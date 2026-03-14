use axum::{extract::Path, http::StatusCode, Json};
use futures::TryStreamExt;
use mongodb::bson::doc;
use utoipa_axum::{router::OpenApiRouter, routes};

use crate::auth::{AuthError, AuthUser};
use crate::db::orders_collection;
use crate::errors::{AppError, AppResult};
use crate::models::{BatchDeleteRequest, BatchDeleteResponse, BatchUpsertRequest, BatchUpsertResponse, CreateOrderRequest, Order, OrderStatus, UpdateOrderRequest};

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
async fn list_orders(AuthUser(claims): AuthUser) -> AppResult<Json<Vec<Order>>> {
    tracing::info!("GET /orders - user: {}", claims.sub);

    let entities: Vec<_> = orders_collection()
        .find(doc! { "user_id": &claims.sub })
        .await
        .map_err(AppError::database)?
        .try_collect()
        .await
        .map_err(AppError::database)?;

    let orders: Vec<Order> = entities.into_iter().map(Order::from).collect();

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
    AuthUser(claims): AuthUser,
    Json(payload): Json<CreateOrderRequest>,
) -> AppResult<(StatusCode, Json<Order>)> {
    tracing::info!(
        "POST /orders - user: {}, order_number: {}",
        claims.sub,
        payload.order_number
    );

    let entity = payload.into_entity(claims.sub);

    // Upsert: update if exists, insert if not
    let filter = doc! { "order_number": &entity.order_number, "user_id": &entity.user_id };
    orders_collection()
        .replace_one(filter, &entity)
        .upsert(true)
        .await
        .map_err(AppError::database)?;

    tracing::info!("POST /orders - upserted order: {}", entity.id);
    Ok((StatusCode::CREATED, Json(Order::from(entity))))
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
    AuthUser(claims): AuthUser,
    Json(payload): Json<BatchUpsertRequest>,
) -> AppResult<Json<BatchUpsertResponse>> {
    tracing::info!("POST /orders/batch - user: {}, count: {}", claims.sub, payload.orders.len());

    let collection = orders_collection();
    let mut upserted = 0;

    for order_req in payload.orders {
        let entity = order_req.into_entity(claims.sub.clone());
        let filter = doc! { "order_number": &entity.order_number, "user_id": &entity.user_id };
        collection
            .replace_one(filter, &entity)
            .upsert(true)
            .await
            .map_err(AppError::database)?;
        upserted += 1;
    }

    tracing::info!("POST /orders/batch - upserted {} orders", upserted);
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
    AuthUser(claims): AuthUser,
    Json(payload): Json<BatchDeleteRequest>,
) -> AppResult<Json<BatchDeleteResponse>> {
    tracing::info!("POST /orders/batch-delete - user: {}, count: {}", claims.sub, payload.ids.len());

    let result = orders_collection()
        .delete_many(doc! {
            "id": { "$in": &payload.ids },
            "user_id": &claims.sub,
        })
        .await
        .map_err(AppError::database)?;

    tracing::info!("POST /orders/batch-delete - deleted {} orders", result.deleted_count);
    Ok(Json(BatchDeleteResponse { deleted: result.deleted_count as usize }))
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
async fn get_order(AuthUser(claims): AuthUser, Path(id): Path<String>) -> AppResult<Json<Order>> {
    tracing::info!("GET /orders/{} - user: {}", id, claims.sub);

    let entity = orders_collection()
        .find_one(doc! { "id": &id, "user_id": &claims.sub })
        .await
        .map_err(AppError::database)?
        .ok_or_else(|| AppError::not_found("Order"))?;

    Ok(Json(Order::from(entity)))
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
        (status = 400, description = "Bad request (empty update)"),
        (status = 404, description = "Order not found"),
        (status = 401, description = "Unauthorized", body = AuthError)
    ),
    security(("bearer_auth" = []))
)]
async fn update_order(
    AuthUser(claims): AuthUser,
    Path(id): Path<String>,
    Json(payload): Json<UpdateOrderRequest>,
) -> AppResult<StatusCode> {
    tracing::info!("PATCH /orders/{} - user: {}", id, claims.sub);

    let mut update_doc = doc! {};

    if let Some(status) = &payload.status {
        let status_str = match status {
            OrderStatus::Uncommented => "uncommented",
            OrderStatus::Commented => "commented",
            OrderStatus::CommentRevealed => "comment_revealed",
            OrderStatus::Reimbursed => "reimbursed",
        };
        update_doc.insert("status", status_str);
    }
    if let Some(note) = &payload.note {
        update_doc.insert("note", note);
    }
    if let Some(updated_at) = &payload.updated_at {
        update_doc.insert("updated_at", updated_at);
    }
    if let Some(deleted_at) = &payload.deleted_at {
        update_doc.insert("deleted_at", deleted_at);
    }

    if update_doc.is_empty() {
        return Err(AppError::bad_request("No fields to update"));
    }

    let result = orders_collection()
        .update_one(
            doc! { "id": &id, "user_id": &claims.sub },
            doc! { "$set": update_doc },
        )
        .await
        .map_err(AppError::database)?;

    if result.matched_count == 0 {
        return Err(AppError::not_found("Order"));
    }

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
async fn delete_order(AuthUser(claims): AuthUser, Path(id): Path<String>) -> AppResult<StatusCode> {
    tracing::info!("DELETE /orders/{} - user: {}", id, claims.sub);

    let result = orders_collection()
        .delete_one(doc! { "id": &id, "user_id": &claims.sub })
        .await
        .map_err(AppError::database)?;

    if result.deleted_count == 0 {
        return Err(AppError::not_found("Order"));
    }

    tracing::info!("DELETE /orders/{} - deleted", id);
    Ok(StatusCode::NO_CONTENT)
}
