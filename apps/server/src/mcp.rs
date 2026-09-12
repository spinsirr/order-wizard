use std::{borrow::Cow, sync::Arc};

use axum::http::request::Parts;
use rmcp::{
    handler::server::{tool::Extension as McpExtension, wrapper::Parameters},
    model::{CallToolResult, ContentBlock, ProtocolVersion},
    tool, tool_handler, tool_router, Json, ServerHandler,
};
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::json;

use crate::{
    application::{ApplicationError, OrderApplication, OrderSearch, Principal},
    models::{Order, OrderStatus},
};

use rmcp::transport::streamable_http_server::{
    session::never::NeverSessionManager, StreamableHttpServerConfig, StreamableHttpService,
};

const DEFAULT_LIMIT: usize = 50;

fn default_limit() -> usize {
    DEFAULT_LIMIT
}

#[derive(Debug, Deserialize, JsonSchema)]
struct ListOrdersParams {
    /// Optional exact order status.
    status: Option<OrderStatus>,
    /// Maximum number of orders to return, from 1 through 100.
    #[serde(default = "default_limit")]
    #[schemars(range(min = 1, max = 100))]
    limit: usize,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct SearchOrdersParams {
    /// Case-insensitive text matched against order ID, number, product name, and note.
    query: String,
    /// Optional exact order status.
    status: Option<OrderStatus>,
    /// Maximum number of matching orders to return, from 1 through 100.
    #[serde(default = "default_limit")]
    #[schemars(range(min = 1, max = 100))]
    limit: usize,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct GetOrderParams {
    /// Canonical Order Wizard order ID.
    id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct SetStatusParams {
    /// Canonical Order Wizard order ID.
    id: String,
    /// New workflow status.
    status: OrderStatus,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct SetNoteParams {
    /// Canonical Order Wizard order ID.
    id: String,
    /// Complete replacement note. Pass an empty string to clear it.
    note: String,
}

#[derive(Clone)]
pub(crate) struct OrderMcpServer {
    application: OrderApplication,
}

impl OrderMcpServer {
    pub(crate) fn new(application: OrderApplication) -> Self {
        Self { application }
    }
}

#[tool_router]
impl OrderMcpServer {
    #[tool(
        name = "orders_list",
        description = "List the authenticated user's orders, optionally filtered by status.",
        annotations(
            title = "List orders",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn list_orders(
        &self,
        McpExtension(parts): McpExtension<Parts>,
        Parameters(params): Parameters<ListOrdersParams>,
    ) -> Result<Json<Vec<Order>>, CallToolResult> {
        let principal = principal_from_parts(&parts)
            .ok_or_else(|| tool_error("AUTH_REQUIRED", "Missing authenticated principal"))?;
        self.application
            .search_orders(
                &principal,
                OrderSearch {
                    query: None,
                    status: params.status,
                    limit: params.limit,
                },
            )
            .await
            .map(Json)
            .map_err(application_error)
    }

    #[tool(
        name = "orders_search",
        description = "Search the authenticated user's order IDs, numbers, product names, and notes.",
        annotations(
            title = "Search orders",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn search_orders(
        &self,
        McpExtension(parts): McpExtension<Parts>,
        Parameters(params): Parameters<SearchOrdersParams>,
    ) -> Result<Json<Vec<Order>>, CallToolResult> {
        let principal = principal_from_parts(&parts)
            .ok_or_else(|| tool_error("AUTH_REQUIRED", "Missing authenticated principal"))?;
        self.application
            .search_orders(
                &principal,
                OrderSearch {
                    query: Some(params.query),
                    status: params.status,
                    limit: params.limit,
                },
            )
            .await
            .map(Json)
            .map_err(application_error)
    }

    #[tool(
        name = "orders_get",
        description = "Get one order by its canonical Order Wizard ID.",
        annotations(
            title = "Get order",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn get_order(
        &self,
        McpExtension(parts): McpExtension<Parts>,
        Parameters(params): Parameters<GetOrderParams>,
    ) -> Result<Json<Order>, CallToolResult> {
        let principal = principal_from_parts(&parts)
            .ok_or_else(|| tool_error("AUTH_REQUIRED", "Missing authenticated principal"))?;
        self.application
            .get_order(&principal, &params.id)
            .await
            .map(Json)
            .map_err(application_error)
    }

    #[tool(
        name = "orders_set_status",
        description = "Replace one order's workflow status.",
        annotations(
            title = "Set order status",
            read_only_hint = false,
            destructive_hint = true,
            idempotent_hint = false,
            open_world_hint = false
        )
    )]
    async fn set_status(
        &self,
        McpExtension(parts): McpExtension<Parts>,
        Parameters(params): Parameters<SetStatusParams>,
    ) -> Result<Json<Order>, CallToolResult> {
        let principal = principal_from_parts(&parts)
            .ok_or_else(|| tool_error("AUTH_REQUIRED", "Missing authenticated principal"))?;
        self.application
            .update_status(&principal, &params.id, params.status)
            .await
            .map(Json)
            .map_err(application_error)
    }

    #[tool(
        name = "orders_set_note",
        description = "Replace one order's note. This cannot create or delete orders.",
        annotations(
            title = "Set order note",
            read_only_hint = false,
            destructive_hint = true,
            idempotent_hint = false,
            open_world_hint = false
        )
    )]
    async fn set_note(
        &self,
        McpExtension(parts): McpExtension<Parts>,
        Parameters(params): Parameters<SetNoteParams>,
    ) -> Result<Json<Order>, CallToolResult> {
        let principal = principal_from_parts(&parts)
            .ok_or_else(|| tool_error("AUTH_REQUIRED", "Missing authenticated principal"))?;
        self.application
            .update_note(&principal, &params.id, params.note)
            .await
            .map(Json)
            .map_err(application_error)
    }
}

#[tool_handler(
    name = "order-wizard",
    instructions = "Read orders and update only their status or note. Creating and deleting orders are intentionally unavailable."
)]
impl ServerHandler for OrderMcpServer {
    fn supported_protocol_versions(&self) -> Cow<'static, [ProtocolVersion]> {
        Cow::Borrowed(&[ProtocolVersion::V_2026_07_28])
    }

    async fn list_tools(
        &self,
        _request: Option<rmcp::model::PaginatedRequestParams>,
        context: rmcp::service::RequestContext<rmcp::RoleServer>,
    ) -> Result<rmcp::model::ListToolsResult, rmcp::ErrorData> {
        let mut tools = Self::tool_router().list_all();
        tools.sort_by(|left, right| left.name.cmp(&right.name));
        let supports_cache_hints = context
            .protocol_version()
            .is_some_and(|version| version >= ProtocolVersion::V_2026_07_28);
        Ok(rmcp::model::ListToolsResult {
            result_type: Some(rmcp::model::ResultType::COMPLETE),
            tools,
            meta: None,
            next_cursor: None,
            ttl_ms: supports_cache_hints.then_some(0),
            cache_scope: supports_cache_hints.then_some(rmcp::model::CacheScope::Public),
        })
    }
}

pub(crate) fn service(
    application: OrderApplication,
    config: StreamableHttpServerConfig,
) -> StreamableHttpService<OrderMcpServer, NeverSessionManager> {
    let factory_application = application.clone();
    StreamableHttpService::new(
        move || Ok(OrderMcpServer::new(factory_application.clone())),
        Arc::new(NeverSessionManager::default()),
        config,
    )
}

pub(crate) fn transport_config(resource_uri: &str) -> Result<StreamableHttpServerConfig, String> {
    let resource = reqwest::Url::parse(resource_uri)
        .map_err(|error| format!("RESOURCE_URI is invalid: {error}"))?;
    if !matches!(resource.scheme(), "http" | "https") {
        return Err("RESOURCE_URI must use http or https".to_string());
    }

    let resource_host = resource
        .host_str()
        .ok_or_else(|| "RESOURCE_URI must contain a host".to_string())?;
    let resource_authority = resource
        .port()
        .map(|port| format!("{resource_host}:{port}"))
        .unwrap_or_else(|| resource_host.to_string());

    let mut allowed_hosts = vec![
        resource_authority,
        "localhost".to_string(),
        "127.0.0.1".to_string(),
        "::1".to_string(),
    ];
    extend_csv_env(&mut allowed_hosts, "MCP_ALLOWED_HOSTS");
    deduplicate(&mut allowed_hosts);

    let mut allowed_origins = vec![resource.origin().ascii_serialization()];
    extend_csv_env(&mut allowed_origins, "MCP_ALLOWED_ORIGINS");
    deduplicate(&mut allowed_origins);

    Ok(StreamableHttpServerConfig::default()
        .with_legacy_session_mode(false)
        .with_json_response(true)
        .with_stateless_protocol_metadata_required(true)
        .with_allowed_hosts(allowed_hosts)
        .with_allowed_origins(allowed_origins))
}

fn extend_csv_env(values: &mut Vec<String>, name: &str) {
    if let Ok(configured) = std::env::var(name) {
        values.extend(
            configured
                .split(',')
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned),
        );
    }
}

fn deduplicate(values: &mut Vec<String>) {
    let mut seen = std::collections::HashSet::new();
    values.retain(|value| seen.insert(value.clone()));
}

fn principal_from_parts(parts: &Parts) -> Option<Principal> {
    parts.extensions.get::<Principal>().cloned()
}

fn application_error(error: ApplicationError) -> CallToolResult {
    match error {
        ApplicationError::Forbidden => tool_error(
            "INSUFFICIENT_SCOPE",
            "The access token lacks the required scope",
        ),
        ApplicationError::InvalidInput(message) => tool_error("INVALID_INPUT", &message),
        ApplicationError::NotFound => tool_error("NOT_FOUND", "Order not found"),
        ApplicationError::Repository(message) => {
            tracing::error!(error = %message, "MCP order operation failed");
            tool_error("INTERNAL_ERROR", "Order operation failed")
        }
    }
}

fn tool_error(code: &str, message: &str) -> CallToolResult {
    CallToolResult::error(vec![ContentBlock::text(
        json!({ "code": code, "message": message }).to_string(),
    )])
}

#[cfg(test)]
mod tests;
