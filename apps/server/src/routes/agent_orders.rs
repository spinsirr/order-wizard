use axum::{
    extract::{Path, Query},
    Extension, Json,
};
use serde::Deserialize;
use utoipa::{IntoParams, ToSchema};
use utoipa_axum::{router::OpenApiRouter, routes};

use crate::application::{AgentOrder, OrderApplication, OrderInbox, OrderPage, OrderSearch};
use crate::auth::{AuthAgentPrincipal, AuthError};
use crate::errors::AppResult;
use crate::models::OrderStatus;

#[derive(Debug, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
struct AgentOrderQuery {
    /// Case-insensitive text matched against ID, order number, product name, and note.
    q: Option<String>,
    /// Continuation cursor from nextCursor; keep filters unchanged.
    after: Option<String>,
    /// Optional exact order status.
    status: Option<OrderStatus>,
    /// Maximum results from 1 through 100. Defaults to 50.
    limit: Option<usize>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AgentStatusUpdateRequest {
    /// Exact version token from the last read.
    expected_version: String,
    status: OrderStatus,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AgentNoteUpdateRequest {
    /// Exact version token from the last read.
    expected_version: String,
    note: String,
}

pub fn router() -> OpenApiRouter {
    OpenApiRouter::new()
        .routes(routes!(search_orders))
        .routes(routes!(order_inbox))
        .routes(routes!(get_order))
        .routes(routes!(update_status))
        .routes(routes!(update_note))
}

#[utoipa::path(
    get,
    path = "/agent/orders",
    tag = "Agent Orders",
    summary = "Search the authenticated user's orders",
    params(AgentOrderQuery),
    responses(
        (status = 200, description = "Matching orders", body = OrderPage),
        (status = 400, description = "Invalid search parameters"),
        (status = 401, description = "Unauthorized", body = AuthError)
    ),
    security(("bearer_auth" = []))
)]
async fn search_orders(
    Extension(application): Extension<OrderApplication>,
    AuthAgentPrincipal(principal): AuthAgentPrincipal,
    Query(query): Query<AgentOrderQuery>,
) -> AppResult<Json<OrderPage>> {
    let orders = application
        .search_orders(
            &principal,
            OrderSearch {
                query: query.q,
                after: query.after,
                status: query.status,
                limit: query.limit.unwrap_or(50),
                ..OrderSearch::default()
            },
        )
        .await?;
    Ok(Json(orders))
}

#[utoipa::path(
    get,
    path = "/agent/orders/{id}",
    tag = "Agent Orders",
    summary = "Get one order",
    params(("id" = String, Path, description = "Order ID")),
    responses(
        (status = 200, description = "Order detail", body = AgentOrder),
        (status = 404, description = "Order not found"),
        (status = 401, description = "Unauthorized", body = AuthError)
    ),
    security(("bearer_auth" = []))
)]
async fn get_order(
    Extension(application): Extension<OrderApplication>,
    AuthAgentPrincipal(principal): AuthAgentPrincipal,
    Path(id): Path<String>,
) -> AppResult<Json<AgentOrder>> {
    let order = application.get_order(&principal, &id).await?;
    Ok(Json(order.into()))
}

#[utoipa::path(
    patch,
    path = "/agent/orders/{id}/status",
    tag = "Agent Orders",
    summary = "Update an order's status",
    params(("id" = String, Path, description = "Order ID")),
    request_body = AgentStatusUpdateRequest,
    responses(
        (status = 200, description = "Canonical updated order", body = AgentOrder),
        (status = 409, description = "Order changed; read again before editing"),
        (status = 422, description = "Missing version or invalid mutation payload"),
        (status = 404, description = "Order not found"),
        (status = 401, description = "Unauthorized", body = AuthError)
    ),
    security(("bearer_auth" = []))
)]
async fn update_status(
    Extension(application): Extension<OrderApplication>,
    AuthAgentPrincipal(principal): AuthAgentPrincipal,
    Path(id): Path<String>,
    Json(request): Json<AgentStatusUpdateRequest>,
) -> AppResult<Json<AgentOrder>> {
    let order = application
        .update_status(&principal, &id, request.status, request.expected_version)
        .await?;
    Ok(Json(order.into()))
}

#[utoipa::path(
    patch,
    path = "/agent/orders/{id}/note",
    tag = "Agent Orders",
    summary = "Update an order's note",
    params(("id" = String, Path, description = "Order ID")),
    request_body = AgentNoteUpdateRequest,
    responses(
        (status = 200, description = "Canonical updated order", body = AgentOrder),
        (status = 409, description = "Order changed; read again before editing"),
        (status = 422, description = "Missing version or invalid mutation payload"),
        (status = 404, description = "Order not found"),
        (status = 401, description = "Unauthorized", body = AuthError)
    ),
    security(("bearer_auth" = []))
)]
async fn update_note(
    Extension(application): Extension<OrderApplication>,
    AuthAgentPrincipal(principal): AuthAgentPrincipal,
    Path(id): Path<String>,
    Json(request): Json<AgentNoteUpdateRequest>,
) -> AppResult<Json<AgentOrder>> {
    let order = application
        .update_note(&principal, &id, request.note, request.expected_version)
        .await?;
    Ok(Json(order.into()))
}

#[derive(Debug, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
struct InboxQuery {
    /// User's local calendar date, YYYY-MM-DD.
    as_of: String,
    after: Option<String>,
    limit: Option<usize>,
}

#[utoipa::path(get, path = "/agent/inbox", tag = "Agent Orders", params(InboxQuery),
    responses((status = 200, description = "Pending orders and suggested checks, paginated by order number", body = OrderInbox)),
    security(("bearer_auth" = [])))]
async fn order_inbox(
    Extension(application): Extension<OrderApplication>,
    AuthAgentPrincipal(principal): AuthAgentPrincipal,
    Query(query): Query<InboxQuery>,
) -> AppResult<Json<OrderInbox>> {
    Ok(Json(
        application
            .order_inbox(
                &principal,
                &query.as_of,
                query.after,
                query.limit.unwrap_or(50),
            )
            .await?,
    ))
}

#[cfg(test)]
mod tests;
