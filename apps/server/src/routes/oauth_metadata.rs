use axum::{Extension, Json};
use serde::Serialize;
use utoipa::ToSchema;
use utoipa_axum::{router::OpenApiRouter, routes};

use crate::auth::agent_scope_values;

#[derive(Clone, Debug, Serialize, ToSchema)]
pub struct ProtectedResourceMetadata {
    resource: String,
    resource_name: &'static str,
    authorization_servers: Vec<String>,
    scopes_supported: Vec<String>,
    bearer_methods_supported: [&'static str; 1],
    resource_signing_alg_values_supported: [&'static str; 1],
}

impl ProtectedResourceMetadata {
    pub fn new(resource: impl Into<String>, authorization_server: impl Into<String>) -> Self {
        let resource = resource.into().trim_end_matches('/').to_string();
        let scopes_supported = agent_scope_values(&resource);
        Self {
            resource,
            resource_name: "OrderCue API",
            authorization_servers: vec![authorization_server.into()],
            scopes_supported,
            bearer_methods_supported: ["header"],
            resource_signing_alg_values_supported: ["RS256"],
        }
    }
}

pub fn router(metadata: ProtectedResourceMetadata) -> OpenApiRouter {
    OpenApiRouter::new()
        .routes(routes!(get_metadata))
        .layer(Extension(metadata))
}

#[utoipa::path(
    get,
    path = "/.well-known/oauth-protected-resource",
    tag = "Auth",
    summary = "OAuth protected resource metadata",
    responses(
        (status = 200, description = "RFC 9728 protected resource metadata", body = ProtectedResourceMetadata)
    )
)]
async fn get_metadata(
    Extension(metadata): Extension<ProtectedResourceMetadata>,
) -> Json<ProtectedResourceMetadata> {
    Json(metadata)
}

#[cfg(test)]
mod tests;
