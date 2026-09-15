mod api;
mod command;
mod error;

pub use command::Cli;
pub use error::CliError;

use api::ApiClient;
use command::{Command, OrdersCommand};
use serde_json::Value;

/// Execute a command against the configured `OrderCue` API.
///
/// # Errors
/// Returns an error for missing credentials, invalid configuration, network failures,
/// or an API response that rejects the operation or violates the JSON contract.
pub async fn execute(cli: Cli) -> Result<Value, CliError> {
    let client = ApiClient::from_environment()?;
    match cli.command {
        Command::Orders { command } => match command {
            OrdersCommand::List { status, limit } => client.list_orders(status, limit).await,
            OrdersCommand::Search {
                query,
                status,
                limit,
            } => client.search_orders(&query, status, limit).await,
            OrdersCommand::Get { id } => client.get_order(&id).await,
            OrdersCommand::Status { id, status } => client.update_status(&id, status).await,
            OrdersCommand::Note { id, note } => client.update_note(&id, &note).await,
        },
    }
}
