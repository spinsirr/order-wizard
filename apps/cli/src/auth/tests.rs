use super::*;
use axum::{body::Body, http::Request};
use tower::ServiceExt;

#[test]
fn generated_state_satisfies_the_https_relay_contract() {
    let state = login_state(8765);
    let (nonce, port) = state.secret().rsplit_once('.').unwrap();
    assert_eq!(port, "8765");
    assert!((32..=128).contains(&nonce.len()));
    assert!(nonce
        .bytes()
        .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-'));
    assert_ne!(state, login_state(8765));
}

#[tokio::test]
async fn wrong_state_or_host_cannot_consume_the_pending_login() {
    let (sender, receiver) = oneshot::channel();
    let app = Router::new()
        .route("/callback", get(receive_callback))
        .with_state(Arc::new(PendingLogin {
            expected_state: CsrfToken::new("expected-state".into()),
            authority: "127.0.0.1:8765".into(),
            result: Mutex::new(Some(sender)),
        }));
    for (state, host) in [
        ("wrong-state", "127.0.0.1:8765"),
        ("expected-state", "attacker.example"),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::get(format!("/callback?state={state}&code=attacker-code"))
                    .header("host", host)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }
    let request = || {
        Request::get("/callback?state=expected-state&code=valid-code")
            .header("host", "127.0.0.1:8765")
            .body(Body::empty())
            .unwrap()
    };
    let response = app.clone().oneshot(request()).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(receiver.await.unwrap().unwrap(), "valid-code");
    assert_eq!(
        app.oneshot(request()).await.unwrap().status(),
        StatusCode::CONFLICT
    );
}

#[tokio::test]
async fn oauth_denial_ends_the_pending_login_without_a_code() {
    let (sender, receiver) = oneshot::channel();
    let app = Router::new()
        .route("/callback", get(receive_callback))
        .with_state(Arc::new(PendingLogin {
            expected_state: CsrfToken::new("expected-state".into()),
            authority: "127.0.0.1:8765".into(),
            result: Mutex::new(Some(sender)),
        }));
    let response = app
        .oneshot(
            Request::get("/callback?state=expected-state&error=access_denied")
                .header("host", "127.0.0.1:8765")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert!(receiver.await.unwrap().is_err());
}

#[test]
fn oauth_endpoints_must_not_downgrade_tls_or_embed_credentials() {
    for invalid in [
        "http://issuer.example/token",
        "https://user:password@issuer.example/token",
        "https://issuer.example/token#fragment",
    ] {
        assert!(secure_endpoint(invalid).is_err());
    }
    assert!(secure_endpoint("https://issuer.example/token").is_ok());
}
