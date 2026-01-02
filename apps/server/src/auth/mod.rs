use axum::{
    extract::FromRequestParts,
    http::{request::Parts, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use jsonwebtoken::{decode, decode_header, jwk::JwkSet, DecodingKey, Validation};
use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

static JWKS_CACHE: OnceCell<Arc<RwLock<Option<JwkSet>>>> = OnceCell::new();

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String,
    pub email: Option<String>,
    pub exp: usize,
    pub iss: String,
    pub aud: Option<String>,
    #[serde(rename = "cognito:username")]
    pub username: Option<String>,
}

#[derive(Debug)]
pub struct AuthUser(pub Claims);

#[derive(Debug, Serialize)]
struct AuthError {
    error: String,
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        (StatusCode::UNAUTHORIZED, Json(self)).into_response()
    }
}

fn get_cognito_config() -> (String, String, String) {
    let region = std::env::var("AWS_COGNITO_REGION").expect("AWS_COGNITO_REGION must be set");
    let pool_id =
        std::env::var("AWS_COGNITO_USER_POOL_ID").expect("AWS_COGNITO_USER_POOL_ID must be set");
    let client_id =
        std::env::var("AWS_COGNITO_CLIENT_ID").expect("AWS_COGNITO_CLIENT_ID must be set");
    (region, pool_id, client_id)
}

async fn fetch_jwks(region: &str, pool_id: &str) -> Result<JwkSet, String> {
    let url = format!(
        "https://cognito-idp.{}.amazonaws.com/{}/.well-known/jwks.json",
        region, pool_id
    );

    reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to fetch JWKS: {}", e))?
        .json::<JwkSet>()
        .await
        .map_err(|e| format!("Failed to parse JWKS: {}", e))
}

async fn get_jwks() -> Result<JwkSet, String> {
    let cache = JWKS_CACHE.get_or_init(|| Arc::new(RwLock::new(None)));

    // Try to read from cache
    {
        let read_guard = cache.read().await;
        if let Some(ref jwks) = *read_guard {
            return Ok(jwks.clone());
        }
    }

    // Fetch and cache
    let (region, pool_id, _) = get_cognito_config();
    let jwks = fetch_jwks(&region, &pool_id).await?;

    {
        let mut write_guard = cache.write().await;
        *write_guard = Some(jwks.clone());
    }

    Ok(jwks)
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
                }
                .into_response()
            })?;

        let token = auth_header.strip_prefix("Bearer ").ok_or_else(|| {
            AuthError {
                error: "Invalid Authorization header format".to_string(),
            }
            .into_response()
        })?;

        let header = decode_header(token).map_err(|e| {
            AuthError {
                error: format!("Invalid token header: {}", e),
            }
            .into_response()
        })?;

        let kid = header.kid.ok_or_else(|| {
            AuthError {
                error: "Token missing kid".to_string(),
            }
            .into_response()
        })?;

        let jwks = get_jwks().await.map_err(|e| {
            AuthError {
                error: format!("Failed to get JWKS: {}", e),
            }
            .into_response()
        })?;

        let jwk = jwks.find(&kid).ok_or_else(|| {
            AuthError {
                error: "Unknown key ID".to_string(),
            }
            .into_response()
        })?;

        let decoding_key = DecodingKey::from_jwk(jwk).map_err(|e| {
            AuthError {
                error: format!("Invalid JWK: {}", e),
            }
            .into_response()
        })?;

        let (region, pool_id, client_id) = get_cognito_config();
        let issuer = format!(
            "https://cognito-idp.{}.amazonaws.com/{}",
            region, pool_id
        );

        let mut validation = Validation::new(header.alg);
        validation.set_issuer(&[&issuer]);
        validation.set_audience(&[&client_id]);

        let token_data = decode::<Claims>(token, &decoding_key, &validation).map_err(|e| {
            AuthError {
                error: format!("Invalid token: {}", e),
            }
            .into_response()
        })?;

        Ok(AuthUser(token_data.claims))
    }
}
