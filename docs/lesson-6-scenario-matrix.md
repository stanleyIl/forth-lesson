# 第 6 课 Scenario 验收映射

日期：2026-10-22

## ai-application-management

- 每班多个应用、种子至少两个应用：`tests/ai-platform.test.ts`、`tests/ai-platform-api.test.ts`
- 同班列表和跨班隐藏：`tests/ai-platform-api.test.ts`
- 教师绑定、学生只读、客户端 class/tool 覆盖无效：`tests/ai-platform-api.test.ts`
- conversation 绑定应用并使用保存配置：Compose 浏览器和 API 验收，见 `docs/evidence/lesson6-sample.json`

## prompt-template-management

- 创建、版本化、禁用和教师权限：`tests/ai-platform-api.test.ts`
- 变量 allowlist、缺失/未声明/格式错误：`tests/ai-platform.test.ts`
- 服务端预览不调用 provider：`tests/ai-platform-api.test.ts`
- trace 记录模板版本和渲染摘要：`docs/evidence/lesson6-sample.json`

## skill-package-management

- 内置 `guided-solving` 和 `extract-key-points`：seed 与 `tests/ai-platform.test.ts`
- 教师上传合法 `SKILL.md`、学生 403：`tests/ai-platform-api.test.ts` 与 Compose 上传验收
- 非法文件名、可执行代码、路径/URL 内容拒绝：`tests/ai-platform.test.ts`
- 只发送绑定 instruction，不发送完整包：execution prompt/provider trace
- server_action 注册表、参数校验、输出限制、未知动作拒绝：`tests/ai-platform.test.ts`
- 实际 Skill 执行：`docs/evidence/lesson6-skill-sample.json`

## mcp-tool-integration

- MCP Streamable HTTP server 和 tools/list：Compose 验收
- `calculate` 与 `lookup_class_schedule`：`tests/ai-platform.test.ts`
- Host allowlist、参数 JSON Schema、超时和输出限制：`src/mcp/server.ts`、`src/mcp/client.ts`
- 只广告应用绑定工具、未绑定调用拒绝：orchestrator 与 `tests/ai-platform-api.test.ts`
- 模型 tool call、tools/call、tool result、最终回答：`docs/evidence/lesson6-sample.json`
- MCP 停机返回通用 503 并可恢复：Compose outage 验收

## ai-execution-observability

- prompt、retrieval、provider、Skill、MCP、final/error 有序步骤：`tests/ai-platform-api.test.ts`
- 教师同班可读、学生 403、跨班 404：`tests/ai-platform-api.test.ts`
- JSON export 回答五个作业问题：`docs/evidence/lesson6-sample.json`
- trace retention cleanup：Compose PostgreSQL `POST /api/executions/cleanup` 验收
- JWT、Cookie、密码、key、内部 MCP URL 和存储路径审计：提交前 `rg` 检查

## material-browser-experience

- AI 应用选择、应用 conversation、Skill/MCP 活动：浏览器验收截图 `evidence/lesson-6/`
- 教师管理模板、Skill 上传、MCP 发现/绑定、execution evidence：浏览器 AX/截图验收
- 学生无 API mutation 权限：`tests/ai-platform-api.test.ts`
- 页面 Bearer storage/header、401 清理和无 secret：`tests/ai-platform-api.test.ts`、`tests/jwt-rag-security.test.ts`

## service-operations

- Compose 启动 database/application/mcp-server 和健康检查：Compose 验收
- 迁移 001-005、幂等 seed、backfill：Compose 验收和 `tests/migrations.test.ts`
- 本地 mock 普通回答、tool_calls 和 tool result：`scripts/mock-openai-server.mjs`
- README 和第 6 课验收步骤：`README.md`、`docs/lesson-6-verification.md`
- 纯文字黑字 PDF 生成和渲染：`scripts/generate-lesson6-report.py`、`output/pdf/campusclaw-lesson-6-report.pdf`

## 最终命令

```bash
npm test
npm run build
npm audit --omit=dev
npx openspec validate --specs
docker compose up -d --build --wait
```

当前自动化结果：17 个测试文件，100 个测试通过；production dependency audit 为 0 vulnerability。
