import { createServer } from "node:http";

const vector = (text) => {
  const value = String(text);
  if (value.includes("天气") || value.includes("比分")) return [0, 0, 1];
  if (value.includes("磁铁") || value.includes("木块")) return [1, 0, 0];
  return [0, 1, 0];
};
createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => body += chunk);
  request.on("end", () => {
    try {
      const payload = body ? JSON.parse(body) : {};
      response.setHeader("content-type", "application/json");
      if (request.url?.endsWith("/v1/embeddings")) {
        const input = Array.isArray(payload.input) ? payload.input : [payload.input];
        response.end(JSON.stringify({ data: input.map((text, index) => ({ index, embedding: vector(text) })) }));
        return;
      }
      if (request.url?.endsWith("/v1/chat/completions")) {
        const messages = payload.messages ?? [];
        const text = JSON.stringify(messages);
        const lastUserText = String([...messages].reverse().find((item) => item?.role === "user")?.content ?? "");
        const availableTools = new Set((payload.tools ?? []).map((item) => item?.function?.name).filter(Boolean));
        const lastTool = [...messages].reverse().find((item) => item?.role === "tool");
        if (lastTool) {
          const final = lastTool.name?.includes("calculate")
            ? `计算工具返回 ${lastTool.content}，因此结果是 42。`
            : lastTool.name?.includes("schedule")
              ? `课程表工具返回：${lastTool.content}`
              : `技能执行结果：${lastTool.content}`;
          response.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: final } }] }));
          return;
        }
        const toolCall = (name, args) => ({
          choices: [{
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              content: null,
              tool_calls: [{ id: `call_${name}`, type: "function", function: { name, arguments: JSON.stringify(args) } }],
            },
          }],
        });
        const calculateTool = [...availableTools].find((name) => name.endsWith("__calculate"));
        if (calculateTool && (lastUserText.includes("6乘7") || lastUserText.includes("6*7") || lastUserText.includes("6 × 7"))) {
          response.end(JSON.stringify(toolCall(calculateTool, { operation: "multiply", a: 6, b: 7 })));
          return;
        }
        const scheduleTool = [...availableTools].find((name) => name.endsWith("__lookup_class_schedule"));
        if (scheduleTool && lastUserText.includes("课程表")) {
          response.end(JSON.stringify(toolCall(scheduleTool, { day: "monday" })));
          return;
        }
        const skillTool = [...availableTools].find((name) => name.startsWith("skill__"));
        if (skillTool && lastUserText.includes("提取要点")) {
          response.end(JSON.stringify(toolCall(skillTool, { text: "第一点。第二点。第三点。" })));
          return;
        }
        const answer = text.includes("磁铁") ? "磁铁不能吸引木块，它主要吸引铁等磁性材料。[1]" : "请依据检索到的本班资料理解这个问题。[1]";
        response.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: answer } }] }));
        return;
      }
      response.statusCode = 404; response.end(JSON.stringify({ error: "Not Found" }));
    } catch {
      response.statusCode = 400; response.end(JSON.stringify({ error: "Bad Request" }));
    }
  });
}).listen(Number(process.env.MOCK_OPENAI_PORT ?? 18081), "0.0.0.0", () => console.log(`mock-openai-ready:${process.env.MOCK_OPENAI_PORT ?? 18081}`));
