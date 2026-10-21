# 第四、第五课 Scenario 验收映射

日期：2026-10-21

本记录把 `add-jwt-rag-streaming-assistant` 的七个 delta spec 映射到自动化测试、Compose 验收和浏览器证据。用户明确选择本地 OpenAI-compatible mock 作为作业演示 provider，不提交第三方凭据。

## account-authentication

- JWT 签发、Cookie 兼容、Bearer 认证、撤销：`tests/jwt-rag.test.ts`
- Bearer 优先、无效 Bearer 不回退 Cookie、HS512 拒绝：`tests/jwt-rag-security.test.ts`
- 缺失、篡改、撤销 token 返回 401：`tests/jwt-rag.test.ts`、`tests/jwt-rag-security.test.ts`
- DevTools Bearer 请求：本地 Safari Network 已验证 `/api/me` 请求包含 `Authorization: Bearer`；截图属于临时凭据证据并保持在 Git 忽略范围外

## assistant-configuration-and-skills

- 教师修改 prompt、学生 403：`tests/jwt-rag.test.ts`
- prompt、guided-solving 与编号证据同时进入 provider 请求：`tests/jwt-rag.test.ts`
- 客户端伪造历史不进入非流式 provider 请求：`tests/jwt-rag-security.test.ts`

## class-scoped-knowledge-retrieval

- 自动、分隔符、Markdown 标题分块和 offset：`tests/jwt-rag.test.ts`
- keyword/vector/hybrid 与 RRF：`tests/retrieval.test.ts`、`tests/search-api.test.ts`
- A/B 班隔离和伪造 class/source 字段无效：`tests/search-api.test.ts`、`tests/jwt-rag-security.test.ts`
- Compose backfill 可重复执行：`docs/lesson-4-5-verification.md`

## grounded-knowledge-question-answering

- 无命中固定回答且不调用模型：`tests/jwt-rag.test.ts`
- `[1]` 引用顺序和 source 对象：`tests/jwt-rag.test.ts`、`tests/jwt-rag-security.test.ts`
- prompt、skill、evidence 共同组成请求：`tests/jwt-rag.test.ts`
- provider 失败返回通用 503，不返回回答、引用或 provider 信息：`tests/jwt-rag-security.test.ts`

## material-browser-experience

- `sessionStorage` 保存 access token、受保护 fetch/XHR 添加 Bearer、401 清理：`tests/jwt-rag-security.test.ts` 和浏览器页面源码断言
- 问答引用、无命中、教师配置、SSE parser：`tests/jwt-rag-security.test.ts`
- 材料浏览、下载、上传、Markdown 安全、主题和命令面板回归：现有 `tests/material-*.test.ts`、`tests/browser-pages.test.ts`

## service-operations

- JWT/chat/chunk/history 配置边界：`tests/config.test.ts`
- 001-004 迁移和已有数据兼容：`tests/migrations.test.ts`
- Compose 启动、种子、backfill、搜索、问答和 SSE：`docs/lesson-4-5-verification.md`
- 本地 mock 与真实 provider 的边界：`README.md`、`docs/lesson-4-5-verification.md`

## streaming-assistant-conversations

- conversation 创建、所有者/班级 404 和有序 SSE 事件：`tests/jwt-rag-security.test.ts`
- 服务端持久化历史，不采用客户端 system/history：`tests/jwt-rag-security.test.ts`
- no-hit 不调用模型：`tests/jwt-rag.test.ts`
- provider 错误不伪造成功：`tests/jwt-rag-security.test.ts`

## 敏感信息审计

- `.env` 和 `evidence/` 被 Git 忽略。
- API 响应不包含 JWT secret、provider key、原始 jti、向量、SQL 或存储路径。
- `access_token_sessions` 只保存 HMAC 后的 jti。
- Network 截图中的临时 Bearer 和 Cookie 不进入 Git；公开截图前必须打码并退出登录使凭据失效。
- `repository-url.txt` 只包含公开仓库地址。
