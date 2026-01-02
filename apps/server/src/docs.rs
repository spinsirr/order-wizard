use crate::{
    error::ErrorResponse,
    models::{CreateOrder, Order, OrderStatus, UpdateOrder},
    oauth::{OAuthUser, SessionSnapshot},
};
use utoipa::OpenApi;

#[derive(OpenApi)]
#[openapi(
    paths(
        crate::routes::orders::create_order,
        crate::routes::orders::list_orders,
        crate::routes::orders::get_order,
        crate::routes::orders::update_order,
        crate::routes::orders::delete_order,
        crate::routes::auth::current_session
    ),
    components(schemas(
        Order,
        OrderStatus,
        CreateOrder,
        UpdateOrder,
        ErrorResponse,
        SessionSnapshot,
        OAuthUser
    )),
    tags(
        (name = "Orders", description = "Order management endpoints"),
        (name = "Authentication", description = "Authentication session information")
    ),
    info(
        title = "Order Wizard API",
        version = "0.1.0",
        description = "API for managing Amazon orders with OAuth authentication.\n\n## Authentication Flow\n\n1. Navigate to `/auth/login` to initiate OAuth login (redirects to AWS Cognito)\n2. After successful login, you'll be redirected back with a session cookie\n3. Use the session cookie for authenticated API requests\n4. Call `POST /auth/logout` to end your session"
    )
)]
pub struct ApiDoc;
