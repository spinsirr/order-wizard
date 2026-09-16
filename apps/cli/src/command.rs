use clap::{Parser, Subcommand, ValueEnum};
use serde::Serialize;

#[derive(Debug, Parser)]
#[command(name = "ordercue", version, about = "Agent-friendly OrderCue client")]
pub struct Cli {
    #[command(subcommand)]
    pub(crate) command: Command,
}

#[derive(Debug, Subcommand)]
pub(crate) enum Command {
    /// Sign in, inspect saved credentials, or sign out.
    Auth {
        #[command(subcommand)]
        command: AuthCommand,
    },
    /// Serve order tools to a local MCP client over stdio.
    Mcp,
    /// Read or update orders through the least-privilege agent API.
    Orders {
        #[command(subcommand)]
        command: OrdersCommand,
    },
}

#[derive(Debug, Subcommand)]
pub(crate) enum AuthCommand {
    Login {
        /// Sign in using the separate MCP client.
        #[arg(long)]
        mcp: bool,
        /// Print the login URL without launching a browser.
        #[arg(long)]
        no_browser: bool,
    },
    Status {
        #[arg(long)]
        mcp: bool,
    },
    Logout {
        #[arg(long)]
        mcp: bool,
    },
}

#[derive(Debug, Subcommand)]
pub(crate) enum OrdersCommand {
    /// Find pending work and return checks. Use the same local date for all pages.
    Inbox {
        /// Your local calendar date (YYYY-MM-DD).
        #[arg(long)]
        as_of: String,
        /// nextCursor from the previous page.
        #[arg(long)]
        after: Option<String>,
        #[arg(long, default_value_t = 50, value_parser = clap::value_parser!(u8).range(1..=100))]
        limit: u8,
    },
    /// List orders, optionally filtered by status.
    List {
        /// nextCursor from the previous page; keep filters unchanged.
        #[arg(long)]
        after: Option<String>,
        #[arg(long, value_enum)]
        status: Option<OrderStatus>,
        #[arg(long, default_value_t = 50, value_parser = clap::value_parser!(u8).range(1..=100))]
        limit: u8,
    },
    /// Search order ID, number, product name, and note.
    Search {
        /// nextCursor from the previous page; keep filters unchanged.
        #[arg(long)]
        after: Option<String>,
        query: String,
        #[arg(long, value_enum)]
        status: Option<OrderStatus>,
        #[arg(long, default_value_t = 50, value_parser = clap::value_parser!(u8).range(1..=100))]
        limit: u8,
    },
    /// Get one order by ID.
    Get { id: String },
    /// Update one order's status.
    Status {
        id: String,
        status: OrderStatus,
        /// Version from the last read; a concurrent edit returns CONFLICT.
        #[arg(long)]
        if_version: String,
    },
    /// Replace one order's note.
    Note {
        id: String,
        note: String,
        /// Version from the last read. Note text replaces the whole note.
        #[arg(long)]
        if_version: String,
    },
}

#[derive(Clone, Copy, Debug, Serialize, serde::Deserialize, schemars::JsonSchema, ValueEnum)]
#[serde(rename_all = "snake_case")]
pub(crate) enum OrderStatus {
    Uncommented,
    Commented,
    CommentRevealed,
    Reimbursed,
}

impl OrderStatus {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Uncommented => "uncommented",
            Self::Commented => "commented",
            Self::CommentRevealed => "comment_revealed",
            Self::Reimbursed => "reimbursed",
        }
    }
}
