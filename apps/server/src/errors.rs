use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use utoipa::ToSchema;

/// API error response
#[derive(Debug, Serialize, ToSchema)]
pub struct ApiError {
    pub code: &'static str,
    pub message: String,
}

/// Application errors - fail fast with clear messages
#[derive(Debug)]
pub enum AppError {
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

    pub fn database(err: mongodb::error::Error) -> Self {
        AppError::Database(err.to_string())
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message) = match self {
            AppError::NotFound(resource) => (
                StatusCode::NOT_FOUND,
                "NOT_FOUND",
                format!("{} not found", resource),
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
