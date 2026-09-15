use super::{router, ProtectedResourceMetadata};
use axum::{body::to_bytes, http::Request};
use tower::ServiceExt;

#[tokio::test]
async fn publishes_rfc_9728_metadata_for_the_shared_api_resource() {
    let metadata = ProtectedResourceMetadata::new(
        "https://api.ordercue.example",
        "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool",
    );
    let app: axum::Router = router(metadata).into();

    let response = app
        .oneshot(
            Request::get("/.well-known/oauth-protected-resource")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), axum::http::StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["resource"], "https://api.ordercue.example");
    assert_eq!(
        json["authorization_servers"],
        serde_json::json!(["https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool"])
    );
    assert_eq!(
        json["scopes_supported"],
        serde_json::json!([
            "https://api.ordercue.example/orders.read",
            "https://api.ordercue.example/orders.status.write",
            "https://api.ordercue.example/orders.note.write"
        ])
    );
    assert_eq!(
        json["bearer_methods_supported"],
        serde_json::json!(["header"])
    );
}
