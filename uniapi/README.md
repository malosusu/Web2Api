# UniAPI Worker

Cloudflare Worker 聚合网关，统一提供 OpenAI 兼容、Claude Messages 兼容、Gemini `/v1beta` 兼容、Responses API、图像/视频生成、Gemini Web 和 Kimi 代理能力。

## 能力

- GLM: 文本、视觉、图像、视频生成，OpenAI Chat、Claude Messages、Gemini API 适配和首页测试 UI。
- Gemini Web: Gemini 网页端协议，支持 OpenAI Chat、Responses API、Gemini `/v1beta`。
- Kimi: kimi-ai.chat 的 OpenAI 兼容代理，支持伪流式、KV 会话、工具调用。

## 路由规则

统一入口会按请求体里的 `model` 自动分发：

- `glm-*`、`cogview-*` 等默认走 GLM。
- `gemini-3.5-flash`、`gemini-3.1-pro` 等走 Gemini Web。
- `kimi-k2-instruct-0905`、`kimi-k2-instruct` 走 Kimi。

显式前缀也可用：

- `/gemini-web/v1/chat/completions`
- `/gemini-web/v1/responses`
- `/gemini-web/v1beta/models/{model}:generateContent`
- `/kimi/v1/models`

## 部署步骤

### 1. 安装依赖并检查代码

```bash
npm install
npm run typecheck
```

### 2. 登录 Cloudflare

```bash
npm run login
npm run whoami
```

如果部署时报 `Authentication error [code: 10000]`，重新登录：

```bash
npm run logout
npm run login
npm run whoami
```

`whoami` 必须能正常显示账号信息。

### 3. 创建 Kimi KV namespace

```bash
npm run kv:create
```

命令会输出类似：

```toml
[[kv_namespaces]]
binding = "KIMI_KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

把 [wrangler.toml](./wrangler.toml) 里的 `KIMI_KV` id 替换成真实 id：

```toml
[[kv_namespaces]]
binding = "KIMI_KV"
id = "你的真实 KV id"
```

### 4. 设置可选 secrets

没有配置 `API_KEYS` 时接口不鉴权，建议公开部署时设置：

```bash
printf 'sk-your-key' | npx wrangler secret put API_KEYS
```

Gemini Web 如需登录态或 Pro 路由，可设置：

```bash
printf '完整 cookie 字符串' | npx wrangler secret put GEMINI_COOKIE
```

其他可选变量：

- `SIGN_SECRET`: GLM 签名密钥，默认已在 `wrangler.toml` 配置。
- `SAPISID`: Gemini SAPISID，未设置时会从 `GEMINI_COOKIE` 提取。
- `GEMINI_BL`: Gemini Web 构建号，默认内置。
- `GEMINI_ORIGIN`: Gemini Web 反代源，Cloudflare 出口被 Google 限制时使用。
- `UPSTREAM_SOCKET`: Gemini Web 是否优先使用 `cloudflare:sockets`，默认 true。

### 5. 预检和部署

```bash
npm run deploy:dry
npm run deploy
```

部署成功后测试：

```bash
curl https://<你的 worker 域名>/ping
curl https://<你的 worker 域名>/v1/models
curl https://<你的 worker 域名>/v1beta/models
```