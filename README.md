# CampusClaw

CampusClaw 是一个按班级隔离的教学材料与可追溯知识库系统。教师和学生可以使用服务端 Session Cookie 或 JWT Bearer 登录；教师管理本班 `.txt`/`.md` 材料，学生浏览、下载、检索并向本班知识库提问。所有角色和班级判断均由服务端完成。

## 第六课提交材料

本次阶段性验收使用真实外部模型接口 `glm-5.3-flash`，完成知识库问答、上传 Skill、Skill 动作执行和 MCP 工具调用。知识助手采用关键词检索，只传入命中的本班片段。应用运行时直接连接模型网关，密钥保存在本机 `.env`，不随仓库提交。

- [PDF 报告](output/pdf/campusclaw-lesson-6-report.pdf)：9 页，包含 14 张前后端验证截图及五个问题的回答。
- [Word 原稿](output/docx/campusclaw-lesson-6-report.docx)：宋体黑字，可继续编辑。
- [原始截图包](output/lesson6-screenshots.zip)：保留网页、实际后端请求和响应的浏览器截图。
- [完整验证记录](docs/evidence/lesson6-real-model/README.md)：模型 HTTP 请求与响应、应用执行记录、认证和班级隔离结果。

重新制作 Word 原稿需要在工作区 Python 环境安装 `scripts/requirements-report.txt`，然后运行 `npm run report:lesson6`。PDF 从 Word 原稿通过 Word/WPS 导出。自动化测试中的 mock 用于隔离外部依赖；本次提交目录中的模型调用证据来自真实网关。

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
- 每班内置多个 AI 应用，可分别绑定提示词模板、知识库策略、Skill 和 MCP 工具
- 教师可创建/预览版本化提示词模板，并上传声明式 `SKILL.md`
- 独立 MCP Streamable HTTP 服务，内置安全计算器和班级课程表查询工具
- 模型工具调用循环、Skill server_action、执行 trace 和五项作业问题证据导出
- Docker Compose、健康检查、数据卷、幂等双班种子和自动化测试

## 明确不做

本迭代不提供用户注册、密码找回、刷新 token、平台管理员、OAuth/SSO、作业批改、技能市场、任意插件代码执行、任意外部 MCP 地址、Kubernetes、多副本高可用或公网部署。当前发布形态是本地单实例 Docker Compose。

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
| `AI_APPLICATION_*` / `PROMPT_TEMPLATE_*` | 每班 AI 应用和提示词模板数量上限 |
| `SKILL_*` | Skill 数量、上传大小和持久化目录 |
| `MCP_SERVER_*` / `MCP_*_TIMEOUT_MS` | 服务端控制的 MCP 名称、内部地址和超时 |
| `TOOL_MAX_*` | 单轮工具调用次数、轮数和输出大小 |
| `EXECUTION_TRACE_*` | 执行证据保留天数、数量和预览长度 |

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
| `GET/POST/PATCH /api/ai-applications` | 已登录/教师 | 使用或管理本班多个 AI 应用及绑定 |
| `GET/POST /api/prompt-templates` | 已登录/教师 | 列出、创建、预览和版本化提示词模板 |
| `GET /api/skills`、`POST /api/skills/upload` | 已登录/教师 | 列出或上传声明式 `SKILL.md` |
| `GET /api/mcp/servers`、`POST /api/mcp/refresh` | 教师 | 查看或刷新服务端 MCP 工具发现 |
| `GET /api/executions/:id/export` | 教师、同班 | 导出脱敏模型/检索/Skill/MCP 执行证据 |
| `GET /health` | 公开 | HTTP 200 `{"status":"ok"}` |

服务端忽略请求体、查询参数和 header 中伪造的用户/角色/班级；跨班材料、chunk、来源和 conversation 不可访问。`401` 表示未登录或 token 无效，`403` 表示角色不足，`404` 表示不存在或不属于当前班级，`400/413/415` 表示输入、大小或文件类型错误，provider 依赖失败返回通用 `503`。

## 本地假 Provider

`node scripts/mock-openai-server.mjs` 会启动只用于本地确定性验收的 OpenAI-compatible embedding/chat 服务，默认端口 `18081`。它不是真实大模型，也不需要真实 API key。真实 provider 只应通过本地 `.env` 配置，绝不提交密钥。

该 mock 支持普通回答和确定性 tool call：

- 问“6*7”时选择 MCP `calculate`
- 问“课程表”时选择 MCP `lookup_class_schedule`
- 收到 tool result 后生成最终回答

## AI 应用、模板与 Skill

种子数据为 A/B 班分别创建：

- 本班知识助手：使用 `hybrid` 检索、必须命中资料、绑定 `guided-solving`
- 公式辅导助手：不强制检索，可绑定计算器和课程表 MCP 工具

提示词模板只支持声明过的 `{{variable_name}}`，由服务端填充可信值。客户端提交的 system prompt、classId、tool schema 或 Skill 内容不会覆盖保存配置。

上传 Skill 必须是单个 UTF-8 `SKILL.md`：

```markdown
---
id: evidence-summary
name: 证据摘要
version: 1.0.0
type: instruction
description: 只总结选中的知识证据
---
只使用当前应用选中的知识片段，不补充资料中没有的内容。
```

支持 `instruction` 和 `server_action`。上传文件不能携带 JavaScript、Shell、Python、路径穿越或外部 URL，也不能创建新的服务端动作。`server_action` 只能引用项目中预先注册的安全实现。

## MCP 调用流程

1. 应用服务通过内部 `MCP_SERVER_URL` 初始化 MCP Client。
2. `tools/list` 发现工具，保存名称、描述、输入 schema 和 hash。
3. 教师把已发现工具绑定到某个 AI 应用。
4. 模型请求只携带该应用绑定的 tool schema。
5. 模型返回 tool call 后，服务端校验绑定和参数。
6. 服务端调用 MCP `tools/call`，把有界结果作为 tool message 发送给模型。
7. 模型生成最终回答；整个流程写入脱敏 execution trace。

浏览器和模型都不能指定任意 MCP 内部地址。

## 第 6 课作业证据

教师可在页面“执行证据”中查看和导出：

- 模型、生成参数、消息角色和返回内容摘要
- 实际使用的提示词模板版本
- 仅被选中的知识 chunk，而不是完整知识库
- 实际绑定的 Skill 指令或 server_action 执行
- MCP tool schema、参数、有界结果和最终回答

完整步骤见 `docs/lesson-6-verification.md`。最终 PDF 使用：

```bash
.venv/bin/python scripts/generate-lesson6-report.py
```

## 持久化和验证

Compose 使用 `database_data` 和 `material_data` 命名卷。普通 `docker compose down`、重建应用镜像或重新创建容器不会删除数据；不要执行 `docker compose down -v`，除非明确要删除本地数据。

```bash
npm test
npm run build
npx openspec validate --specs
```

第 6 课验收记录见 `docs/lesson-6-verification.md`；前序记录见 `docs/lesson-4-5-verification.md` 和 `docs/course-foundation-verification.md`。仓库地址保存在 `repository-url.txt`。
