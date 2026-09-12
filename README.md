# cf-static-guard

Cloudflare Worker 守卫：把**任意静态站构建产物**挂在 Worker Assets 上，访问前必须完成 OAuth 登录。  
不限于文档站——VitePress / Hugo / 纯 HTML / React·Vue SPA 均可。

## 特性

- **先鉴权再出静态资源**：favicon、CSS、JS、图片与 HTML 同等保护（`run_worker_first`）
- **多 Provider 可插拔**：当前内置 GitHub OAuth；接口已预留 Google / Gitee 等
- **普通 / 严格模式**：严格模式规则**按 Provider 分区**配置
- **JWT 会话**：HttpOnly Cookie，HMAC-SHA256，无状态
- **KV 规则**：运行时改策略，无需重新部署
- **心跳** `GET /health`：免登录，供 Uptime 监控
- **登录 UI**：Vue 3（`packages/login-ui`），文案可配置
- **管理后台** `/admin`：Vue 3（`packages/admin-ui`），改规则 / 文案 / 备案
- **可配置文案**：标题、版权、ICP、徽章/图标开关，存 KV，登录页实时读取

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 创建 GitHub OAuth App

GitHub → Settings → Developer settings → OAuth Apps → New OAuth App

| 字段 | 值 |
|------|----|
| Homepage URL | `https://<your-worker>.workers.dev` |
| Authorization callback URL | `https://<your-worker>.workers.dev/auth/callback/github` |

本地调试时 callback 可用 `http://127.0.0.1:8787/auth/callback/github`。

### 3. 本地密钥

```bash
cp packages/guard-worker/.dev.vars.example packages/guard-worker/.dev.vars
# 编辑 .dev.vars：GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET / SESSION_SECRET / ADMIN_PASSWORD
```

### 4. 管理后台

访问 `http://127.0.0.1:8787/admin`，密码为 Secret / `.dev.vars` 中的 `ADMIN_PASSWORD`。

未设置 `ADMIN_PASSWORD` 时后台禁用（避免弱口令裸奔）。

生产：

```bash
cd packages/guard-worker
npx wrangler secret put ADMIN_PASSWORD
```

后台可改：

- 全局 / GitHub 模式（normal | strict）
- allowlist / blocklist / 账号年龄 / 组织 / 团队 / 邮箱域名
- 登录页文案、版权、ICP 备案、页脚与图标开关

配置写入 KV：`auth:config` 与 `ui:config`。**未绑定 KV 时保存会失败。**

### 5. 严格规则如何判定

1. 用户走某个 Provider（如 GitHub）登录。
2. 取该 Provider 的 `mode`，没有则用全局 `mode`。
3. **normal**：OAuth 成功即可；仍会检查 **blocklist**。
4. **strict**：只校验「已配置」的规则字段；字段为空/未填 → **跳过**；填了且失败 → **拒绝**。

| 字段 | 含义 |
|------|------|
| `allowlist` | 白名单命中可放行 |
| `blocklist` | 黑名单，normal/strict 都拒绝 |
| `minAccountAgeDays` | 账号至少注册 N 天 |
| `requiredOrgs` | 必须在这些 GitHub 组织内 |
| `requiredTeams` | 必须在 `org/team` 团队内 |
| `emailDomainAllowlist` | 邮箱域名限制 |

### 6. 构建并本地运行

```bash
npm run dev
# 打开 http://127.0.0.1:8787
# 管理后台 http://127.0.0.1:8787/admin
```

- 未登录访问 `/` → 跳转 `/auth/login`
- `/health` 与 `/ui-config` 无需登录
- 会话：`/auth/me`，登出：`/auth/logout`

### 7. 部署

```bash
# 生成 SESSION_SECRET（示例）
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

cd packages/guard-worker
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET

# 可选：KV 规则
npx wrangler kv namespace create RULES
# 把返回的 id 写入 wrangler.toml 的 [[kv_namespaces]]，去掉注释

cd ../..
npm run deploy
```

生产环境的 OAuth App callback 改为：`https://<your-worker>.workers.dev/auth/callback/github`

## 配置

### wrangler vars（非机密）

| 变量 | 默认 | 说明 |
|------|------|------|
| `GUARD_MODE` | `normal` | 全局默认模式 `normal` \| `strict` |
| `PUBLIC_PATHS` | `/health` | 额外免鉴权路径。默认仅心跳；favicon 等资源也需登录 |
| `SPA_FALLBACK` | `false` | `true` 时 404 且无扩展名 → `index.html`（前端路由） |
| `SESSION_TTL_SECONDS` | `604800` | 会话 7 天 |
| `OAUTH_REDIRECT_BASE` | 请求 origin | 自定义域 / 反代时覆盖 OAuth 回调基址 |

> 默认已按「资产全部必须认证」处理：仅 `/health` 与 `/auth/*` 免鉴权。

### Secrets

| 名称 | 说明 |
|------|------|
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | Client Secret |
| `SESSION_SECRET` | JWT HMAC 密钥，≥32 字节随机 |

### KV `RULES` → key `auth:config`

按 **Provider 分区**，互不干扰：

```json
{
  "mode": "strict",
  "providers": {
    "github": {
      "enabled": true,
      "mode": "strict",
      "rules": {
        "allowlist": ["your-github-login", "github:your-github-login"],
        "blocklist": [],
        "minAccountAgeDays": 30,
        "requiredOrgs": ["your-org"],
        "requiredTeams": [{ "org": "your-org", "team": "docs-readers" }],
        "emailDomainAllowlist": []
      }
    }
  }
}
```

规则字段语义：

- 未配置的字段：**跳过**
- 已配置且校验失败：**拒绝**
- `allowlist` 命中可短路放行；`blocklist` 在 normal/strict 下都拒绝
- 严格模式失败会展示 `/auth/logout` 可读的拒绝页（不泄露完整策略细节以外的内部信息）

写入示例：

```bash
cd packages/guard-worker
npx wrangler kv key put auth:config --binding=RULES --path ../../scripts/rules.sample.json
```

## 路由

| 路径 | 鉴权 | 说明 |
|------|------|------|
| `GET /health` | 否 | 心跳 JSON |
| `GET /ui-config` | 否 | 登录页文案 JSON |
| `GET /auth/login` | 否 | 登录页（Vue SPA） |
| `GET /admin` | 密码会话 | 管理后台（Vue SPA） |
| `POST /admin/login` | 否 | 管理员登录 |
| `GET /admin/api/state` | 是* | 读规则与文案 |
| `PUT /admin/api/auth-config` | 是* | 保存规则 |
| `PUT /admin/api/ui-config` | 是* | 保存文案 |
| `GET /auth/providers` | 否 | 已启用 Provider 列表 JSON |
| `GET /auth/start/:provider` | 否 | 跳转 OAuth |
| `GET /auth/callback/:provider` | 否 | OAuth 回调 |
| `GET /auth/logout` | 否 | 清 Cookie |
| `GET /auth/me` | 是* | 当前会话（无 Cookie 返回 401） |
| 其它全部路径 | 是 | 静态资产 |

\* `/auth/me` 本身是 API，无有效会话时返回 401 JSON，不重定向。

## 挂自己的静态站

```bash
# 把你的 dist 同步进 worker assets
rm -rf packages/guard-worker/assets/site
mkdir -p packages/guard-worker/assets/site
cp -r path/to/your/dist/* packages/guard-worker/assets/site/

# SPA（history 路由）时在 wrangler.toml 设置 SPA_FALLBACK = "true"

npm run deploy -w @cf-static-guard/guard-worker
```

仓库内 `examples/minimal-site` 仅作联调示例；示例 dist **不提交**（已 gitignore）。

## Vue 登录页（可选）

```bash
npm run build:login   # 单文件 HTML → 嵌入 Worker
npm run sync-assets
npm run build:worker  # 或 npm run build / npm run dev / npm run deploy
```

未构建 login-ui 时，Worker 使用内置登录 HTML，功能等价。

## 新增 OAuth Provider

1. 在 `packages/guard-worker/src/auth/providers/` 新增 `xxx.ts`，实现 `AuthProvider`
2. 在 `providers/index.ts` 注册
3. 在 `config.ts` / `types.ts` 按需扩展该 provider 的 secrets 检查
4. KV `auth:config` 打开 `providers.xxx.enabled`
5. 登录页会自动出现新按钮（`/auth/providers`）

严格模式规则字段请只声明该平台能校验的项（参考 GitHub 的 org/team）。

## 项目结构

```text
packages/guard-worker   # CF Worker 守卫核心
packages/login-ui       # Vue 3 登录 SPA（单文件嵌入）
packages/admin-ui       # Vue 3 管理后台（单文件嵌入）
examples/minimal-site   # 联调用静态示例
scripts/                # 资产同步、规则样例
```

## 安全说明

- Session Cookie：`HttpOnly` + `SameSite=Lax` +（HTTPS）`Secure`
- OAuth `state` 绑定防 CSRF；跳转 `next` 仅允许站内相对路径
- Access Token 只留在 Worker 请求内，**不下发浏览器**
- 默认带 `X-Robots-Tag: noindex`
- 请使用足够长的 `SESSION_SECRET`，并在生产关闭不必要的 `PUBLIC_PATHS`

## License

MIT
