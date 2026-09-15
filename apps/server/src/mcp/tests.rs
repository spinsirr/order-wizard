use std::collections::BTreeSet;

use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
    middleware, Extension, Router,
};
use serde_json::{json, Value};
use tower::ServiceExt;

use super::*;
use crate::application::{InMemoryOrderRepository, UserId};
use crate::auth::{auth_middleware, AuthPolicy, JwksVerifier};

fn order(id: &str, user_id: &str, product_name: &str) -> Order {
    Order {
        id: id.to_string(),
        user_id: user_id.to_string(),
        order_number: format!("{id}-order-number"),
        product_name: product_name.to_string(),
        order_date: "August 27, 2026".to_string(),
        product_image: "https://example.com/product.jpg".to_string(),
        price: "$10.00".to_string(),
        status: OrderStatus::Uncommented,
        note: None,
        updated_at: Some("2026-08-27T12:00:00Z".to_string()),
        created_at: Some("2026-08-27T12:00:00Z".to_string()),
        deleted_at: None,
    }
}

fn server(orders: impl IntoIterator<Item = Order>) -> OrderMcpServer {
    OrderMcpServer::new(OrderApplication::new(InMemoryOrderRepository::with_orders(
        orders,
    )))
}

fn authenticated_parts(user_id: &str) -> Parts {
    let request = Request::new(());
    let (mut parts, ()) = request.into_parts();
    parts
        .extensions
        .insert(Principal::agent(UserId::new(user_id)));
    parts
}

fn protocol_meta() -> Value {
    json!({
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientInfo": {
            "name": "ordercue-test",
            "version": "1.0.0"
        },
        "io.modelcontextprotocol/clientCapabilities": {}
    })
}

fn mcp_router(orders: impl IntoIterator<Item = Order>) -> Router {
    let application = OrderApplication::new(InMemoryOrderRepository::with_orders(orders));
    let config = transport_config("http://localhost").unwrap();
    Router::new()
        .nest_service("/mcp", service(application, config))
        .layer(Extension(Principal::agent(UserId::new("alice"))))
}

#[test]
fn exposes_only_the_five_agent_safe_tools_with_structured_outputs() {
    let server = server([]);
    let tools = OrderMcpServer::tool_router().list_all();
    let names = tools
        .iter()
        .map(|tool| tool.name.as_ref())
        .collect::<BTreeSet<_>>();

    assert_eq!(
        names,
        BTreeSet::from([
            "orders_get",
            "orders_list",
            "orders_search",
            "orders_set_note",
            "orders_set_status",
        ])
    );
    assert!(tools.iter().all(|tool| tool.output_schema.is_some()));
    assert!(names.iter().all(|name| {
        !name.contains("create") && !name.contains("delete") && !name.contains("batch")
    }));

    let list = tools
        .iter()
        .find(|tool| tool.name == "orders_list")
        .unwrap();
    let list_annotations = list.annotations.as_ref().unwrap();
    assert_eq!(list_annotations.read_only_hint, Some(true));
    assert_eq!(list_annotations.open_world_hint, Some(false));

    let set_note = tools
        .iter()
        .find(|tool| tool.name == "orders_set_note")
        .unwrap();
    let note_annotations = set_note.annotations.as_ref().unwrap();
    assert_eq!(note_annotations.read_only_hint, Some(false));
    assert_eq!(note_annotations.destructive_hint, Some(true));

    assert_eq!(
        server.supported_protocol_versions().as_ref(),
        &[ProtocolVersion::V_2026_07_28]
    );
}

#[tokio::test]
async fn list_is_tenant_scoped_and_honors_the_limit() {
    let server = server([
        order("alice-one", "alice", "First product"),
        order("alice-two", "alice", "Second product"),
        order("bob-one", "bob", "Private product"),
    ]);

    let Json(orders) = server
        .list_orders(
            McpExtension(authenticated_parts("alice")),
            Parameters(ListOrdersParams {
                status: None,
                limit: 1,
            }),
        )
        .await
        .unwrap();

    assert_eq!(orders.len(), 1);
    assert_eq!(orders[0].user_id, "alice");
}

#[tokio::test]
async fn status_and_note_updates_use_the_same_application_boundary() {
    let server = server([order("alice-order", "alice", "Product")]);

    let Json(updated_status) = server
        .set_status(
            McpExtension(authenticated_parts("alice")),
            Parameters(SetStatusParams {
                id: "alice-order".to_string(),
                status: OrderStatus::Reimbursed,
            }),
        )
        .await
        .unwrap();
    assert_eq!(updated_status.status, OrderStatus::Reimbursed);
    assert!(updated_status.updated_at.is_some());

    let Json(updated_note) = server
        .set_note(
            McpExtension(authenticated_parts("alice")),
            Parameters(SetNoteParams {
                id: "alice-order".to_string(),
                note: "Follow up tomorrow".to_string(),
            }),
        )
        .await
        .unwrap();
    assert_eq!(updated_note.note.as_deref(), Some("Follow up tomorrow"));
}

#[tokio::test]
async fn missing_principal_is_a_tool_error_not_an_authority_escalation() {
    let server = server([order("alice-order", "alice", "Product")]);
    let (parts, ()) = Request::new(()).into_parts();

    let result = server
        .get_order(
            McpExtension(parts),
            Parameters(GetOrderParams {
                id: "alice-order".to_string(),
            }),
        )
        .await;
    let Err(error) = result else {
        panic!("missing principal must fail")
    };

    assert_eq!(error.is_error, Some(true));
    let message = error.content[0].as_text().unwrap().text.as_str();
    assert!(message.contains("AUTH_REQUIRED"));
}

#[test]
fn production_transport_is_modern_stateless_and_validates_host_and_origin() {
    let config = transport_config("https://api.ordercue.example").unwrap();

    assert!(!config.legacy_session_mode);
    assert!(config.json_response);
    assert!(config.stateless_protocol_metadata_required);
    assert!(config
        .allowed_hosts
        .iter()
        .any(|host| host == "api.ordercue.example"));
    assert!(config
        .allowed_origins
        .iter()
        .any(|origin| origin == "https://api.ordercue.example"));
}

#[tokio::test]
async fn streamable_http_lists_only_safe_tools_without_a_session() {
    let response = mcp_router([])
        .oneshot(
            Request::post("/mcp")
                .header("host", "localhost")
                .header("content-type", "application/json")
                .header("accept", "application/json, text/event-stream")
                .header("mcp-protocol-version", "2026-07-28")
                .header("mcp-method", "tools/list")
                .body(Body::from(
                    json!({
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "tools/list",
                        "params": { "_meta": protocol_meta() }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    assert!(response.headers().get("mcp-session-id").is_none());
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();
    let ordered_names = payload["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|tool| tool["name"].as_str().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(
        ordered_names,
        vec![
            "orders_get",
            "orders_list",
            "orders_search",
            "orders_set_note",
            "orders_set_status",
        ]
    );
}

#[tokio::test]
async fn streamable_http_discovery_advertises_only_the_current_protocol() {
    let response = mcp_router([])
        .oneshot(
            Request::post("/mcp")
                .header("host", "localhost")
                .header("content-type", "application/json")
                .header("accept", "application/json, text/event-stream")
                .header("mcp-protocol-version", "2026-07-28")
                .header("mcp-method", "server/discover")
                .body(Body::from(
                    json!({
                        "jsonrpc": "2.0",
                        "id": 10,
                        "method": "server/discover",
                        "params": { "_meta": protocol_meta() }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    assert!(response.headers().get("mcp-session-id").is_none());
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(
        payload["result"]["supportedVersions"],
        json!(["2026-07-28"])
    );
    assert!(payload["result"]["capabilities"]["tools"].is_object());
}

#[tokio::test]
async fn streamable_http_tool_call_receives_the_authenticated_principal() {
    let response = mcp_router([
        order("shared-id", "alice", "Alice product"),
        order("shared-id", "bob", "Bob product"),
    ])
    .oneshot(
        Request::post("/mcp")
            .header("host", "localhost")
            .header("content-type", "application/json")
            .header("accept", "application/json, text/event-stream")
            .header("mcp-protocol-version", "2026-07-28")
            .header("mcp-method", "tools/call")
            .header("mcp-name", "orders_get")
            .body(Body::from(
                json!({
                    "jsonrpc": "2.0",
                    "id": 2,
                    "method": "tools/call",
                    "params": {
                        "name": "orders_get",
                        "arguments": { "id": "shared-id" },
                        "_meta": protocol_meta()
                    }
                })
                .to_string(),
            ))
            .unwrap(),
    )
    .await
    .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(payload["result"]["structuredContent"]["id"], "shared-id");
    assert_eq!(
        payload["result"]["structuredContent"]["productName"],
        "Alice product"
    );
}

#[tokio::test]
async fn streamable_http_rejects_a_disallowed_browser_origin() {
    let response = mcp_router([])
        .oneshot(
            Request::post("/mcp")
                .header("host", "localhost")
                .header("origin", "https://evil.example")
                .header("content-type", "application/json")
                .header("accept", "application/json, text/event-stream")
                .header("mcp-protocol-version", "2026-07-28")
                .header("mcp-method", "tools/list")
                .body(Body::from(
                    json!({
                        "jsonrpc": "2.0",
                        "id": 3,
                        "method": "tools/list",
                        "params": { "_meta": protocol_meta() }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn streamable_http_rejects_protocol_header_body_mismatch() {
    let response = mcp_router([])
        .oneshot(
            Request::post("/mcp")
                .header("host", "localhost")
                .header("content-type", "application/json")
                .header("accept", "application/json, text/event-stream")
                .header("mcp-protocol-version", "2026-07-28")
                .header("mcp-method", "tools/list")
                .body(Body::from(
                    json!({
                        "jsonrpc": "2.0",
                        "id": 4,
                        "method": "tools/list",
                        "params": {
                            "_meta": {
                                "io.modelcontextprotocol/protocolVersion": "2025-11-25",
                                "io.modelcontextprotocol/clientInfo": {
                                    "name": "ordercue-test",
                                    "version": "1.0.0"
                                },
                                "io.modelcontextprotocol/clientCapabilities": {}
                            }
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(payload["error"]["code"], -32020);
}

#[tokio::test]
async fn mcp_endpoint_requires_oauth_and_advertises_resource_metadata() {
    let application = OrderApplication::new(InMemoryOrderRepository::with_orders([]));
    let config = transport_config("https://api.ordercue.example").unwrap();
    let policy = AuthPolicy::new("extension-client", "https://api.ordercue.example");
    let verifier = JwksVerifier::new("https://issuer.example".to_string(), policy);
    let app = Router::new()
        .nest_service("/mcp", service(application, config))
        .layer(middleware::from_fn_with_state(verifier, auth_middleware));

    let response = app
        .oneshot(
            Request::post("/mcp")
                .header("host", "api.ordercue.example")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    let challenge = response
        .headers()
        .get("www-authenticate")
        .and_then(|value| value.to_str().ok())
        .unwrap();
    assert!(challenge.contains(
        "resource_metadata=\"https://api.ordercue.example/.well-known/oauth-protected-resource\""
    ));
    assert!(challenge.contains("orders.read"));
    assert!(challenge.contains("orders.status.write"));
    assert!(challenge.contains("orders.note.write"));
}
