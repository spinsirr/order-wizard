mod config;
mod error;
mod models;
mod oauth;
mod routes;
mod state;
mod docs;

use axum::error_handling::HandleErrorLayer;
use dotenvy::dotenv_override;
use mongodb::{options::ClientOptions, Client};
use std::net::{AddrParseError, SocketAddr};
use std::sync::Arc;
use std::time::Duration;
use tower::{timeout::TimeoutLayer, ServiceBuilder};
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;
use tracing::{error, info};
use tracing_subscriber::EnvFilter;

use crate::{
    config::AppConfig, models::OrderDocument, oauth::OAuthState, routes::router, state::AppState,
};

#[tokio::main]
async fn main() {
    eprintln!("🚀 Starting Order Wizard Server...");

    if let Err(error) = init_tracing() {
        eprintln!("Failed to initialize tracing: {error}");
    } else {
        eprintln!("✅ Tracing initialized successfully");
    }

    if let Err(error) = run().await {
        eprintln!("❌ Server error: {error}");
        error!("Server error: {error}");
        std::process::exit(1);
    }

    eprintln!("✅ Server completed successfully");
}

async fn run() -> Result<(), String> {
    eprintln!("📝 Loading .env file...");
    dotenv_override().ok();
    eprintln!("✅ .env file loaded");

    eprintln!("⚙️  Loading application configuration from environment...");
    info!("Loading application configuration from environment");
    let config = AppConfig::from_env().map_err(|error| {
        let message = format!("Configuration error: {error}");
        eprintln!("❌ {message}");
        error!("{message}");
        message
    })?;
    eprintln!("✅ Configuration loaded successfully");
    info!(
        "Configuration loaded (host: {}, port: {}, mongo_db: {})",
        config.host, config.port, config.mongo.database
    );

    eprintln!("🔗 Parsing MongoDB connection options...");
    eprintln!("   MongoDB URI: {}", config.mongo.uri);
    let client_options = ClientOptions::parse(&config.mongo.uri)
        .await
        .map_err(|error| {
            let message = format!("Failed to parse MongoDB URI: {error}");
            eprintln!("❌ {message}");
            error!("{message}");
            message
        })?;
    eprintln!("✅ MongoDB connection options parsed");
    info!("MongoDB connection options parsed for {}", config.mongo.uri);

    eprintln!("🔧 Creating MongoDB client...");
    let client = Client::with_options(client_options)
        .map_err(|error| {
            let message = format!("Failed to create MongoDB client: {error}");
            eprintln!("❌ {message}");
            error!("{message}");
            message
        })?;
    eprintln!("✅ MongoDB client created");
    info!(
        "MongoDB client initialized for database {}",
        config.mongo.database
    );

    eprintln!("📦 Getting orders collection...");
    let orders_collection = client
        .database(&config.mongo.database)
        .collection::<OrderDocument>("orders");
    eprintln!("✅ Orders collection ready");

    eprintln!("🔐 Initializing OAuth state...");
    eprintln!("   OIDC Issuer: {}", config.oauth.issuer_url);
    let oauth_state = Arc::new(
        OAuthState::from_config(&config.oauth, &config.session)
            .await
            .map_err(|error| {
                let message = format!("OAuth configuration error: {error}");
                eprintln!("❌ {message}");
                error!("{message}");
                message
            })?,
    );
    eprintln!("✅ OAuth state initialized");
    info!("OAuth state initialized for issuer {}", config.oauth.issuer_url);

    // Start background task to cleanup expired sessions
    eprintln!("🧹 Starting session cleanup background task...");
    let oauth_for_cleanup = Arc::clone(&oauth_state);
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(300)); // 5 minutes
        loop {
            interval.tick().await;
            oauth_for_cleanup.cleanup_expired().await;
        }
    });
    eprintln!("✅ Session cleanup task started");

    eprintln!("🏗️  Building application state...");
    let state = AppState::new(orders_collection, oauth_state);
    eprintln!("✅ Application state built");
    info!("Application state initialized");

    eprintln!("🛣️  Setting up routes and middleware...");
    eprintln!("   Allowed CORS origins: {:?}", config.cors.allowed_origins);
    let app = router(state, config.cors.allowed_origins.clone())
        .merge(SwaggerUi::new("/docs").url(
            "/docs/openapi.json",
            docs::ApiDoc::openapi(),
        ))
        .layer(
            ServiceBuilder::new()
                .layer(HandleErrorLayer::new(error::handle_global_error))
                .layer(TimeoutLayer::new(Duration::from_secs(30)))
                .into_inner(),
        );
    eprintln!("✅ Routes configured");

    eprintln!("🌐 Preparing to bind to {}:{}", config.host, config.port);
    let addr: SocketAddr = format!("{}:{}", config.host, config.port)
        .parse()
        .map_err(|error: AddrParseError| {
            let message = format!("Failed to parse bind address: {error}");
            eprintln!("❌ {message}");
            error!("{message}");
            message
        })?;
    eprintln!("✅ Address parsed: {addr}");

    eprintln!("🔌 Binding TCP listener...");
    info!("🚀 Order Wizard server binding to http://{addr}");

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|error| {
            let message = format!("Failed to bind TCP listener: {error}");
            eprintln!("❌ {message}");
            error!("{message}");
            message
        })?;

    eprintln!("✅ TCP listener bound successfully");
    eprintln!("🎉 Order Wizard server is ready to accept connections on http://{addr}");
    info!("Order Wizard server is ready to accept connections");

    eprintln!("⏳ Starting server (this will block until shutdown)...");
    axum::serve(listener, app.into_make_service())
        .await
        .map_err(|error| {
            let message = format!("Server runtime error: {error}");
            eprintln!("❌ {message}");
            error!("{message}");
            message
        })?;

    eprintln!("🛑 Server shutdown complete");
    info!("Server shutdown complete");

    Ok(())
}

fn init_tracing() -> Result<(), String> {
    if std::env::var("RUST_LOG").is_err() {
        std::env::set_var("RUST_LOG", "info");
    }

    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .with_target(false)
        .try_init()
        .map_err(|error| error.to_string())
}
