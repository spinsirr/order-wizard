use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Serialize)]
pub struct CliError {
    error: ErrorBody,
    #[serde(skip)]
    exit_code: u8,
}

#[derive(Debug, Serialize)]
struct ErrorBody {
    code: &'static str,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    details: Option<Box<Value>>,
}

impl CliError {
    pub fn usage(message: impl Into<String>) -> Self {
        Self::new("USAGE_ERROR", message, 2)
    }

    pub(crate) fn config(message: impl Into<String>) -> Self {
        Self::new("CONFIG_ERROR", message, 2)
    }

    pub(crate) fn auth(message: impl Into<String>) -> Self {
        Self::new("AUTH_REQUIRED", message, 3)
    }

    pub(crate) fn network(message: impl Into<String>) -> Self {
        Self::new("NETWORK_ERROR", message, 4)
    }

    pub(crate) fn protocol(message: impl Into<String>) -> Self {
        Self::new("PROTOCOL_ERROR", message, 5)
    }

    pub(crate) fn api(status: u16, details: Value) -> Self {
        Self {
            error: ErrorBody {
                code: "API_ERROR",
                message: format!("OrderCue API returned HTTP {status}"),
                status: Some(status),
                details: Some(Box::new(details)),
            },
            exit_code: 6,
        }
    }

    fn new(code: &'static str, message: impl Into<String>, exit_code: u8) -> Self {
        Self {
            error: ErrorBody {
                code,
                message: message.into(),
                status: None,
                details: None,
            },
            exit_code,
        }
    }

    #[must_use]
    /// Serialize the machine-readable error envelope.
    ///
    /// # Panics
    /// Panics if serialization fails; the envelope contains only JSON-compatible fields.
    pub fn as_json(&self) -> String {
        serde_json::to_string(self).expect("CLI errors must always be serializable")
    }

    #[must_use]
    pub fn exit_code(&self) -> i32 {
        i32::from(self.exit_code)
    }
}
