use chrono::Duration as ChronoDuration;
use std::env;
use thiserror::Error;

const DEFAULT_PORT: u16 = 8080;
const DEFAULT_HOST: &str = "0.0.0.0";
const DEFAULT_DB_NAME: &str = "order-wizard";
const DEFAULT_SESSION_TTL: i64 = 60 * 60;
const DEFAULT_FRONTEND_ORIGIN: &str = "http://localhost:5173";

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub host: String,
    pub port: u16,
    pub mongo: MongoConfig,
    pub oauth: OAuthConfig,
    pub session: SessionConfig,
    pub cors: CorsConfig,
}

#[derive(Debug, Clone)]
pub struct MongoConfig {
    pub uri: String,
    pub database: String,
}

#[derive(Debug, Clone)]
pub struct OAuthConfig {
    pub client_id: String,
    pub client_secret: Option<String>,
    pub issuer_url: String,
    pub redirect_url: String,
    pub scopes: Vec<String>,
    pub success_redirect: String,
    pub failure_redirect: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SessionConfig {
    pub cookie_name: String,
    pub cookie_domain: Option<String>,
    pub cookie_secure: bool,
    pub ttl: ChronoDuration,
}

#[derive(Debug, Clone)]
pub struct CorsConfig {
    pub allowed_origins: Vec<String>,
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("missing required environment variable: {0}")]
    Missing(&'static str),
    #[error("invalid value for {0}: {1}")]
    Invalid(&'static str, String),
    #[error("oidc discovery failed: {0}")]
    Discovery(String),
}

impl AppConfig {
    pub fn from_env() -> Result<Self, ConfigError> {
        let host = env::var("HOST").unwrap_or_else(|_| DEFAULT_HOST.to_string());
        let port = env::var("PORT")
            .ok()
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(DEFAULT_PORT);

        let mongo_uri = env::var("MONGODB_URI").map_err(|_| ConfigError::Missing("MONGODB_URI"))?;
        let mongo_database =
            env::var("MONGODB_DATABASE").unwrap_or_else(|_| DEFAULT_DB_NAME.to_string());

        let client_id =
            env::var("OAUTH_CLIENT_ID").map_err(|_| ConfigError::Missing("OAUTH_CLIENT_ID"))?;
        let client_secret = env::var("OAUTH_CLIENT_SECRET").ok();
        let issuer_url =
            env::var("OIDC_ISSUER_URL").map_err(|_| ConfigError::Missing("OIDC_ISSUER_URL"))?;

        // Derive OAuth URLs from frontend origin (reduces config)
        let frontend_origin =
            env::var("FRONTEND_ORIGIN").unwrap_or_else(|_| DEFAULT_FRONTEND_ORIGIN.to_string());
        let redirect_url = env::var("OAUTH_REDIRECT_URL")
            .unwrap_or_else(|_| format!("http://localhost:{}/auth/callback", port));
        let success_redirect = env::var("OAUTH_SUCCESS_REDIRECT")
            .unwrap_or_else(|_| format!("{}/auth/success", frontend_origin));
        let failure_redirect = env::var("OAUTH_FAILURE_REDIRECT").ok();

        // Default scopes - openid and email are typically all that's needed
        let scopes = env::var("OAUTH_SCOPES")
            .unwrap_or_else(|_| "openid email".to_string())
            .split([' ', ','])
            .filter(|scope| !scope.trim().is_empty())
            .map(|scope| scope.to_string())
            .collect::<Vec<_>>();

        let cookie_name = env::var("SESSION_COOKIE_NAME").unwrap_or_else(|_| "ow_session".into());
        let cookie_domain = env::var("SESSION_COOKIE_DOMAIN").ok();
        let cookie_secure = env::var("SESSION_COOKIE_SECURE")
            .ok()
            .map(|value| matches!(value.to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
            .unwrap_or(true);
        let ttl = env::var("SESSION_TTL_SECONDS")
            .ok()
            .and_then(|value| value.parse::<i64>().ok())
            .filter(|ttl| *ttl > 0)
            .map(ChronoDuration::seconds)
            .unwrap_or_else(|| ChronoDuration::seconds(DEFAULT_SESSION_TTL));

        // Derive CORS origins from FRONTEND_ORIGIN if not explicitly set
        let allowed_origins = env::var("ALLOWED_ORIGINS")
            .unwrap_or_else(|_| frontend_origin.clone())
            .split(',')
            .filter(|origin| !origin.trim().is_empty())
            .map(|origin| origin.trim().to_string())
            .collect::<Vec<_>>();

        Ok(Self {
            host,
            port,
            mongo: MongoConfig {
                uri: mongo_uri,
                database: mongo_database,
            },
            oauth: OAuthConfig {
                client_id,
                client_secret,
                issuer_url,
                redirect_url,
                scopes,
                success_redirect,
                failure_redirect,
            },
            session: SessionConfig {
                cookie_name,
                cookie_domain,
                cookie_secure,
                ttl,
            },
            cors: CorsConfig {
                allowed_origins,
            },
        })
    }
}
