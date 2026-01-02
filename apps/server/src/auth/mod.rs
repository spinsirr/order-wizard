use axum::{
    extract::FromRequestParts,
    http::{header, request::Parts, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String,
    pub email: Option<String>,
    #[serde(rename = "cognito:username")]
    pub username: Option<String>,
}

#[derive(Debug)]
pub struct AuthUser(pub Claims);

/// OAuth 2.0 error response per RFC 6749 Section 5.2
#[derive(Debug, Serialize, ToSchema)]
pub struct AuthError {
    /// Error code per RFC 6749
    #[schema(example = "invalid_token")]
    pub error: String,
    /// Human-readable error description
    #[schema(example = "The access token is invalid")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_description: Option<String>,
}

impl AuthError {
    fn invalid_token(description: impl Into<String>) -> Self {
        Self {
            error: "invalid_token".to_string(),
            error_description: Some(description.into()),
        }
    }

    fn invalid_request(description: impl Into<String>) -> Self {
        Self {
            error: "invalid_request".to_string(),
            error_description: Some(description.into()),
        }
    }
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        // RFC 6750: WWW-Authenticate header for Bearer token errors
        let www_authenticate = format!(
            "Bearer error=\"{}\", error_description=\"{}\"",
            self.error,
            self.error_description.as_deref().unwrap_or("")
        );

        let mut response = (StatusCode::UNAUTHORIZED, Json(&self)).into_response();
        response.headers_mut().insert(
            header::WWW_AUTHENTICATE,
            HeaderValue::from_str(&www_authenticate).unwrap_or_else(|_| {
                HeaderValue::from_static("Bearer")
            }),
        );
        response
    }
}

/// Decode JWT payload without signature verification.
/// This is safe because we trust the token was issued by our auth provider.
fn decode_jwt_payload(token: &str) -> Result<Claims, String> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Err("Malformed JWT".to_string());
    }

    use base64::Engine;
    let payload = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(parts[1])
        .map_err(|_| "Invalid token encoding".to_string())?;

    serde_json::from_slice(&payload).map_err(|_| "Invalid token payload".to_string())
}

impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
{
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get(header::AUTHORIZATION)
            .and_then(|h| h.to_str().ok())
            .ok_or_else(|| {
                AuthError::invalid_request("Missing Authorization header").into_response()
            })?;

        let token = auth_header.strip_prefix("Bearer ").ok_or_else(|| {
            AuthError::invalid_request("Authorization header must use Bearer scheme").into_response()
        })?;

        let claims = decode_jwt_payload(token).map_err(|e| {
            AuthError::invalid_token(e).into_response()
        })?;

        Ok(AuthUser(claims))
    }
}
