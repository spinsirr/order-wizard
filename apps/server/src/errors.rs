use axum::{
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use utoipa::ToSchema;

use crate::application::ApplicationError;

/// API error response
#[derive(Debug, Serialize, ToSchema)]
pub struct ApiError {
    pub code: &'static str,
    pub message: String,
}

/// Application errors - fail fast with clear messages
#[derive(Debug)]
pub enum AppError {
    /// Authenticated caller lacks the required capability
    Forbidden,
    /// An explicit client version is older than the current order
    Conflict,
    /// Resource not found
    NotFound(&'static str),
    /// Invalid request data
    BadRequest(String),
    /// Database operation failed
    Database(String),
}

impl AppError {
    pub fn not_found(resource: &'static str) -> Self {
        AppError::NotFound(resource)
    }

    pub fn bad_request(message: impl Into<String>) -> Self {
        AppError::BadRequest(message.into())
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        if matches!(self, AppError::Forbidden) {
            let mut response = (
                StatusCode::FORBIDDEN,
                Json(ApiError {
                    code: "INSUFFICIENT_SCOPE",
                    message: "Insufficient permissions".to_string(),
                }),
            )
                .into_response();
            response.headers_mut().insert(
                header::WWW_AUTHENTICATE,
                HeaderValue::from_static("Bearer error=\"insufficient_scope\""),
            );
            return response;
        }

        let (status, code, message) = match self {
            AppError::Forbidden => unreachable!("forbidden errors return above"),
            AppError::Conflict => (
                StatusCode::CONFLICT,
                "CONFLICT",
                "Order changed; fetch the latest version before editing".to_string(),
            ),
            AppError::NotFound(resource) => (
                StatusCode::NOT_FOUND,
                "NOT_FOUND",
                format!("{resource} not found"),
            ),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, "BAD_REQUEST", msg),
            AppError::Database(msg) => {
                tracing::error!("Database error: {}", msg);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "DATABASE_ERROR",
                    "Database operation failed".to_string(),
                )
            }
        };

        (status, Json(ApiError { code, message })).into_response()
    }
}

/// Result type for handlers
pub type AppResult<T> = Result<T, AppError>;

impl From<ApplicationError> for AppError {
    fn from(error: ApplicationError) -> Self {
        match error {
            ApplicationError::Forbidden => AppError::Forbidden,
            ApplicationError::Conflict => AppError::Conflict,
            ApplicationError::InvalidInput(message) => AppError::bad_request(message),
            ApplicationError::NotFound => AppError::not_found("Order"),
            ApplicationError::Repository(message) => AppError::Database(message),
        }
    }
}
