use crate::models::{Order, OrderStatus};
use async_trait::async_trait;
use futures::{stream, StreamExt, TryStreamExt};
use std::sync::Arc;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

mod agent;
mod inbox;
mod mongo_repository;
pub use agent::{AgentOrder, OrderPage};
pub use inbox::OrderInbox;
#[cfg(test)]
mod test_support;
mod timestamps;

pub(crate) use mongo_repository::MongoOrderRepository;
#[cfg(test)]
pub(crate) use test_support::InMemoryOrderRepository;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserId(String);

impl UserId {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub(crate) fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Principal {
    user_id: UserId,
    capabilities: CapabilitySet,
}

impl Principal {
    #[cfg(test)]
    pub fn extension(user_id: UserId) -> Self {
        Self {
            user_id,
            capabilities: CapabilitySet::extension(),
        }
    }

    #[cfg(test)]
    pub fn agent(user_id: UserId) -> Self {
        Self {
            user_id,
            capabilities: CapabilitySet::agent(),
        }
    }

    pub(crate) fn with_capabilities(
        user_id: UserId,
        capabilities: impl IntoIterator<Item = Capability>,
    ) -> Self {
        Self {
            user_id,
            capabilities: CapabilitySet::from_capabilities(capabilities),
        }
    }

    pub(crate) fn user_id(&self) -> &UserId {
        &self.user_id
    }

    fn require(&self, capability: Capability) -> Result<(), ApplicationError> {
        self.capabilities
            .contains(capability)
            .then_some(())
            .ok_or(ApplicationError::Forbidden)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum Capability {
    ReadOrders,
    SyncOrders,
    UpdateStatus,
    UpdateNote,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct CapabilitySet(u8);

impl CapabilitySet {
    const READ_ORDERS: u8 = 1 << 0;
    const SYNC_ORDERS: u8 = 1 << 1;
    const UPDATE_STATUS: u8 = 1 << 2;
    const UPDATE_NOTE: u8 = 1 << 3;

    #[cfg(test)]
    fn extension() -> Self {
        Self(Self::READ_ORDERS | Self::SYNC_ORDERS | Self::UPDATE_STATUS | Self::UPDATE_NOTE)
    }

    #[cfg(test)]
    fn agent() -> Self {
        Self(Self::READ_ORDERS | Self::UPDATE_STATUS | Self::UPDATE_NOTE)
    }

    fn from_capabilities(capabilities: impl IntoIterator<Item = Capability>) -> Self {
        capabilities
            .into_iter()
            .fold(Self(0), |set, capability| Self(set.0 | capability.flag()))
    }

    fn contains(self, capability: Capability) -> bool {
        let flag = capability.flag();
        self.0 & flag == flag
    }
}

impl Capability {
    fn flag(self) -> u8 {
        match self {
            Capability::ReadOrders => CapabilitySet::READ_ORDERS,
            Capability::SyncOrders => CapabilitySet::SYNC_ORDERS,
            Capability::UpdateStatus => CapabilitySet::UPDATE_STATUS,
            Capability::UpdateNote => CapabilitySet::UPDATE_NOTE,
        }
    }
}

#[derive(Debug, Eq, PartialEq)]
pub enum ApplicationError {
    Forbidden,
    Conflict,
    InvalidInput(String),
    NotFound,
    Repository(String),
}

pub(crate) trait Clock: Send + Sync {
    fn now_utc(&self) -> String;
}

struct SystemClock;

impl Clock for SystemClock {
    fn now_utc(&self) -> String {
        OffsetDateTime::now_utc()
            .format(&Rfc3339)
            .expect("RFC 3339 formatting must support UTC timestamps")
    }
}

#[derive(Clone, Debug)]
pub struct UpsertOrder {
    pub id: String,
    pub order_number: String,
    pub product_name: String,
    pub order_date: String,
    pub product_image: String,
    pub price: String,
    pub status: OrderStatus,
    pub note: Option<String>,
    pub updated_at: Option<String>,
    pub created_at: Option<String>,
    pub deleted_at: Option<String>,
}

#[derive(Clone, Debug, Default, serde::Serialize)]
pub struct UpdateOrder {
    #[serde(skip)]
    pub expected_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<OrderStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
}

#[derive(Clone, Debug, Default)]
pub struct OrderSearch {
    pub after: Option<String>,
    pub pending_only: bool,
    pub query: Option<String>,
    pub status: Option<OrderStatus>,
    pub limit: usize,
}

impl UpdateOrder {
    fn is_empty(&self) -> bool {
        self.status.is_none()
            && self.note.is_none()
            && self.updated_at.is_none()
            && self.deleted_at.is_none()
    }

    fn at_version(&self, existing: &Order, now: &str) -> Result<Self, ApplicationError> {
        if self
            .expected_version
            .as_deref()
            .is_some_and(|expected| expected != agent::version(existing))
        {
            return Err(ApplicationError::Conflict);
        }
        let version = timestamps::for_update(existing, self.updated_at.as_deref(), now)?;
        Ok(Self {
            updated_at: Some(version.clone()),
            deleted_at: self.deleted_at.as_ref().map(|_| version),
            ..self.clone()
        })
    }
}

pub(crate) struct UpsertResult {
    order: Order,
    applied: bool,
}

impl UpsertOrder {
    fn into_order(self, user_id: &UserId) -> Order {
        Order {
            id: self.id,
            user_id: user_id.as_str().to_string(),
            order_number: self.order_number,
            product_name: self.product_name,
            order_date: self.order_date,
            product_image: self.product_image,
            price: self.price,
            status: self.status,
            note: self.note,
            updated_at: self.updated_at,
            created_at: self.created_at,
            deleted_at: self.deleted_at,
        }
    }
}

#[async_trait]
pub(crate) trait TenantScopedOrderRepository: Send + Sync {
    async fn list(&self, user_id: &UserId) -> Result<Vec<Order>, ApplicationError>;
    async fn get(
        &self,
        user_id: &UserId,
        order_id: &str,
    ) -> Result<Option<Order>, ApplicationError>;
    async fn search(
        &self,
        user_id: &UserId,
        search: OrderSearch,
    ) -> Result<Vec<Order>, ApplicationError>;
    async fn upsert_if_newer(
        &self,
        user_id: &UserId,
        order: Order,
    ) -> Result<UpsertResult, ApplicationError>;
    async fn update(
        &self,
        user_id: &UserId,
        order_id: &str,
        update: UpdateOrder,
        now: &str,
    ) -> Result<Option<Order>, ApplicationError>;
    async fn delete_many(
        &self,
        user_id: &UserId,
        order_ids: &[String],
        updated_at: &str,
    ) -> Result<usize, ApplicationError> {
        let mut count = 0;
        for id in order_ids {
            let deleted = self
                .update(
                    user_id,
                    id,
                    UpdateOrder {
                        deleted_at: Some(updated_at.into()),
                        ..UpdateOrder::default()
                    },
                    updated_at,
                )
                .await?;
            count += usize::from(deleted.is_some());
        }
        Ok(count)
    }
}

#[derive(Clone)]
pub struct OrderApplication {
    repository: Arc<dyn TenantScopedOrderRepository>,
    clock: Arc<dyn Clock>,
}

impl OrderApplication {
    pub(crate) fn new(repository: impl TenantScopedOrderRepository + 'static) -> Self {
        Self {
            repository: Arc::new(repository),
            clock: Arc::new(SystemClock),
        }
    }

    #[cfg(test)]
    fn with_clock(
        repository: impl TenantScopedOrderRepository + 'static,
        clock: impl Clock + 'static,
    ) -> Self {
        Self {
            repository: Arc::new(repository),
            clock: Arc::new(clock),
        }
    }

    pub async fn list_orders(&self, principal: &Principal) -> Result<Vec<Order>, ApplicationError> {
        principal.require(Capability::ReadOrders)?;
        let orders = self.repository.list(principal.user_id()).await?;
        Ok(orders
            .into_iter()
            .filter(|order| {
                principal.capabilities.contains(Capability::SyncOrders)
                    || order.deleted_at.is_none()
            })
            .collect())
    }

    pub async fn get_order(
        &self,
        principal: &Principal,
        order_id: &str,
    ) -> Result<Order, ApplicationError> {
        principal.require(Capability::ReadOrders)?;
        self.repository
            .get(principal.user_id(), order_id)
            .await?
            .filter(|order| order.deleted_at.is_none())
            .ok_or(ApplicationError::NotFound)
    }

    pub async fn upsert_order(
        &self,
        principal: &Principal,
        input: UpsertOrder,
    ) -> Result<Order, ApplicationError> {
        principal.require(Capability::SyncOrders)?;
        let order = input.into_order(principal.user_id());
        timestamps::validate_order(&order)?;
        self.repository
            .upsert_if_newer(principal.user_id(), order)
            .await
            .map(|result| result.order)
    }

    pub async fn update_status(
        &self,
        principal: &Principal,
        order_id: &str,
        status: OrderStatus,
        expected_version: String,
    ) -> Result<Order, ApplicationError> {
        principal.require(Capability::UpdateStatus)?;
        let updated_at = self.clock.now_utc();
        self.repository
            .update(
                principal.user_id(),
                order_id,
                UpdateOrder {
                    status: Some(status),
                    expected_version: Some(expected_version),
                    ..UpdateOrder::default()
                },
                &updated_at,
            )
            .await?
            .ok_or(ApplicationError::NotFound)
    }

    pub async fn update_note(
        &self,
        principal: &Principal,
        order_id: &str,
        note: String,
        expected_version: String,
    ) -> Result<Order, ApplicationError> {
        principal.require(Capability::UpdateNote)?;
        let updated_at = self.clock.now_utc();
        self.repository
            .update(
                principal.user_id(),
                order_id,
                UpdateOrder {
                    note: Some(note),
                    expected_version: Some(expected_version),
                    ..UpdateOrder::default()
                },
                &updated_at,
            )
            .await?
            .ok_or(ApplicationError::NotFound)
    }

    pub async fn delete_order(
        &self,
        principal: &Principal,
        order_id: &str,
    ) -> Result<(), ApplicationError> {
        principal.require(Capability::SyncOrders)?;
        let now = self.clock.now_utc();
        self.repository
            .update(
                principal.user_id(),
                order_id,
                UpdateOrder {
                    deleted_at: Some(now.clone()),
                    ..UpdateOrder::default()
                },
                &now,
            )
            .await?
            .map(|_| ())
            .ok_or(ApplicationError::NotFound)
    }

    pub async fn update_order(
        &self,
        principal: &Principal,
        order_id: &str,
        update: UpdateOrder,
    ) -> Result<Order, ApplicationError> {
        principal.require(Capability::SyncOrders)?;
        if update.is_empty() {
            return Err(ApplicationError::InvalidInput(
                "No fields to update".to_string(),
            ));
        }
        timestamps::parse(update.updated_at.as_deref())?;
        timestamps::parse(update.deleted_at.as_deref())?;
        self.repository
            .update(principal.user_id(), order_id, update, &self.clock.now_utc())
            .await?
            .ok_or(ApplicationError::NotFound)
    }

    pub async fn batch_upsert_orders(
        &self,
        principal: &Principal,
        inputs: Vec<UpsertOrder>,
    ) -> Result<usize, ApplicationError> {
        principal.require(Capability::SyncOrders)?;
        if inputs.len() > 100 {
            return Err(ApplicationError::InvalidInput(
                "Batch size exceeds maximum of 100".to_string(),
            ));
        }

        let user_id = principal.user_id().clone();
        let repository = Arc::clone(&self.repository);
        stream::iter(inputs.into_iter().map(|input| {
            let user_id = user_id.clone();
            let repository = Arc::clone(&repository);
            async move {
                let order = input.into_order(&user_id);
                timestamps::validate_order(&order)?;
                repository.upsert_if_newer(&user_id, order).await
            }
        }))
        .buffer_unordered(10)
        .try_fold(0_usize, |count, result| async move {
            Ok(count + usize::from(result.applied))
        })
        .await
    }

    pub async fn batch_delete_orders(
        &self,
        principal: &Principal,
        order_ids: Vec<String>,
    ) -> Result<usize, ApplicationError> {
        principal.require(Capability::SyncOrders)?;
        self.repository
            .delete_many(principal.user_id(), &order_ids, &self.clock.now_utc())
            .await
    }
}

#[cfg(test)]
mod tests;
