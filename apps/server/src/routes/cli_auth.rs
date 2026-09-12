use axum::{
    extract::Query,
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Redirect, Response},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize)]
pub(crate) struct ClientConfig {
    pub issuer: String,
    pub resource: String,
    pub cli_client_id: Option<String>,
    pub mcp_client_ids: Vec<String>,
}

pub(crate) fn router(config: ClientConfig) -> Router {
    Router::new()
        .route(
            "/.well-known/order-wizard-clients",
            get(move || async move { Json(config) }),
        )
        .route("/oauth/cli/callback", get(callback))
}

#[derive(Deserialize)]
struct Callback {
    state: String,
    code: Option<String>,
    error: Option<String>,
}

// Cognito redirects only to this registered HTTPS URL. The authorization code is
// forwarded to the originating loopback listener; tokens never pass through it.
async fn callback(Query(query): Query<Callback>) -> Response {
    let Some((nonce, port)) = query.state.rsplit_once('.') else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    let Ok(port) = port.parse::<u16>() else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    if port < 1024
        || !(32..=128).contains(&nonce.len())
        || !nonce
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
    {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let value = match (&query.code, &query.error) {
        (Some(code), None) if !code.is_empty() && code.len() <= 4096 => ("code", code),
        (None, Some(error)) if !error.is_empty() && error.len() <= 256 => ("error", error),
        _ => return StatusCode::BAD_REQUEST.into_response(),
    };
    let mut destination = reqwest::Url::parse(&format!("http://127.0.0.1:{port}/callback"))
        .expect("validated loopback URL");
    destination
        .query_pairs_mut()
        .append_pair("state", &query.state)
        .append_pair(value.0, value.1);
    let mut headers = HeaderMap::new();
    headers.insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    headers.insert(header::REFERRER_POLICY, "no-referrer".parse().unwrap());
    (headers, Redirect::to(destination.as_str())).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::Request};
    use tower::ServiceExt;

    fn app() -> Router {
        Router::new().route("/oauth/cli/callback", get(callback))
    }

    #[tokio::test]
    async fn callback_only_redirects_codes_to_loopback_and_never_caches() {
        let state = format!("{}.8765", "a".repeat(43));
        let response = app()
            .oneshot(
                Request::get(format!(
                    "/oauth/cli/callback?state={state}&code=one-time-code"
                ))
                .body(Body::empty())
                .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::SEE_OTHER);
        let url =
            reqwest::Url::parse(response.headers()[header::LOCATION].to_str().unwrap()).unwrap();
        assert_eq!(url.host_str(), Some("127.0.0.1"));
        assert_eq!(url.port(), Some(8765));
        assert_eq!(
            url.query_pairs().find(|(key, _)| key == "state").unwrap().1,
            state
        );
        assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
        assert_eq!(response.headers()[header::REFERRER_POLICY], "no-referrer");
    }

    #[tokio::test]
    async fn callback_rejects_invalid_destinations_and_ambiguous_responses() {
        let nonce = "a".repeat(43);
        for query in [
            "state=https://evil.example&code=x".to_string(),
            format!("state={nonce}.80&code=x"),
            format!("state={nonce}.65536&code=x"),
            format!("state={nonce}.8765&code=x&error=denied"),
            format!("state={nonce}.8765&code="),
        ] {
            let response = app()
                .oneshot(
                    Request::get(format!("/oauth/cli/callback?{query}"))
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::BAD_REQUEST);
            assert!(!response.headers().contains_key(header::LOCATION));
        }
    }
}
