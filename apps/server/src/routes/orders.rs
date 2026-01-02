use axum::{
    extract::Path,
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, patch, post},
    Json, Router,
};
use futures::TryStreamExt;
use mongodb::bson::doc;

use crate::auth::AuthUser;
use crate::db::orders_collection;
use crate::models::{CreateOrderRequest, Order, UpdateOrderRequest};

pub fn router() -> Router {
    Router::new()
        .route("/orders", get(list_orders))
        .route("/orders", post(create_order))
        .route("/orders/{id}", get(get_order))
        .route("/orders/{id}", patch(update_order))
        .route("/orders/{id}", delete(delete_order))
}

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
