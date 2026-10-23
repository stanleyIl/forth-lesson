# 第 6 课阶段性验收

日期：2026-10-22

仓库：https://github.com/stanleyIl/forth-lesson

## 项目简介

CampusClaw 是按班级隔离的 AI 教学应用平台。教师和学生通过 JWT Bearer 或兼容 Cookie 登录。每个班级拥有多个 AI 应用，每个应用独立绑定提示词模板、知识库检索策略、Skill 和 MCP 工具。所有身份、班级、模板、Skill、工具和知识来源均由服务端决定。

## 启动

```bash
cp .env.example .env
# 设置至少 32 字符的 SESSION_SECRET、JWT_SECRET，以及种子密码
node scripts/mock-openai-server.mjs
docker compose up -d --build --wait
docker compose run --rm \
  -e SEED_TEACHER_PASSWORD="$SEED_TEACHER_PASSWORD" \
  -e SEED_STUDENT_PASSWORD="$SEED_STUDENT_PASSWORD" \
  application node dist/db/seed.js
docker compose run --rm application node dist/knowledge/backfill.js
```

登录 `teacher-a` 后，点击“刷新工具发现”，再在“应用绑定”中为“公式辅导”绑定 `calculate` 和 `lookup_class_schedule`。

## 功能验证

1. 多个 AI 应用：页面至少显示“A班知识助手”和“A班公式辅导”。
2. 提示词模板：教师可创建、预览和版本化模板；预览不调用模型。
3. 知识库检索：知识助手只把 hybrid top-k 选中 chunk 传入模型并返回 `[1]` 引用。
4. 内置 Skill：`guided-solving` 作为 instruction skill 参与知识助手提示词。
5. 上传 Skill：教师上传单个合法 `SKILL.md` 后可绑定；学生上传返回 403。
6. 外部工具/MCP：应用通过内部 MCP Streamable HTTP 服务发现和调用工具。
7. 执行证据：教师可查看 execution trace 和 JSON export。

## 五个问题的验证答案

### 1. 每次对话传递给 LLM 的参数和返回内容是什么？模板是否一起传递？

execution trace 的 `provider_request` 步骤记录模型名称、`maxTokens`、消息角色、消息字符数、模板版本、选中 chunk、Skill 版本和绑定工具 schema。`provider_response` 记录 finish reason、回答摘要和 tool call。模板由服务端渲染后作为 system message 的一部分传入。

### 2. 绑定知识库后是否把全部内容传给 LLM？

不会。系统先在已认证班级执行 keyword/vector/hybrid 检索，只取应用配置的 top-k chunk。trace 的 `retrieval` 步骤记录被选中的 chunk ID、文件名、偏移和有界 excerpt。未选中的知识库内容不会进入 provider request。

### 3. 绑定 Skill 后是否把 Skill 全部内容传给 LLM？

不会。只加载当前应用绑定且启用的 Skill 版本。`instruction` Skill 只把 Markdown instruction body 传入；不会发送上传文件字节、frontmatter、存储路径或未绑定 Skill。`server_action` 只发送预注册动作的有界 schema。

### 4. 执行具体 Skill 时逻辑是什么？

模型或编排器只能选择应用绑定的 server_action。服务端校验动作名和参数，调用固定注册表中的实现，限制超时和输出长度，把结果作为 tool message 继续生成最终回答。上传 Skill 不能执行 JavaScript、Shell 或任意网络请求。

### 5. 集成 MCP 后传递给 LLM 的参数是什么？

初始请求包含模型参数、服务端渲染 prompt、受限历史、选中证据、绑定 Skill 和当前应用绑定的 MCP tool schemas。模型返回 tool name 和 JSON arguments。服务端验证后调用 MCP `tools/call`，再把有界 tool result 作为 tool message 发送给模型生成最终回答。MCP 内部 URL 和凭据不会发送给模型或浏览器。

## 自动化验证

```bash
npm test
npm run build
npx openspec validate --specs
```

关键测试：

- `tests/ai-platform.test.ts`
- `tests/ai-platform-api.test.ts`
- `tests/jwt-rag-security.test.ts`
- `tests/migrations.test.ts`

## 敏感信息

- `.env`、`evidence/` 和本地截图不进入 Git。
- PDF、JSON export 和日志不得包含完整 JWT、Cookie、密码、provider key、MCP 凭据或内部存储路径。
- 课程演示使用本地 deterministic mock，并在报告中明确标注。
