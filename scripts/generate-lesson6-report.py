# -*- coding: utf-8 -*-
import json
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "docs" / "evidence" / "lesson6-sample.json"
SKILL_EVIDENCE = ROOT / "docs" / "evidence" / "lesson6-skill-sample.json"
OUTPUT = ROOT / "output" / "pdf" / "campusclaw-lesson-6-report.pdf"

font = "/System/Library/Fonts/STHeiti Light.ttc"
bold = "/System/Library/Fonts/STHeiti Medium.ttc"
pdfmetrics.registerFont(TTFont("CN", font, subfontIndex=0))
pdfmetrics.registerFont(TTFont("CN-Bold", bold, subfontIndex=0))

styles = {
    "title": ParagraphStyle("title", fontName="CN-Bold", fontSize=19, leading=27, alignment=1, textColor="#000000", spaceAfter=18),
    "h1": ParagraphStyle("h1", fontName="CN-Bold", fontSize=14, leading=21, textColor="#000000", spaceBefore=11, spaceAfter=6),
    "h2": ParagraphStyle("h2", fontName="CN-Bold", fontSize=11, leading=17, textColor="#000000", spaceBefore=7, spaceAfter=3),
    "body": ParagraphStyle("body", fontName="CN", fontSize=9.5, leading=15.5, textColor="#000000", spaceAfter=5),
}


def paragraph(text, style="body"):
    escaped = str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return Paragraph(escaped, styles[style])


def evidence_summary():
    if not EVIDENCE.exists():
        return "尚未生成 Compose 执行证据；运行 docs/lesson-6-verification.md 中的验收命令后重新生成本报告。"
    data = json.loads(EVIDENCE.read_text(encoding="utf-8"))
    execution = data.get("execution", {})
    answers = data.get("assignmentAnswers", {})
    skill_steps = 0
    if SKILL_EVIDENCE.exists():
        skill_data = json.loads(SKILL_EVIDENCE.read_text(encoding="utf-8"))
        skill_steps = len([
            step for step in skill_data.get("assignmentAnswers", {}).get("boundSkillContributionAndExecution", [])
            if step.get("step_type") == "skill_action"
        ])
    return (
        f"代表执行 ID：{execution.get('id', 'unknown')}；"
        f"应用：{execution.get('application_name', 'unknown')}；"
        f"状态：{execution.get('status', 'unknown')}；"
        f"模型：{execution.get('model_identity', 'unknown')}；"
        f"provider 步骤：{len(answers.get('modelRequestAndResponse', []))}；"
        f"MCP 步骤：{len(answers.get('mcpParametersAndResults', []))}；"
        f"Skill action 步骤：{skill_steps}。"
    )


story = [
    Spacer(1, 12 * mm),
    paragraph("CampusClaw", "title"),
    paragraph("第 6 课 AI 应用、Skill 与 MCP 实现报告", "title"),
    paragraph("一、仓库地址", "h1"),
    paragraph("https://github.com/stanleyIl/forth-lesson"),
    paragraph("二、项目简介", "h1"),
    paragraph(
        "CampusClaw 是按班级隔离的 AI 教学应用平台。教师和学生通过 JWT Bearer 或兼容 Cookie 登录。"
        "每个班级可以使用多个 AI 应用，每个应用独立绑定提示词模板、知识库检索策略、Skill 和 MCP 工具。"
        "服务端负责身份、班级、提示词、Skill、工具和知识来源的可信控制。"
    ),
    paragraph("三、已实现能力", "h1"),
    paragraph("1. 内置多个 AI 应用：本班知识助手和公式辅导助手。"),
    paragraph("2. 支持提示词模板的创建、变量校验、预览、版本化和应用绑定。"),
    paragraph("3. 支持 keyword、vector、hybrid 班级知识库检索和来源引用。"),
    paragraph("4. 支持内置 Skill、声明式 SKILL.md 上传和安全 server_action。"),
    paragraph("5. 支持本地 MCP Streamable HTTP 服务、工具发现、工具绑定和模型工具调用循环。"),
    paragraph("6. 支持 execution trace、JSON evidence export、SSE 工具活动和最终 PDF 生成。"),
    paragraph("四、五个验证问题", "h1"),
    paragraph("1. 每次对话传递给 LLM 的参数和返回内容是什么？提示词模板是否一起传递？", "h2"),
    paragraph(
        "provider_request 记录模型名称、maxTokens、消息角色、消息字符数、提示词模板版本、选中知识 chunk、"
        "Skill 版本和当前应用绑定的工具 schema。模板由服务端渲染为 system message 的一部分。"
        "provider_response 记录 finish reason、回答摘要和模型返回的 tool call。"
    ),
    paragraph("2. 绑定知识库后是否把全部知识库内容传递给 LLM？", "h2"),
    paragraph(
        "不会。服务端先按登录用户的可信 classId 执行应用配置的检索模式，只取有界 top-k chunk。"
        "模型请求只包含这些 chunk 的编号、文件名、偏移和 excerpt。完整知识库和其他班级内容不会进入请求。"
    ),
    paragraph("3. 绑定 Skill 后是否把该 Skill 的全部内容传递给 LLM？", "h2"),
    paragraph(
        "不会。只加载当前应用绑定且启用的 Skill 版本。instruction Skill 只发送其 Markdown 指令正文；"
        "不会发送上传文件字节、frontmatter、存储路径或未绑定 Skill。server_action 只提供预注册动作的有界 schema。"
    ),
    paragraph("4. 执行具体 Skill 时逻辑是什么？", "h2"),
    paragraph(
        "模型或编排器只能选择当前应用绑定的 server_action。服务端校验动作名和参数，调用固定注册表中的实现，"
        "限制输出长度，把结果作为 tool message 继续生成最终回答。上传 Skill 不能执行 JavaScript、Shell 或任意网络请求。"
    ),
    paragraph("5. 集成 MCP 工具后，每次请求传递给 LLM 的参数是什么？", "h2"),
    paragraph(
        "初始请求包含模型参数、服务端渲染 prompt、受限历史、选中证据、绑定 Skill 和当前应用绑定的 MCP tool schemas。"
        "模型返回 tool name 与 JSON arguments。服务端校验后调用 MCP tools/call，再把有界 tool result 作为 tool message"
        "发送给模型生成最终回答。MCP 内部地址和凭据不发送给模型或浏览器。"
    ),
    paragraph("五、代表性执行证据", "h1"),
    paragraph(evidence_summary()),
    paragraph("六、安全边界", "h1"),
    paragraph(
        "系统不支持上传并执行任意代码，不支持任意 MCP 地址，不把完整 JWT、Cookie、密码、provider key、MCP 凭据、"
        "完整知识库或内部存储路径写入报告。课程演示使用本地 deterministic mock，并明确标注其用途。"
    ),
    paragraph("七、验证命令", "h1"),
    paragraph("npm test"),
    paragraph("npm run build"),
    paragraph("docker compose up -d --build --wait"),
    paragraph("npx openspec validate --specs"),
]

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
doc = SimpleDocTemplate(
    str(OUTPUT),
    pagesize=A4,
    leftMargin=20 * mm,
    rightMargin=20 * mm,
    topMargin=17 * mm,
    bottomMargin=17 * mm,
    title="CampusClaw 第 6 课 AI 应用、Skill 与 MCP 实现报告",
    author="CampusClaw",
)
doc.build(story)
print(OUTPUT)
