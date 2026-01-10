use mongodb::{bson::doc, Client, Collection, Database};
use std::sync::OnceLock;

use crate::models::OrderEntity;

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

    Ok(())
}

pub fn get_db() -> &'static Database {
    DB.get().expect("Database not initialized")
}

pub fn orders_collection() -> Collection<OrderEntity> {
    get_db().collection("orders")
}
