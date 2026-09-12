use crate::{api::ApiClient, auth::Profile, command::OrderStatus, CliError};
use rmcp::{
    handler::server::wrapper::Parameters, model::CallToolResult, tool, tool_handler, tool_router,
    Json, ServerHandler, ServiceExt,
};
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize, JsonSchema)]
struct ListParams {
    status: Option<OrderStatus>,
    #[serde(default = "default_limit")]
    #[schemars(range(min = 1, max = 100))]
    limit: u8,
}
#[derive(Deserialize, JsonSchema)]
struct SearchParams {
    query: String,
    status: Option<OrderStatus>,
    #[serde(default = "default_limit")]
    #[schemars(range(min = 1, max = 100))]
    limit: u8,
}
#[derive(Deserialize, JsonSchema)]
struct GetParams {
    id: String,
}
#[derive(Deserialize, JsonSchema)]
struct StatusParams {
    id: String,
    status: OrderStatus,
}
#[derive(Deserialize, JsonSchema)]
struct NoteParams {
    id: String,
    note: String,
}
fn default_limit() -> u8 {
    50
}

#[derive(Clone)]
struct OrderTools;
fn tool_error(error: CliError) -> CallToolResult {
    CallToolResult::error(vec![rmcp::model::ContentBlock::text(error.as_json())])
}
async fn api() -> Result<ApiClient, CallToolResult> {
    ApiClient::from_environment(Profile::Mcp)
        .await
        .map_err(tool_error)
}

#[tool_router]
impl OrderTools {
    #[tool(
        name = "orders_list",
        description = "List your orders, optionally filtered by status.",
        annotations(
            read_only_hint = true,
            destructive_hint = false,
            open_world_hint = false
        )
    )]
    async fn list(
        &self,
        Parameters(p): Parameters<ListParams>,
    ) -> Result<Json<Value>, CallToolResult> {
        api()
            .await?
            .list_orders(p.status, p.limit)
            .await
            .map(Json)
            .map_err(tool_error)
    }
    #[tool(
        name = "orders_search",
        description = "Search your order IDs, numbers, product names, and notes.",
        annotations(
            read_only_hint = true,
            destructive_hint = false,
            open_world_hint = false
        )
    )]
    async fn search(
        &self,
        Parameters(p): Parameters<SearchParams>,
    ) -> Result<Json<Value>, CallToolResult> {
        api()
            .await?
            .search_orders(&p.query, p.status, p.limit)
            .await
            .map(Json)
            .map_err(tool_error)
    }
    #[tool(
        name = "orders_get",
        description = "Get one of your orders by its canonical ID.",
        annotations(
            read_only_hint = true,
            destructive_hint = false,
            open_world_hint = false
        )
    )]
    async fn get(
        &self,
        Parameters(p): Parameters<GetParams>,
    ) -> Result<Json<Value>, CallToolResult> {
        api()
            .await?
            .get_order(&p.id)
            .await
            .map(Json)
            .map_err(tool_error)
    }
    #[tool(
        name = "orders_set_status",
        description = "Replace one order's workflow status.",
        annotations(
            read_only_hint = false,
            destructive_hint = true,
            open_world_hint = false
        )
    )]
    async fn status(
        &self,
        Parameters(p): Parameters<StatusParams>,
    ) -> Result<Json<Value>, CallToolResult> {
        api()
            .await?
            .update_status(&p.id, p.status)
            .await
            .map(Json)
            .map_err(tool_error)
    }
    #[tool(
        name = "orders_set_note",
        description = "Replace one order's note. This cannot create or delete orders.",
        annotations(
            read_only_hint = false,
            destructive_hint = true,
            open_world_hint = false
        )
    )]
    async fn note(
        &self,
        Parameters(p): Parameters<NoteParams>,
    ) -> Result<Json<Value>, CallToolResult> {
        api()
            .await?
            .update_note(&p.id, &p.note)
            .await
            .map(Json)
            .map_err(tool_error)
    }
}
#[tool_handler(
    name = "order-wizard",
    instructions = "Read orders and update only their status or note. Creating and deleting orders are unavailable."
)]
impl ServerHandler for OrderTools {}

pub(crate) async fn serve() -> Result<Value, CliError> {
    OrderTools
        .serve(rmcp::transport::stdio())
        .await
        .map_err(|_| CliError::protocol("MCP initialization failed"))?
        .waiting()
        .await
        .map_err(|_| CliError::protocol("MCP transport failed"))?;
    Ok(Value::Null)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stdio_exposes_exactly_the_five_order_tools() {
        let tools = OrderTools::tool_router().list_all();
        let mut names: Vec<_> = tools.iter().map(|tool| tool.name.as_ref()).collect();
        names.sort();
        assert_eq!(
            names,
            [
                "orders_get",
                "orders_list",
                "orders_search",
                "orders_set_note",
                "orders_set_status"
            ]
        );
    }
}
