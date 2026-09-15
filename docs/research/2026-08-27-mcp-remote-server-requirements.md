# 远程 MCP Server 实施要求（2026-08-27）

本文只记录对 OrderCue 的 Rust/Axum 远程 MCP 接入有直接约束的官方要求。来源限定为 MCP 官方规范、官方 SDK 文档与官方 SDK 源码。

## 结论

- 当前稳定协议版本是 **`2026-07-28`**；`draft` 页面只累积下一版尚未发布的变化，不应作为生产契约。[稳定规范](https://modelcontextprotocol.io/specification/2026-07-28) · [draft changelog](https://modelcontextprotocol.io/specification/draft/changelog)
- 使用官方 Rust SDK **`rmcp = 3.1.4`**。它是当前最新稳定 release，官方 SDK 清单已将 Rust 标为 Tier 1，且 `StreamableHttpService` 可直接作为 Tower service 挂到 Axum。[3.1.4 release](https://github.com/modelcontextprotocol/rust-sdk/releases/tag/rmcp-v3.1.4) · [官方 SDK 清单](https://modelcontextprotocol.io/specification/2026-07-28/sdk) · [Rust SDK Streamable HTTP](https://github.com/modelcontextprotocol/rust-sdk/tree/rmcp-v3.1.4#stateless-streamable-http)
- **必须显式选择 `ProtocolVersion::V_2026_07_28`**。`rmcp 3.1.4` 的 `ProtocolVersion::LATEST` 仍指向 `V_2025_11_25`，不能依赖默认值。[协议常量源码](https://github.com/modelcontextprotocol/rust-sdk/blob/rmcp-v3.1.4/crates/rmcp/src/model.rs#L356-L372)
- 首版只做工具面：`orders_list`、`orders_search`、`orders_get`、`orders_set_status`、`orders_set_note`。创建、删除、批量写入不注册为 MCP 工具；所有工具复用现有 `OrderApplication` 与 tenant-scoped repository。

## Streamable HTTP：现代协议不是旧 SSE/session 模型

`2026-07-28` 是逐请求、无协议 session 的模型：每个 JSON-RPC 消息都是一个新的 `POST /mcp`，服务端返回单个 `application/json` 对象或仅属于该请求的 `text/event-stream`。GET stream、DELETE session termination、`Mcp-Session-Id`、`Last-Event-ID` 恢复、`initialize` / `notifications/initialized` 都已移除；能力与协议版本改为随每个请求携带，服务端必须支持 `server/discover`。[Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http) · [2026-07-28 变更](https://modelcontextprotocol.io/specification/2026-07-28/changelog)

每个现代 POST 的必要行为：

1. 客户端 `Accept` 同时声明 `application/json` 与 `text/event-stream`；服务端可选择其中一种响应。[发送消息](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#sending-messages)
2. `MCP-Protocol-Version` 必须与 body `_meta.io.modelcontextprotocol/protocolVersion` 相同；不一致返回 HTTP 400 与 JSON-RPC `HeaderMismatch` (`-32020`)。[协议版本头](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#protocol-version-header)
3. 所有请求必须带 `Mcp-Method`；`tools/call` 还必须带 `Mcp-Name`。header 与 body 必须逐项校验。[标准请求头](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#standard-request-headers)
4. 只有确实需要让网关基于工具参数路由时才使用 `x-mcp-header` / `Mcp-Param-*`；首版订单工具不需要它，尤其不能把 token、PII 或备注内容复制到 header。[自定义参数头](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#custom-headers-from-tool-parameters)
5. 若返回 SSE，最终 JSON-RPC response 后应结束流；客户端断开流必须被视为取消。`Last-Event-ID` 不再支持。[接收消息与取消](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#receiving-messages)

### 推荐的 `rmcp` 服务端配置

保持精确版本：

```toml
rmcp = { version = "=3.1.4", features = ["server", "macros", "transport-streamable-http-server"] }
schemars = "1.2"
```

实现时应：

- `ServerHandler::supported_protocol_versions()` 只返回 `V_2026_07_28`；不要使用 `LATEST`。
- 用 `StreamableHttpService` 挂载单一 `/mcp`，并为每个请求创建轻量 handler；Mongo/repository 与 `OrderApplication` 通过可 clone 的共享 handle 注入，不能依赖 handler 内存跨请求存在。
- 使用 `NeverSessionManager`，并显式设置 `with_legacy_session_mode(false)` 与 `with_stateless_protocol_metadata_required(true)`。这让旧 initialize/session 路径不能悄悄进入现代端点。[SDK 传输源码](https://github.com/modelcontextprotocol/rust-sdk/blob/rmcp-v3.1.4/crates/rmcp/src/transport/streamable_http_server/tower.rs)
- 可设置 `with_json_response(true)`，让普通短工具调用优先返回 JSON；需要通知时 SDK 仍可退回 SSE。[SDK Streamable HTTP 示例](https://github.com/modelcontextprotocol/rust-sdk/tree/rmcp-v3.1.4#stateless-streamable-http)
- 加入 workspace `rust-version = "1.88"`；这是 rmcp 3.x 的 MSRV。[3.0 migration / MSRV](https://github.com/modelcontextprotocol/rust-sdk/discussions/969#discussioncomment-17089517)

### DNS rebinding 与 Origin

Streamable HTTP 服务端必须校验所有出现的 `Origin`；非法 Origin 返回 403。本地部署应只监听 localhost，所有部署都应认证。[传输安全要求](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#security--endpoint)

`rmcp 3.1.4` 默认 `allowed_hosts` 只有 `localhost`、`127.0.0.1`、`::1`，但默认空 `allowed_origins` 会关闭 Origin 校验。因此 Fly.io/公开域名必须显式调用：

- `with_allowed_hosts([...公开 API host...])`
- `with_allowed_origins([...真实浏览器 origin...])`

不要使用 `disable_allowed_hosts()` 或空 Origin allowlist 作为生产配置。[SDK 配置源码](https://github.com/modelcontextprotocol/rust-sdk/blob/rmcp-v3.1.4/crates/rmcp/src/transport/streamable_http_server/tower.rs#L628-L707)

## OAuth protected resource 要求

授权在 MCP 总体上是可选的，但 OrderCue 暴露用户订单，所以远程 `/mcp` 必须是 OAuth protected resource。启用授权后：[Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)

1. MCP server 必须发布 RFC 9728 Protected Resource Metadata，且 `authorization_servers` 至少有一个 issuer。为最大互操作性，同时提供根 well-known endpoint 和每次 401 的 `WWW-Authenticate: Bearer resource_metadata="..."`；规范要求服务端至少实现其中一种，客户端必须支持两种发现路径。[Protected Resource Metadata discovery](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery)
2. metadata 中的 `resource` 应与 canonical API resource URI 完全一致；OAuth authorization 与 token request 都必须带 RFC 8707 `resource`。服务端必须验证 token 的 audience 确实是该 resource。[resource 参数](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization#resource-parameter-implementation) · [token 校验](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization#token-handling)
3. 每个 HTTP 请求都使用 `Authorization: Bearer ...`，token 不得放在 query string。缺失、无效或过期 token 返回 401；token 有效但 scope 不够返回 403 `insufficient_scope`，并在 challenge 一次给出当前操作所需的完整 scope 集合。[Access Token Usage](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization#access-token-usage) · [scope challenge](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization#runtime-insufficient-scope-errors)
4. Authorization server 必须提供 RFC 8414 或 OIDC discovery；客户端必须校验 metadata `issuer` 与发现 URL 使用的 issuer 完全相同。[Authorization Server Metadata Discovery](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery#authorization-server-metadata-discovery)
5. MCP client 必须通过预注册、Client ID Metadata Document 或 Dynamic Client Registration 获得 client ID。2026-07-28 已将 DCR 标为 deprecated compatibility path，因此 Cognito 与目标 MCP Host 的实际注册方式、redirect URI、PKCE S256、resource/audience 和 refresh token 流程必须在上线前做真实 E2E；不能假设普通 Cognito app client 会自动兼容任意 MCP Host。[Client Registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration) · [deprecated DCR](https://modelcontextprotocol.io/specification/2026-07-28/changelog#deprecated)

现有 REST 与 MCP 应共享同一个 `RESOURCE_URI`、JWT 验证器、scope-to-capability 映射与 `Principal`。MCP auth middleware 只负责把已验证的 `Principal` 注入请求；工具 handler 不接受调用者传入 `user_id`，而是从认证上下文取得 tenant。

## 工具契约

工具服务端必须声明 `tools` capability，`tools/list` 顺序应确定且稳定。工具定义必须提供有效 JSON Schema；未声明 `$schema` 时默认是 JSON Schema 2020-12。[Tools capability 与定义](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)

建议契约：

| 工具 | 行为 annotations | 结果 |
|---|---|---|
| `orders_list` | `readOnlyHint=true`, `openWorldHint=false` | 有界订单数组 |
| `orders_search` | `readOnlyHint=true`, `openWorldHint=false` | 有界订单数组 |
| `orders_get` | `readOnlyHint=true`, `openWorldHint=false` | 单个订单 |
| `orders_set_status` | `readOnlyHint=false`, `destructiveHint=true`, `idempotentHint=true`, `openWorldHint=false` | 更新后的订单 |
| `orders_set_note` | `readOnlyHint=false`, `destructiveHint=true`, `idempotentHint=true`, `openWorldHint=false` | 更新后的订单 |

状态与备注是覆盖既有值，因此按规范的保守语义标记为 destructive；相同参数重复调用最终状态相同，所以标记 idempotent。Annotations 只是提示，不能代替 capability enforcement。[Tool annotations 安全说明](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#tool)

每个工具都应给出 `outputSchema`，返回符合 schema 的 `structuredContent`；为了旧客户端兼容，同时返回序列化 JSON 的 `TextContent`。一旦声明 output schema，服务端结果必须符合它。[Structured Content 与 Output Schema](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#structured-content)

错误分层：未知工具、JSON-RPC/参数结构错误使用 protocol error；订单不存在、非法状态、上游失败等模型可以理解和修正的业务错误用 `CallToolResult` 的 `isError: true`，且不得泄露内部堆栈或跨租户存在性。[Tool error handling](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#error-handling)

## 实施与验证顺序

1. 先固定现代协议边界：版本 allowlist、`NeverSessionManager`、strict metadata、Host/Origin allowlist。
2. 复用现有 auth middleware，并验证 Protected Resource Metadata、401/403 challenge、audience 与 scope。
3. 注册上述五个工具，所有 handler 只调用 `OrderApplication`；不出现 Mongo 查询或独立业务规则。
4. 单元测试 tool-to-application 映射与 annotations/output schema；HTTP 集成测试覆盖 `server/discover`、`tools/list`、`tools/call`、header/body mismatch、401/403、Host/Origin。
5. 使用与 rmcp 3.1.4 对应的官方 conformance suite 跑 `2026-07-28` server tests，再用至少一个真实目标 MCP Host 完成 OAuth E2E。[rmcp 3.0 conformance status](https://github.com/modelcontextprotocol/rust-sdk/discussions/969#discussioncomment-17089517)
