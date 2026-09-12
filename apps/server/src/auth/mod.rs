use axum::{
    body::Body,
    extract::{Request, State},
    http::{header, HeaderValue, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
    time::Duration,
};
use tokio::sync::RwLock;
use utoipa::ToSchema;

use crate::application::{Capability, Principal, UserId};

pub(crate) const ORDER_READ_SCOPE: &str = "orders.read";
pub(crate) const ORDER_SYNC_SCOPE: &str = "orders.sync";
pub(crate) const ORDER_STATUS_SCOPE: &str = "orders.status.write";
pub(crate) const ORDER_NOTE_SCOPE: &str = "orders.note.write";

pub(crate) fn agent_scope_values(resource: &str) -> Vec<String> {
    [ORDER_READ_SCOPE, ORDER_STATUS_SCOPE, ORDER_NOTE_SCOPE]
        .map(|name| format!("{}/{name}", resource.trim_end_matches('/')))
        .to_vec()
}

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
    pub alg: String,
    pub n: String,
    pub e: String,
}

/// Cached JWKS with expiry tracking
struct JwksCache {
    keys: HashMap<String, DecodingKey>,
    fetched_at: std::time::Instant,
}

/// JWT verifier with JWKS caching
#[derive(Clone)]
pub struct JwksVerifier {
    cache: Arc<RwLock<Option<JwksCache>>>,
    jwks_url: String,
    issuer: String,
    policy: AuthPolicy,
}

impl JwksVerifier {
    pub fn new(issuer: String, policy: AuthPolicy) -> Self {
        let jwks_url = format!("{}/.well-known/jwks.json", issuer);
        Self {
            cache: Arc::new(RwLock::new(None)),
            jwks_url,
            issuer,
            policy,
        }
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
            if jwk.kty == "RSA" && jwk.alg == "RS256" {
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
    async fn authenticate(&self, token: &str) -> Result<(Claims, Principal), &'static str> {
        // Decode header to get kid
        let header = decode_header(token).map_err(|e| {
            tracing::debug!("Invalid token header: {}", e);
            "Invalid token"
        })?;

        let kid = header.kid.ok_or_else(|| {
            tracing::debug!("Token missing kid claim");
            "Invalid token"
        })?;
        if header.alg != Algorithm::RS256 {
            tracing::debug!(algorithm = ?header.alg, "Token uses an unsupported algorithm");
            return Err("Invalid token");
        }

        // Get the decoding key
        let key = self.get_key(&kid).await.map_err(|e| {
            tracing::debug!("Failed to get key: {}", e);
            "Invalid token"
        })?;

        // Set up validation
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&[&self.issuer]);
        // Cognito access tokens identify the app client with `client_id`. Their
        // resource-bound `aud` is validated separately by AuthPolicy.
        validation.validate_aud = false;

        // Decode and verify
        let token_data = decode::<Claims>(token, &key, &validation).map_err(|e| {
            tracing::debug!("Token validation failed: {}", e);
            "Invalid token"
        })?;

        let principal = self.policy.principal_for(&token_data.claims)?;
        Ok((token_data.claims, principal))
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
    pub client_id: Option<String>,
    pub scope: Option<String>,
}

#[derive(Clone, Debug)]
pub struct AuthPolicy {
    extension_client_id: String,
    agent_client_ids: HashSet<String>,
    resource_server_identifier: String,
}

impl AuthPolicy {
    pub fn new(
        extension_client_id: impl Into<String>,
        resource_server_identifier: impl Into<String>,
    ) -> Self {
        Self {
            extension_client_id: extension_client_id.into(),
            agent_client_ids: HashSet::new(),
            resource_server_identifier: resource_server_identifier
                .into()
                .trim_end_matches('/')
                .to_string(),
        }
    }

    pub fn with_agent_clients(
        mut self,
        client_ids: impl IntoIterator<Item = impl Into<String>>,
    ) -> Result<Self, &'static str> {
        for client_id in client_ids {
            let client_id = client_id.into().trim().to_string();
            if client_id == self.extension_client_id {
                return Err("Agent client IDs must be different from OIDC_CLIENT_ID");
            }
            if !client_id.is_empty() {
                self.agent_client_ids.insert(client_id);
            }
        }
        Ok(self)
    }

    fn principal_for(&self, claims: &Claims) -> Result<Principal, &'static str> {
        if claims.token_use.as_deref() != Some("access") {
            return Err("Token must be an access token");
        }

        let client_id = claims
            .client_id
            .as_deref()
            .ok_or("Token missing client_id")?;
        let user_id = UserId::new(claims.sub.clone());
        if claims.aud.as_deref() != Some(self.resource_server_identifier.as_str()) {
            return Err("Token audience does not match this resource");
        }
        let is_extension = client_id == self.extension_client_id;
        let is_agent = self.agent_client_ids.contains(client_id);
        if !is_extension && !is_agent {
            return Err("Token was issued to an unsupported client");
        }

        let scopes = claims.scope.as_deref().unwrap_or_default();
        let has_scope = |name: &str| {
            let expected = format!("{}/{name}", self.resource_server_identifier);
            scopes.split_whitespace().any(|scope| scope == expected)
        };
        let mut capabilities = Vec::with_capacity(4);
        if has_scope(ORDER_READ_SCOPE) {
            capabilities.push(Capability::ReadOrders);
        }
        if is_extension && has_scope(ORDER_SYNC_SCOPE) {
            capabilities.push(Capability::SyncOrders);
        }
        if has_scope(ORDER_STATUS_SCOPE) {
            capabilities.push(Capability::UpdateStatus);
        }
        if has_scope(ORDER_NOTE_SCOPE) {
            capabilities.push(Capability::UpdateNote);
        }

        Ok(Principal::with_capabilities(user_id, capabilities))
    }

    fn resource_metadata_uri(&self) -> String {
        format!(
            "{}/.well-known/oauth-protected-resource",
            self.resource_server_identifier
        )
    }

    fn agent_scopes(&self) -> String {
        agent_scope_values(&self.resource_server_identifier).join(" ")
    }
}

/// OAuth 2.0 bearer-token error response.
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

    fn into_response_with_policy(self, policy: &AuthPolicy) -> Response {
        let www_authenticate = format!(
            "Bearer error=\"{}\", error_description=\"{}\", resource_metadata=\"{}\", scope=\"{}\"",
            self.error,
            self.error_description.as_deref().unwrap_or(""),
            policy.resource_metadata_uri(),
            policy.agent_scopes(),
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
pub async fn auth_middleware(
    State(verifier): State<JwksVerifier>,
    mut request: Request<Body>,
    next: Next,
) -> Response {
    // Extract token from Authorization header
    let auth_header = match request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
    {
        Some(h) => h,
        None => {
            return AuthError::invalid_request("Missing Authorization header")
                .into_response_with_policy(&verifier.policy);
        }
    };

    let token = match auth_header.strip_prefix("Bearer ") {
        Some(t) => t,
        None => {
            return AuthError::invalid_request("Authorization header must use Bearer scheme")
                .into_response_with_policy(&verifier.policy);
        }
    };

    // Verify the token
    let (claims, principal) = match verifier.authenticate(token).await {
        Ok(context) => context,
        Err(e) => {
            tracing::warn!("Token verification failed: {}", e);
            return AuthError::invalid_token(e).into_response_with_policy(&verifier.policy);
        }
    };

    // Insert claims into request extensions for handlers to use
    request.extensions_mut().insert(principal);
    request.extensions_mut().insert(claims);

    next.run(request).await
}

/// Extractor to get authenticated user claims from request extensions
#[derive(Debug, Clone)]
pub struct AuthUser(pub Claims);

/// Application principal derived once from verified authentication context.
#[derive(Debug, Clone)]
pub struct AuthPrincipal(pub Principal);

/// Least-privilege principal for agent-facing routes.
#[derive(Debug, Clone)]
pub struct AuthAgentPrincipal(pub Principal);

fn application_principal(parts: &axum::http::request::Parts) -> Option<Principal> {
    parts.extensions.get::<Principal>().cloned()
}

fn missing_application_principal() -> Response {
    AuthError::invalid_request("Missing application principal - is auth middleware applied?")
        .into_response()
}

impl<S> axum::extract::FromRequestParts<S> for AuthPrincipal
where
    S: Send + Sync,
{
    type Rejection = Response;

    async fn from_request_parts(
        parts: &mut axum::http::request::Parts,
        _state: &S,
    ) -> Result<Self, Self::Rejection> {
        application_principal(parts)
            .map(AuthPrincipal)
            .ok_or_else(missing_application_principal)
    }
}

impl<S> axum::extract::FromRequestParts<S> for AuthAgentPrincipal
where
    S: Send + Sync,
{
    type Rejection = Response;

    async fn from_request_parts(
        parts: &mut axum::http::request::Parts,
        _state: &S,
    ) -> Result<Self, Self::Rejection> {
        application_principal(parts)
            .map(AuthAgentPrincipal)
            .ok_or_else(missing_application_principal)
    }
}

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

#[cfg(test)]
mod tests;
