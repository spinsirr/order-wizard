use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use validator::Validate;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[derive(ToSchema)]
pub struct Order {
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
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[derive(ToSchema)]
pub struct OrderDocument {
    #[serde(rename = "_id")]
    pub id: String,
    pub user_id: String,
    pub order_number: String,
    pub product_name: String,
    pub order_date: String,
    pub product_image: String,
    pub price: String,
    pub status: OrderStatus,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub note: Option<String>,
}

impl From<OrderDocument> for Order {
    fn from(value: OrderDocument) -> Self {
        Order {
            id: value.id,
            user_id: value.user_id,
            order_number: value.order_number,
            product_name: value.product_name,
            order_date: value.order_date,
            product_image: value.product_image,
            price: value.price,
            status: value.status,
            note: value.note,
        }
    }
}

impl From<Order> for OrderDocument {
    fn from(value: Order) -> Self {
        OrderDocument {
            id: value.id,
            user_id: value.user_id,
            order_number: value.order_number,
            product_name: value.product_name,
            order_date: value.order_date,
            product_image: value.product_image,
            price: value.price,
            status: value.status,
            note: value.note,
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[derive(ToSchema)]
pub enum OrderStatus {
    Uncommented,
    Commented,
    CommentRevealed,
    Reimbursed,
}

#[derive(Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
#[derive(ToSchema)]
pub struct CreateOrder {
    #[validate(length(max = 100))]
    pub id: Option<String>,

    #[validate(length(min = 1, max = 100))]
    pub order_number: String,

    #[validate(length(min = 1, max = 500))]
    pub product_name: String,

    #[validate(length(min = 1, max = 50))]
    pub order_date: String,

    #[validate(url)]
    pub product_image: String,

    #[validate(length(min = 1, max = 50))]
    pub price: String,

    pub status: OrderStatus,

    #[serde(skip_serializing_if = "Option::is_none")]
    #[validate(length(max = 2000))]
    pub note: Option<String>,
}

#[derive(Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
#[derive(ToSchema)]
pub struct UpdateOrder {
    #[validate(length(min = 1, max = 100))]
    pub order_number: Option<String>,

    #[validate(length(min = 1, max = 500))]
    pub product_name: Option<String>,

    #[validate(length(min = 1, max = 50))]
    pub order_date: Option<String>,

    #[validate(url)]
    pub product_image: Option<String>,

    #[validate(length(min = 1, max = 50))]
    pub price: Option<String>,

    pub status: Option<OrderStatus>,

    #[validate(length(max = 2000))]
    pub note: Option<String>,
}
