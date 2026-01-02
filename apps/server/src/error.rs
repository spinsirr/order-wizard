use axum::{http::StatusCode, response::IntoResponse, BoxError, Json};
use serde::Serialize;
use thiserror::Error;
use utoipa::ToSchema;
use tracing::error;
use tokio::time::error::Elapsed;

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("order not found")]
    NotFound,
    #[error("database error: {0}")]
    Database(String),
    #[error("authentication required")]
    Unauthorized,
    #[error("oauth error: {0}")]
    Auth(String),
    #[error("http error: {0}")]
    Http(String),
    #[error("validation error: {0}")]
    Validation(String),
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ErrorResponse {
    error: String,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        let status = match self {
            ApiError::NotFound => StatusCode::NOT_FOUND,
            ApiError::Database(_) | ApiError::Http(_) => StatusCode::INTERNAL_SERVER_ERROR,
            ApiError::Unauthorized => StatusCode::UNAUTHORIZED,
            ApiError::Auth(_) => StatusCode::BAD_REQUEST,
            ApiError::Validation(_) => StatusCode::BAD_REQUEST,
        };

        let message = self.to_string();
        let body = Json(ErrorResponse { error: message });

        (status, body).into_response()
    }
}

pub async fn handle_global_error(error: BoxError) -> impl IntoResponse {
    if error.is::<Elapsed>() {
        error!("request timed out: {error}");
        (
            StatusCode::REQUEST_TIMEOUT,
            Json(ErrorResponse {
                error: "request timed out".into(),
            }),
        )
    } else {
        error!("unhandled internal error: {error}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "internal server error".into(),
            }),
        )
    }
}
