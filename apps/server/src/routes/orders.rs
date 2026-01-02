use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use axum_extra::extract::cookie::CookieJar;
use futures::TryStreamExt;
use mongodb::bson::{doc, to_bson, Document};
use uuid::Uuid;
use validator::Validate;

use crate::{
    error::ApiError,
    models::{CreateOrder, Order, OrderDocument, UpdateOrder},
    state::AppState,
};
#[allow(unused_imports)]
use crate::error::ErrorResponse;
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/orders", post(create_order).get(list_orders))
        .route(
            "/orders/:id",
            get(get_order).patch(update_order).delete(delete_order),
        )
}

#[utoipa::path(
    post,
    path = "/orders",
    request_body = CreateOrder,
    responses(
        (status = 201, description = "Order created", body = Order),
        (status = 400, description = "Missing user id", body = ErrorResponse),
        (status = 500, description = "Database error", body = ErrorResponse)
    ),
    tag = "Orders"
)]
pub async fn create_order(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(payload): Json<CreateOrder>,
) -> Result<(StatusCode, Json<Order>), ApiError> {
    // Validate input
    payload
        .validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;

    let CreateOrder {
        id,
        order_number,
        product_name,
        order_date,
        product_image,
        price,
        status,
        note,
    } = payload;

    let user_id = state
        .session_user_id(&jar)
        .await
        .ok_or(ApiError::Unauthorized)?;

    let id = id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let order = Order {
        id: id.clone(),
        user_id: user_id.clone(),
        order_number,
        product_name,
        order_date,
        product_image,
        price,
        status,
        note,
    };

    state
        .orders
        .insert_one(OrderDocument::from(order.clone()), None)
        .await
        .map_err(|error| ApiError::Database(error.to_string()))?;

    Ok((StatusCode::CREATED, Json(order)))
}

#[utoipa::path(
    get,
    path = "/orders",
    responses(
        (status = 200, description = "List orders", body = [Order]),
        (status = 401, description = "Unauthorized", body = ErrorResponse),
        (status = 500, description = "Database error", body = ErrorResponse)
    ),
    tag = "Orders"
)]
pub async fn list_orders(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<Json<Vec<Order>>, ApiError> {
    let user_id = state
        .session_user_id(&jar)
        .await
        .ok_or(ApiError::Unauthorized)?;

    let mut cursor = state
        .orders
        .find(doc! { "userId": &user_id }, None)
        .await
        .map_err(|error| ApiError::Database(error.to_string()))?;

    let mut orders = Vec::new();
    while let Some(document) = cursor
        .try_next()
        .await
        .map_err(|error| ApiError::Database(error.to_string()))?
    {
        orders.push(Order::from(document));
    }

    Ok(Json(orders))
}

#[utoipa::path(
    get,
    path = "/orders/{id}",
    params(
        ("id" = String, Path, description = "Order identifier")
    ),
    responses(
        (status = 200, description = "Order detail", body = Order),
        (status = 401, description = "Unauthorized", body = ErrorResponse),
        (status = 404, description = "Order not found", body = ErrorResponse),
        (status = 500, description = "Database error", body = ErrorResponse)
    ),
    tag = "Orders"
)]
pub async fn get_order(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<String>,
) -> Result<Json<Order>, ApiError> {
    let user_id = state
        .session_user_id(&jar)
        .await
        .ok_or(ApiError::Unauthorized)?;

    let order = state
        .orders
        .find_one(doc! { "_id": &id, "userId": &user_id }, None)
        .await
        .map_err(|error| ApiError::Database(error.to_string()))?
        .map(Order::from)
        .ok_or(ApiError::NotFound)?;

    Ok(Json(order))
}

#[utoipa::path(
    patch,
    path = "/orders/{id}",
    request_body = UpdateOrder,
    params(
        ("id" = String, Path, description = "Order identifier")
    ),
    responses(
        (status = 204, description = "Order updated"),
        (status = 404, description = "Order not found", body = ErrorResponse),
        (status = 500, description = "Database error", body = ErrorResponse)
    ),
    tag = "Orders"
)]
pub async fn update_order(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<String>,
    Json(update): Json<UpdateOrder>,
) -> Result<StatusCode, ApiError> {
    // Validate input
    update
        .validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;

    let user_id = state
        .session_user_id(&jar)
        .await
        .ok_or(ApiError::Unauthorized)?;

    let mut updates = Document::new();

    if let Some(order_number) = update.order_number {
        updates.insert("orderNumber", order_number);
    }
    if let Some(product_name) = update.product_name {
        updates.insert("productName", product_name);
    }
    if let Some(order_date) = update.order_date {
        updates.insert("orderDate", order_date);
    }
    if let Some(product_image) = update.product_image {
        updates.insert("productImage", product_image);
    }
    if let Some(price) = update.price {
        updates.insert("price", price);
    }
    if let Some(status) = update.status {
        let bson_status =
            to_bson(&status).map_err(|error| ApiError::Database(error.to_string()))?;
        updates.insert("status", bson_status);
    }
    if let Some(note) = update.note {
        updates.insert("note", note);
    }
    if updates.is_empty() {
        return Ok(StatusCode::NO_CONTENT);
    }

    // Atomic update with ownership check in one operation
    let result = state
        .orders
        .update_one(
            doc! { "_id": &id, "userId": &user_id },  // Check ownership atomically
            doc! { "$set": updates },
            None,
        )
        .await
        .map_err(|error| ApiError::Database(error.to_string()))?;

    // Check if any document was matched/updated
    if result.matched_count == 0 {
        Err(ApiError::NotFound)
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}

#[utoipa::path(
    delete,
    path = "/orders/{id}",
    params(
        ("id" = String, Path, description = "Order identifier")
    ),
    responses(
        (status = 204, description = "Order deleted"),
        (status = 401, description = "Unauthorized", body = ErrorResponse),
        (status = 404, description = "Order not found", body = ErrorResponse),
        (status = 500, description = "Database error", body = ErrorResponse)
    ),
    tag = "Orders"
)]
pub async fn delete_order(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let user_id = state
        .session_user_id(&jar)
        .await
        .ok_or(ApiError::Unauthorized)?;

    let result = state
        .orders
        .delete_one(doc! { "_id": &id, "userId": &user_id }, None)
        .await
        .map_err(|error| ApiError::Database(error.to_string()))?;

    if result.deleted_count == 0 {
        Err(ApiError::NotFound)
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}
