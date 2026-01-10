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

/// Internal database entity - stored with snake_case field names in MongoDB
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderEntity {
    pub id: String,
    pub user_id: String,
    pub order_number: String,
    pub product_name: String,
    pub order_date: String,
    pub product_image: String,
    pub price: String,
    pub status: OrderStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
}

/// API response type - serialized with camelCase for frontend
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Order {
    pub id: String,
    pub user_id: String,
    #[schema(example = "123-4567890-1234567")]
    pub order_number: String,
    #[schema(example = "Wireless Bluetooth Headphones")]
    pub product_name: String,
    #[schema(example = "December 25, 2024")]
    pub order_date: String,
    pub product_image: String,
    #[schema(example = "$29.99")]
    pub price: String,
    pub status: OrderStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
}

impl From<OrderEntity> for Order {
    fn from(e: OrderEntity) -> Self {
        Self {
            id: e.id,
            user_id: e.user_id,
            order_number: e.order_number,
            product_name: e.product_name,
            order_date: e.order_date,
            product_image: e.product_image,
            price: e.price,
            status: e.status,
            note: e.note,
            updated_at: e.updated_at,
            created_at: e.created_at,
            deleted_at: e.deleted_at,
        }
    }
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

impl CreateOrderRequest {
    pub fn into_entity(self, user_id: String) -> OrderEntity {
        OrderEntity {
            id: self.id,
            user_id,
            order_number: self.order_number,
            product_name: self.product_name,
            order_date: self.order_date,
            product_image: self.product_image,
            price: self.price,
            status: self.status,
            note: self.note,
            updated_at: self.updated_at,
            created_at: self.created_at,
            deleted_at: self.deleted_at,
        }
    }
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateOrderRequest {
    pub status: Option<OrderStatus>,
    pub note: Option<String>,
    pub updated_at: Option<String>,
    pub deleted_at: Option<String>,
}
