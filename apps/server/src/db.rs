use mongodb::{bson::doc, options::IndexOptions, Client, Collection, Database, IndexModel};

use crate::models::OrderEntity;

pub async fn connect() -> Result<Database, mongodb::error::Error> {
    let uri =
        std::env::var("MONGODB_URI").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
    let client = Client::with_uri_str(&uri).await?;
    let db = client.database("order_wizard");

    // Ping to verify connection
    db.run_command(doc! { "ping": 1 }).await?;
    ensure_order_indexes(&orders_collection(&db)).await?;
    tracing::info!("Connected to MongoDB");

    Ok(db)
}

pub fn orders_collection(database: &Database) -> Collection<OrderEntity> {
    database.collection("orders")
}

/// Ensure indexes on application startup for both new and existing databases.
pub(crate) async fn ensure_order_indexes(
    collection: &Collection<OrderEntity>,
) -> Result<(), mongodb::error::Error> {
    collection
        .create_indexes([
            IndexModel::builder()
                .keys(doc! { "user_id": 1 })
                .options(
                    IndexOptions::builder()
                        .name("idx_user_id".to_string())
                        .build(),
                )
                .build(),
            IndexModel::builder()
                .keys(doc! { "user_id": 1, "order_number": 1 })
                .options(
                    IndexOptions::builder()
                        .name("idx_user_order_unique".to_string())
                        .unique(true)
                        .build(),
                )
                .build(),
            IndexModel::builder()
                .keys(doc! { "id": 1, "user_id": 1 })
                .options(
                    IndexOptions::builder()
                        .name("idx_id_user".to_string())
                        .build(),
                )
                .build(),
        ])
        .await?;
    Ok(())
}
