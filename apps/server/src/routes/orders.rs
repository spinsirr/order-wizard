use axum::{extract::Path, http::StatusCode, Extension, Json};
use utoipa_axum::{router::OpenApiRouter, routes};

use crate::application::{OrderApplication, UpdateOrder, UpsertOrder};
use crate::auth::{AuthError, AuthPrincipal};
use crate::errors::AppResult;
use crate::models::{
    BatchDeleteRequest, BatchDeleteResponse, BatchUpsertRequest, BatchUpsertResponse,
    CreateOrderRequest, Order, UpdateOrderRequest,
};

pub fn router() -> OpenApiRouter {
    OpenApiRouter::new()
        .routes(routes!(list_orders))
        .routes(routes!(create_order))
        .routes(routes!(batch_upsert_orders))
        .routes(routes!(batch_delete_orders))
        .routes(routes!(get_order))
        .routes(routes!(update_order))
        .routes(routes!(delete_order))
}

#[utoipa::path(
    get,
    path = "/orders",
    tag = "Orders",
    summary = "List all orders",
    description = "Returns all orders for the authenticated user",
    responses(
        (status = 200, description = "List of orders", body = Vec<Order>),
        (status = 401, description = "Unauthorized", body = AuthError)
    ),
    security(("bearer_auth" = []))
)]
async fn list_orders(
    Extension(application): Extension<OrderApplication>,
    AuthPrincipal(principal): AuthPrincipal,
) -> AppResult<Json<Vec<Order>>> {
    tracing::info!("GET /orders - user: {}", principal.user_id().as_str());

    let orders = application.list_orders(&principal).await?;

    tracing::info!("GET /orders - returning {} orders", orders.len());
    Ok(Json(orders))
}

#[utoipa::path(
    post,
    path = "/orders",
    tag = "Orders",
    summary = "Create a new order",
    description = "Creates a new order for the authenticated user (upsert by order_number)",
    request_body = CreateOrderRequest,
    responses(
        (status = 201, description = "Order created successfully", body = Order),
        (status = 401, description = "Unauthorized", body = AuthError)
    ),
    security(("bearer_auth" = []))
)]
async fn create_order(
    Extension(application): Extension<OrderApplication>,
    AuthPrincipal(principal): AuthPrincipal,
    Json(payload): Json<CreateOrderRequest>,
) -> AppResult<(StatusCode, Json<Order>)> {
    tracing::info!(
        "POST /orders - user: {}, order_number: {}",
        principal.user_id().as_str(),
        payload.order_number
    );

    let order = application
        .upsert_order(&principal, UpsertOrder::from(payload))
        .await?;

    tracing::info!("POST /orders - canonical order: {}", order.id);
    Ok((StatusCode::CREATED, Json(order)))
}

impl From<CreateOrderRequest> for UpsertOrder {
    fn from(request: CreateOrderRequest) -> Self {
        Self {
            id: request.id,
            order_number: request.order_number,
            product_name: request.product_name,
            order_date: request.order_date,
            product_image: request.product_image,
            price: request.price,
            status: request.status,
            note: request.note,
            updated_at: request.updated_at,
            created_at: request.created_at,
            deleted_at: request.deleted_at,
        }
    }
}

#[utoipa::path(
    post,
    path = "/orders/batch",
    tag = "Orders",
    summary = "Batch upsert orders",
    description = "Upserts multiple orders in a single request",
    request_body = BatchUpsertRequest,
    responses(
        (status = 200, description = "Batch upsert completed", body = BatchUpsertResponse),
        (status = 401, description = "Unauthorized", body = AuthError)
    ),
    security(("bearer_auth" = []))
)]
async fn batch_upsert_orders(
    Extension(application): Extension<OrderApplication>,
    AuthPrincipal(principal): AuthPrincipal,
    Json(payload): Json<BatchUpsertRequest>,
) -> AppResult<Json<BatchUpsertResponse>> {
    let count = payload.orders.len();
    tracing::info!(
        "POST /orders/batch - user: {}, count: {}",
        principal.user_id().as_str(),
        count
    );

    let inputs = payload.orders.into_iter().map(UpsertOrder::from).collect();
    let upserted = application.batch_upsert_orders(&principal, inputs).await?;

    tracing::info!("POST /orders/batch - applied {} orders", upserted);
    Ok(Json(BatchUpsertResponse { upserted }))
}

#[utoipa::path(
    post,
    path = "/orders/batch-delete",
    tag = "Orders",
    summary = "Batch delete orders",
    description = "Deletes multiple orders by their IDs",
    request_body = BatchDeleteRequest,
    responses(
        (status = 200, description = "Batch delete completed", body = BatchDeleteResponse),
        (status = 401, description = "Unauthorized", body = AuthError)
    ),
    security(("bearer_auth" = []))
)]
async fn batch_delete_orders(
    Extension(application): Extension<OrderApplication>,
    AuthPrincipal(principal): AuthPrincipal,
    Json(payload): Json<BatchDeleteRequest>,
) -> AppResult<Json<BatchDeleteResponse>> {
    tracing::info!(
        "POST /orders/batch-delete - user: {}, count: {}",
        principal.user_id().as_str(),
        payload.ids.len()
    );

    let deleted = application
        .batch_delete_orders(&principal, payload.ids)
        .await?;

    tracing::info!("POST /orders/batch-delete - deleted {} orders", deleted);
    Ok(Json(BatchDeleteResponse { deleted }))
}

#[utoipa::path(
    get,
    path = "/orders/{id}",
    tag = "Orders",
    summary = "Get an order by ID",
    description = "Returns a specific order by its ID",
    params(
        ("id" = String, Path, description = "Order ID")
    ),
    responses(
        (status = 200, description = "Order found", body = Order),
        (status = 404, description = "Order not found"),
        (status = 401, description = "Unauthorized", body = AuthError)
    ),
    security(("bearer_auth" = []))
)]
async fn get_order(
    Extension(application): Extension<OrderApplication>,
    AuthPrincipal(principal): AuthPrincipal,
    Path(id): Path<String>,
) -> AppResult<Json<Order>> {
    tracing::info!(
        "GET /orders/{} - user: {}",
        id,
        principal.user_id().as_str()
    );

    let order = application.get_order(&principal, &id).await?;

    Ok(Json(order))
}

#[utoipa::path(
    patch,
    path = "/orders/{id}",
    tag = "Orders",
    summary = "Update an order",
    description = "Updates an existing order's status or note",
    params(
        ("id" = String, Path, description = "Order ID")
    ),
    request_body = UpdateOrderRequest,
    responses(
        (status = 200, description = "Order updated successfully"),
        (status = 400, description = "Bad request (empty update or invalid timestamp)"),
        (status = 409, description = "Order version conflict; fetch the latest order and retry"),
        (status = 404, description = "Order not found"),
        (status = 401, description = "Unauthorized", body = AuthError)
    ),
    security(("bearer_auth" = []))
)]
async fn update_order(
    Extension(application): Extension<OrderApplication>,
    AuthPrincipal(principal): AuthPrincipal,
    Path(id): Path<String>,
    Json(payload): Json<UpdateOrderRequest>,
) -> AppResult<StatusCode> {
    tracing::info!(
        "PATCH /orders/{} - user: {}",
        id,
        principal.user_id().as_str()
    );

    application
        .update_order(
            &principal,
            &id,
            UpdateOrder {
                status: payload.status,
                note: payload.note,
                updated_at: payload.updated_at,
                deleted_at: payload.deleted_at,
                ..UpdateOrder::default()
            },
        )
        .await?;

    tracing::info!("PATCH /orders/{} - updated", id);
    Ok(StatusCode::OK)
}

#[utoipa::path(
    delete,
    path = "/orders/{id}",
    tag = "Orders",
    summary = "Delete an order",
    description = "Deletes an order by its ID",
    params(
        ("id" = String, Path, description = "Order ID")
    ),
    responses(
        (status = 204, description = "Order deleted successfully"),
        (status = 404, description = "Order not found"),
        (status = 401, description = "Unauthorized", body = AuthError)
    ),
    security(("bearer_auth" = []))
)]
async fn delete_order(
    Extension(application): Extension<OrderApplication>,
    AuthPrincipal(principal): AuthPrincipal,
    Path(id): Path<String>,
) -> AppResult<StatusCode> {
    tracing::info!(
        "DELETE /orders/{} - user: {}",
        id,
        principal.user_id().as_str()
    );

    application.delete_order(&principal, &id).await?;

    tracing::info!("DELETE /orders/{} - deleted", id);
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests;
