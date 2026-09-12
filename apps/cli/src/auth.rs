use std::{
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use axum::{
    extract::{Query, State},
    http::{header, HeaderMap, StatusCode},
    routing::get,
    Router,
};
use oauth2::{
    basic::BasicClient, AuthType, AuthUrl, AuthorizationCode, ClientId, CsrfToken,
    PkceCodeChallenge, RedirectUrl, RefreshToken, Scope, TokenResponse, TokenUrl,
};
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::oneshot;

use crate::CliError;

const DEFAULT_API: &str = "https://order-wizard-api.fly.dev";
const KEYRING_SERVICE: &str = "order-wizard";

#[derive(Clone, Copy)]
pub(crate) enum Profile {
    Cli,
    Mcp,
}
impl Profile {
    pub(crate) fn name(self) -> &'static str {
        match self {
            Self::Cli => "cli",
            Self::Mcp => "mcp",
        }
    }
}

#[derive(Deserialize)]
struct ClientConfig {
    issuer: String,
    resource: String,
    cli_client_id: Option<String>,
    mcp_client_ids: Vec<String>,
}

#[derive(Deserialize)]
struct Metadata {
    issuer: String,
    authorization_endpoint: String,
    token_endpoint: String,
    revocation_endpoint: String,
}

#[derive(Serialize, Deserialize)]
struct Session {
    resource: String,
    client_id: String,
    token_endpoint: String,
    revocation_endpoint: String,
    access_token: String,
    refresh_token: String,
    expires_at: u64,
}

pub(crate) fn api_url() -> Result<Url, CliError> {
    let value = std::env::var("ORDER_WIZARD_API_URL").unwrap_or_else(|_| DEFAULT_API.to_string());
    let url = Url::parse(&format!("{}/", value.trim_end_matches('/')))
        .map_err(|_| CliError::config("ORDER_WIZARD_API_URL is invalid"))?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(CliError::config(
            "API URL must not contain credentials, a query, or a fragment",
        ));
    }
    if url.scheme() != "https"
        && !(url.scheme() == "http"
            && matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]")))
    {
        return Err(CliError::config(
            "API URL must use HTTPS, except for local development",
        ));
    }
    Ok(url)
}

pub(crate) fn http() -> Result<Client, CliError> {
    Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| CliError::network("Could not initialize HTTP client"))
}

fn secure_endpoint(value: &str) -> Result<Url, CliError> {
    let url = Url::parse(value).map_err(|_| CliError::config("Invalid OAuth endpoint"))?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return Err(CliError::config(
            "OAuth endpoints must use HTTPS without URL credentials",
        ));
    }
    Ok(url)
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn login_state(port: u16) -> CsrfToken {
    CsrfToken::new(format!("{}.{port}", CsrfToken::new_random_len(32).secret()))
}
fn entry(profile: Profile, api: &Url) -> Result<keyring::Entry, CliError> {
    keyring::Entry::new(KEYRING_SERVICE, &format!("{}:{}", profile.name(), api))
        .map_err(|_| CliError::config("System credential store is unavailable"))
}
fn load(profile: Profile, api: &Url) -> Result<Session, CliError> {
    let data = entry(profile, api)
        .map_err(|_| CliError::auth("No saved login is available: the system credential store is unavailable. Set ORDER_WIZARD_ACCESS_TOKEN or enable the system credential store."))?
        .get_secret()
        .map_err(|error| match error {
            keyring::Error::NoEntry => CliError::auth(format!(
                "Run order-wizard auth login{} (or set ORDER_WIZARD_ACCESS_TOKEN)",
                if matches!(profile, Profile::Mcp) {
                    " --mcp"
                } else {
                    ""
                }
            )),
            _ => CliError::config("Could not read the system credential store"),
        })?;
    serde_json::from_slice(&data)
        .map_err(|_| CliError::auth("Stored login is invalid; sign in again"))
}
fn save(profile: Profile, api: &Url, session: &Session) -> Result<(), CliError> {
    let data =
        serde_json::to_vec(session).map_err(|_| CliError::config("Could not encode login"))?;
    entry(profile, api)?
        .set_secret(&data)
        .map_err(|_| CliError::config("Could not save login to the system credential store"))
}

#[derive(Deserialize)]
struct Callback {
    state: String,
    code: Option<String>,
    error: Option<String>,
}
struct PendingLogin {
    expected_state: CsrfToken,
    authority: String,
    result: Mutex<Option<oneshot::Sender<Result<String, ()>>>>,
}
async fn receive_callback(
    State(pending): State<Arc<PendingLogin>>,
    headers: HeaderMap,
    Query(query): Query<Callback>,
) -> (StatusCode, &'static str) {
    if headers.get("host").and_then(|v| v.to_str().ok()) != Some(&pending.authority)
        || CsrfToken::new(query.state) != pending.expected_state
    {
        return (
            StatusCode::BAD_REQUEST,
            "This login response does not match the pending login.",
        );
    }
    let result = match (query.code, query.error) {
        (Some(code), None) if !code.is_empty() && code.len() <= 4096 => Ok(code),
        (None, Some(_)) => Err(()),
        _ => return (StatusCode::BAD_REQUEST, "Invalid login response."),
    };
    let Some(sender) = pending.result.lock().unwrap().take() else {
        return (
            StatusCode::CONFLICT,
            "This login response has already been used.",
        );
    };
    let _ = sender.send(result);
    (
        StatusCode::OK,
        "Login response received. You can return to your terminal and close this tab.",
    )
}

pub(crate) async fn login(profile: Profile, no_browser: bool) -> Result<Value, CliError> {
    let api = api_url()?;
    let _ = entry(profile, &api)?;
    let http = http()?;
    let config: ClientConfig = http
        .get(api.join(".well-known/order-wizard-clients").unwrap())
        .send()
        .await
        .map_err(|_| CliError::network("Could not retrieve login configuration"))?
        .error_for_status()
        .map_err(|_| CliError::config("Server does not provide CLI login configuration"))?
        .json()
        .await
        .map_err(|_| CliError::config("Invalid server login configuration"))?;
    if config.resource.trim_end_matches('/') != api.as_str().trim_end_matches('/') {
        return Err(CliError::config(
            "Login resource does not match the API URL",
        ));
    }
    let client_id = match profile {
        Profile::Cli => config.cli_client_id.filter(|id| !id.is_empty()),
        Profile::Mcp if config.mcp_client_ids.len() == 1 => {
            config.mcp_client_ids.into_iter().next()
        }
        Profile::Mcp => None,
    }
    .ok_or_else(|| {
        CliError::config("Server must configure one client ID for this login profile")
    })?;
    let issuer = secure_endpoint(&config.issuer)?;
    let metadata: Metadata = http
        .get(format!(
            "{}/.well-known/openid-configuration",
            issuer.as_str().trim_end_matches('/')
        ))
        .send()
        .await
        .map_err(|_| CliError::network("Could not retrieve OAuth metadata"))?
        .error_for_status()
        .map_err(|_| CliError::config("OAuth discovery failed"))?
        .json()
        .await
        .map_err(|_| CliError::config("Invalid OAuth metadata"))?;
    if metadata.issuer != config.issuer {
        return Err(CliError::config(
            "OAuth issuer does not match server configuration",
        ));
    }
    secure_endpoint(&metadata.authorization_endpoint)?;
    secure_endpoint(&metadata.token_endpoint)?;
    secure_endpoint(&metadata.revocation_endpoint)?;
    let redirect_uri = api.join("oauth/cli/callback").unwrap().to_string();
    secure_endpoint(&redirect_uri)?;
    let oauth = BasicClient::new(ClientId::new(client_id.clone()))
        .set_auth_type(AuthType::RequestBody)
        .set_auth_uri(AuthUrl::new(metadata.authorization_endpoint).unwrap())
        .set_token_uri(TokenUrl::new(metadata.token_endpoint.clone()).unwrap())
        .set_redirect_uri(RedirectUrl::new(redirect_uri).unwrap());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|_| CliError::network("Could not open local login listener"))?;
    let address = listener
        .local_addr()
        .map_err(|_| CliError::network("Could not read local login address"))?;
    let state = login_state(address.port());
    let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
    let mut request = oauth
        .authorize_url(|| state.clone())
        .set_pkce_challenge(challenge)
        .add_extra_param("resource", &config.resource);
    for name in ["orders.read", "orders.status.write", "orders.note.write"] {
        request = request.add_scope(Scope::new(format!("{}/{name}", config.resource)));
    }
    let (url, _) = request.url();
    let (sender, receiver) = oneshot::channel();
    let app = Router::new()
        .route("/callback", get(receive_callback))
        .layer(axum::middleware::map_response(
            |mut response: axum::response::Response| async move {
                response
                    .headers_mut()
                    .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
                response
                    .headers_mut()
                    .insert(header::REFERRER_POLICY, "no-referrer".parse().unwrap());
                response
            },
        ))
        .with_state(Arc::new(PendingLogin {
            expected_state: state,
            authority: address.to_string(),
            result: Mutex::new(Some(sender)),
        }));
    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let mut server = tokio::spawn(async move {
        axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = shutdown_rx.await;
            })
            .await
    });
    eprintln!("Sign in using your browser:\n{url}");
    if !no_browser && open::that(url.as_str()).is_err() {
        eprintln!("Open the URL above in your browser to continue.");
    }
    let received = tokio::time::timeout(Duration::from_secs(300), receiver).await;
    let _ = shutdown_tx.send(());
    if tokio::time::timeout(Duration::from_secs(2), &mut server)
        .await
        .is_err()
    {
        server.abort();
    }
    let code = received
        .map_err(|_| CliError::auth("Login timed out; try again"))?
        .map_err(|_| CliError::auth("Login listener closed"))?
        .map_err(|_| CliError::auth("Login was denied"))?;
    let token = oauth
        .exchange_code(AuthorizationCode::new(code))
        .set_pkce_verifier(verifier)
        .request_async(&http)
        .await
        .map_err(|_| CliError::auth("OAuth code exchange failed; sign in again"))?;
    let expires_in = token
        .expires_in()
        .ok_or_else(|| CliError::auth("OAuth response has no token expiration"))?;
    let refresh_token = token
        .refresh_token()
        .ok_or_else(|| CliError::auth("OAuth response has no refresh token"))?
        .secret()
        .clone();
    let granted = token
        .scopes()
        .ok_or_else(|| CliError::auth("OAuth response has no order scopes"))?;
    for name in ["orders.read", "orders.status.write", "orders.note.write"] {
        if !granted
            .iter()
            .any(|scope| scope.as_str() == format!("{}/{name}", config.resource))
        {
            return Err(CliError::auth(
                "Login did not grant the required order scopes",
            ));
        }
    }
    http.get(api.join("me").unwrap())
        .bearer_auth(token.access_token().secret())
        .send()
        .await
        .map_err(|_| CliError::network("Could not verify login with the order API"))?
        .error_for_status()
        .map_err(|_| {
            CliError::auth("Order API rejected the login; check client and audience configuration")
        })?;
    let session = Session {
        resource: config.resource,
        client_id,
        token_endpoint: metadata.token_endpoint,
        revocation_endpoint: metadata.revocation_endpoint,
        access_token: token.access_token().secret().clone(),
        refresh_token,
        expires_at: now() + expires_in.as_secs(),
    };
    save(profile, &api, &session)?;
    Ok(json!({"authenticated": true, "profile": profile.name(), "expiresAt": session.expires_at}))
}

pub(crate) async fn access_token(profile: Profile, api: &Url) -> Result<String, CliError> {
    if let Ok(token) = std::env::var("ORDER_WIZARD_ACCESS_TOKEN") {
        if !token.trim().is_empty() {
            return Ok(token);
        }
    }
    let mut session = load(profile, api)?;
    if session.resource.trim_end_matches('/') != api.as_str().trim_end_matches('/') {
        return Err(CliError::auth("Stored login belongs to a different API"));
    }
    if session.expires_at > now() + 30 {
        return Ok(session.access_token);
    }
    secure_endpoint(&session.token_endpoint)?;
    let oauth = BasicClient::new(ClientId::new(session.client_id.clone()))
        .set_auth_type(AuthType::RequestBody)
        .set_token_uri(TokenUrl::new(session.token_endpoint.clone()).unwrap());
    let token = oauth
        .exchange_refresh_token(&RefreshToken::new(session.refresh_token.clone()))
        .request_async(&http()?)
        .await
        .map_err(|_| CliError::auth("Session expired; sign in again"))?;
    let expires_in = token
        .expires_in()
        .ok_or_else(|| CliError::auth("Refreshed token has no expiration"))?;
    session.access_token = token.access_token().secret().clone();
    session.expires_at = now() + expires_in.as_secs();
    if let Some(refresh) = token.refresh_token() {
        session.refresh_token = refresh.secret().clone();
    }
    save(profile, api, &session)?;
    Ok(session.access_token)
}

pub(crate) fn status(profile: Profile) -> Result<Value, CliError> {
    let session = load(profile, &api_url()?)?;
    Ok(
        json!({"credentialsSaved": true, "profile": profile.name(), "expiresAt": session.expires_at}),
    )
}

pub(crate) async fn logout(profile: Profile) -> Result<Value, CliError> {
    let api = api_url()?;
    let session = load(profile, &api)?;
    secure_endpoint(&session.revocation_endpoint)?;
    let result = http()?
        .post(&session.revocation_endpoint)
        .form(&[
            ("token", session.refresh_token.as_str()),
            ("client_id", session.client_id.as_str()),
        ])
        .send()
        .await;
    entry(profile, &api)?
        .delete_credential()
        .map_err(|_| CliError::config("Could not remove saved login"))?;
    if !result.is_ok_and(|response| response.status().is_success()) {
        return Err(CliError::network(
            "Saved login removed, but remote revocation failed",
        ));
    }
    Ok(json!({"authenticated": false, "profile": profile.name()}))
}

#[cfg(test)]
mod tests;
