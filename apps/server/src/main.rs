mod auth;
mod db;
mod models;
mod routes;

use auth::{auth_middleware, AuthError, AuthUser, JwksVerifier};
use axum::{middleware, Json};
use serde::Serialize;
use axum::http::{header, Method};
use tower_http::cors::{AllowOrigin, CorsLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use utoipa::{
    openapi::security::{HttpAuthScheme, HttpBuilder, SecurityScheme},
    Modify, OpenApi, ToSchema,
};
use utoipa_axum::router::OpenApiRouter;
use utoipa_swagger_ui::SwaggerUi;

#[derive(Serialize, ToSchema)]
struct Health {
    status: String,
}

#[derive(Serialize, ToSchema)]
struct UserInfo {
    /// User subject (unique identifier)
    sub: String,
    /// User email address
    email: Option<String>,
    /// Cognito username
    username: Option<String>,
}


#[utoipa::path(
    get,
    path = "/health",
    tag = "Health",
    summary = "Health check",
    description = "Returns the health status of the server",
    responses(
        (status = 200, description = "Server is healthy", body = Health)
    )
)]
async fn health() -> Json<Health> {
    Json(Health {
        status: "ok".to_string(),
    })
}


#[utoipa::path(
    get,
    path = "/me",
    tag = "Auth",
    summary = "Get current user info",
    description = "Returns information about the authenticated user",
    responses(
        (status = 200, description = "User information", body = UserInfo),
        (status = 401, description = "Unauthorized", body = AuthError)
    ),
    security(("bearer_auth" = []))
)]
async fn me(AuthUser(claims): AuthUser) -> Json<UserInfo> {
    Json(UserInfo {
        sub: claims.sub,
        email: claims.email,
        username: claims.username,
    })
}

struct SecurityAddon;

impl Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        if let Some(components) = openapi.components.as_mut() {
            components.add_security_scheme(
                "bearer_auth",
                SecurityScheme::Http(
                    HttpBuilder::new()
                        .scheme(HttpAuthScheme::Bearer)
                        .bearer_format("JWT")
                        .description(Some("OAuth 2.0 Bearer Token"))
                        .build(),
                ),
            );
        }
    }
}

#[derive(OpenApi)]
#[openapi(
    info(
        title = "Order Wizard API",
        description = "API for managing Amazon order tracking",
        version = "0.1.0"
    ),
    tags(
        (name = "Health", description = "Health check endpoints"),
        (name = "Auth", description = "Authentication endpoints"),
        (name = "Orders", description = "Order management endpoints")
    ),
    modifiers(&SecurityAddon)
)]
struct ApiDoc;

#[tokio::main]
async fn main() {
    // Load .env file if present
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    // Initialize JWT verifier with Cognito configuration
    let issuer = std::env::var("OIDC_ISSUER").expect("OIDC_ISSUER must be set");
    let client_id = std::env::var("OIDC_CLIENT_ID").expect("OIDC_CLIENT_ID must be set");
    JwksVerifier::init(issuer, client_id);
    tracing::info!("JWT verifier initialized");

    // Initialize database (optional - server can still serve auth endpoints without it)
    if let Err(e) = db::init_db().await {
        tracing::warn!(
            "Failed to connect to MongoDB: {}. Order endpoints will not work.",
            e
        );
    }

    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::mirror_request())
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::PATCH, Method::OPTIONS])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE, header::ACCEPT])
        .expose_headers([header::CONTENT_TYPE])
        .allow_credentials(true);

    // Public routes (no auth required)
    let public_routes = OpenApiRouter::new().routes(utoipa_axum::routes!(health));

    // Protected routes (auth middleware applied)
    let protected_routes = OpenApiRouter::new()
        .routes(utoipa_axum::routes!(me))
        .merge(routes::orders::router())
        .layer(middleware::from_fn(auth_middleware));

    let (router, api) = OpenApiRouter::with_openapi(ApiDoc::openapi())
        .merge(public_routes)
        .merge(protected_routes)
        .split_for_parts();

    let app = router
        .merge(SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", api))
        .layer(cors);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let addr = format!("0.0.0.0:{}", port);

    tracing::info!("Server running on {}", addr);
    tracing::info!(
        "Swagger UI available at http://localhost:{}/swagger-ui",
        port
    );

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
