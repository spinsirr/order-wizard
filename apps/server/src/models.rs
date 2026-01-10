use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum OrderStatus {
    Uncommented,
    Commented,
    CommentRevealed,
    Reimbursed,
}

impl OrderStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            OrderStatus::Uncommented => "uncommented",
            OrderStatus::Commented => "commented",
            OrderStatus::CommentRevealed => "comment_revealed",
            OrderStatus::Reimbursed => "reimbursed",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Order {
    /// Unique order identifier
    pub id: String,
    /// Owner's user ID
    pub user_id: String,
    /// Amazon order number
    #[schema(example = "123-4567890-1234567")]
    pub order_number: String,
    /// Product name
    #[schema(example = "Wireless Bluetooth Headphones")]
    pub product_name: String,
    /// Order date as displayed on Amazon
    #[schema(example = "December 25, 2024")]
    pub order_date: String,
    /// Product image URL
    pub product_image: String,
    /// Order total price
    #[schema(example = "$29.99")]
    pub price: String,
    /// Current status of the order
    pub status: OrderStatus,
    /// Optional user note
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    /// ISO 8601 timestamp for sync conflict resolution
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    /// ISO 8601 timestamp when order was created
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    /// ISO 8601 timestamp for soft delete
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateOrderRequest {
    pub id: String,
    pub order_number: String,
    pub product_name: String,
    pub order_date: String,
    pub product_image: String,
    pub price: String,
    pub status: OrderStatus,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub deleted_at: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateOrderRequest {
    pub status: Option<OrderStatus>,
    pub note: Option<String>,
    pub updated_at: Option<String>,
    pub deleted_at: Option<String>,
}
