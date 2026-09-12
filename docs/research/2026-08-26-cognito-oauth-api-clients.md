# Amazon Cognito OAuth：REST、MCP 与 CLI 的认证授权边界

日期：2026-08-26

2026-09-12 更新：CLI 和 Claude Code MCP 已选择并实现受控 HTTPS callback；见文末当前实施状态。历史分析中的待办不代表当前代码仍缺少对应校验。

## 结论

- 保留一个 Cognito user pool，但至少拆成 **Extension public app client** 与 **CLI public app client**。同一 user pool 支持多个 app client，且每个 client 可以独立配置 grant、callback、scope、token 时效与撤销策略。[Application-specific settings with app clients](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-client-apps.html)
- Order API 只接受 **access token**。ID token 只用于客户端确认登录身份和读取 `email` 等 profile claims，不作为 REST/MCP bearer token。Access token 承载权限 scope；ID token 的职责是声明登录身份。[User pool JWTs](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-with-identity-providers.html) · [Verifying JWTs](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html)
- 启用 Cognito **resource binding**。Extension、CLI 和 MCP OAuth authorization request 都发送 `resource=<本 API 的 canonical HTTPS URI>`，服务端要求 access-token `aud` 精确等于该 URI。没有 `resource` 时，Cognito access token 通常没有 `aud`；它绝不能继续被拿来与 app client ID 比较。[Resource binding](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-define-resource-servers.html#cognito-user-pools-define-resource-servers-resource-binding)
- 授权 principal 必须由验证后的 `client_id + scope` 派生。路由只能消费 principal，不能把任意已认证 token 先升级为 Extension principal，再按 URL 降权。
- CLI 使用无 secret 的 public client、Authorization Code + PKCE S256。Cognito 的 HTTP loopback callback 被官方标为仅测试用途，且 URI 必须预注册；生产 CLI callback 是实施门槛，详见下文。

## Cognito token 的实际 claims

| claim / header | ID token | access token | 本项目校验 |
|---|---|---|---|
| `alg` | `RS256` | `RS256` | 固定只接受 `RS256`，不能采用 token header 自报的算法 |
| `kid` | ID-token signing key | access-token signing key，通常与同一 session 的 ID token 不同 | 从该 user pool JWKS 按 `kid` 取 key；遇到新 `kid` 刷新缓存 |
| `iss` | user-pool issuer | user-pool issuer | 必须与配置值精确一致 |
| `token_use` | `id` | `access` | API 必须要求 `access` |
| app client | `aud=<app client ID>` | `client_id=<app client ID>` | access token 校验 `client_id` allowlist；不要用 client ID 校验 access-token `aud` |
| resource audience | 不适用 | 只有 authorization request 使用 `resource` 时才有 `aud=<API URI>` | 本项目启用 resource binding 后必须精确校验 |
| `scope` | 不作为 API capability 来源 | 空格分隔的实际签发 scopes | 做精确集合匹配，再生成 capabilities |
| `sub` | 用户 subject | 用户 subject | 用作 `UserId`；AWS 明确建议不要把 Cognito `sub` 严格解析成 RFC UUID |
| `exp` | 过期时间 | 过期时间 | 必须存在且未过期 |

Cognito 对 ID token 与 access token 使用不同 signing key，AWS 要求分别验证。Cognito 也会轮换 key；正确做法是按 `kid` 缓存 JWKS，并在收到未知 `kid` 时刷新。[Access token](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-access-token.html) · [JWT verification](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html)

`iss` 是 Cognito user-pool issuer，不是 managed-login/Hosted UI 的自定义域名。原 issuer 形如 `https://cognito-idp.<region>.amazonaws.com/<pool-id>`；AWS 现在也提供 `https://issuer-cognito-idp.<region>.amazonaws.com/<pool-id>` 形式的 updated issuer。服务端应配置并验证实际选用的唯一 issuer；切换 issuer 需要协调部署。[OIDC issuer endpoints](https://docs.aws.amazon.com/cognito/latest/developerguide/federation-endpoints.html)

Resource binding 是 Cognito 对 RFC 8707 resource indicator 的实现：authorization request 的 `resource` 必须是 URL；Cognito 把它写进 access token 的 `aud`，refresh 后的新 access token 会保留该 `aud`。一次认证只能请求一个 resource，且该能力只适用于经 user-pool OAuth authorization server 发起的用户 authorization-code/implicit flow，不适用于 SDK authentication 或 client-credentials M2M flow。[Resource binding](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-define-resource-servers.html#cognito-user-pools-define-resource-servers-resource-binding) · [Token endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/token-endpoint.html)

## 多 app client 与 scopes

Extension 和 CLI 都是可被用户检查的分发软件，不能安全保存 client secret，因此都应使用 Cognito public app client。AWS 对 public client 的定义就是没有可信服务端资源、没有 client secret；authorization-code public client 应只开启 code grant 并使用 PKCE。[App client types and grants](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-client-apps.html)

建议建立 URL 形式的 resource-server identifier，例如占位符：

```text
https://api.order-wizard.example
```

URL identifier 既能用于 resource binding，也会成为 custom scope 的前缀。最小 scope 集与现有 application capabilities 一一对应：

| Cognito custom scope | application capability | Extension | CLI / agent |
|---|---|---:|---:|
| `<resource>/orders.read` | `ReadOrders` | 是 | 是 |
| `<resource>/orders.sync` | `SyncOrders` | 是 | 否 |
| `<resource>/orders.status.write` | `UpdateStatus` | 是 | 是 |
| `<resource>/orders.note.write` | `UpdateNote` | 是 | 是 |

Custom scope 的完整格式是 `<resource-server-identifier>/<scope-name>`；scope 必须关联到 app client，Cognito 将实际签发结果写进 access-token `scope` claim。[Scopes and resource servers](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-define-resource-servers.html)

每次 authorization request 都显式请求最小 scope，不依赖 app client 的默认集合。Cognito 文档对“请求未关联 scope”究竟被忽略还是令认证失败的描述并不完全一致，但不影响资源服务器规则：**只按最终 access token 中实际存在的 `scope` 授权**，绝不按客户端曾请求的 scope 授权。[Authorization endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html) · [Scopes and resource servers](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-define-resource-servers.html)

建议的 principal 派生规则是：

```text
verified access token
  -> exact issuer + exp + token_use=access + API audience
  -> client profile selected by allowlisted client_id
  -> issued capabilities parsed from scope
  -> Principal(user_id=sub, capabilities=client_max ∩ issued_scopes)
```

`client_id` allowlist 是“哪些 app client 能调用 API”的边界；scope 是“这枚 token 此刻拥有哪些权限”的边界。两者取交集可避免 app-client 配置错误直接变成权限提升。Extension 与 CLI 在同一 user pool 中会共享用户 subject，因此 `sub` 仍可作为统一的 tenant `UserId`；app client 不是 tenant identity。[Access-token `sub` and `client_id`](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-access-token.html)

## 现有 Rust verifier 的明确改动要求

当前 `apps/server/src/auth/mod.rs` 有以下不匹配：

1. `Validation::new(header.alg)` 采用了未验证 header 声明的算法。Cognito user-pool JWT 使用 `RS256`，verifier 应固定 `RS256`，再按 `kid` 选择 JWKS key。[JWT structure](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html)
2. `set_audience(OIDC_CLIENT_ID)` 是 ID-token 规则，不是 access-token 规则。access token 的 app client 在 `client_id`；启用 resource binding 后，其 `aud` 是 API URL。[Verifying claims](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html) · [Access token](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-access-token.html)
3. `Claims` 没有 `client_id` 和 `scope`，而 `token_use`、`iss`、`exp` 被建模成 optional 且没有显式做 access-token 检查。Order API 应拒绝缺少任何必需 claim、`token_use != access`、未知 `client_id`、错误 resource `aud` 或过期的 token。
4. 当前 middleware 对所有通过验证的 token 执行 `Principal::extension(...)`；`AuthAgentPrincipal` 到 `/agent/*` 才重新构造 agent principal。增加 CLI client allowlist 后，CLI token 可直接访问 `/orders/*` 并被赋予 Extension 权限。principal 必须一次性从 `client_id + scope` 构造，不能由 route 决定权限。
5. 签名/issuer/client/audience/token-use 无效应返回 401 `invalid_token`；JWT 合法但缺少操作所需 scope 应由 application capability check 返回 403 `insufficient_scope`。
6. access token 默认不包含 `email`。`openid email` 让 ID token 和 `userInfo` 返回 email，不代表 email 会出现在 access-token payload；因此 `/me` 不能依赖 API bearer access token 的 `email` claim。Extension 已经在本地验证 ID token 并读取 `sub/email`，这个职责划分应保留。[OIDC scopes](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-client-apps.html)

现有按 `kid` 缓存 JWKS、未知/过期缓存时重新获取 key 的方向正确。ID 与 access token 的 `kid` 不同不是异常，JWKS cache 必须能同时容纳两类 key。

## Extension 的明确改动要求

当前 Extension 正确地把 `access_token` 交给 API，并用验证后的 ID-token claims 建立本地用户资料；需要补齐的是：

- authorization request 目前只有 `openid email`。增加 Extension 对应的四个 custom scopes，并增加 `resource=<API URI>`，否则 API 无法获得 Order scopes 和 resource audience。
- 当前使用 `oauth.expectNoState`。AWS 把 `state` 标为推荐的 CSRF 防护；应生成一次性 state、随 PKCE verifier 临时保存，并在 callback 精确比较。[Authorization endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html)
- refresh 代码已经能在响应存在新 `refresh_token` 时替换旧值，兼容 rotation；替换必须与 token storage 原子完成，并避免两个并发 refresh 同时消费同一枚 rotated token。
- sign-out 目前只清本地 storage 并打开 `/logout`。正确的单 session 顺序是：用 refresh token `POST /oauth2/revoke`（public client 同时提交 `client_id`）→ 无论 revoke 是否已执行都清本地 token → 浏览器访问 `/logout` 清 managed-login cookie。[Revocation endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/revocation-endpoint.html) · [Logout endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/logout-endpoint.html)

`/logout` 只处理 managed-login browser session；它不替代 refresh-token revoke，也不会退出外部 OIDC/social IdP。SAML 只有配置 SLO 后才会联动。[Logout endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/logout-endpoint.html)

## Native CLI：Authorization Code + PKCE

CLI app client 配置为 public client、无 secret、只开启 authorization-code grant 和 CLI 所需 scopes。一次登录流程为：

1. 生成一次性 `state` 与 PKCE `code_verifier`，用 SHA-256 生成 `code_challenge`。
2. 在系统浏览器打开 `/oauth2/authorize`，带 `response_type=code`、CLI `client_id`、精确 `redirect_uri`、显式 scopes、`resource=<API URI>`、`state`、`code_challenge_method=S256` 和 challenge。
3. callback 校验 state；authorization code 有效期为五分钟。
4. 向 `/oauth2/token` 提交同一个 `redirect_uri`、code、CLI client ID 和 `code_verifier`，不提交 client secret。
5. ID token 只有请求 `openid` 才返回。CLI 调 Order API 只需要 access token；如果 CLI 需要显示 email/profile，再请求 `openid email` 并仅在本地消费 ID token。

Cognito 只支持 PKCE `S256`，token endpoint 要求 code exchange 的 `redirect_uri` 与 authorize 时完全相同。[PKCE](https://docs.aws.amazon.com/cognito/latest/developerguide/using-pkce-in-authorization-code.html) · [Authorization endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html) · [Token endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/token-endpoint.html)

### Loopback callback 门槛

AWS API reference 允许 callback 使用 `http://localhost`、`http://127.0.0.1`、`http://[::1]` 和自定义 TCP port，但同时明确把这些 HTTP callback 标为 **testing purposes only**。Callback 还必须是预注册的绝对 URI、不能带 fragment；Cognito 没有承诺对 RFC 8252 随机临时端口做 wildcard 匹配。[UserPoolClientType callback rules](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_UserPoolClientType.html)

因此：

- 不要实现“随机空闲端口 + 假定 Cognito 接受”的流程。
- 若做 loopback 验证，只使用预注册固定端口，例如 `http://127.0.0.1:<fixed-port>/callback`，并测试 authorize、token exchange、重试、端口占用和 macOS/Windows/Linux。
- 固定 loopback 即便技术验证通过，AWS 仍没有给出生产用途承诺。正式发布前必须选定：获得 AWS 对生产用法的确认、改用已注册 custom scheme（Cognito 明确支持 `myapp://...`），或采用受控 HTTPS callback 方案。
- Cognito app-client OAuth grant 列表只有 `code`、`implicit`、`client_credentials`，不能把 device authorization grant 当作现成 fallback。[UserPoolClientType OAuth flows](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_UserPoolClientType.html)

## Refresh、revoke 与真实 logout 语义

- Access/ID token 可按 app client 配置为 5 分钟至 1 天，默认 1 小时；refresh token 默认 30 天，可配置 60 分钟至 10 年。[Access token](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-access-token.html) · [Refresh tokens](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-refresh-token.html)
- AWS 建议启用 refresh-token rotation。每次成功 refresh 返回新的 refresh token；新 token 只继承原 token 的剩余寿命，可给旧 token 最多 60 秒 retry grace。OAuth `/oauth2/token` refresh grant 支持 rotation。[Refresh tokens](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-refresh-token.html)
- `/oauth2/revoke` 接收 refresh token。Public client 必须在 body 中带 `client_id`；撤销同一 refresh-token lineage 的 refresh、ID 和 access tokens。已撤销或无效 token 仍返回 200，所以 logout 可以安全重试。[Revocation endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/revocation-endpoint.html)
- `GlobalSignOut` 撤销用户的所有 token，但要求调用 access token 含 `aws.cognito.signin.user.admin`；`AdminUserGlobalSignOut` 由服务端 IAM credentials 授权。二者都不清 managed-login cookie。[GlobalSignOut](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_GlobalSignOut.html) · [AdminUserGlobalSignOut](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AdminUserGlobalSignOut.html)

最重要的限制是：自建 API 的离线 JWT verifier 无法自动得知 token 已在 Cognito 撤销。AWS 明确说明，被撤销 JWT 对只检查签名和过期时间的 JWT library 仍然结构有效；GlobalSignOut 文档也说明其他请求可能持续有效到 token 过期。[Token revocation](https://docs.aws.amazon.com/cognito/latest/developerguide/token-revocation.html) · [GlobalSignOut](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_GlobalSignOut.html)

本项目若不增加在线状态/denylist，应把 access-token lifetime 配得较短，并把 revoke 的保证定义为“立即阻止后续 refresh；已签发 access token 最迟在 `exp` 失效”。如果产品要求立即让 REST/MCP access token 失效，单靠当前 JWKS verifier 无法满足。

## 验收测试

- 合法 ID token 即使 `aud` 等于 Extension client ID，也必须被 API 拒绝。
- 合法 access token 的 `client_id` 未在 allowlist、`aud` 不是 API resource、缺少 `token_use=access` 或已过期，均返回 401。
- 合法 CLI access token 能 read/status/note，但即使直接调用 `/orders/*` 也不能 sync/create/delete/batch；缺 scope 返回 403。
- Extension token 只有在实际 `scope` 含 `orders.sync` 时才具有同步权限。
- Extension 与 CLI token 对同一用户产生相同 `UserId=sub`，但不同 capabilities。
- refresh 后 access-token `aud` 保持 API resource，rotation 后旧 refresh token 在 grace 结束后不可再用。
- Extension sign-out 会 revoke refresh token、清本地 storage、清 managed-login cookie。
- CLI 固定 loopback callback 对三平台完成真实 Cognito 互操作验证；不能只用 mock OAuth server 验收。

## 研究时的实施门槛（2026-08-26）

1. **生产 CLI callback**：AWS 将 HTTP loopback 标成仅测试；需要明确选择并验证生产 callback 策略。
2. **Canonical resource URI**：必须确定 REST API 与 `/mcp` 是共享一个 audience，还是分别使用不同 resource URI；Cognito 一次 authorization 只能绑定一个 resource。
3. **撤销 SLA**：必须确认“access token 最长存活到 `exp`”是否可接受；若要求立即撤销，需要增加服务端状态机制。
4. **Cognito 配置**：尚需实际创建/确认 Extension 与 CLI app client、custom resource server/scopes、callback/logout URLs、token 时效、rotation 和 revocation 配置。

## 本轮实现决策

- REST、未来的 `/mcp` 与 CLI 共用一个 canonical protected resource：部署根地址 `RESOURCE_URI`（不带尾部 `/`）。它们共享同一用户数据与 capability 模型，endpoint 差异由 scopes 和 application policy 控制，不再为 `/mcp` 建第二个 audience。
- 服务端现已固定 RS256、要求 access token、校验 `client_id` allowlist 与 resource `aud`，并把最终 scopes 与 Extension/CLI 各自最大权限取交集。两个 app client ID 若相同会在启动时失败。
- Extension authorization request 已加入 resource binding、完整 Extension scopes 和一次性 state；sign-out 会先尝试 revoke refresh token，再清本地会话与 managed-login cookie。
- CLI 的 list/search/get/status/note 命令、配套 Skill、`auth login/status/logout` 和 Claude Code stdio MCP 已实现。Cognito 注册的 callback 为 `https://order-wizard-api.fly.dev/oauth/cli/callback`；API 只把 code/error 转回本机监听器，监听器校验 Host 和一次性 state，CLI 用原 HTTPS redirect URI 与 PKCE verifier 直接兑换 token。随机端口只用于本机接收，并非 Cognito callback。
- 若不增加服务端 denylist，项目接受“已签发 access token 最迟到 `exp` 才失效”的 Cognito/JWT 语义。生产 app client 应配置短 access-token lifetime；若产品改为要求即时撤销，再引入有状态 revocation 检查。

## 当前实施状态（2026-09-12）

- CLI 与 MCP 使用独立公共客户端，各自仅允许三项 agent scopes，无 client secret。两者使用相同的已注册 HTTPS callback，均已在 Cognito 保存。
- 客户端 access/ID token 时效为 15 分钟、refresh 为五天；开启 revoke 与 prevent-user-existence-errors，仅保留 refresh SDK flow。多个本机进程共享一份登录，暂不开启 refresh rotation。
- CLI 登录只请求订单 scopes，不请求 ID token。凭据由 OS credential store 保存，按 API 地址和 CLI/MCP profile 隔离；登录后调用 `/me` 验证 audience/client 配置，后续请求自动刷新。
- Claude Code 使用 `order-wizard mcp` stdio 接口和独立 MCP 登录，无需替 Claude Code 注册它自己的 HTTP loopback callback。HTTP MCP 仍保留给预注册客户端。
- GitHub Secrets 保存两类公共 client ID，发布流程把它们写入 Fly runtime secrets。生产路径需要在新版本部署后完成实际 Cognito 登录验证；单元测试不能替代这一步。
