mod auth;
mod db;
mod models;
mod routes;

use auth::AuthUser;
use axum::{routing::get, Json, Router};
use serde::Serialize;
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Serialize)]
struct Health {
    status: &'static str,
}

#[derive(Serialize)]
struct UserInfo {
    sub: String,
    email: Option<String>,
    username: Option<String>,
}

async fn health() -> Json<Health> {
    Json(Health { status: "ok" })
}

async fn me(AuthUser(claims): AuthUser) -> Json<UserInfo> {
    Json(UserInfo {
        sub: claims.sub,
        email: claims.email,
        username: claims.username,
    })
}

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    // Initialize database
    if let Err(e) = db::init_db().await {
        tracing::error!("Failed to connect to MongoDB: {}", e);
        std::process::exit(1);
    }

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health))
        .route("/me", get(me))
        .merge(routes::orders::router())
        .layer(cors);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let addr = format!("0.0.0.0:{}", port);

    tracing::info!("Server running on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
