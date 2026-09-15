use super::ApplicationError;
use crate::models::Order;
use time::{format_description::well_known::Rfc3339, Duration, OffsetDateTime};

pub(super) fn parse(value: Option<&str>) -> Result<Option<OffsetDateTime>, ApplicationError> {
    value
        .map(|value| {
            OffsetDateTime::parse(value, &Rfc3339).map_err(|_| {
                ApplicationError::InvalidInput("Sync timestamps must be RFC 3339 dates".into())
            })
        })
        .transpose()
}

pub(super) fn validate_order(order: &Order) -> Result<(), ApplicationError> {
    parse(order.updated_at.as_deref())?;
    parse(order.created_at.as_deref())?;
    parse(order.deleted_at.as_deref())?;
    Ok(())
}

pub(super) fn should_replace(existing: &Order, incoming: &Order) -> Result<bool, ApplicationError> {
    let existing = version(existing)?;
    let incoming = version(incoming)?;
    Ok(match (existing, incoming) {
        (Some(existing), Some(incoming)) => incoming > existing,
        (None, _) => true,
        (Some(_), None) => false,
    })
}

fn version(order: &Order) -> Result<Option<OffsetDateTime>, ApplicationError> {
    parse(order.updated_at.as_deref().or(order.created_at.as_deref()))
}

/// Explicit client versions are conditional; server commands advance the stored clock.
pub(super) fn for_update(
    existing: &Order,
    proposed: Option<&str>,
    now: &str,
) -> Result<String, ApplicationError> {
    let previous = version(existing)?;
    let timestamp = if let Some(proposed) = parse(proposed)? {
        if previous.is_some_and(|previous| proposed <= previous) {
            return Err(ApplicationError::Conflict);
        }
        proposed
    } else {
        let now = parse(Some(now))?.expect("a supplied timestamp parses to Some");
        if let Some(previous) = previous {
            let next = previous
                .checked_add(Duration::nanoseconds(1))
                .ok_or_else(|| {
                    ApplicationError::InvalidInput("Order version is out of range".into())
                })?;
            now.max(next)
        } else {
            now
        }
    };
    timestamp
        .format(&Rfc3339)
        .map_err(|_| ApplicationError::InvalidInput("Order version is out of range".into()))
}
