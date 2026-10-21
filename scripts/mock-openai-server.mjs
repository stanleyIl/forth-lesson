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
        const text = JSON.stringify(payload.messages ?? []);
        const answer = text.includes("磁铁") ? "磁铁不能吸引木块，它主要吸引铁等磁性材料。[1]" : "请依据检索到的本班资料理解这个问题。[1]";
        response.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: answer } }] }));
        return;
      }
      response.statusCode = 404; response.end(JSON.stringify({ error: "Not Found" }));
    } catch {
      response.statusCode = 400; response.end(JSON.stringify({ error: "Bad Request" }));
    }
  });
}).listen(18081, "0.0.0.0", () => console.log("mock-openai-ready:18081"));
