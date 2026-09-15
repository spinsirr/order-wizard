use std::sync::RwLock;

use async_trait::async_trait;

use super::{
    ApplicationError, OrderSearch, TenantScopedOrderRepository, UpdateOrder, UpsertResult, UserId,
};
use crate::models::Order;

pub(crate) struct InMemoryOrderRepository {
    orders: RwLock<Vec<Order>>,
}

impl InMemoryOrderRepository {
    pub(crate) fn with_orders(orders: impl IntoIterator<Item = Order>) -> Self {
        Self {
            orders: RwLock::new(orders.into_iter().collect()),
        }
    }
}

#[async_trait]
impl TenantScopedOrderRepository for InMemoryOrderRepository {
    async fn list(&self, user_id: &UserId) -> Result<Vec<Order>, ApplicationError> {
        Ok(self
            .orders
            .read()
            .expect("in-memory order repository lock poisoned")
            .iter()
            .filter(|order| order.user_id == user_id.as_str())
            .cloned()
            .collect())
    }

    async fn get(
        &self,
        user_id: &UserId,
        order_id: &str,
    ) -> Result<Option<Order>, ApplicationError> {
        Ok(self
            .orders
            .read()
            .expect("in-memory order repository lock poisoned")
            .iter()
            .find(|order| order.user_id == user_id.as_str() && order.id == order_id)
            .cloned())
    }

    async fn search(
        &self,
        user_id: &UserId,
        search: OrderSearch,
    ) -> Result<Vec<Order>, ApplicationError> {
        let query = search
            .query
            .as_deref()
            .map(str::trim)
            .filter(|query| !query.is_empty())
            .map(str::to_lowercase);
        let orders = self
            .orders
            .read()
            .expect("in-memory order repository lock poisoned");
        Ok(orders
            .iter()
            .filter(|order| order.user_id == user_id.as_str() && order.deleted_at.is_none())
            .filter(|order| {
                search
                    .status
                    .as_ref()
                    .is_none_or(|status| &order.status == status)
            })
            .filter(|order| {
                query.as_ref().is_none_or(|query| {
                    order.id.to_lowercase().contains(query)
                        || order.order_number.to_lowercase().contains(query)
                        || order.product_name.to_lowercase().contains(query)
                        || order
                            .note
                            .as_deref()
                            .is_some_and(|note| note.to_lowercase().contains(query))
                })
            })
            .take(search.limit)
            .cloned()
            .collect())
    }

    async fn upsert_if_newer(
        &self,
        user_id: &UserId,
        order: Order,
    ) -> Result<UpsertResult, ApplicationError> {
        let mut orders = self
            .orders
            .write()
            .expect("in-memory order repository lock poisoned");
        if let Some(existing) = orders.iter_mut().find(|existing| {
            existing.user_id == user_id.as_str() && existing.order_number == order.order_number
        }) {
            if super::timestamps::should_replace(existing, &order)? {
                let mut order = order;
                order.id = existing.id.clone();
                *existing = order.clone();
                Ok(UpsertResult {
                    order,
                    applied: true,
                })
            } else {
                Ok(UpsertResult {
                    order: existing.clone(),
                    applied: false,
                })
            }
        } else {
            orders.push(order.clone());
            Ok(UpsertResult {
                order,
                applied: true,
            })
        }
    }

    async fn update(
        &self,
        user_id: &UserId,
        order_id: &str,
        update: UpdateOrder,
        now: &str,
    ) -> Result<Option<Order>, ApplicationError> {
        let mut orders = self
            .orders
            .write()
            .expect("in-memory order repository lock poisoned");
        let Some(order) = orders.iter_mut().find(|order| {
            order.user_id == user_id.as_str() && order.id == order_id && order.deleted_at.is_none()
        }) else {
            return Ok(None);
        };
        let patch = update.at_version(order, now)?;
        if let Some(status) = patch.status {
            order.status = status;
        }
        if let Some(note) = patch.note {
            order.note = Some(note);
        }
        order.updated_at = patch.updated_at;
        if let Some(deleted_at) = patch.deleted_at {
            order.deleted_at = Some(deleted_at);
        }
        Ok(Some(order.clone()))
    }
}
