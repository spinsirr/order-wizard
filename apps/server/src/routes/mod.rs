pub mod auth;
pub mod orders;

use axum::{http::{header, Method}, Router};
use tower_http::cors::CorsLayer;

use crate::state::AppState;

pub fn router(state: AppState, allowed_origins: Vec<String>) -> Router {
    // Parse allowed origins into HeaderValue
    let origins: Vec<_> = allowed_origins
        .iter()
        .filter_map(|origin| origin.parse().ok())
        .collect();

    Router::new()
        .merge(orders::routes())
        .merge(auth::routes())
        .with_state(state)
        .layer(
            CorsLayer::new()
                .allow_origin(origins)
                .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::DELETE, Method::OPTIONS])
                .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
                .allow_credentials(true),  // Required for cookies
        )
}
