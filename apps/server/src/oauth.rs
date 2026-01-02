use crate::config::{ConfigError, OAuthConfig, SessionConfig};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use openidconnect::{
    core::{
        CoreAuthenticationFlow, CoreClient, CoreProviderMetadata, CoreTokenResponse,
        CoreUserInfoClaims,
    },
    reqwest::async_http_client,
    url::Url,
    AccessToken, AuthorizationCode, ClientId, ClientSecret, CsrfToken, IssuerUrl, Nonce,
    PkceCodeChallenge, PkceCodeVerifier, RedirectUrl, Scope,
};
use serde::Serialize;
use utoipa::ToSchema;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use time::Duration as CookieDuration;
use tokio::sync::RwLock;
use uuid::Uuid;
use tracing::{info, warn};

const DEFAULT_SESSION_TTL_SECS: u64 = 60 * 60;

#[derive(Clone)]
pub struct OAuthState {
    pub client: CoreClient,
    scopes: Vec<Scope>,
    pending: Arc<RwLock<HashMap<String, PendingAuth>>>,
    sessions: Arc<RwLock<HashMap<String, AuthSession>>>,
    success_redirect: String,
    failure_redirect: Option<String>,
    cookie_name: String,
    cookie_domain: Option<String>,
    cookie_secure: bool,
    session_ttl: ChronoDuration,
}

#[derive(Debug)]
struct PendingAuth {
    verifier: PkceCodeVerifier,
    nonce: Nonce,
    created_at: DateTime<Utc>,
}

#[derive(Clone)]
struct AuthSession {
    user: OAuthUser,
    expires_at: Option<DateTime<Utc>>,
    raw_profile: Value,
}

#[derive(Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct OAuthUser {
    pub id: String,
    pub name: Option<String>,
    pub email: Option<String>,
}

#[derive(Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
    pub user: OAuthUser,
    pub expires_at: Option<DateTime<Utc>>,
    pub profile: Value,
}

impl OAuthState {
    pub async fn from_config(
        oauth_config: &OAuthConfig,
        session_config: &SessionConfig,
    ) -> Result<Self, ConfigError> {
        let issuer = IssuerUrl::new(oauth_config.issuer_url.clone())
            .map_err(|error| ConfigError::Invalid("OIDC_ISSUER_URL", error.to_string()))?;

        info!("Starting OIDC discovery at {}", oauth_config.issuer_url);
        let provider_metadata = CoreProviderMetadata::discover_async(issuer, async_http_client)
            .await
            .map_err(|error| ConfigError::Discovery(error.to_string()))?;
        info!("Successfully discovered OIDC provider metadata");

        let client_secret = oauth_config
            .client_secret
            .as_ref()
            .map(|secret| ClientSecret::new(secret.clone()));

        let client = CoreClient::from_provider_metadata(
            provider_metadata,
            ClientId::new(oauth_config.client_id.clone()),
            client_secret,
        )
        .set_redirect_uri(
            RedirectUrl::new(oauth_config.redirect_url.clone())
                .map_err(|error| ConfigError::Invalid("OAUTH_REDIRECT_URL", error.to_string()))?,
        );

        let scopes = if oauth_config.scopes.is_empty() {
            warn!("No OAuth scopes provided; defaulting to 'openid'");
            vec![Scope::new("openid".into())]
        } else {
            info!(
                "Using {} OAuth scope(s): {}",
                oauth_config.scopes.len(),
                oauth_config.scopes.join(", ")
            );
            oauth_config
                .scopes
                .iter()
                .map(|scope| Scope::new(scope.clone()))
                .collect()
        };

        Ok(Self {
            client,
            scopes,
            pending: Arc::new(RwLock::new(HashMap::new())),
            sessions: Arc::new(RwLock::new(HashMap::new())),
            success_redirect: oauth_config.success_redirect.clone(),
            failure_redirect: oauth_config.failure_redirect.clone(),
            cookie_name: session_config.cookie_name.clone(),
            cookie_domain: session_config.cookie_domain.clone(),
            cookie_secure: session_config.cookie_secure,
            session_ttl: session_config.ttl,
        })
    }

    pub fn success_redirect(&self) -> &str {
        &self.success_redirect
    }

    pub fn failure_redirect(&self) -> Option<&str> {
        self.failure_redirect.as_deref()
    }

    pub fn cookie_name(&self) -> &str {
        &self.cookie_name
    }

    pub fn build_authorization_url(&self) -> (Url, CsrfToken, PkceCodeVerifier, Nonce) {
        let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
        let mut request = self
            .client
            .authorize_url(
                CoreAuthenticationFlow::AuthorizationCode,
                CsrfToken::new_random,
                Nonce::new_random,
            )
            .set_pkce_challenge(challenge);

        for scope in &self.scopes {
            request = request.add_scope(scope.clone());
        }

        let (url, csrf_token, nonce) = request.url();
        (url, csrf_token, verifier, nonce)
    }

    pub async fn store_pending(&self, state: String, verifier: PkceCodeVerifier, nonce: Nonce) {
        let mut guard = self.pending.write().await;
        guard.insert(
            state,
            PendingAuth {
                verifier,
                nonce,
                created_at: Utc::now(),
            },
        );
    }

    pub async fn take_pending(&self, state: &str) -> Option<(PkceCodeVerifier, Nonce)> {
        let mut guard = self.pending.write().await;
        guard.remove(state).and_then(|pending| {
            let age = Utc::now() - pending.created_at;
            if age > ChronoDuration::minutes(10) {
                None
            } else {
                Some((pending.verifier, pending.nonce))
            }
        })
    }

    pub async fn exchange_code(
        &self,
        code: AuthorizationCode,
        verifier: PkceCodeVerifier,
    ) -> Result<CoreTokenResponse, String> {
        self.client
            .exchange_code(code)
            .set_pkce_verifier(verifier)
            .request_async(async_http_client)
            .await
            .map_err(|error| error.to_string())
    }

    pub async fn fetch_userinfo(&self, access_token: &AccessToken) -> Result<Value, String> {
        let request = self
            .client
            .user_info(access_token.clone(), None)
            .map_err(|error| error.to_string())?;

        let claims: CoreUserInfoClaims = request
            .request_async(async_http_client)
            .await
            .map_err(|error| error.to_string())?;

        serde_json::to_value(claims).map_err(|error| error.to_string())
    }

    pub async fn create_session(
        &self,
        user: OAuthUser,
        expires_in: Option<std::time::Duration>,
        raw_profile: Value,
    ) -> String {
        let session_id = Uuid::new_v4().to_string();
        let expires_at = expires_in
            .and_then(|expires| ChronoDuration::from_std(expires).ok())
            .map(|duration| Utc::now() + duration);

        let session = AuthSession {
            user,
            expires_at,
            raw_profile,
        };

        let mut guard = self.sessions.write().await;
        guard.insert(session_id.clone(), session);

        session_id
    }

    pub async fn remove_session(&self, session_id: &str) {
        let mut guard = self.sessions.write().await;
        guard.remove(session_id);
    }

    pub async fn session_snapshot(&self, session_id: &str) -> Option<SessionSnapshot> {
        let guard = self.sessions.read().await;
        guard.get(session_id).map(|session| SessionSnapshot {
            user: session.user.clone(),
            expires_at: session.expires_at,
            profile: session.raw_profile.clone(),
        })
    }

    pub async fn session_user_id(&self, jar: &CookieJar) -> Option<String> {
        let cookie = jar.get(&self.cookie_name)?;
        let session_id = cookie.value();
        let guard = self.sessions.read().await;
        guard.get(session_id).and_then(|session| {
            // Check if session has expired
            if let Some(expires_at) = session.expires_at {
                if Utc::now() > expires_at {
                    warn!("Session {} has expired", session_id);
                    return None;  // Session expired
                }
            }
            Some(session.user.id.clone())
        })
    }

    pub fn build_cookie(&self, session_id: &str) -> Cookie<'static> {
        let ttl = self
            .session_ttl
            .to_std()
            .unwrap_or_else(|_| std::time::Duration::from_secs(DEFAULT_SESSION_TTL_SECS));
        let max_age = CookieDuration::seconds(ttl.as_secs() as i64);

        let mut builder = Cookie::build((self.cookie_name.clone(), session_id.to_string()))
            .path("/")
            .http_only(true)
            .same_site(SameSite::Lax)
            .max_age(max_age);

        if let Some(domain) = &self.cookie_domain {
            builder = builder.domain(domain.clone());
        }

        if self.cookie_secure {
            builder = builder.secure(true);
        }

        builder.build()
    }

    pub fn build_logout_cookie(&self) -> Cookie<'static> {
        let mut builder = Cookie::build((self.cookie_name.clone(), ""))
            .path("/")
            .http_only(true)
            .same_site(SameSite::Lax)
            .max_age(CookieDuration::seconds(0));

        if let Some(domain) = &self.cookie_domain {
            builder = builder.domain(domain.clone());
        }

        if self.cookie_secure {
            builder = builder.secure(true);
        }

        builder.build()
    }

    /// Clean up expired pending auth states and sessions
    pub async fn cleanup_expired(&self) {
        // Clean up expired pending auth
        {
            let mut guard = self.pending.write().await;
            let now = Utc::now();
            let before_count = guard.len();
            guard.retain(|_state, pending| {
                (now - pending.created_at) <= ChronoDuration::minutes(10)
            });
            let removed = before_count - guard.len();
            if removed > 0 {
                info!("Cleaned up {} expired pending auth states", removed);
            }
        }

        // Clean up expired sessions
        {
            let mut guard = self.sessions.write().await;
            let now = Utc::now();
            let before_count = guard.len();
            guard.retain(|_session_id, session| {
                session.expires_at.is_none_or(|expires| expires > now)
            });
            let removed = before_count - guard.len();
            if removed > 0 {
                info!("Cleaned up {} expired sessions", removed);
            }
        }
    }

    pub fn extract_identity(profile: &Value) -> Option<OAuthUser> {
        if profile.is_null() {
            return None;
        }

        let id = profile
            .get("sub")
            .or_else(|| profile.get("id"))
            .or_else(|| profile.pointer("/user/id"))
            .and_then(|value| match value {
                Value::String(text) => Some(text.clone()),
                Value::Number(number) => Some(number.to_string()),
                _ => None,
            })?;

        let email = profile
            .get("email")
            .and_then(|value| value.as_str())
            .map(String::from);

        let name = profile
            .get("name")
            .or_else(|| profile.get("preferred_username"))
            .or_else(|| profile.get("login"))
            .and_then(|value| value.as_str())
            .map(String::from);

        Some(OAuthUser { id, name, email })
    }
}
