mod api;
mod auth;
mod command;
mod error;
mod mcp;

pub use command::Cli;
pub use error::CliError;

use api::ApiClient;
use auth::Profile;
use command::{AuthCommand, Command, OrdersCommand};
use serde_json::Value;

/// Execute a command against the configured `OrderCue` API.
///
/// # Errors
/// Returns an error for missing credentials, invalid configuration, network failures,
/// or an API response that rejects the operation or violates the JSON contract.
pub async fn execute(cli: Cli) -> Result<Value, CliError> {
    match cli.command {
        Command::Auth { command } => {
            let profile = |mcp| if mcp { Profile::Mcp } else { Profile::Cli };
            match command {
                AuthCommand::Login { mcp, no_browser } => {
                    auth::login(profile(mcp), no_browser).await
                }
                AuthCommand::Status { mcp } => auth::status(profile(mcp)),
                AuthCommand::Logout { mcp } => auth::logout(profile(mcp)).await,
            }
        }
        Command::Mcp => mcp::serve().await,
        Command::Orders { command } => {
            let client = ApiClient::from_environment(Profile::Cli).await?;
            match command {
                OrdersCommand::Inbox {
                    as_of,
                    after,
                    limit,
                } => client.inbox(&as_of, limit, after.as_deref()).await,
                OrdersCommand::List {
                    status,
                    limit,
                    after,
                } => client.list_orders(status, limit, after.as_deref()).await,
                OrdersCommand::Search {
                    query,
                    after,
                    status,
                    limit,
                } => {
                    client
                        .search_orders(&query, status, limit, after.as_deref())
                        .await
                }
                OrdersCommand::Get { id } => client.get_order(&id).await,
                OrdersCommand::Status {
                    id,
                    status,
                    if_version,
                } => client.update_status(&id, status, &if_version).await,
                OrdersCommand::Note {
                    id,
                    note,
                    if_version,
                } => client.update_note(&id, &note, &if_version).await,
            }
        }
    }
}
