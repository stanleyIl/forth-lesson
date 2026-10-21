# CampusClaw

CampusClaw 是一个按班级隔离的教学材料与可追溯知识库系统。教师和学生可以使用服务端 Session Cookie 或 JWT Bearer 登录；教师管理本班 `.txt`/`.md` 材料，学生浏览、下载、检索并向本班知识库提问。所有角色和班级判断均由服务端完成。

## 已实现范围

- 教师/学生账号密码登录、JWT Bearer、`GET /api/me` 身份恢复和服务端登出
- HttpOnly、SameSite=Lax Session Cookie 与自适应加盐密码哈希
- 教师上传；教师和学生查看、下载本班材料
- A/B 班服务端数据隔离，跨班对象与不存在对象同形返回 404
- UTF-8 `.txt`/`.md` 校验、大小限制、原子入库和持久化文件
- 安全 GFM Markdown 详情、列表/网格、同班本地筛选、深浅色、命令面板、上传进度和反馈
- PostgreSQL 全文检索、pgvector 向量检索、RRF 融合和来源追溯
- 自动/分隔符/Markdown 标题分块，embedding 生命周期和可重试 backfill
- 三种受保护检索模式、带 `[1]` 引用的知识问答和 SSE 流式对话
- 教师可配置系统提示词与引导式解题开关；学生只能读取和使用配置
- Docker Compose、健康检查、数据卷、幂等双班种子和自动化测试

## 明确不做

本迭代不提供用户注册、密码找回、刷新 token、平台管理员、OAuth/SSO、作业批改、技能市场、MCP、Kubernetes、多副本高可用或公网部署。当前发布形态是本地单实例 Docker Compose。

## 本地启动

要求：Docker Desktop（包含 Docker Compose CLI）。`SESSION_SECRET` 和 `JWT_SECRET` 都必须是不少于 32 个字符的本地私密值。

```bash
cp .env.example .env
# 编辑 .env，替换 SESSION_SECRET、JWT_SECRET、SEED_TEACHER_PASSWORD 和 SEED_STUDENT_PASSWORD
source ~/.zshrc  # 如果当前终端尚未加载 Docker Desktop CLI PATH
docker compose up --build --wait
```

应用地址：

- 登录页：`http://localhost:3000/`
- 登录后材料页：`http://localhost:3000/app/materials`
- 健康检查：`http://localhost:3000/health`

## 创建演示数据

```bash
docker compose run --rm \
  -e SEED_TEACHER_PASSWORD="$SEED_TEACHER_PASSWORD" \
  -e SEED_STUDENT_PASSWORD="$SEED_STUDENT_PASSWORD" \
  application node dist/db/seed.js
docker compose run --rm application node dist/knowledge/backfill.js
```

命令可重复执行，不会复制材料或覆盖教师上传内容。创建 `teacher-a`、`student-a`、`teacher-b`、`student-b` 四个账号，并创建可区分的 A/B 班材料用于验证隔离。密码只以 scrypt 自适应哈希存储。

## 运行时配置

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 连接地址 |
| `SESSION_SECRET` | Session HMAC 密钥，至少 32 字符 |
| `JWT_SECRET` | JWT HS256 签名密钥，至少 32 字符，只在服务端使用 |
| `JWT_ISSUER` / `JWT_AUDIENCE` / `JWT_TTL_SECONDS` | JWT issuer、audience 和有效期 |
| `SESSION_TTL_SECONDS` / `SESSION_COOKIE_NAME` / `HTTPS_ENABLED` | Cookie 会话参数 |
| `UPLOAD_MAX_BYTES` / `MATERIAL_STORAGE_ROOT` | 上传上限和持久化目录 |
| `EMBEDDING_ENDPOINT` / `EMBEDDING_API_KEY` / `EMBEDDING_MODEL` | OpenAI-compatible embedding 服务；key 只由服务端读取 |
| `CHAT_ENDPOINT` / `CHAT_API_KEY` / `CHAT_MODEL` | OpenAI-compatible 聊天服务；key 只由服务端读取 |
| `SEARCH_*` / `ASK_*` / `CONVERSATION_*` | 检索、提问和会话的长度/数量边界 |
| `CHUNK_*` / `VECTOR_SIMILARITY_THRESHOLD` | 分块窗口、重叠字符和向量阈值 |

`.env` 已被 Git 忽略；`.env.example` 不包含真实密钥。数据库只在 Compose 内部网络可达，没有映射宿主端口。

## API

| 操作 | 权限 | 行为 |
| --- | --- | --- |
| `POST /api/login` | 公开 | 登录并返回 JWT Bearer，同时设置 Session Cookie |
| `GET /api/me` | 已登录 | 返回可信 `userId`、`role`、`classId` |
| `POST /api/logout` | 已登录 | 撤销当前 JWT、删除服务端会话并清 Cookie |
| `GET /api/materials` | 已登录 | 只列出当前班级材料 |
| `GET /api/materials/:materialId` | 已登录、同班 | 材料与知识条目详情 |
| `GET /api/materials/:materialId/file` | 已登录、同班 | 下载原始文件 |
| `POST /api/materials` | 教师 | 上传 `.txt`/`.md` 并触发分块/embedding |
| `POST /api/search` | 教师/学生 | `keyword`、`vector`、`hybrid` 本班检索并返回 chunk 来源 |
| `POST /api/ask` | 教师/学生 | 本班检索增强问答，返回回答和引用；无命中不调用模型 |
| `GET/PATCH /api/assistant-config` | 已登录/教师 | 读取或更新本班提示词与引导式解题开关 |
| `GET/POST /api/conversations` | 已登录 | 创建、列出和读取当前用户的对话 |
| `POST /api/conversations/:id/stream` | 已登录 | SSE 流式回答，发送 `meta`、`citation`、`delta`、`done`/`error` |
| `POST /api/materials/:materialId/reindex` | 教师、同班 | 使用当前配置重新分块和生成 embedding |
| `GET /health` | 公开 | HTTP 200 `{"status":"ok"}` |

服务端忽略请求体、查询参数和 header 中伪造的用户/角色/班级；跨班材料、chunk、来源和 conversation 不可访问。`401` 表示未登录或 token 无效，`403` 表示角色不足，`404` 表示不存在或不属于当前班级，`400/413/415` 表示输入、大小或文件类型错误，provider 依赖失败返回通用 `503`。

## 本地假 Provider

`node scripts/mock-openai-server.mjs` 会启动只用于本地确定性验收的 OpenAI-compatible embedding/chat 服务，默认端口 `18081`。它不是真实大模型，也不需要真实 API key。真实 provider 只应通过本地 `.env` 配置，绝不提交密钥。

## 持久化和验证

Compose 使用 `database_data` 和 `material_data` 命名卷。普通 `docker compose down`、重建应用镜像或重新创建容器不会删除数据；不要执行 `docker compose down -v`，除非明确要删除本地数据。

```bash
npm test
npm run build
npx openspec validate add-jwt-rag-streaming-assistant --strict
```

课程验收记录见 `docs/lesson-4-5-verification.md`；前序基础验收记录见 `docs/course-foundation-verification.md`。仓库地址保存在 `repository-url.txt`。
