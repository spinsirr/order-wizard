use schemars::JsonSchema;
use serde::Serialize;
use utoipa::ToSchema;

use super::{ApplicationError, Capability, OrderApplication, OrderSearch, Principal};
use crate::models::Order;

pub(super) fn version(order: &Order) -> &str {
    order
        .updated_at
        .as_deref()
        .or(order.created_at.as_deref())
        .unwrap_or("unversioned")
}

#[derive(Debug, Serialize, ToSchema, JsonSchema)]
pub struct AgentOrder {
    #[serde(flatten)]
    pub order: Order,
    /// Opaque optimistic-concurrency token. Pass unchanged when updating this order.
    pub version: String,
}

impl From<Order> for AgentOrder {
    fn from(order: Order) -> Self {
        Self {
            version: version(&order).into(),
            order,
        }
    }
}

#[derive(Debug, Serialize, ToSchema, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct OrderPage {
    pub orders: Vec<AgentOrder>,
    /// Pass as `after` with the same filters; null means the end of the result set.
    pub next_cursor: Option<String>,
}

impl OrderApplication {
    pub async fn search_orders(
        &self,
        principal: &Principal,
        mut search: OrderSearch,
    ) -> Result<OrderPage, ApplicationError> {
        principal.require(Capability::ReadOrders)?;
        if search.query.as_deref().is_some_and(|q| q.trim().is_empty()) {
            return Err(ApplicationError::InvalidInput(
                "Search query must not be empty".into(),
            ));
        }
        if !(1..=100).contains(&search.limit) {
            return Err(ApplicationError::InvalidInput(
                "Search limit must be between 1 and 100".into(),
            ));
        }
        if search.after.as_deref().is_some_and(str::is_empty) {
            return Err(ApplicationError::InvalidInput(
                "Cursor must not be empty".into(),
            ));
        }
        let limit = search.limit;
        search.limit += 1;
        let mut orders = self.repository.search(principal.user_id(), search).await?;
        let has_more = orders.len() > limit;
        orders.truncate(limit);
        let next_cursor =
            has_more.then(|| orders.last().expect("nonempty page").order_number.clone());
        Ok(OrderPage {
            orders: orders.into_iter().map(AgentOrder::from).collect(),
            next_cursor,
        })
    }
}
