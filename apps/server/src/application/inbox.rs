use std::sync::LazyLock;

use regex::Regex;
use schemars::JsonSchema;
use serde::Serialize;
use time::{
    format_description::{self, well_known::Rfc3339, FormatItem},
    Date, Duration, Month, OffsetDateTime,
};
use utoipa::ToSchema;

use super::{AgentOrder, ApplicationError, Capability, OrderApplication, OrderSearch, Principal};
use crate::models::OrderStatus;

static DATE_FORMAT: LazyLock<Vec<FormatItem<'static>>> = LazyLock::new(|| {
    format_description::parse_borrowed::<2>("[year]-[month]-[day]").expect("valid date format")
});

static ENGLISH_DATE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)^(?:([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})|(\d{1,2})\s+([a-z]+)\.?\s+(\d{4}))$")
        .expect("valid captured date pattern")
});

#[derive(Debug, Serialize, ToSchema, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum NextAction {
    Review,
    ReviewVisibility,
    Reimbursement,
    ReturnOptions,
}

#[derive(Debug, Serialize, ToSchema, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReturnCheck {
    pub stage: &'static str,
    pub days_remaining: i64,
    /// Order date + 30 calendar days; a reminder target, NOT Amazon's return deadline.
    pub target_date: String,
}

#[derive(Debug, Serialize, ToSchema, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct InboxItem {
    pub order: AgentOrder,
    /// Suggested check only; never evidence that a review, return or payment occurred.
    pub next_action: NextAction,
    /// Null means the captured date could not be parsed. Negative means a future date.
    pub days_since_order: Option<i64>,
    pub return_check: Option<ReturnCheck>,
}

#[derive(Debug, Serialize, ToSchema, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct OrderInbox {
    pub as_of: String,
    pub items: Vec<InboxItem>,
    pub next_cursor: Option<String>,
}

impl OrderApplication {
    pub async fn order_inbox(
        &self,
        principal: &Principal,
        as_of: &str,
        after: Option<String>,
        limit: usize,
    ) -> Result<OrderInbox, ApplicationError> {
        principal.require(Capability::ReadOrders)?;
        let today = Date::parse(as_of, &DATE_FORMAT).map_err(|_| {
            ApplicationError::InvalidInput(
                "as_of must be the user's local date in YYYY-MM-DD format".into(),
            )
        })?;
        let page = self
            .search_orders(
                principal,
                OrderSearch {
                    pending_only: true,
                    after,
                    limit,
                    ..OrderSearch::default()
                },
            )
            .await?;
        let items = page
            .orders
            .into_iter()
            .map(|order| {
                let day = parse_order_day(&order.order.order_date);
                let days_since_order = day.map(|date| (today - date).whole_days());
                let return_check = day.and_then(|date| return_check(date, today));
                let next_action = if return_check.is_some() {
                    NextAction::ReturnOptions
                } else {
                    match order.order.status {
                        OrderStatus::Uncommented => NextAction::Review,
                        OrderStatus::Commented => NextAction::ReviewVisibility,
                        OrderStatus::CommentRevealed | OrderStatus::Reimbursed => {
                            NextAction::Reimbursement
                        }
                    }
                };
                InboxItem {
                    order,
                    next_action,
                    days_since_order,
                    return_check,
                }
            })
            .collect();
        Ok(OrderInbox {
            as_of: as_of.into(),
            items,
            next_cursor: page.next_cursor,
        })
    }
}

fn return_check(day: Date, today: Date) -> Option<ReturnCheck> {
    let age = (today - day).whole_days();
    if age < 25 {
        return None;
    }
    Some(ReturnCheck {
        stage: if age >= 30 {
            "overdue"
        } else if age >= 28 {
            "urgent"
        } else {
            "warning"
        },
        days_remaining: 30 - age,
        target_date: day
            .checked_add(Duration::days(30))?
            .format(&DATE_FORMAT)
            .ok()?,
    })
}

/// Match the extension's captured English and ISO calendar dates without timezone shifts.
fn parse_order_day(value: &str) -> Option<Date> {
    let value = value.trim();
    if let Some((date, _)) = value.split_once('T') {
        OffsetDateTime::parse(value, &Rfc3339).ok()?;
        return Date::parse(date, &DATE_FORMAT).ok();
    }
    if let Ok(date) = Date::parse(value, &DATE_FORMAT) {
        return Some(date);
    }
    let parts = ENGLISH_DATE.captures(value)?;
    let name = parts
        .get(1)
        .or_else(|| parts.get(5))?
        .as_str()
        .to_ascii_lowercase();
    let day = parts.get(2).or_else(|| parts.get(4))?.as_str();
    let year = parts.get(3).or_else(|| parts.get(6))?.as_str();
    let months = [
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
    ];
    let month = months.iter().position(|month| {
        name == *month || name == month[..3] || (name == "sept" && *month == "september")
    })?;
    Date::from_calendar_date(
        year.parse().ok()?,
        Month::try_from(u8::try_from(month + 1).ok()?).ok()?,
        day.parse().ok()?,
    )
    .ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reminders_agree_with_the_extension_on_calendar_dates_and_thresholds() {
        let cases: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../test-fixtures/return-warnings.json"
        ))
        .unwrap();
        for case in cases.as_array().unwrap() {
            let today = Date::parse(case["asOf"].as_str().unwrap(), &DATE_FORMAT).unwrap();
            let actual = parse_order_day(case["orderDate"].as_str().unwrap())
                .and_then(|day| return_check(day, today));
            if case["stage"].is_null() {
                assert!(actual.is_none(), "{case}");
            } else {
                let actual = serde_json::to_value(actual.unwrap()).unwrap();
                assert_eq!(actual["stage"], case["stage"], "{case}");
                assert_eq!(actual["daysRemaining"], case["daysRemaining"], "{case}");
                assert_eq!(actual["targetDate"], case["targetDate"], "{case}");
            }
        }
    }
}
