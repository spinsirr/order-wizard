mod auth;
mod db;
mod models;
mod routes;

use auth::{AuthError, AuthUser};
use axum::Json;
use serde::Serialize;
use tower_http::cors::{Any, CorsLayer};
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

/// OAuth 2.0 Protected Resource Metadata per RFC 9728
#[derive(Serialize, ToSchema)]
struct ProtectedResourceMetadata {
    /// The protected resource's resource identifier
    resource: String,
    /// Authorization servers that can authorize access to this resource
    authorization_servers: Vec<String>,
    /// OAuth 2.0 client ID to use with the authorization server
    client_id: String,
    /// Bearer token types supported
    bearer_methods_supported: Vec<String>,
    /// Scopes supported by this protected resource
    scopes_supported: Vec<String>,
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
    path = "/.well-known/oauth-protected-resource",
    tag = "Auth",
    summary = "OAuth 2.0 Protected Resource Metadata",
    description = "Returns the OAuth 2.0 Protected Resource Metadata per RFC 9728",
    responses(
        (status = 200, description = "Protected Resource Metadata", body = ProtectedResourceMetadata)
    )
)]
async fn protected_resource_metadata() -> Json<ProtectedResourceMetadata> {
    let resource = std::env::var("RESOURCE_URI").expect("RESOURCE_URI must be set");
    let authorization_server =
        std::env::var("OIDC_ISSUER").expect("OIDC_ISSUER must be set");
    let client_id = std::env::var("OIDC_CLIENT_ID").expect("OIDC_CLIENT_ID must be set");

    // Get scopes from environment, defaulting to openid and email
    // Note: Cognito app clients must have scopes explicitly enabled
    let scopes = std::env::var("OIDC_SCOPES")
        .unwrap_or_else(|_| "openid email".to_string())
        .split_whitespace()
        .map(|s| s.to_string())
        .collect();

    Json(ProtectedResourceMetadata {
        resource,
        authorization_servers: vec![authorization_server],
        client_id,
        bearer_methods_supported: vec!["header".to_string()],
        scopes_supported: scopes,
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

    // Initialize database (optional - server can still serve auth endpoints without it)
    if let Err(e) = db::init_db().await {
        tracing::warn!("Failed to connect to MongoDB: {}. Order endpoints will not work.", e);
    }

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let (router, api) = OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(utoipa_axum::routes!(health))
        .routes(utoipa_axum::routes!(protected_resource_metadata))
        .routes(utoipa_axum::routes!(me))
        .merge(routes::orders::router())
        .split_for_parts();

    let app = router
        .merge(SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", api))
        .layer(cors);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let addr = format!("0.0.0.0:{}", port);

    tracing::info!("Server running on {}", addr);
    tracing::info!("Swagger UI available at http://localhost:{}/swagger-ui", port);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
