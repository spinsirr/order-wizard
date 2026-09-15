mod application;
mod auth;
mod db;
mod errors;
mod mcp;
mod models;
mod routes;

use application::{MongoOrderRepository, OrderApplication};
use auth::{auth_middleware, AuthError, AuthPolicy, AuthUser, JwksVerifier};
use axum::http::{header, Method};
use axum::{middleware, Extension, Json, Router};
use serde::Serialize;
use tower_governor::{
    governor::GovernorConfigBuilder, key_extractor::SmartIpKeyExtractor, GovernorLayer,
};
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
        title = "OrderCue API",
        description = "API for managing Amazon order tracking",
        version = env!("CARGO_PKG_VERSION")
    ),
    tags(
        (name = "Health", description = "Health check endpoints"),
        (name = "Auth", description = "Authentication endpoints"),
        (name = "Orders", description = "Order management endpoints")
    ),
    modifiers(&SecurityAddon)
)]
struct ApiDoc;

/// Start the API and its database-backed order repository.
///
/// # Errors
/// Returns configuration, database, listener, or server errors during startup and serving.
pub async fn run() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .try_init()?;

    let issuer = std::env::var("OIDC_ISSUER")?;
    let extension_client_id = std::env::var("OIDC_CLIENT_ID")?;
    let resource_uri = std::env::var("RESOURCE_URI")?;
    let mcp_transport_config = mcp::transport_config(&resource_uri)?;
    let protected_resource_metadata = routes::oauth_metadata::ProtectedResourceMetadata::new(
        resource_uri.clone(),
        issuer.clone(),
    );
    let mut agent_client_ids = std::env::var("OIDC_CLI_CLIENT_ID")
        .into_iter()
        .chain(std::env::var("OIDC_MCP_CLIENT_IDS"))
        .flat_map(|value| {
            value
                .split(',')
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    agent_client_ids.sort();
    agent_client_ids.dedup();
    let auth_policy =
        AuthPolicy::new(extension_client_id, resource_uri).with_agent_clients(agent_client_ids)?;
    let verifier = JwksVerifier::new(issuer, auth_policy);
    tracing::info!("JWT verifier initialized");

    let database = db::connect().await?;
    let order_application =
        OrderApplication::new(MongoOrderRepository::new(db::orders_collection(&database)));

    let cors = cors_layer();

    let governor_config = GovernorConfigBuilder::default()
        .per_second(1)
        .burst_size(60)
        .key_extractor(SmartIpKeyExtractor)
        .finish()
        .ok_or("Failed to create rate limiter config")?;
    let rate_limit = GovernorLayer::new(governor_config);

    let public_routes = OpenApiRouter::new()
        .routes(utoipa_axum::routes!(health))
        .merge(routes::oauth_metadata::router(protected_resource_metadata));
    let protected_routes = OpenApiRouter::new()
        .routes(utoipa_axum::routes!(me))
        .merge(routes::orders::router())
        .merge(routes::agent_orders::router())
        .layer(Extension(order_application.clone()))
        .layer(middleware::from_fn_with_state(
            verifier.clone(),
            auth_middleware,
        ));

    let mcp_routes = Router::new()
        .nest_service(
            "/mcp",
            mcp::service(order_application.clone(), mcp_transport_config),
        )
        .layer(middleware::from_fn_with_state(verifier, auth_middleware));

    let (router, api) = OpenApiRouter::with_openapi(ApiDoc::openapi())
        .merge(public_routes)
        .merge(protected_routes)
        .split_for_parts();
    let router = router.merge(mcp_routes);

    let enable_swagger = std::env::var("ENABLE_SWAGGER")
        .map(|value| value == "true" || value == "1")
        .unwrap_or(false);

    let app = if enable_swagger {
        router
            .merge(SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", api))
            .layer(rate_limit)
            .layer(cors)
    } else {
        router.layer(rate_limit).layer(cors)
    };

    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let address = format!("0.0.0.0:{port}");

    tracing::info!("Server running on {address}");
    if enable_swagger {
        tracing::info!("Swagger UI available at http://localhost:{port}/swagger-ui");
    }

    let listener = tokio::net::TcpListener::bind(&address).await?;
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await?;
    Ok(())
}

fn cors_layer() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(AllowOrigin::mirror_request())
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::PATCH,
            Method::OPTIONS,
        ])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE, header::ACCEPT])
        .expose_headers([header::CONTENT_TYPE])
        .allow_credentials(true)
}
