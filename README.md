# CampusClaw

CampusClaw 是一个按班级隔离的教学材料与可追溯知识库系统。教师和学生使用服务端 Session Cookie 登录；教师管理本班 `.txt`/`.md` 材料，学生浏览、下载和检索本班内容。所有角色和班级判断均由服务端完成。

## 已实现范围

- 教师/学生账号密码登录、`GET /api/me` 身份恢复和服务端登出
- HttpOnly、SameSite=Lax Session Cookie 与自适应加盐密码哈希
- 教师上传；教师和学生查看、下载本班材料
- A/B 班服务端数据隔离，跨班对象与不存在对象同形返回 404
- UTF-8 `.txt`/`.md` 校验、大小限制、原子入库和持久化文件
- 安全 GFM Markdown 详情、列表/网格、同班本地筛选、深浅色、命令面板、上传进度和反馈
- PostgreSQL 全文检索、pgvector 向量检索、RRF 融合和来源追溯
- Embedding 服务不可用时自动降级为 `lexical_fallback`
- Docker Compose、健康检查、数据卷、幂等双班种子和自动化测试

## 明确不做

本迭代不提供用户注册、密码找回、平台管理员、JWT/OAuth/SSO、LLM 问答或对话、作业批改、技能、MCP、Kubernetes、多副本高可用或公网部署。当前发布形态是本地单实例 Docker Compose。

## 本地启动

要求：

- Docker Desktop（包含 Docker Compose CLI）
- 一个不少于 32 个字符的本地 `SESSION_SECRET`

```bash
cp .env.example .env
# 编辑 .env，替换 SESSION_SECRET、SEED_TEACHER_PASSWORD 和 SEED_STUDENT_PASSWORD
source ~/.zshrc  # 如果当前终端尚未加载 Docker Desktop CLI PATH
docker compose up --build --wait
```

应用地址：

- 登录页：`http://localhost:3000/`
- 登录后材料页：`http://localhost:3000/app/materials`
- 健康检查：`http://localhost:3000/health`

`GET /health` 只表示应用进程存活，不要求登录，也不把数据库就绪检查混入响应。

## 创建演示数据

```bash
docker compose run --rm \
  -e SEED_TEACHER_PASSWORD="$SEED_TEACHER_PASSWORD" \
  -e SEED_STUDENT_PASSWORD="$SEED_STUDENT_PASSWORD" \
  application node dist/db/seed.js
```

命令可重复执行，不会复制材料或覆盖教师上传内容。创建以下账号：

| 账号 | 角色 | 班级 | 密码来源 |
| --- | --- | --- | --- |
| `teacher-a` | 教师 | `class-a` | `SEED_TEACHER_PASSWORD` |
| `student-a` | 学生 | `class-a` | `SEED_STUDENT_PASSWORD` |
| `teacher-b` | 教师 | `class-b` | `SEED_TEACHER_PASSWORD` |
| `student-b` | 学生 | `class-b` | `SEED_STUDENT_PASSWORD` |

同时创建可区分的 `class-a-introduction.md` 和 `class-b-introduction.md`，用于验证同班访问和跨班拒绝。密码只以 scrypt 自适应哈希存储。

## 运行时配置

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 是（Compose 已接线） | PostgreSQL 连接地址 |
| `SESSION_SECRET` | 是 | Session HMAC 密钥，至少 32 字符；缺失时拒绝启动 |
| `SESSION_TTL_SECONDS` | 否 | 会话有效期，默认 86400 秒 |
| `SESSION_COOKIE_NAME` | 否 | Session Cookie 名称 |
| `HTTPS_ENABLED` | 否 | HTTPS 环境设为 `true`，启用 Secure Cookie |
| `UPLOAD_MAX_BYTES` | 否 | 上传上限，默认 1 MiB |
| `MATERIAL_STORAGE_ROOT` | 是（Compose 已接线） | 持久化材料目录 |
| `EMBEDDING_ENDPOINT` | 否 | OpenAI-compatible embeddings 地址；Compose 访问宿主服务应使用 `host.docker.internal` |
| `EMBEDDING_API_KEY` | 否 | Embedding 服务凭据，仅由服务端发送 |
| `EMBEDDING_MODEL` | 否 | 模型身份，用于 stale/current 向量判断 |
| `EMBEDDING_TIMEOUT_MS` / `EMBEDDING_BATCH_SIZE` | 否 | Provider 超时与批量大小 |
| `SEARCH_*` | 否 | 查询长度、结果数、候选数、摘录和 RRF 边界 |

`.env` 已被 Git 忽略；`.env.example` 不包含真实密钥。数据库只在 Compose 内部网络可达，没有映射宿主端口。

## API

| 操作 | 权限 | 行为 |
| --- | --- | --- |
| `POST /api/login` | 公开 | 登录并设置 Session Cookie |
| `GET /api/me` | 已登录 | 返回可信 `userId`、`role`、`classId` |
| `POST /api/logout` | 公开安全调用 | 删除当前服务端会话并清 Cookie |
| `GET /api/materials` | 已登录 | 只列出当前班级材料 |
| `GET /api/materials/:materialId` | 已登录、同班 | 材料与知识条目详情 |
| `GET /api/materials/:materialId/file` | 已登录、同班 | 下载原始文件 |
| `GET /api/knowledge-entries/:entryId` | 已登录、同班 | 知识条目详情 |
| `POST /api/materials` | 教师 | 上传 `.txt`/`.md` |
| `POST /api/knowledge-search` | 教师/学生 | 本班 PostgreSQL FTS + pgvector 混合检索 |
| `GET /health` | 公开 | HTTP 200 `{"status":"ok"}` |

状态码约定：

- `401`：未登录、Session 无效/过期/篡改
- `403`：已登录但角色无权执行操作，例如学生直接调用上传 API
- `404`：对象不存在或属于其他班级；两者响应同形，不泄露资源存在性
- `400/413/415`：空/非法编码、超限、非 `.txt`/`.md` 上传
- `503`：数据库、材料存储或检索依赖暂时不可用；响应不包含 SQL、路径或 provider 细节

## 检索与回填

词法候选由 PostgreSQL `tsvector`/GIN 全文检索生成；向量候选由 pgvector `<=>` 距离查询生成。两个集合在应用层使用 RRF 确定性融合，并返回材料 ID、原文件名、知识条目 ID、序号、摘录和排名来源。

```bash
docker compose exec application node dist/retrieval/backfill.js
```

若 Embedding 服务超时或报错，材料仍可上传、词法检索仍可用，API 返回 `retrievalMode: "lexical_fallback"`，失败向量保持可重试状态。

## 持久化和验证

Compose 使用 `database_data` 和 `material_data` 命名卷。普通 `docker compose down`、重建应用镜像或重新创建容器不会删除数据；不要执行 `docker compose down -v`，除非明确要删除本地数据。

```bash
npm test
npm run build
npx openspec validate complete-course-foundation-experience --strict
```

完整课程验收记录见 `docs/course-foundation-verification.md`。
