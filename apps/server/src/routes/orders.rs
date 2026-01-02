use axum::{extract::Path, http::StatusCode, response::IntoResponse, Json};
use futures::TryStreamExt;
use mongodb::bson::doc;
use utoipa_axum::{router::OpenApiRouter, routes};

use crate::auth::{AuthError, AuthUser};
use crate::db::orders_collection;
use crate::models::{CreateOrderRequest, Order, UpdateOrderRequest};

pub fn router() -> OpenApiRouter {
    OpenApiRouter::new()
        .routes(routes!(list_orders))
        .routes(routes!(create_order))
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
async fn list_orders(AuthUser(claims): AuthUser) -> impl IntoResponse {
    let collection = orders_collection();

    let filter = doc! { "user_id": &claims.sub };
    let cursor = match collection.find(filter).await {
        Ok(cursor) => cursor,
        Err(e) => {
            tracing::error!("Failed to query orders: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(Vec::<Order>::new()));
        }
    };

    let orders: Vec<Order> = match cursor.try_collect().await {
        Ok(orders) => orders,
        Err(e) => {
            tracing::error!("Failed to collect orders: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(Vec::<Order>::new()));
        }
    };

    (StatusCode::OK, Json(orders))
}

#[utoipa::path(
    post,
    path = "/orders",
    tag = "Orders",
    summary = "Create a new order",
    description = "Creates a new order for the authenticated user",
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
) -> impl IntoResponse {
    let collection = orders_collection();

    let order = Order {
        id: payload.id,
        user_id: claims.sub,
        order_number: payload.order_number,
        product_name: payload.product_name,
        order_date: payload.order_date,
        product_image: payload.product_image,
        price: payload.price,
        status: payload.status,
        note: payload.note,
    };

    match collection.insert_one(&order).await {
        Ok(_) => (StatusCode::CREATED, Json(order)),
        Err(e) => {
            tracing::error!("Failed to create order: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(order))
        }
    }
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
async fn get_order(AuthUser(claims): AuthUser, Path(id): Path<String>) -> impl IntoResponse {
    let collection = orders_collection();

    let filter = doc! { "id": &id, "user_id": &claims.sub };

    match collection.find_one(filter).await {
        Ok(Some(order)) => (StatusCode::OK, Json(Some(order))),
        Ok(None) => (StatusCode::NOT_FOUND, Json(None)),
        Err(e) => {
            tracing::error!("Failed to get order: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(None))
        }
    }
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
) -> impl IntoResponse {
    let collection = orders_collection();

    let filter = doc! { "id": &id, "user_id": &claims.sub };

    let mut update_doc = doc! {};
    if let Some(status) = &payload.status {
        let status_str = match status {
            crate::models::OrderStatus::Uncommented => "uncommented",
            crate::models::OrderStatus::Commented => "commented",
            crate::models::OrderStatus::CommentRevealed => "comment_revealed",
            crate::models::OrderStatus::Reimbursed => "reimbursed",
        };
        update_doc.insert("status", status_str);
    }
    if let Some(note) = &payload.note {
        update_doc.insert("note", note);
    }

    if update_doc.is_empty() {
        return StatusCode::BAD_REQUEST;
    }

    let update = doc! { "$set": update_doc };

    match collection.update_one(filter, update).await {
        Ok(result) if result.matched_count > 0 => StatusCode::OK,
        Ok(_) => StatusCode::NOT_FOUND,
        Err(e) => {
            tracing::error!("Failed to update order: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
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
async fn delete_order(AuthUser(claims): AuthUser, Path(id): Path<String>) -> impl IntoResponse {
    let collection = orders_collection();

    let filter = doc! { "id": &id, "user_id": &claims.sub };

    match collection.delete_one(filter).await {
        Ok(result) if result.deleted_count > 0 => StatusCode::NO_CONTENT,
        Ok(_) => StatusCode::NOT_FOUND,
        Err(e) => {
            tracing::error!("Failed to delete order: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}
