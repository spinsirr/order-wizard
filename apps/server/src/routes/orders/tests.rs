use super::router;
use crate::application::{InMemoryOrderRepository, OrderApplication, Principal, UserId};
use crate::models::{Order, OrderStatus};
use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
    Extension,
};
use tower::ServiceExt;

fn order(id: &str, user_id: &str) -> Order {
    Order {
        id: id.to_string(),
        user_id: user_id.to_string(),
        order_number: format!("{id}-order-number"),
        product_name: "Test product".to_string(),
        order_date: "August 26, 2026".to_string(),
        product_image: "https://example.com/product.jpg".to_string(),
        price: "$10.00".to_string(),
        status: OrderStatus::Uncommented,
        note: None,
        updated_at: Some("2026-08-26T12:00:00Z".to_string()),
        created_at: Some("2026-08-26T12:00:00Z".to_string()),
        deleted_at: None,
    }
}

fn extension_principal(user_id: &str) -> Principal {
    Principal::extension(UserId::new(user_id))
}

#[tokio::test]
async fn list_orders_preserves_rest_shape_and_tenant_filtering() {
    let application = OrderApplication::new(InMemoryOrderRepository::with_orders([
        order("alice-order", "alice"),
        order("bob-order", "bob"),
    ]));
    let app: axum::Router = router()
        .layer(Extension(application))
        .layer(Extension(extension_principal("alice")))
        .into();

    let response = app
        .oneshot(Request::get("/orders").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json.as_array().unwrap().len(), 1);
    assert_eq!(json[0]["id"], "alice-order");
    assert_eq!(json[0]["orderNumber"], "alice-order-order-number");
    assert!(json[0].get("order_number").is_none());
}

#[tokio::test]
async fn create_order_preserves_created_status_and_camel_case_response() {
    let application =
        OrderApplication::new(InMemoryOrderRepository::with_orders(std::iter::empty()));
    let app: axum::Router = router()
        .layer(Extension(application))
        .layer(Extension(extension_principal("alice")))
        .into();
    let body = serde_json::json!({
        "id": "new-order",
        "orderNumber": "111-1111111-1111111",
        "productName": "Test product",
        "orderDate": "August 26, 2026",
        "productImage": "https://example.com/product.jpg",
        "price": "$10.00",
        "status": "uncommented",
        "updatedAt": "2026-08-26T15:00:00Z",
        "createdAt": "2026-08-26T15:00:00Z"
    });

    let response = app
        .oneshot(
            Request::post("/orders")
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["id"], "new-order");
    assert_eq!(json["userId"], "alice");
    assert_eq!(json["orderNumber"], "111-1111111-1111111");
    assert!(json.get("order_number").is_none());
}

#[tokio::test]
async fn delete_order_preserves_no_content_status() {
    let application = OrderApplication::new(InMemoryOrderRepository::with_orders([order(
        "alice-order",
        "alice",
    )]));
    let app: axum::Router = router()
        .layer(Extension(application))
        .layer(Extension(extension_principal("alice")))
        .into();

    let response = app
        .oneshot(
            Request::delete("/orders/alice-order")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn update_order_preserves_ok_status() {
    let application = OrderApplication::new(InMemoryOrderRepository::with_orders([order(
        "alice-order",
        "alice",
    )]));
    let app: axum::Router = router()
        .layer(Extension(application))
        .layer(Extension(extension_principal("alice")))
        .into();
    let body = serde_json::json!({
        "status": "commented",
        "note": "Extension note",
        "updatedAt": "2026-08-26T17:00:00Z"
    });

    let response = app
        .oneshot(
            Request::patch("/orders/alice-order")
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn batch_upsert_preserves_response_count() {
    let application =
        OrderApplication::new(InMemoryOrderRepository::with_orders(std::iter::empty()));
    let app: axum::Router = router()
        .layer(Extension(application))
        .layer(Extension(extension_principal("alice")))
        .into();
    let body = serde_json::json!({
        "orders": [
            {
                "id": "one",
                "orderNumber": "111-1111111-1111111",
                "productName": "One",
                "orderDate": "August 26, 2026",
                "productImage": "https://example.com/one.jpg",
                "price": "$10.00",
                "status": "uncommented",
                "updatedAt": "2026-08-26T18:00:00Z"
            },
            {
                "id": "two",
                "orderNumber": "222-2222222-2222222",
                "productName": "Two",
                "orderDate": "August 26, 2026",
                "productImage": "https://example.com/two.jpg",
                "price": "$20.00",
                "status": "commented",
                "updatedAt": "2026-08-26T18:00:00Z"
            }
        ]
    });

    let response = app
        .oneshot(
            Request::post("/orders/batch")
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["upserted"], 2);
}

#[tokio::test]
async fn batch_delete_preserves_response_count() {
    let application = OrderApplication::new(InMemoryOrderRepository::with_orders([
        order("one", "alice"),
        order("two", "alice"),
        order("bob", "bob"),
    ]));
    let app: axum::Router = router()
        .layer(Extension(application))
        .layer(Extension(extension_principal("alice")))
        .into();
    let body = serde_json::json!({ "ids": ["one", "two", "bob"] });

    let response = app
        .oneshot(
            Request::post("/orders/batch-delete")
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["deleted"], 2);
}

#[tokio::test]
async fn restricted_principal_cannot_call_extension_create_route() {
    let application =
        OrderApplication::new(InMemoryOrderRepository::with_orders(std::iter::empty()));
    let app: axum::Router = router()
        .layer(Extension(application))
        .layer(Extension(Principal::agent(UserId::new("alice"))))
        .into();
    let body = serde_json::json!({
        "id": "forbidden",
        "orderNumber": "111-1111111-1111111",
        "productName": "Test product",
        "orderDate": "August 26, 2026",
        "productImage": "https://example.com/product.jpg",
        "price": "$10.00",
        "status": "uncommented",
        "updatedAt": "2026-08-26T19:00:00Z"
    });

    let response = app
        .oneshot(
            Request::post("/orders")
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    assert_eq!(
        response
            .headers()
            .get("www-authenticate")
            .and_then(|value| value.to_str().ok()),
        Some("Bearer error=\"insufficient_scope\"")
    );
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["code"], "INSUFFICIENT_SCOPE");
}

#[tokio::test]
async fn stale_patch_returns_conflict_without_changing_the_order() {
    let principal = extension_principal("alice");
    let mut initial = order("order-a", "alice");
    initial.updated_at = Some("2099-01-01T00:00:00.123456789Z".to_string());
    let application = OrderApplication::new(InMemoryOrderRepository::with_orders([initial]));
    let app: axum::Router = router()
        .layer(Extension(application.clone()))
        .layer(Extension(principal.clone()))
        .into();
    let response = app
        .oneshot(
            Request::patch("/orders/order-a")
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"note":"stale edit","updatedAt":"2099-01-01T00:00:00.123Z"}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::CONFLICT);
    let body: serde_json::Value =
        serde_json::from_slice(&to_bytes(response.into_body(), 4096).await.unwrap()).unwrap();
    assert_eq!(body["code"], "CONFLICT");
    assert_eq!(
        application
            .get_order(&principal, "order-a")
            .await
            .unwrap()
            .note,
        None
    );
}
