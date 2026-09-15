use serde_json::Value;
use std::{
    io::{BufRead, BufReader, Read, Write},
    net::TcpListener,
    process::{Command, Stdio},
    thread,
};

fn exchange(input: &mut impl Write, output: &mut impl BufRead, message: &Value) -> Value {
    writeln!(input, "{message}").unwrap();
    input.flush().unwrap();
    let mut line = String::new();
    output.read_line(&mut line).unwrap();
    serde_json::from_str(&line).unwrap()
}

#[test]
fn stdio_mcp_negotiates_and_reads_orders_without_stdout_noise() {
    let (api_url, server) = serve_once(r#"[{"id":"order-1"}]"#);
    let mut child = Command::new(env!("CARGO_BIN_EXE_ordercue"))
        .arg("mcp")
        .env("ORDERCUE_API_URL", api_url)
        .env("ORDERCUE_ACCESS_TOKEN", "mcp-test-token")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut input = child.stdin.take().unwrap();
    let mut output = BufReader::new(child.stdout.take().unwrap());
    let initialized = exchange(
        &mut input,
        &mut output,
        &serde_json::json!({
            "jsonrpc":"2.0", "id":1, "method":"initialize", "params":{
                "protocolVersion":"2025-11-25", "capabilities":{},
                "clientInfo":{"name":"integration-test", "version":"1"}
            }
        }),
    );
    assert_eq!(initialized["result"]["protocolVersion"], "2025-11-25");
    writeln!(
        input,
        "{}",
        serde_json::json!({"jsonrpc":"2.0","method":"notifications/initialized"})
    )
    .unwrap();
    let listed = exchange(
        &mut input,
        &mut output,
        &serde_json::json!({"jsonrpc":"2.0","id":2,"method":"tools/list"}),
    );
    assert_eq!(listed["result"]["tools"].as_array().unwrap().len(), 5);
    let called = exchange(
        &mut input,
        &mut output,
        &serde_json::json!({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{
            "name":"orders_list", "arguments":{"limit":1}
        }}),
    );
    assert_ne!(called["result"]["isError"], true);
    assert!(called["result"]["content"].to_string().contains("order-1"));
    drop(input);
    let mut trailing = String::new();
    output.read_to_string(&mut trailing).unwrap();
    assert!(trailing.is_empty());
    assert!(child.wait().unwrap().success());
    let request = server.join().unwrap();
    assert!(request.starts_with("GET /agent/orders?limit=1 HTTP/1.1\r\n"));
    assert!(request
        .to_ascii_lowercase()
        .contains("authorization: bearer mcp-test-token\r\n"));
}

fn serve_once(response_body: &'static str) -> (String, thread::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let handle = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut request = Vec::new();
        let mut buffer = [0; 4096];
        loop {
            let read = stream.read(&mut buffer).unwrap();
            request.extend_from_slice(&buffer[..read]);
            if read == 0 {
                break;
            }
            let Some(header_end) = request.windows(4).position(|window| window == b"\r\n\r\n")
            else {
                continue;
            };
            let headers = String::from_utf8_lossy(&request[..header_end]);
            let content_length = headers
                .lines()
                .find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    name.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse::<usize>().ok())
                        .flatten()
                })
                .unwrap_or(0);
            if request.len() >= header_end + 4 + content_length {
                break;
            }
        }

        let response = format!(
            "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
            response_body.len(),
            response_body
        );
        stream.write_all(response.as_bytes()).unwrap();
        String::from_utf8(request).unwrap()
    });
    (format!("http://{address}"), handle)
}

#[test]
fn list_outputs_json_and_calls_only_the_agent_endpoint() {
    let response = r#"[{"id":"order-1","orderNumber":"111-1111111-1111111"}]"#;
    let (api_url, server) = serve_once(response);

    let output = Command::new(env!("CARGO_BIN_EXE_ordercue"))
        .args(["orders", "list"])
        .env("ORDERCUE_API_URL", api_url)
        .env("ORDERCUE_ACCESS_TOKEN", "test-token")
        .output()
        .unwrap();

    assert!(output.status.success());
    assert_eq!(
        serde_json::from_slice::<Value>(&output.stdout).unwrap(),
        serde_json::from_str::<Value>(response).unwrap()
    );
    assert!(output.stderr.is_empty());

    let request = server.join().unwrap();
    assert!(request.starts_with("GET /agent/orders?limit=50 HTTP/1.1\r\n"));
    assert!(request
        .to_ascii_lowercase()
        .contains("authorization: bearer test-token\r\n"));
}

#[test]
fn get_outputs_one_order_from_the_agent_endpoint() {
    let response = r#"{"id":"order-1","status":"uncommented"}"#;
    let (api_url, server) = serve_once(response);

    let output = Command::new(env!("CARGO_BIN_EXE_ordercue"))
        .args(["orders", "get", "order-1"])
        .env("ORDERCUE_API_URL", api_url)
        .env("ORDERCUE_ACCESS_TOKEN", "test-token")
        .output()
        .unwrap();

    assert!(output.status.success());
    assert_eq!(
        serde_json::from_slice::<Value>(&output.stdout).unwrap(),
        serde_json::from_str::<Value>(response).unwrap()
    );
    let request = server.join().unwrap();
    assert!(request.starts_with("GET /agent/orders/order-1 HTTP/1.1\r\n"));
}

#[test]
fn search_encodes_query_and_filters_on_the_agent_endpoint() {
    let response = r#"[{"id":"order-1"}]"#;
    let (api_url, server) = serve_once(response);

    let output = Command::new(env!("CARGO_BIN_EXE_ordercue"))
        .args([
            "orders",
            "search",
            "wireless headphones",
            "--status",
            "commented",
            "--limit",
            "10",
        ])
        .env("ORDERCUE_API_URL", api_url)
        .env("ORDERCUE_ACCESS_TOKEN", "test-token")
        .output()
        .unwrap();

    assert!(output.status.success());
    let request = server.join().unwrap();
    assert!(request.starts_with(
        "GET /agent/orders?q=wireless+headphones&limit=10&status=commented HTTP/1.1\r\n"
    ));
}

#[test]
fn status_updates_only_the_status_agent_endpoint() {
    let response = r#"{"id":"order-1","status":"reimbursed"}"#;
    let (api_url, server) = serve_once(response);

    let output = Command::new(env!("CARGO_BIN_EXE_ordercue"))
        .args(["orders", "status", "order-1", "reimbursed"])
        .env("ORDERCUE_API_URL", api_url)
        .env("ORDERCUE_ACCESS_TOKEN", "test-token")
        .output()
        .unwrap();

    assert!(output.status.success());
    let request = server.join().unwrap();
    assert!(request.starts_with("PATCH /agent/orders/order-1/status HTTP/1.1\r\n"));
    assert!(request.ends_with("\r\n\r\n{\"status\":\"reimbursed\"}"));
}

#[test]
fn note_updates_only_the_note_agent_endpoint() {
    let response = r#"{"id":"order-1","note":"Follow up tomorrow"}"#;
    let (api_url, server) = serve_once(response);

    let output = Command::new(env!("CARGO_BIN_EXE_ordercue"))
        .args(["orders", "note", "order-1", "Follow up tomorrow"])
        .env("ORDERCUE_API_URL", api_url)
        .env("ORDERCUE_ACCESS_TOKEN", "test-token")
        .output()
        .unwrap();

    assert!(output.status.success());
    let request = server.join().unwrap();
    assert!(request.starts_with("PATCH /agent/orders/order-1/note HTTP/1.1\r\n"));
    assert!(request.ends_with("\r\n\r\n{\"note\":\"Follow up tomorrow\"}"));
}

#[test]
fn destructive_order_commands_are_not_exposed() {
    for command in ["create", "delete", "batch"] {
        let output = Command::new(env!("CARGO_BIN_EXE_ordercue"))
            .args(["orders", command])
            .output()
            .unwrap();

        assert_eq!(output.status.code(), Some(2));
        assert!(output.stdout.is_empty());
        let error: Value = serde_json::from_slice(&output.stderr).unwrap();
        assert_eq!(error["error"]["code"], "USAGE_ERROR");
    }
}

#[test]
fn missing_token_is_a_machine_readable_auth_error() {
    let output = Command::new(env!("CARGO_BIN_EXE_ordercue"))
        .args(["orders", "list"])
        .env("ORDERCUE_API_URL", "https://api.ordercue.example")
        .env_remove("ORDERCUE_ACCESS_TOKEN")
        .output()
        .unwrap();

    assert_eq!(output.status.code(), Some(3));
    assert!(output.stdout.is_empty());
    let error: Value = serde_json::from_slice(&output.stderr).unwrap();
    assert_eq!(error["error"]["code"], "AUTH_REQUIRED");
}
