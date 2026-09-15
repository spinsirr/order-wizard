use super::{auth_middleware, AuthPolicy, Claims, JwksVerifier};
use crate::application::{
    ApplicationError, InMemoryOrderRepository, OrderApplication, Principal, UserId,
};
use axum::{body::Body, http::Request, middleware, routing::get, Router};
use tower::ServiceExt;

#[test]
fn cli_access_token_with_all_agent_scopes_maps_to_agent_principal() {
    let policy = AuthPolicy::new("extension-client", "https://api.ordercue.example")
        .with_agent_clients(["cli-client"])
        .unwrap();
    let claims = Claims {
        sub: "user-123".to_string(),
        email: None,
        username: Some("alice".to_string()),
        iss: Some("https://issuer.example".to_string()),
        aud: Some("https://api.ordercue.example".to_string()),
        exp: Some(1_800_000_000),
        iat: Some(1_700_000_000),
        token_use: Some("access".to_string()),
        client_id: Some("cli-client".to_string()),
        scope: Some(
            "https://api.ordercue.example/orders.read \
             https://api.ordercue.example/orders.status.write \
             https://api.ordercue.example/orders.note.write"
                .to_string(),
        ),
    };

    let principal = policy.principal_for(&claims).unwrap();

    assert_eq!(principal, Principal::agent(UserId::new("user-123")));
}

#[test]
fn registered_mcp_host_access_token_maps_to_the_same_agent_ceiling() {
    let policy = AuthPolicy::new("extension-client", "https://api.ordercue.example")
        .with_agent_clients(["cli-client", "mcp-host-client"])
        .unwrap();
    let claims = Claims {
        sub: "user-123".to_string(),
        email: None,
        username: None,
        iss: Some("https://issuer.example".to_string()),
        aud: Some("https://api.ordercue.example".to_string()),
        exp: Some(1_800_000_000),
        iat: Some(1_700_000_000),
        token_use: Some("access".to_string()),
        client_id: Some("mcp-host-client".to_string()),
        scope: Some(
            "https://api.ordercue.example/orders.read \
             https://api.ordercue.example/orders.status.write \
             https://api.ordercue.example/orders.note.write"
                .to_string(),
        ),
    };

    let principal = policy.principal_for(&claims).unwrap();

    assert_eq!(principal, Principal::agent(UserId::new("user-123")));
}

#[test]
fn cli_access_token_for_a_different_resource_is_rejected() {
    let policy = AuthPolicy::new("extension-client", "https://api.ordercue.example")
        .with_agent_clients(["cli-client"])
        .unwrap();
    let claims = Claims {
        sub: "user-123".to_string(),
        email: None,
        username: None,
        iss: Some("https://issuer.example".to_string()),
        aud: Some("https://other-api.example".to_string()),
        exp: Some(1_800_000_000),
        iat: Some(1_700_000_000),
        token_use: Some("access".to_string()),
        client_id: Some("cli-client".to_string()),
        scope: Some(
            "https://api.ordercue.example/orders.read \
             https://api.ordercue.example/orders.status.write \
             https://api.ordercue.example/orders.note.write"
                .to_string(),
        ),
    };

    let result = policy.principal_for(&claims);

    assert_eq!(result, Err("Token audience does not match this resource"));
}

#[test]
fn extension_access_token_without_resource_binding_is_rejected() {
    let policy = AuthPolicy::new("extension-client", "https://api.ordercue.example")
        .with_agent_clients(["cli-client"])
        .unwrap();
    let claims = Claims {
        sub: "user-123".to_string(),
        email: None,
        username: None,
        iss: Some("https://issuer.example".to_string()),
        aud: None,
        exp: Some(1_800_000_000),
        iat: Some(1_700_000_000),
        token_use: Some("access".to_string()),
        client_id: Some("extension-client".to_string()),
        scope: Some(
            "https://api.ordercue.example/orders.read \
             https://api.ordercue.example/orders.sync"
                .to_string(),
        ),
    };

    let result = policy.principal_for(&claims);

    assert_eq!(result, Err("Token audience does not match this resource"));
}

#[tokio::test]
async fn cli_scopes_become_operation_level_capabilities() {
    let policy = AuthPolicy::new("extension-client", "https://api.ordercue.example")
        .with_agent_clients(["cli-client"])
        .unwrap();
    let claims = Claims {
        sub: "user-123".to_string(),
        email: None,
        username: None,
        iss: Some("https://issuer.example".to_string()),
        aud: Some("https://api.ordercue.example".to_string()),
        exp: Some(1_800_000_000),
        iat: Some(1_700_000_000),
        token_use: Some("access".to_string()),
        client_id: Some("cli-client".to_string()),
        scope: Some("https://api.ordercue.example/orders.read".to_string()),
    };

    let principal = policy.principal_for(&claims).unwrap();
    let application =
        OrderApplication::new(InMemoryOrderRepository::with_orders(std::iter::empty()));

    assert!(application.list_orders(&principal).await.is_ok());
    assert!(matches!(
        application
            .update_note(&principal, "order-1", "forbidden".to_string())
            .await,
        Err(ApplicationError::Forbidden)
    ));
}

#[tokio::test]
async fn unauthorized_response_advertises_resource_metadata_and_agent_scopes() {
    let policy = AuthPolicy::new("extension-client", "https://api.ordercue.example")
        .with_agent_clients(["cli-client"])
        .unwrap();
    let verifier = JwksVerifier::new("https://issuer.example".to_string(), policy);
    let app = Router::new()
        .route("/protected", get(|| async { "ok" }))
        .layer(middleware::from_fn_with_state(verifier, auth_middleware));

    let response = app
        .oneshot(Request::get("/protected").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), axum::http::StatusCode::UNAUTHORIZED);
    assert_eq!(
        response
            .headers()
            .get("www-authenticate")
            .and_then(|value| value.to_str().ok()),
        Some(
            "Bearer error=\"invalid_request\", \
             error_description=\"Missing Authorization header\", \
             resource_metadata=\"https://api.ordercue.example/.well-known/oauth-protected-resource\", \
             scope=\"https://api.ordercue.example/orders.read \
             https://api.ordercue.example/orders.status.write \
             https://api.ordercue.example/orders.note.write\""
        )
    );
}

#[test]
fn extension_and_agent_clients_must_be_distinct() {
    let result = AuthPolicy::new("shared-client", "https://api.ordercue.example")
        .with_agent_clients(["shared-client"]);

    assert!(matches!(
        result,
        Err("Agent client IDs must be different from OIDC_CLIENT_ID")
    ));
}
