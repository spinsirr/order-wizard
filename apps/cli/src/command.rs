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
    /// Read or update orders through the least-privilege agent API.
    Orders {
        #[command(subcommand)]
        command: OrdersCommand,
    },
}

#[derive(Debug, Subcommand)]
pub(crate) enum OrdersCommand {
    /// List orders, optionally filtered by status.
    List {
        #[arg(long, value_enum)]
        status: Option<OrderStatus>,
        #[arg(long, default_value_t = 50, value_parser = clap::value_parser!(u8).range(1..=100))]
        limit: u8,
    },
    /// Search order ID, number, product name, and note.
    Search {
        query: String,
        #[arg(long, value_enum)]
        status: Option<OrderStatus>,
        #[arg(long, default_value_t = 50, value_parser = clap::value_parser!(u8).range(1..=100))]
        limit: u8,
    },
    /// Get one order by ID.
    Get { id: String },
    /// Update one order's status.
    Status { id: String, status: OrderStatus },
    /// Replace one order's note.
    Note { id: String, note: String },
}

#[derive(Clone, Copy, Debug, Serialize, ValueEnum)]
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
