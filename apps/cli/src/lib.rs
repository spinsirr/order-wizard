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
                OrdersCommand::List { status, limit } => client.list_orders(status, limit).await,
                OrdersCommand::Search {
                    query,
                    status,
                    limit,
                } => client.search_orders(&query, status, limit).await,
                OrdersCommand::Get { id } => client.get_order(&id).await,
                OrdersCommand::Status { id, status } => client.update_status(&id, status).await,
                OrdersCommand::Note { id, note } => client.update_note(&id, &note).await,
            }
        }
    }
}
