use mongodb::{bson::doc, options::IndexOptions, Client, Collection, Database, IndexModel};
use std::sync::OnceLock;

use crate::models::Order;

static DB: OnceLock<Database> = OnceLock::new();

pub async fn init_db() -> Result<(), mongodb::error::Error> {
    let uri =
        std::env::var("MONGODB_URI").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
    let client = Client::with_uri_str(&uri).await?;
    let db = client.database("order_wizard");

    // Ping to verify connection
    db.run_command(doc! { "ping": 1 }).await?;
    tracing::info!("Connected to MongoDB");

    DB.set(db).expect("Database already initialized");

    // Create indices for common queries
    create_indices().await?;

    Ok(())
}

async fn create_indices() -> Result<(), mongodb::error::Error> {
    let collection = orders_collection();

    let indices = vec![
        // Index for user queries (list all orders for user)
        IndexModel::builder()
            .keys(doc! { "user_id": 1 })
            .build(),
        // Unique index for order upsert (one order per user per order_number)
        IndexModel::builder()
            .keys(doc! { "user_id": 1, "order_number": 1 })
            .options(IndexOptions::builder().unique(true).build())
            .build(),
        // Index for single order lookup
        IndexModel::builder()
            .keys(doc! { "id": 1, "user_id": 1 })
            .build(),
    ];

    collection.create_indexes(indices).await?;
    tracing::info!("Database indices created");

    Ok(())
}

pub fn get_db() -> &'static Database {
    DB.get().expect("Database not initialized")
}

pub fn orders_collection() -> Collection<Order> {
    get_db().collection("orders")
}
