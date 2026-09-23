# CampusClaw

## 项目价值
为教师和学生提供一个按班级隔离的教学材料管理系统。

## 核心场景
教师和学生可以登录系统并查看本班教学材料；教师可以上传材料并将其写入知识库。

## 本迭代范围
- 用户登录与会话管理
- 教师 / 学生角色权限
- 班级级数据隔离
- 教师上传教学材料
- 材料解析并写入知识库
- Docker Compose 启动
- 健康检查接口
- 限定班级范围的混合知识库检索与来源追溯

## 本迭代不做
- RAG 检索问答
- AI 对话
- 作业提交与批改
- 用户注册与密码找回
- SSO
- 生产级高可用

## 本地启动

要求：

- Docker Desktop（包含 Docker Compose）
- 一个不少于 32 个字符的私密 `SESSION_SECRET`

```bash
cp .env.example .env
# 编辑 .env，替换 SESSION_SECRET 和示例账户密码
docker compose up --build --wait
```

应用地址：

- 登录页：`http://localhost:3000/login`
- 教师/学生材料页：`http://localhost:3000/app/materials`
- 健康检查：`http://localhost:3000/health`

首次启动后，可创建作业演示账号：

```bash
docker compose run --rm \
  -e SEED_TEACHER_PASSWORD="$SEED_TEACHER_PASSWORD" \
  -e SEED_STUDENT_PASSWORD="$SEED_STUDENT_PASSWORD" \
  application node dist/db/seed.js
```

默认创建：

- `teacher-a`：教师，属于 `class-a`
- `student-b`：学生，属于 `class-b`

密码由上述环境变量提供，并且只以自适应加盐哈希形式写入数据库。

## 运行时配置

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 是（容器内已接线） | PostgreSQL 连接地址 |
| `SESSION_SECRET` | 是 | 会话 HMAC 密钥，至少 32 字符；缺失时拒绝启动 |
| `SESSION_TTL_SECONDS` | 否 | 会话有效期，默认 86400 秒 |
| `SESSION_COOKIE_NAME` | 否 | 会话 Cookie 名称 |
| `HTTPS_ENABLED` | 否 | HTTPS 环境中设为 `true`，启用 Secure Cookie |
| `UPLOAD_MAX_BYTES` | 否 | 上传大小限制，默认 1 MiB |
| `MATERIAL_STORAGE_ROOT` | 是（容器内已接线） | 持久化材料目录 |
| `HOST` / `PORT` | 否 | HTTP 监听地址和端口 |

Compose 使用 `database_data` 和 `material_data` 命名卷分别保存 PostgreSQL
数据和上传文件。重新创建应用容器不会删除这些卷。

## API 摘要

- `POST /api/login`：账号密码登录并设置 HttpOnly 会话 Cookie
- `GET /api/session`：读取服务端识别出的当前 `user_id`、`role`、`class_id`
- `GET /api/materials`：只列出当前会话班级的材料
- `GET /api/materials/:materialId`：读取同班材料及关联知识条目
- `GET /api/knowledge-entries/:entryId`：读取同班知识条目
- `POST /api/materials`：仅教师可上传 `.txt` 或 `.md`
- `POST /api/knowledge-search`：教师和学生检索当前班级知识，并返回材料、知识条目、序号和摘录来源
- `GET /health`：无需登录的服务存活检查

除登录和健康检查外，API 都要求有效会话。班级范围来自服务端会话，
客户端传入的 `user_id`、`role` 或 `class_id` 不会改变授权结果。

检索使用班级约束下的词法候选与向量候选，并通过 RRF（reciprocal rank fusion）稳定合并；嵌入服务不可用时自动降级为词法检索。向量索引状态保存在 `knowledge_entry_embeddings`，可通过应用启动后的材料上传触发索引，也可以运行 `docker compose exec application node dist/retrieval/backfill.js` 重建。

回滚时可停止检索路由并保留 `knowledge_entry_embeddings` 与索引数据；已有材料和知识条目不需要删除。生产数据库使用 `pgvector/pgvector:pg17` 镜像和原有 `database_data` 命名卷。
