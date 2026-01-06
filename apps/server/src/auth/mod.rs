use axum::{
    body::Body,
    extract::Request,
    http::{header, HeaderValue, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use jsonwebtoken::{decode, decode_header, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Arc, time::Duration};
use tokio::sync::RwLock;
use utoipa::ToSchema;

/// JWKS (JSON Web Key Set) structure from Cognito
#[derive(Debug, Deserialize)]
pub struct Jwks {
    pub keys: Vec<Jwk>,
}

/// Individual JWK (JSON Web Key)
#[derive(Debug, Deserialize, Clone)]
pub struct Jwk {
    pub kid: String,
    pub kty: String,
    #[allow(dead_code)]
    pub alg: String,
    pub n: String,
    pub e: String,
}

/// Cached JWKS with expiry tracking
struct JwksCache {
    keys: HashMap<String, DecodingKey>,
    fetched_at: std::time::Instant,
}

/// Global JWKS verifier
static JWKS_VERIFIER: std::sync::OnceLock<JwksVerifier> = std::sync::OnceLock::new();

/// JWT verifier with JWKS caching
pub struct JwksVerifier {
    cache: Arc<RwLock<Option<JwksCache>>>,
    jwks_url: String,
    issuer: String,
    client_id: String,
}

impl JwksVerifier {
    /// Initialize the global JWKS verifier
    pub fn init(issuer: String, client_id: String) {
        let jwks_url = format!("{}/.well-known/jwks.json", issuer);
        let verifier = Self {
            cache: Arc::new(RwLock::new(None)),
            jwks_url,
            issuer,
            client_id,
        };
        JWKS_VERIFIER.set(verifier).ok();
    }

    fn get() -> Option<&'static JwksVerifier> {
        JWKS_VERIFIER.get()
    }

    /// Fetch JWKS from Cognito and cache the keys
    async fn fetch_jwks(&self) -> Result<HashMap<String, DecodingKey>, String> {
        let response = reqwest::get(&self.jwks_url)
            .await
            .map_err(|e| format!("Failed to fetch JWKS: {}", e))?;

        let jwks: Jwks = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse JWKS: {}", e))?;

        let mut keys = HashMap::new();
        for jwk in jwks.keys {
            if jwk.kty == "RSA" {
                let key = DecodingKey::from_rsa_components(&jwk.n, &jwk.e)
                    .map_err(|e| format!("Failed to create decoding key: {}", e))?;
                keys.insert(jwk.kid, key);
            }
        }

        Ok(keys)
    }

    /// Get decoding key for a given kid, fetching JWKS if needed
    async fn get_key(&self, kid: &str) -> Result<DecodingKey, String> {
        // Check cache first
        {
            let cache = self.cache.read().await;
            if let Some(ref cached) = *cache {
                // Cache is valid for 1 hour
                if cached.fetched_at.elapsed() < Duration::from_secs(3600) {
                    if let Some(key) = cached.keys.get(kid) {
                        return Ok(key.clone());
                    }
                }
            }
        }

        // Fetch fresh JWKS
        let keys = self.fetch_jwks().await?;

        // Update cache
        {
            let mut cache = self.cache.write().await;
            *cache = Some(JwksCache {
                keys: keys.clone(),
                fetched_at: std::time::Instant::now(),
            });
        }

        keys.get(kid)
            .cloned()
            .ok_or_else(|| "Key not found in JWKS".to_string())
    }

    /// Verify and decode a JWT token
    async fn verify_token(&self, token: &str) -> Result<Claims, String> {
        // Decode header to get kid
        let header = decode_header(token).map_err(|e| format!("Invalid token header: {}", e))?;

        let kid = header.kid.ok_or("Token missing kid claim")?;

        // Get the decoding key
        let key = self.get_key(&kid).await?;

        // Set up validation
        let mut validation = Validation::new(header.alg);
        validation.set_issuer(&[&self.issuer]);
        validation.set_audience(&[&self.client_id]);

        // Decode and verify
        let token_data = decode::<Claims>(token, &key, &validation)
            .map_err(|e| format!("Token validation failed: {}", e))?;

        Ok(token_data.claims)
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String,
    pub email: Option<String>,
    #[serde(rename = "cognito:username")]
    pub username: Option<String>,
    pub iss: Option<String>,
    pub aud: Option<String>,
    pub exp: Option<u64>,
    pub iat: Option<u64>,
    pub token_use: Option<String>,
}

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
        let www_authenticate = format!(
            "Bearer error=\"{}\", error_description=\"{}\"",
            self.error,
            self.error_description.as_deref().unwrap_or("")
        );

        let mut response = (StatusCode::UNAUTHORIZED, Json(&self)).into_response();
        response.headers_mut().insert(
            header::WWW_AUTHENTICATE,
            HeaderValue::from_str(&www_authenticate)
                .unwrap_or_else(|_| HeaderValue::from_static("Bearer")),
        );
        response
    }
}

/// Middleware to authenticate requests
pub async fn auth_middleware(mut request: Request<Body>, next: Next) -> Response {
    let verifier = match JwksVerifier::get() {
        Some(v) => v,
        None => {
            return AuthError::invalid_token("Auth not configured").into_response();
        }
    };

    // Extract token from Authorization header
    let auth_header = match request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
    {
        Some(h) => h,
        None => {
            return AuthError::invalid_request("Missing Authorization header").into_response();
        }
    };

    let token = match auth_header.strip_prefix("Bearer ") {
        Some(t) => t,
        None => {
            return AuthError::invalid_request("Authorization header must use Bearer scheme")
                .into_response();
        }
    };

    // Verify the token
    let claims = match verifier.verify_token(token).await {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!("Token verification failed: {}", e);
            return AuthError::invalid_token(e).into_response();
        }
    };

    // Insert claims into request extensions for handlers to use
    request.extensions_mut().insert(claims);

    next.run(request).await
}

/// Extractor to get authenticated user claims from request extensions
#[derive(Debug, Clone)]
pub struct AuthUser(pub Claims);

impl<S> axum::extract::FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
{
    type Rejection = Response;

    async fn from_request_parts(
        parts: &mut axum::http::request::Parts,
        _state: &S,
    ) -> Result<Self, Self::Rejection> {
        parts
            .extensions
            .get::<Claims>()
            .cloned()
            .map(AuthUser)
            .ok_or_else(|| {
                AuthError::invalid_request("Missing auth context - is auth middleware applied?")
                    .into_response()
            })
    }
}
