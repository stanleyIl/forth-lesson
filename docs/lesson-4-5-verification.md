# 第四、第五课验收记录

记录日期：2026-09-30

本次变更 `add-jwt-rag-streaming-assistant` 完成了限定班级知识库检索、来源追溯、JWT Bearer 登录、提示词/引导式解题配置、会话持久化和 SSE 流式回答。

## 本地验证

```bash
npm test
npm run build
npx openspec validate add-jwt-rag-streaming-assistant --strict
```

Docker Compose 验收使用本地 OpenAI-compatible 假服务，避免把真实 provider key 写入仓库：

```bash
node scripts/mock-openai-server.mjs
export SESSION_SECRET=local-compose-session-secret-please-change-2026
export JWT_SECRET=local-jwt-signing-secret-please-change-2026
export EMBEDDING_ENDPOINT=http://host.docker.internal:18081/v1/embeddings
export CHAT_ENDPOINT=http://host.docker.internal:18081/v1/chat/completions
export SEED_TEACHER_PASSWORD=teacher-password-local-2026
export SEED_STUDENT_PASSWORD=student-password-local-2026
docker compose up -d --build --wait
docker compose run --rm application node dist/db/seed.js
docker compose run --rm application node dist/knowledge/backfill.js
```

假服务只用于确定性验收，不代表真实大模型质量。接入真实服务时，仅在本地设置 `EMBEDDING_API_KEY`、`CHAT_API_KEY` 和对应 endpoint，不提交 `.env` 或截图中的密钥。

## 验收重点

- `POST /api/login` 返回 `accessToken`、`tokenType: Bearer`、`expiresAt`，同时保留 HttpOnly Cookie 兼容旧浏览器。
- 受保护请求使用 `Authorization: Bearer <accessToken>`；服务端从签名 JWT 和数据库 token session 恢复 `userId`、`role`、`classId`，不信任浏览器提交的身份字段。
- `POST /api/search` 支持 `keyword`、`vector`、`hybrid`，结果只来自当前用户班级，并返回材料名、知识条目、chunk 序号和字符偏移。
- `POST /api/ask` 先做本班混合检索，最多使用 4 个证据片段；答案包含 `[1]` 等引用和来源信息。无命中时固定返回 `资料中未找到相关内容`，不调用聊天 provider。
- `PATCH /api/assistant-config` 仅教师可调用；学生只能读取和使用配置。
- `POST /api/conversations/:id/stream` 返回 `meta`、`citation`、`delta`、`done` 或 `error` SSE 事件，并把成功答案持久化为 `done`。
- 上传材料后会生成 `knowledge_entries`、`knowledge_chunks` 和 embedding 状态；`node dist/knowledge/backfill.js` 可重复执行并重试失败或过期模型的索引。

## 课程截图

截图目录 `evidence/lesson-4-5/` 已被 Git 忽略，适合放置本地提交材料：

1. 登录后的教师首页/知识问答：显示 `teacher-a`、`A 班`、问题、带 `[1]` 的回答和来源卡片。
2. DevTools Network：选择受保护的 `materials`、`search` 或 `me` 请求，在 Request Headers 中显示 `Authorization: Bearer ...`；截图不得出现 provider key、JWT secret 或完整可复用 token。

若没有用户提供的真实模型 endpoint，截图可以明确标注“本地 OpenAI-compatible 验收服务”，不能把假服务回答描述为真实模型结果。

## 明确不包含

本次不实现注册、找回密码、刷新 token、OAuth/SSO、平台管理员、作业批改、额外技能市场、MCP、队列、多副本高可用或公网部署。
