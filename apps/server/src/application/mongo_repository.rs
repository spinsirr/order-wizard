use async_trait::async_trait;
use futures::TryStreamExt;
use mongodb::{
    bson::{doc, Bson, Regex},
    error::{ErrorKind, WriteFailure},
    options::ReturnDocument,
    Collection,
};

use super::{
    ApplicationError, OrderSearch, TenantScopedOrderRepository, UpdateOrder, UpsertResult, UserId,
};
use crate::models::{Order, OrderEntity};

pub(crate) struct MongoOrderRepository {
    collection: Collection<OrderEntity>,
}

impl MongoOrderRepository {
    pub(crate) fn new(collection: Collection<OrderEntity>) -> Self {
        Self { collection }
    }
}

#[async_trait]
impl TenantScopedOrderRepository for MongoOrderRepository {
    async fn list(&self, user_id: &UserId) -> Result<Vec<Order>, ApplicationError> {
        let entities: Vec<OrderEntity> = self
            .collection
            .find(doc! { "user_id": user_id.as_str() })
            .await
            .map_err(repository_error)?
            .try_collect()
            .await
            .map_err(repository_error)?;

        Ok(entities.into_iter().map(Order::from).collect())
    }

    async fn get(
        &self,
        user_id: &UserId,
        order_id: &str,
    ) -> Result<Option<Order>, ApplicationError> {
        self.collection
            .find_one(doc! { "user_id": user_id.as_str(), "id": order_id })
            .await
            .map(|entity| entity.map(Order::from))
            .map_err(repository_error)
    }

    async fn search(
        &self,
        user_id: &UserId,
        search: OrderSearch,
    ) -> Result<Vec<Order>, ApplicationError> {
        let mut filter = doc! { "user_id": user_id.as_str(), "deleted_at": Bson::Null };
        if let Some(after) = &search.after {
            filter.insert("order_number", doc! { "$gt": after });
        }
        if search.pending_only {
            filter.insert("status", doc! { "$ne": "reimbursed" });
        }
        if let Some(status) = search.status {
            filter.insert(
                "status",
                mongodb::bson::to_bson(&status)
                    .map_err(|error| ApplicationError::Repository(error.to_string()))?,
            );
        }
        if let Some(query) = search
            .query
            .as_deref()
            .map(str::trim)
            .filter(|query| !query.is_empty())
        {
            let regex = Regex {
                pattern: regex::escape(query),
                options: "i".to_string(),
            };
            filter.insert(
                "$or",
                vec![
                    doc! { "id": regex.clone() },
                    doc! { "order_number": regex.clone() },
                    doc! { "product_name": regex.clone() },
                    doc! { "note": regex },
                ],
            );
        }

        let entities: Vec<OrderEntity> = self
            .collection
            .find(filter)
            .sort(doc! { "order_number": 1 })
            .limit(
                i64::try_from(search.limit)
                    .map_err(|error| ApplicationError::InvalidInput(error.to_string()))?,
            )
            .await
            .map_err(repository_error)?
            .try_collect()
            .await
            .map_err(repository_error)?;
        Ok(entities.into_iter().map(Order::from).collect())
    }

    async fn upsert_if_newer(
        &self,
        user_id: &UserId,
        order: Order,
    ) -> Result<UpsertResult, ApplicationError> {
        // Parse instants in Rust, then replace only the exact snapshot we compared.
        // The unique tenant/order-number index arbitrates concurrent first inserts.
        let identity = doc! { "user_id": user_id.as_str(), "order_number": &order.order_number };
        for _ in 0..64 {
            let existing = self
                .collection
                .find_one(identity.clone())
                .await
                .map_err(repository_error)?;
            if let Some(entity) = existing {
                let mut filter = mongodb::bson::to_document(&entity)
                    .map_err(|error| ApplicationError::Repository(error.to_string()))?;
                for field in ["note", "updated_at", "created_at", "deleted_at"] {
                    filter.entry(field.to_string()).or_insert(Bson::Null);
                }
                let existing = Order::from(entity);
                if !super::timestamps::should_replace(&existing, &order)? {
                    return Ok(UpsertResult {
                        order: existing,
                        applied: false,
                    });
                }
                let mut canonical = order.clone();
                canonical.id = existing.id;
                let result = self
                    .collection
                    .replace_one(filter, OrderEntity::from(canonical.clone()))
                    .await
                    .map_err(repository_error)?;
                if result.matched_count > 0 {
                    return Ok(UpsertResult {
                        order: canonical,
                        applied: true,
                    });
                }
            } else {
                match self
                    .collection
                    .insert_one(OrderEntity::from(order.clone()))
                    .await
                {
                    Ok(_) => {
                        return Ok(UpsertResult {
                            order,
                            applied: true,
                        })
                    }
                    Err(error) if is_duplicate_key(&error) => {}
                    Err(error) => return Err(repository_error(error)),
                }
            }
        }
        Err(ApplicationError::Repository(
            "Order changed repeatedly during sync; retry the operation".into(),
        ))
    }

    async fn update(
        &self,
        user_id: &UserId,
        order_id: &str,
        update: UpdateOrder,
        now: &str,
    ) -> Result<Option<Order>, ApplicationError> {
        let identity =
            doc! { "user_id": user_id.as_str(), "id": order_id, "deleted_at": Bson::Null };
        for _ in 0..64 {
            let Some(entity) = self
                .collection
                .find_one(identity.clone())
                .await
                .map_err(repository_error)?
            else {
                return Ok(None);
            };
            let mut filter = identity.clone();
            filter.insert("updated_at", entity.updated_at.clone());
            filter.insert("created_at", entity.created_at.clone());
            // Recompute the version against every new snapshot, but write only the requested fields.
            let patch = update.at_version(&Order::from(entity), now)?;
            let fields = mongodb::bson::to_document(&patch)
                .map_err(|error| ApplicationError::Repository(error.to_string()))?;
            if let Some(updated) = self
                .collection
                .find_one_and_update(filter, doc! { "$set": fields })
                .return_document(ReturnDocument::After)
                .await
                .map_err(repository_error)?
            {
                return Ok(Some(Order::from(updated)));
            }
        }
        Err(ApplicationError::Conflict)
    }
}

fn is_duplicate_key(error: &mongodb::error::Error) -> bool {
    matches!(
        error.kind.as_ref(),
        ErrorKind::Write(WriteFailure::WriteError(write_error)) if write_error.code == 11000
    )
}

#[expect(
    clippy::needless_pass_by_value,
    reason = "Matches Result::map_err without repeating conversion closures"
)]
fn repository_error(error: mongodb::error::Error) -> ApplicationError {
    ApplicationError::Repository(error.to_string())
}
