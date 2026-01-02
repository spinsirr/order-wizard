use axum::{
    extract::{Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Redirect},
    routing::{get, post},
    Json, Router,
};
use axum_extra::extract::cookie::CookieJar;
use openidconnect::{AuthorizationCode, OAuth2TokenResponse};
use serde::Deserialize;

use crate::{
    error::ApiError,
    oauth::{OAuthState, SessionSnapshot},
    state::AppState,
};

#[derive(Debug, Deserialize)]
struct AuthCallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
    #[serde(rename = "error_description")]
    error_description: Option<String>,
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/auth/login", get(start_login))
        .route("/auth/callback", get(handle_auth_callback))
        .route("/auth/me", get(current_session))
        .route("/auth/logout", post(logout))
}

#[utoipa::path(
    get,
    path = "/auth/login",
    tag = "Authentication",
    responses(
        (status = 307, description = "Redirects to OAuth provider login page")
    )
)]
pub async fn start_login(State(state): State<AppState>) -> Result<Redirect, ApiError> {
    let (url, csrf_token, verifier, nonce) = state.oauth.build_authorization_url();
    state
        .oauth
        .store_pending(csrf_token.secret().to_string(), verifier, nonce)
        .await;

    Ok(Redirect::temporary(url.as_str()))
}

async fn handle_auth_callback(
    State(state): State<AppState>,
    Query(query): Query<AuthCallbackQuery>,
) -> Result<impl IntoResponse, ApiError> {
    if let Some(error) = &query.error {
        let description = query
            .error_description
            .clone()
            .unwrap_or_else(|| "OAuth authorization failed".to_string());
        return auth_redirect(
            &state.oauth,
            Err(ApiError::Auth(format!("{error}: {description}"))),
        );
    }

    let code = query
        .code
        .as_ref()
        .ok_or_else(|| ApiError::Auth("Missing authorization code".into()))?;
    let state_param = query
        .state
        .as_ref()
        .ok_or_else(|| ApiError::Auth("Missing state parameter".into()))?;

    let (verifier, _nonce) = state
        .oauth
        .take_pending(state_param)
        .await
        .ok_or_else(|| ApiError::Auth("Unknown or expired state parameter".into()))?;

    let token_response = state
        .oauth
        .exchange_code(AuthorizationCode::new(code.to_string()), verifier)
        .await
        .map_err(ApiError::Auth)?;

    let expires_in = token_response.expires_in();

    let profile = state
        .oauth
        .fetch_userinfo(token_response.access_token())
        .await
        .map_err(ApiError::Http)?;

    let identity = OAuthState::extract_identity(&profile)
        .ok_or_else(|| ApiError::Auth("Unable to determine user identity from profile".into()))?;

    let session_id = state
        .oauth
        .create_session(identity, expires_in, profile)
        .await;

    auth_redirect(&state.oauth, Ok(session_id))
}

#[utoipa::path(
    get,
    path = "/auth/me",
    tag = "Authentication",
    responses(
        (status = 200, description = "Current session information", body = SessionSnapshot),
        (status = 401, description = "Unauthorized - not logged in", body = ErrorResponse)
    )
)]
pub async fn current_session(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<Json<SessionSnapshot>, ApiError> {
    let cookie = jar
        .get(state.oauth.cookie_name())
        .ok_or(ApiError::Unauthorized)?;
    let session_id = cookie.value();

    let session = state
        .oauth
        .session_snapshot(session_id)
        .await
        .ok_or(ApiError::Unauthorized)?;

    Ok(Json(session))
}

#[utoipa::path(
    post,
    path = "/auth/logout",
    tag = "Authentication",
    responses(
        (status = 204, description = "Successfully logged out")
    )
)]
pub async fn logout(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<impl IntoResponse, ApiError> {
    if let Some(cookie) = jar.get(state.oauth.cookie_name()) {
        let session_id = cookie.value().to_string();
        state.oauth.remove_session(&session_id).await;

        let mut response = StatusCode::NO_CONTENT.into_response();
        let logout_cookie = state.oauth.build_logout_cookie();
        response.headers_mut().insert(
            header::SET_COOKIE,
            HeaderValue::from_str(&logout_cookie.to_string()).unwrap(),
        );
        return Ok(response);
    }

    Ok(StatusCode::NO_CONTENT.into_response())
}

fn auth_redirect(
    oauth: &OAuthState,
    result: Result<String, ApiError>,
) -> Result<impl IntoResponse, ApiError> {
    match result {
        Ok(session_id) => {
            let mut headers = HeaderMap::new();
            let cookie = oauth.build_cookie(&session_id);
            headers.insert(
                header::SET_COOKIE,
                HeaderValue::from_str(&cookie.to_string()).unwrap(),
            );
            let redirect = Redirect::temporary(oauth.success_redirect());
            Ok((headers, redirect).into_response())
        }
        Err(error) => {
            if let Some(target) = oauth.failure_redirect() {
                let mut response = Redirect::temporary(target).into_response();
                let cookie = oauth.build_logout_cookie();
                response.headers_mut().insert(
                    header::SET_COOKIE,
                    HeaderValue::from_str(&cookie.to_string()).unwrap(),
                );
                Ok(response)
            } else {
                Err(error)
            }
        }
    }
}
