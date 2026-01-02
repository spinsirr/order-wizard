use crate::{models::OrderDocument, oauth::OAuthState};
use axum_extra::extract::cookie::CookieJar;
use mongodb::Collection;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub orders: Collection<OrderDocument>,
    pub oauth: Arc<OAuthState>,
}

impl AppState {
    pub fn new(orders: Collection<OrderDocument>, oauth: Arc<OAuthState>) -> Self {
        Self { orders, oauth }
    }

    pub async fn session_user_id(&self, jar: &CookieJar) -> Option<String> {
        self.oauth.session_user_id(jar).await
    }
}
