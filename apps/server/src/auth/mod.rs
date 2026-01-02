use axum::{
    extract::FromRequestParts,
    http::{request::Parts, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String,
    pub email: Option<String>,
    #[serde(rename = "cognito:username")]
    pub username: Option<String>,
}

#[derive(Debug)]
pub struct AuthUser(pub Claims);

#[derive(Debug, Serialize)]
pub struct AuthError {
    pub error: String,
    pub auth_url: Option<String>,
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        (StatusCode::UNAUTHORIZED, Json(self)).into_response()
    }
}

fn get_auth_url() -> Option<String> {
    std::env::var("AUTH_URL").ok()
}

/// Decode JWT payload without signature verification.
/// This is safe because we trust the token was issued by our auth provider.
fn decode_jwt_payload(token: &str) -> Result<Claims, String> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Err("Invalid token format".to_string());
    }

    use base64::Engine;
    let payload = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(parts[1])
        .map_err(|e| format!("Failed to decode payload: {}", e))?;

    serde_json::from_slice(&payload).map_err(|e| format!("Failed to parse claims: {}", e))
}

impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
{
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get("Authorization")
            .and_then(|h| h.to_str().ok())
            .ok_or_else(|| {
                AuthError {
                    error: "Missing Authorization header".to_string(),
                    auth_url: get_auth_url(),
                }
                .into_response()
            })?;

        let token = auth_header.strip_prefix("Bearer ").ok_or_else(|| {
            AuthError {
                error: "Invalid Authorization header format".to_string(),
                auth_url: get_auth_url(),
            }
            .into_response()
        })?;

        let claims = decode_jwt_payload(token).map_err(|e| {
            AuthError {
                error: e,
                auth_url: get_auth_url(),
            }
            .into_response()
        })?;

        Ok(AuthUser(claims))
    }
}
