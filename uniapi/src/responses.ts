import { approxTokens, sseResponse } from "./common.ts";
import { createParser } from "./sse.ts";

function rid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return JSON.stringify(value);
}

function extractContent(content: unknown): string | Array<Record<string, unknown>> {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return stringify(content);

  const parts: Array<Record<string, unknown>> = [];
  for (const item of content) {
    if (typeof item === "string") {
      parts.push({ type: "text", text: item });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const part = item as Record<string, any>;
    const type = part.type;
    if (type === "input_text" || type === "output_text" || type === "text") {
      parts.push({ type: "text", text: part.text || "" });
    } else if (type === "input_image") {
      const url = part.image_url || part.url;
      if (url) parts.push({ type: "image_url", image_url: { url } });
    } else if (type === "input_file") {
      parts.push({ type: "text", text: `[Attached File: ${part.filename || "unknown"}]` });
    } else {
      parts.push({ type: "text", text: JSON.stringify(part) });
    }
  }

  if (parts.length === 1 && parts[0].type === "text") return String(parts[0].text || "");
  return parts;
}

export function responsesToChat(req: any): any {
  const messages: any[] = [];
  if (req.instructions) messages.push({ role: "system", content: req.instructions });

  const input = req.input;
  if (typeof input === "string") {
    if (input) messages.push({ role: "user", content: input });
  } else if (Array.isArray(input)) {
    for (const raw of input) {
      if (typeof raw === "string") {
        messages.push({ role: "user", content: raw });
        continue;
      }
      if (!raw || typeof raw !== "object") {
        messages.push({ role: "user", content: stringify(raw) });
        continue;
      }
      const item = raw as Record<string, any>;
      const type = item.type;
      if (type === "message" || (!type && (item.role || item.content))) {
        const role = ["system", "user", "assistant", "developer"].includes(item.role) ? item.role : "user";
        messages.push({ role, content: extractContent(item.content || []) });
      } else if (type === "function_call") {
        const callId = item.call_id || item.id || rid("call");
        messages.push({
          role: "assistant",
          content: null,
          tool_calls: [{
            id: callId,
            type: "function",
            function: { name: item.name || "function_call", arguments: stringify(item.arguments || "{}") },
          }],
        });
      } else if (type === "function_call_output") {
        messages.push({ role: "tool", tool_call_id: item.call_id || item.id || "", content: stringify(item.output) });
      } else if (type === "reasoning") {
        const text = item.reasoning_content || item.encrypted_content || "";
        if (text) messages.push({ role: "assistant", content: "", reasoning_content: text });
      }
    }
  }

  const chatReq = { ...req, messages };
  if (chatReq.max_output_tokens != null && chatReq.max_tokens == null) chatReq.max_tokens = chatReq.max_output_tokens;
  for (const key of ["input", "instructions", "max_output_tokens", "store", "previous_response_id"]) delete chatReq[key];
  if (Array.isArray(chatReq.tools)) {
    chatReq.tools = chatReq.tools
      .filter((tool: any) => tool && (tool.type === "function" || tool.name))
      .map((tool: any) => tool.type === "function" && tool.function ? tool : {
        type: "function",
        function: { name: tool.name, description: tool.description || "", parameters: tool.parameters || {} },
      });
  }
  return chatReq;
}

export function chatToResponses(chatResp: any): any {
  const choice = (chatResp.choices || [{}])[0];
  const message = choice.message || {};
  const output: any[] = [];
  if (message.reasoning_content) {
    output.push({ type: "reasoning", id: rid("rs"), summary: [], encrypted_content: message.reasoning_content, status: "completed" });
  }
  if (message.content) {
    output.push({
      type: "message",
      id: rid("msg"),
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text: message.content, annotations: [] }],
    });
  }
  for (const tc of message.tool_calls || []) {
    const fn = tc.function || {};
    output.push({
      type: "function_call",
      id: rid("fc"),
      call_id: tc.id || rid("call"),
      name: fn.name || "",
      arguments: typeof fn.arguments === "string" ? fn.arguments : JSON.stringify(fn.arguments || {}),
      status: "completed",
    });
  }
  if (!output.length) {
    output.push({ type: "message", id: rid("msg"), role: "assistant", status: "completed", content: [{ type: "output_text", text: "", annotations: [] }] });
  }
  const usage = chatResp.usage ? {
    input_tokens: chatResp.usage.prompt_tokens || 0,
    output_tokens: chatResp.usage.completion_tokens || 0,
    total_tokens: chatResp.usage.total_tokens || 0,
  } : undefined;
  return { id: rid("resp"), object: "response", created_at: Math.floor(Date.now() / 1000), status: "completed", model: chatResp.model || "", output, usage };
}

function event(type: string, data: Record<string, unknown>): string {
  return `event: ${type}\ndata: ${JSON.stringify({ ...data, type })}\n\n`;
}

export function chatSseToResponses(chatStream: ReadableStream, model = ""): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const reader = chatStream.getReader();
      const decoder = new TextDecoder();
      const responseId = rid("resp");
      const messageId = rid("msg");
      let outputIndex = 0;
      let contentIndex = 0;
      let textStarted = false;
      let collected = "";
      const enqueue = (value: string) => controller.enqueue(encoder.encode(value));
      enqueue(event("response.created", { response: { id: responseId, object: "response", status: "in_progress", model, output: [] } }));

      const parser = createParser((sseEvent) => {
        if (!sseEvent.data || sseEvent.data === "[DONE]") return;
        let data: any;
        try { data = JSON.parse(sseEvent.data); } catch { return; }
        const choice = data.choices?.[0];
        if (!choice) return;
        const delta = choice.delta || {};
        if (delta.content) {
          if (!textStarted) {
            textStarted = true;
            enqueue(event("response.output_item.added", { output_index: outputIndex, item: { id: messageId, type: "message", role: "assistant", status: "in_progress", content: [] } }));
            enqueue(event("response.content_part.added", { item_id: messageId, output_index: outputIndex, content_index: contentIndex, part: { type: "output_text", text: "", annotations: [] } }));
          }
          collected += delta.content;
          enqueue(event("response.output_text.delta", { item_id: messageId, output_index: outputIndex, content_index: contentIndex, delta: delta.content }));
        }
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const fn = tc.function || {};
            enqueue(event("response.output_item.added", { output_index: outputIndex, item: { type: "function_call", id: rid("fc"), call_id: tc.id || rid("call"), name: fn.name || "", arguments: fn.arguments || "", status: "completed" } }));
            outputIndex++;
          }
        }
      });

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          parser.feed(decoder.decode(value, { stream: true }));
        }
        if (textStarted) {
          enqueue(event("response.output_text.done", { item_id: messageId, output_index: outputIndex, content_index: contentIndex, text: collected }));
          enqueue(event("response.content_part.done", { item_id: messageId, output_index: outputIndex, content_index: contentIndex, part: { type: "output_text", text: collected, annotations: [] } }));
          enqueue(event("response.output_item.done", { output_index: outputIndex, item: { id: messageId, type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: collected, annotations: [] }] } }));
          outputIndex++;
        }
        enqueue(event("response.completed", { response: { id: responseId, object: "response", status: "completed", model, output: [], usage: { input_tokens: 0, output_tokens: approxTokens(collected), total_tokens: approxTokens(collected) } } }));
      } catch (err: any) {
        enqueue(event("error", { message: err?.message || String(err) }));
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });
  return sseResponse(stream);
}
