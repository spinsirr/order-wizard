use crate::{
    auth::{self, Profile},
    command::OrderStatus,
    CliError,
};
use reqwest::{Client, Url};
use serde_json::Value;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct StatusUpdate<'a> {
    expected_version: &'a str,
    status: OrderStatus,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NoteUpdate<'a> {
    expected_version: &'a str,
    note: &'a str,
}

pub(crate) struct ApiClient {
    http: Client,
    base_url: Url,
    access_token: String,
}

impl ApiClient {
    pub(crate) async fn from_environment(profile: Profile) -> Result<Self, CliError> {
        let base_url = auth::api_url()?;
        let access_token = auth::access_token(profile, &base_url).await?;

        Ok(Self {
            http: auth::http()?,
            base_url,
            access_token,
        })
    }

    pub(crate) async fn list_orders(
        &self,
        status: Option<OrderStatus>,
        limit: u8,
        after: Option<&str>,
    ) -> Result<Value, CliError> {
        self.search(None, status, limit, after).await
    }

    pub(crate) async fn search_orders(
        &self,
        query: &str,
        status: Option<OrderStatus>,
        limit: u8,
        after: Option<&str>,
    ) -> Result<Value, CliError> {
        self.search(Some(query), status, limit, after).await
    }

    async fn search(
        &self,
        query: Option<&str>,
        status: Option<OrderStatus>,
        limit: u8,
        after: Option<&str>,
    ) -> Result<Value, CliError> {
        let mut url = self.endpoint("agent/orders")?;
        {
            let mut query_pairs = url.query_pairs_mut();
            if let Some(query) = query {
                query_pairs.append_pair("q", query);
            }
            query_pairs.append_pair("limit", &limit.to_string());
            if let Some(after) = after {
                query_pairs.append_pair("after", after);
            }
            if let Some(status) = status {
                query_pairs.append_pair("status", status.as_str());
            }
        }
        self.send(self.http.get(url)).await
    }

    pub(crate) async fn inbox(
        &self,
        as_of: &str,
        limit: u8,
        after: Option<&str>,
    ) -> Result<Value, CliError> {
        let mut url = self.endpoint("agent/inbox")?;
        {
            let mut pairs = url.query_pairs_mut();
            pairs
                .append_pair("as_of", as_of)
                .append_pair("limit", &limit.to_string());
            if let Some(after) = after {
                pairs.append_pair("after", after);
            }
        }
        self.send(self.http.get(url)).await
    }

    pub(crate) async fn get_order(&self, id: &str) -> Result<Value, CliError> {
        let url = self.order_endpoint(id)?;
        self.send(self.http.get(url)).await
    }

    pub(crate) async fn update_status(
        &self,
        id: &str,
        status: OrderStatus,
        expected_version: &str,
    ) -> Result<Value, CliError> {
        let url = self.order_operation_endpoint(id, "status")?;
        self.send(self.http.patch(url).json(&StatusUpdate {
            expected_version,
            status,
        }))
        .await
    }

    pub(crate) async fn update_note(
        &self,
        id: &str,
        note: &str,
        expected_version: &str,
    ) -> Result<Value, CliError> {
        let url = self.order_operation_endpoint(id, "note")?;
        self.send(self.http.patch(url).json(&NoteUpdate {
            expected_version,
            note,
        }))
        .await
    }

    fn endpoint(&self, path: &str) -> Result<Url, CliError> {
        self.base_url
            .join(path)
            .map_err(|error| CliError::config(format!("API endpoint is invalid: {error}")))
    }

    fn order_endpoint(&self, id: &str) -> Result<Url, CliError> {
        let mut url = self.endpoint("agent/orders")?;
        url.path_segments_mut()
            .map_err(|()| CliError::config("API URL cannot be a base URL"))?
            .push(id);
        Ok(url)
    }

    fn order_operation_endpoint(&self, id: &str, operation: &str) -> Result<Url, CliError> {
        let mut url = self.order_endpoint(id)?;
        url.path_segments_mut()
            .map_err(|()| CliError::config("API URL cannot be a base URL"))?
            .push(operation);
        Ok(url)
    }

    async fn send(&self, request: reqwest::RequestBuilder) -> Result<Value, CliError> {
        let response = request
            .bearer_auth(&self.access_token)
            .send()
            .await
            .map_err(|error| CliError::network(error.to_string()))?;
        let status = response.status();
        let bytes = response
            .bytes()
            .await
            .map_err(|error| CliError::network(error.to_string()))?;
        let value = serde_json::from_slice::<Value>(&bytes)
            .map_err(|error| CliError::protocol(format!("API returned invalid JSON: {error}")))?;

        if status.is_success() {
            Ok(value)
        } else {
            Err(CliError::api(status.as_u16(), value))
        }
    }
}
