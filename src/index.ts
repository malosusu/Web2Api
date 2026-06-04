import { setSignSecret, createCompletion, createCompletionStream, generateImages, generateVideos } from "./chat.ts";
import { createClaudeCompletion, createGeminiCompletion } from "./adapters.ts";
import { defaultTo, isString, unixTimestamp, uuid, md5 } from "./utils.ts";
import geminiWebWorker, { MODELS as GEMINI_WEB_MODELS } from "./gemini-web.js";
import { chatCompletion as kimiChatCompletion, listModels as listKimiModels, HttpError as KimiHttpError } from "./kimi/providers/kimi.ts";
import { KNOWN_MODELS as KIMI_MODEL_IDS, type Env as KimiEnv } from "./kimi/config.ts";
import { chatSseToResponses, chatToResponses, responsesToChat } from "./responses.ts";
import { isAuthorized, jsonResponse as commonJsonResponse, responseToJson } from "./common.ts";

const SUPPORTED_MODELS = [
  // ==================== 文本模型 ====================
  { id: "glm-5.1", name: "GLM-5.1", object: "model", description: "最新旗舰模型，开源 SOTA 能力，长程任务显著提升，可自主工作长达 8 小时" },
  { id: "glm-5", name: "GLM-5", object: "model", description: "高智能基座，编程能力对齐 Claude Opus 4.5，擅长 Agentic 长程规划与执行" },
  { id: "glm-5-turbo", name: "GLM-5-Turbo", object: "model", description: "龙虾增强基座，针对复杂长任务执行与工具调用专项优化" },
  { id: "glm-4.7", name: "GLM-4.7", object: "model", description: "高智能模型，通用对话、推理与智能体能力全面升级" },
  { id: "glm-4.7-flashx", name: "GLM-4.7-FlashX", object: "model", description: "轻量高速版，适用于中文写作、翻译、长文本、情感/角色扮演等场景" },
  { id: "glm-4.6", name: "GLM-4.6", object: "model", description: "超强性能，200K 上下文，高级编码、推理与工具调用能力" },
  { id: "glm-4.5-air", name: "GLM-4.5-Air", object: "model", description: "高性价比，在推理、编码和智能体任务上表现强劲" },
  { id: "glm-4.5-airx", name: "GLM-4.5-AirX", object: "model", description: "高性价比极速版，推理速度快，适用于时效性要求高的场景" },
  { id: "glm-4-long", name: "GLM-4-Long", object: "model", description: "超长输入，支持高达 1M 上下文，用于复杂查询与记忆型任务" },
  { id: "glm-4-flashx-250414", name: "GLM-4-FlashX-250414", object: "model", description: "高速低价 Flash 增强版本，超快推理速度" },

  // 免费/轻量文本模型
  { id: "glm-4.7-flash", name: "GLM-4.7-Flash", object: "model", description: "免费模型，最新基座模型的普惠版本" },
  { id: "glm-4.5-flash", name: "GLM-4.5-Flash", object: "model", description: "免费模型（即将下线），支持深度思考模式" },
  { id: "glm-4-flash-250414", name: "GLM-4-Flash-250414", object: "model", description: "免费模型，超长上下文、多语言支持" },

  // ==================== 视觉/多模态模型 ====================
  { id: "glm-5v-turbo", name: "GLM-5V-Turbo", object: "model", description: "多模态 Coding 基座，兼顾视觉理解与 Coding 能力，深度适配 Agent 工作流" },
  { id: "glm-4.6v", name: "GLM-4.6V", object: "model", description: "视觉推理模型，原生支持工具调用，长上下文，前端代码复刻效果优秀" },
  { id: "glm-ocr", name: "GLM-OCR", object: "model", description: "轻量图文解析，高精度文档解析，支持复杂文档" },
  { id: "autoglm-phone", name: "AutoGLM-Phone", object: "model", description: "手机智能助理框架，支持自然语言完成 App 操作" },
  { id: "glm-4.1v-thinking-flashx", name: "GLM-4.1V-Thinking-FlashX", object: "model", description: "轻量视觉推理，高并发，复杂场景理解" },

  // 免费视觉模型
  { id: "glm-4.6v-flash", name: "GLM-4.6V-Flash", object: "model", description: "免费视觉推理模型，支持工具调用" },
  { id: "glm-4.1v-thinking-flash", name: "GLM-4.1V-Thinking-Flash", object: "model", description: "免费轻量视觉推理" },
  { id: "glm-4v-flash", name: "GLM-4V-Flash", object: "model", description: "免费图像理解模型，多语言支持" },

  // ==================== 图像生成模型 ====================
  { id: "glm-image", name: "GLM-Image", object: "model", description: "旗舰图像生成模型，文字渲染开源 SOTA，支持多分辨率" },
  { id: "cogview-4", name: "CogView-4", object: "model", description: "高质量图像生成，风格多样化，细节丰富" },
  { id: "cogview-3-flash", name: "CogView-3-Flash", object: "model", description: "免费图像生成模型，创意丰富，推理速度快" },

  // ==================== 向量/嵌入模型 ====================
  { id: "embedding-3", name: "Embedding-3", object: "model", description: "V3 向量模型，用于语义检索、聚类等" },
  { id: "embedding-2", name: "Embedding-2", object: "model", description: "V2 向量模型" },

  // ==================== 其他特色模型 ====================
  { id: "charglm-4", name: "CharGLM-4", object: "model", description: "拟人模型，适用于情感陪伴和虚拟角色" },
  { id: "emohaa", name: "Emohaa", object: "model", description: "心理模型，专业情感咨询能力" },
  { id: "codegeex-4", name: "CodeGeeX-4", object: "model", description: "代码模型，适用于代码自动补全任务" },
  { id: "rerank", name: "Rerank", object: "model", description: "重排序模型，计算文本相关性 score" },
];

const GEMINI_MODELS = [
  { name: "models/gemini-1.5-pro", displayName: "Gemini 1.5 Pro", description: "复杂推理任务模型，适合长上下文分析、规划与高质量生成", inputTokenLimit: 2097152, outputTokenLimit: 8192, supportedGenerationMethods: ["generateContent", "streamGenerateContent"] },
  { name: "models/gemini-1.5-flash", displayName: "Gemini 1.5 Flash", description: "高速轻量模型，适合高吞吐、低延迟的内容生成场景", inputTokenLimit: 1048576, outputTokenLimit: 8192, supportedGenerationMethods: ["generateContent", "streamGenerateContent"] },
  { name: "models/gemini-pro", displayName: "Gemini Pro", description: "上一代通用 Gemini 模型，适合常规对话与文本生成", inputTokenLimit: 32768, outputTokenLimit: 2048, supportedGenerationMethods: ["generateContent", "streamGenerateContent"] },
  { name: "models/glm-5", displayName: "GLM-5", description: "通过 Gemini 适配器调用的 GLM-5 对话模型", inputTokenLimit: 32768, outputTokenLimit: 8192, supportedGenerationMethods: ["generateContent", "streamGenerateContent"] },
];

const IMAGE_MODEL_IDS = new Set(["glm-image", "cogview-4", "cogview-3-flash"]);
const EMBEDDING_MODEL_IDS = new Set(["embedding-3", "embedding-2", "rerank"]);
const VISION_MODEL_IDS = new Set([
  "glm-5v-turbo",
  "glm-4.6v",
  "glm-ocr",
  "autoglm-phone",
  "glm-4.1v-thinking-flashx",
  "glm-4.6v-flash",
  "glm-4.1v-thinking-flash",
  "glm-4v-flash",
]);

function getModelCategory(id: string): string {
  if (IMAGE_MODEL_IDS.has(id)) return "图像";
  if (EMBEDDING_MODEL_IDS.has(id)) return "向量";
  if (VISION_MODEL_IDS.has(id)) return "视觉";
  return "文本";
}

function getModelKind(id: string): string {
  if (IMAGE_MODEL_IDS.has(id)) return "image";
  return "chat";
}

function getModelPath(kind: string): string {
  if (kind === "image") return "/v1/images/generations";
  return "/v1/chat/completions";
}

const MODEL_CATALOG = [
  ...SUPPORTED_MODELS.map((model) => {
    const kind = getModelKind(model.id);
    return {
      id: model.id,
      name: model.name,
      description: model.description,
      category: getModelCategory(model.id),
      kind,
      method: "POST",
      path: getModelPath(kind),
    };
  }),
  ...GEMINI_MODELS.map((model) => ({
    id: model.name,
    name: model.displayName,
    description: model.description,
    category: "Gemini",
    kind: "gemini",
    method: "POST",
    path: `/v1beta/models/${model.name.replace(/^models\//, "")}:generateContent`,
  })),
  ...Object.entries(GEMINI_WEB_MODELS).map(([id, model]) => ({
    id,
    name: id,
    description: model.desc || "Gemini 网页端 OpenAI/Gemini 兼容代理",
    category: "Gemini Web",
    kind: "gemini-web",
    method: "POST",
    path: "/v1/chat/completions",
  })),
  ...KIMI_MODEL_IDS.map((id) => ({
    id,
    name: id,
    description: "kimi-ai.chat OpenAI 兼容代理，支持伪流式、KV 会话和工具调用",
    category: "Kimi",
    kind: "kimi",
    method: "POST",
    path: "/v1/chat/completions",
  })),
];

const API_DOCS = [
  {
    title: "OpenAI Chat",
    method: "POST",
    path: "/v1/chat/completions",
    description: "OpenAI 兼容对话接口",
    body: { model: "glm", messages: [{ role: "user", content: "你好" }], stream: false },
  },
  {
    title: "Claude Messages",
    method: "POST",
    path: "/v1/messages",
    description: "Claude Messages 兼容接口",
    body: { model: "glm", messages: [{ role: "user", content: "你好" }], max_tokens: 1024 },
  },
  {
    title: "OpenAI Responses",
    method: "POST",
    path: "/v1/responses",
    description: "Responses API 兼容接口，自动转换到对应模型的 Chat Completions",
    body: { model: "glm-4.7-flash", input: "你好", stream: false },
  },
  {
    title: "Gemini Models",
    method: "GET",
    path: "/v1beta/models",
    description: "Gemini 格式模型列表",
    body: null,
  },
  {
    title: "Gemini Generate Content",
    method: "POST",
    path: "/v1beta/models/{model}:generateContent",
    description: "Gemini 格式内容生成",
    body: { contents: [{ role: "user", parts: [{ text: "你好" }] }] },
  },
  {
    title: "Images",
    method: "POST",
    path: "/v1/images/generations",
    description: "OpenAI 兼容图像生成接口",
    body: { model: "65a232c082ff90a2ad2f15e2", prompt: "一只玻璃质感的蓝色小鸟", response_format: "url" },
  },
  {
    title: "Models",
    method: "GET",
    path: "/v1/models",
    description: "模型列表",
    body: null,
  },
];

const HOME_DATA = {
  models: MODEL_CATALOG,
  apiDocs: API_DOCS,
};

function htmlJson(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function renderHomeHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>UniAPI</title>
<style>
  :root {
    color-scheme: light;
    --bg: #eef2f6;
    --panel: #ffffff;
    --panel-subtle: #f8fafc;
    --text: #111820;
    --muted: #617084;
    --line: #d9e1ea;
    --line-strong: #c4ceda;
    --accent: #0b7b61;
    --accent-strong: #075c49;
    --accent-soft: #e7f5ef;
    --user: #e9f8f2;
    --danger: #a33a3a;
    --shadow: 0 18px 50px rgba(29, 45, 65, 0.10);
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    min-height: 100vh;
    overflow: hidden;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: var(--text);
    background:
      linear-gradient(180deg, rgba(255,255,255,0.72), rgba(255,255,255,0) 260px),
      var(--bg);
  }

  button, textarea, select { font: inherit; }
  button { cursor: pointer; }

  .app {
    display: grid;
    grid-template-columns: 360px minmax(0, 1fr);
    gap: 16px;
    width: min(1480px, calc(100vw - 24px));
    height: 100vh;
    min-height: 0;
    margin: 0 auto;
    padding: 12px 0;
  }

  .sidebar,
  .chat-shell {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    box-shadow: var(--shadow);
    overflow: hidden;
  }

  .sidebar {
    display: grid;
    grid-template-rows: auto auto 1fr;
    height: 100%;
    min-height: 0;
  }

  .brand {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 64px;
    padding: 0 16px;
    border-bottom: 1px solid var(--line);
    background: #fbfcfd;
  }

  .brand-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 38px;
    padding: 0 13px;
    border: 1px solid var(--line-strong);
    border-radius: 7px;
    background: #fff;
    color: var(--text);
    font-size: 14px;
    font-weight: 760;
    white-space: nowrap;
  }

  .model-toggle {
    display: none;
  }

  .model-tools {
    display: grid;
    gap: 12px;
    padding: 14px;
    border-bottom: 1px solid var(--line);
  }

  .search {
    width: 100%;
    height: 40px;
    padding: 0 12px;
    border: 1px solid var(--line-strong);
    border-radius: 7px;
    outline: none;
    background: #fff;
    color: var(--text);
  }

  .search:focus,
  .model-select:focus,
  textarea:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(11, 123, 97, 0.12);
  }

  .filters {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .filter {
    min-height: 32px;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: #fff;
    color: var(--muted);
    font-size: 12px;
    font-weight: 650;
  }

  .filter.active {
    border-color: #a7d9cb;
    background: var(--accent-soft);
    color: var(--accent-strong);
  }

  .model-count {
    color: var(--muted);
    font-size: 12px;
  }

  .model-list {
    display: grid;
    align-content: start;
    gap: 8px;
    padding: 12px;
    overflow: auto;
    min-height: 0;
    max-height: 100%;
  }

  .model-card {
    display: grid;
    gap: 5px;
    width: 100%;
    min-height: 92px;
    padding: 11px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
    color: var(--text);
    text-align: left;
  }

  .model-card:hover {
    border-color: #aacfc4;
    background: #fbfefd;
  }

  .model-card.active {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  .model-card-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
  }

  .model-name {
    font-size: 13px;
    font-weight: 760;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge {
    padding: 3px 7px;
    border: 1px solid #d2e7df;
    border-radius: 999px;
    background: #e8f4ef;
    font-size: 11px;
    color: var(--accent-strong);
  }

  .model-id {
    color: #355a75;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  .model-desc {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.45;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .chat-shell {
    display: grid;
    grid-template-rows: auto 1fr auto;
    height: 100%;
    min-height: 0;
    position: relative;
  }

  .chat-shell.drag-over::after,
  .composer-box.drag-over::after {
    content: "释放图片作为附件";
    position: absolute;
    inset: 10px;
    z-index: 5;
    display: grid;
    place-items: center;
    border: 2px dashed #54b99d;
    border-radius: 8px;
    background: rgba(231, 245, 239, 0.9);
    color: var(--accent-strong);
    font-size: 14px;
    font-weight: 760;
    pointer-events: none;
  }

  .chat-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 14px;
    align-items: center;
    min-height: 76px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--line);
    background: #fbfcfd;
  }

  .selected-model {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .selected-title {
    margin: 0;
    font-size: 18px;
    font-weight: 780;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .selected-desc {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .capability-note {
    margin: 2px 0 0;
    color: #7b8796;
    font-size: 12px;
    line-height: 1.4;
  }

  .head-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .model-select {
    width: min(420px, 34vw);
    height: 40px;
    padding: 0 10px;
    border: 1px solid var(--line-strong);
    border-radius: 7px;
    background: #fff;
    color: var(--text);
    outline: none;
  }

  .secondary-button {
    height: 40px;
    padding: 0 12px;
    border: 1px solid var(--line-strong);
    border-radius: 7px;
    background: #fff;
    color: var(--text);
    font-size: 13px;
  }

  .transcript {
    padding: 24px;
    overflow: auto;
    background: #f7f9fb;
    min-height: 0;
  }

  .welcome {
    display: grid;
    place-items: center;
    min-height: 100%;
    padding: 30px 10px;
    text-align: center;
  }

  .welcome-box {
    width: min(760px, 100%);
    display: grid;
    gap: 16px;
  }

  .welcome h2 {
    margin: 0;
    font-size: 28px;
    line-height: 1.2;
    letter-spacing: 0;
  }

  .welcome p {
    margin: 0;
    color: var(--muted);
    font-size: 14px;
    line-height: 1.6;
  }

  .quick-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .quick {
    min-height: 48px;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
    color: var(--text);
    text-align: left;
    font-size: 14px;
  }

  .message-row {
    display: flex;
    gap: 12px;
    width: min(900px, 100%);
    margin: 0 auto 18px;
  }

  .message-row.user {
    flex-direction: row-reverse;
  }

  .avatar {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: #fff;
    color: var(--muted);
    font-size: 12px;
    font-weight: 760;
  }

  .message-row.user .avatar {
    background: #e8f7f1;
    color: var(--accent-strong);
  }

  .bubble {
    max-width: min(760px, calc(100% - 46px));
    padding: 13px 15px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.65;
    font-size: 14px;
  }

  .bubble p,
  .bubble pre,
  .bubble ul,
  .bubble ol,
  .bubble blockquote,
  .bubble .table-wrap {
    margin: 0 0 10px;
  }

  .bubble > :last-child {
    margin-bottom: 0;
  }

  .bubble ul,
  .bubble ol {
    padding-left: 20px;
  }

  .bubble li + li {
    margin-top: 4px;
  }

  .bubble code {
    padding: 2px 4px;
    border-radius: 4px;
    background: #eef2f6;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.92em;
  }

  .bubble pre {
    overflow: auto;
    padding: 10px;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: #101820;
    color: #f6f8fb;
    white-space: pre;
  }

  .bubble pre code {
    padding: 0;
    background: transparent;
    color: inherit;
  }

  .bubble blockquote {
    padding-left: 10px;
    border-left: 3px solid var(--line-strong);
    color: var(--muted);
  }

  .bubble a {
    color: #0b6fbe;
    text-decoration: none;
  }

  .bubble a:hover {
    text-decoration: underline;
  }

  .bubble .table-wrap {
    max-width: 100%;
    overflow-x: auto;
    border: 1px solid var(--line);
    border-radius: 7px;
  }

  .bubble table {
    width: 100%;
    border-collapse: collapse;
    min-width: 360px;
    background: #fff;
    white-space: normal;
  }

  .bubble th,
  .bubble td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--line);
    text-align: left;
    vertical-align: top;
  }

  .bubble th {
    background: #f1f5f9;
    color: var(--text);
    font-weight: 760;
  }

  .bubble tr:last-child td {
    border-bottom: 0;
  }

  .reasoning {
    margin: 0 0 10px;
    border: 1px solid #dbe6ef;
    border-radius: 7px;
    background: #f7fafc;
    overflow: hidden;
  }

  .reasoning summary {
    min-height: 34px;
    padding: 8px 10px;
    color: #516274;
    font-size: 12px;
    font-weight: 760;
    cursor: pointer;
    list-style: none;
  }

  .reasoning summary::-webkit-details-marker {
    display: none;
  }

  .reasoning-body {
    max-height: 260px;
    overflow: auto;
    padding: 0 10px 10px;
    color: #5f6f82;
    font-size: 12px;
    line-height: 1.6;
    white-space: pre-wrap;
  }

  .message-row.user .bubble {
    background: var(--user);
    border-color: #c7e8dc;
  }

  .message-row.error .bubble {
    border-color: #efbcbc;
    background: #fff6f6;
    color: var(--danger);
  }

  .media-list {
    display: grid;
    gap: 10px;
    margin-top: 10px;
    width: 100%;
  }

  .bubble.media-bubble {
    width: min(680px, calc(100% - 46px));
  }

  .media-list.image-only.single {
    grid-template-columns: minmax(0, 1fr);
    width: min(520px, 100%);
  }

  .media-list.image-only.multiple {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .media-list img {
    display: block;
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #f8fafc;
    object-fit: contain;
    cursor: zoom-in;
  }

  .media-list.image-only {
    margin-top: 0;
  }

  .media-list.image-only.multiple img {
    aspect-ratio: 1 / 1;
  }

  .media-list.image-only.single img {
    max-height: 460px;
  }

  .lightbox {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: none;
    place-items: center;
    padding: 24px;
    background: rgba(15, 23, 32, 0.72);
  }

  .lightbox.open {
    display: grid;
  }

  .lightbox img {
    display: block;
    max-width: min(100%, 1100px);
    max-height: calc(100vh - 72px);
    border-radius: 8px;
    background: #fff;
    object-fit: contain;
  }

  .lightbox-close {
    position: absolute;
    top: 16px;
    right: 16px;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.92);
    color: #111820;
    font-size: 20px;
    line-height: 1;
  }

  .composer {
    padding: 14px 18px 18px;
    border-top: 1px solid var(--line);
    background: #fff;
  }

  .composer-box {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 44px;
    gap: 10px;
    width: min(900px, 100%);
    margin: 0 auto;
    padding: 10px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: #fff;
    position: relative;
  }

  .composer-main {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .composer-tools {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .tool-button,
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 10px;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: #fff;
    color: var(--muted);
    font-size: 12px;
    font-weight: 650;
  }

  .tool-hidden {
    display: none !important;
  }

  .toggle input {
    width: 14px;
    height: 14px;
    accent-color: var(--accent);
  }

  .attachment-preview {
    display: none;
    align-items: center;
    gap: 8px;
    width: fit-content;
    max-width: 100%;
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: var(--panel-subtle);
    color: var(--muted);
    font-size: 12px;
  }

  .attachment-preview.active {
    display: flex;
  }

  .attachment-preview img {
    width: 34px;
    height: 34px;
    border-radius: 6px;
    object-fit: cover;
    border: 1px solid var(--line);
  }

  .attachment-preview button {
    border: 0;
    background: transparent;
    color: var(--danger);
    font-size: 16px;
  }

  textarea {
    width: 100%;
    min-height: 56px;
    max-height: 150px;
    padding: 8px 10px;
    border: 0;
    outline: none;
    resize: vertical;
    color: var(--text);
    line-height: 1.5;
  }

  .send {
    align-self: end;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 8px;
    background: var(--accent);
    color: #fff;
    font-size: 20px;
    font-weight: 720;
  }

  .send:hover { background: var(--accent-strong); }
  .send:disabled { opacity: 0.58; cursor: wait; }

  .toast {
    position: fixed;
    left: 50%;
    bottom: 18px;
    z-index: 40;
    transform: translateX(-50%) translateY(12px);
    opacity: 0;
    min-height: 38px;
    padding: 0 14px;
    border-radius: 999px;
    background: #111820;
    color: #fff;
    display: inline-flex;
    align-items: center;
    font-size: 13px;
    pointer-events: none;
    transition: opacity 160ms ease, transform 160ms ease;
  }

  .toast.show {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }

  .drawer {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: none;
  }

  .drawer.open { display: block; }

  .drawer-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(17, 24, 32, 0.35);
  }

  .drawer-panel {
    position: absolute;
    top: 0;
    right: 0;
    display: grid;
    grid-template-rows: auto 1fr;
    width: min(460px, 100vw);
    height: 100%;
    background: #fff;
    box-shadow: -18px 0 46px rgba(17, 24, 32, 0.18);
  }

  .drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 62px;
    padding: 0 16px;
    border-bottom: 1px solid var(--line);
  }

  .drawer-head h2 {
    margin: 0;
    font-size: 16px;
  }

  .icon-button {
    display: inline-grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: #fff;
    color: var(--text);
    font-size: 18px;
    line-height: 1;
  }

  .docs-list {
    display: grid;
    align-content: start;
    gap: 10px;
    padding: 14px;
    overflow: auto;
  }

  .doc-card {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel-subtle);
  }

  .doc-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 44px;
    padding: 0 11px;
    color: var(--text);
    list-style: none;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }

  .doc-summary::-webkit-details-marker { display: none; }

  .method {
    flex: 0 0 auto;
    min-width: 45px;
    padding: 3px 6px;
    border-radius: 5px;
    background: #e8f4ef;
    color: var(--accent-strong);
    text-align: center;
    font-size: 11px;
    font-weight: 760;
  }

  .doc-body {
    padding: 0 11px 11px;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.5;
  }

  .doc-path,
  .doc-code,
  .endpoint {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  .doc-path,
  .endpoint {
    color: #284f70;
  }

  .endpoint.copyable {
    width: fit-content;
    max-width: 100%;
    padding: 4px 0;
    border: 0;
    background: transparent;
    text-align: left;
    cursor: copy;
  }

  .endpoint.copyable:hover {
    color: var(--accent-strong);
    text-decoration: underline;
  }

  .doc-code {
    margin: 8px 0 0;
    padding: 9px;
    border: 1px solid #e4e9f0;
    border-radius: 6px;
    background: #fff;
    color: #23364d;
    white-space: pre-wrap;
  }

  @media (max-width: 940px) {
    body {
      min-height: 100dvh;
    }

    .app {
      grid-template-columns: 1fr;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 0;
      width: 100vw;
      height: 100dvh;
      padding: 0;
    }

    .sidebar,
    .chat-shell {
      border-right: 0;
      border-left: 0;
      border-radius: 0;
      box-shadow: none;
    }

    .sidebar {
      grid-template-rows: auto auto auto;
      height: auto;
      max-height: none;
      border-top: 0;
    }

    .chat-shell {
      height: auto;
      min-height: 0;
      border-bottom: 0;
    }

    .brand {
      min-height: 54px;
      padding: 0 12px;
      justify-content: flex-start;
      gap: 8px;
    }

    .brand-action {
      min-height: 34px;
      padding: 0 11px;
      font-size: 13px;
    }

    .model-toggle {
      display: inline-flex;
    }

    .model-tools {
      gap: 9px;
      padding: 10px 12px;
    }

    .search {
      height: 36px;
    }

    .filters {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 2px;
      scrollbar-width: none;
    }

    .filters::-webkit-scrollbar,
    .model-list::-webkit-scrollbar,
    .composer-tools::-webkit-scrollbar {
      display: none;
    }

    .filter {
      flex: 0 0 auto;
      min-height: 30px;
      padding: 0 10px;
    }

    .model-list {
      display: flex;
      gap: 10px;
      min-height: 116px;
      max-height: 132px;
      padding: 10px 12px 12px;
      overflow-x: auto;
      overflow-y: hidden;
    }

    .model-card {
      flex: 0 0 min(76vw, 270px);
      min-height: 104px;
      align-content: start;
    }

    .sidebar:not(.models-open) .model-tools,
    .sidebar:not(.models-open) .model-list {
      display: none;
    }

    .sidebar.models-open {
      grid-template-rows: auto auto minmax(0, 1fr);
      max-height: min(46dvh, 360px);
    }

    .chat-head {
      grid-template-columns: 1fr;
      min-height: auto;
      padding: 8px 12px;
      gap: 0;
      align-items: stretch;
    }

    .selected-model {
      display: none;
    }

    .selected-title {
      font-size: 16px;
    }

    .selected-desc {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      font-size: 12px;
    }

    .capability-note {
      font-size: 11px;
    }

    .head-actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      width: 100%;
    }

    .model-select {
      width: 100%;
      min-width: 0;
    }

    .secondary-button {
      padding: 0 10px;
      white-space: nowrap;
    }

    .transcript {
      padding: 12px;
    }

    .welcome {
      align-items: start;
      padding: 16px 0;
    }

    .welcome-box {
      gap: 12px;
    }

    .welcome h2 {
      font-size: 22px;
    }

    .quick-grid {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .quick {
      min-height: 42px;
      font-size: 13px;
    }

    .message-row {
      gap: 8px;
      margin-bottom: 12px;
    }

    .avatar {
      width: 30px;
      height: 30px;
      font-size: 11px;
    }

    .bubble {
      max-width: calc(100% - 38px);
      padding: 11px 12px;
      font-size: 13px;
    }

    .media-list {
      gap: 8px;
    }

    .bubble.media-bubble {
      width: calc(100% - 38px);
    }

    .media-list.image-only.single img {
      max-height: 320px;
    }

    .lightbox {
      padding: 12px;
    }

    .lightbox img {
      max-height: calc(100dvh - 64px);
    }

    .composer {
      padding: 10px 12px 12px;
    }

    .composer-box {
      grid-template-columns: minmax(0, 1fr) 42px;
      gap: 8px;
      padding: 8px;
    }

    .composer-tools {
      flex-wrap: nowrap;
      overflow-x: auto;
      padding-bottom: 2px;
    }

    .tool-button,
    .toggle {
      flex: 0 0 auto;
      min-height: 30px;
      padding: 0 9px;
      white-space: nowrap;
    }

    textarea {
      min-height: 48px;
      max-height: 108px;
    }

    .send {
      width: 42px;
      height: 42px;
    }
  }
</style>
</head>
<body>
<main class="app">
  <aside class="sidebar" aria-label="模型目录">
    <header class="brand">
      <button class="brand-action" id="docsButton" type="button">API 文档</button>
      <button class="brand-action model-toggle" id="modelToggle" type="button" aria-expanded="false">模型</button>
      <span class="brand-title">UniAPI</span>
    </header>
    <section class="model-tools">
      <input class="search" id="modelSearch" type="search" placeholder="搜索模型" autocomplete="off">
      <div class="filters" id="modelFilters"></div>
      <div class="model-count" id="modelCount"></div>
    </section>
    <section class="model-list" id="modelList" aria-label="全部模型"></section>
  </aside>

  <section class="chat-shell" aria-label="对话测试">
    <header class="chat-head">
      <div class="selected-model">
        <h2 class="selected-title" id="selectedTitle"></h2>
        <p class="selected-desc" id="selectedDesc"></p>
        <p class="capability-note" id="capabilityNote"></p>
        <button class="endpoint copyable" id="currentEndpoint" type="button" title="复制完整 API URL"></button>
      </div>
      <div class="head-actions">
        <select class="model-select" id="modelSelect" aria-label="选择模型"></select>
        <button class="secondary-button" id="clearButton" type="button">新对话</button>
      </div>
    </header>

    <div class="transcript" id="transcript"></div>

    <form class="composer" id="chatForm">
      <div class="composer-box">
        <div class="composer-main">
          <textarea id="promptInput" name="prompt" placeholder="输入消息..." autocomplete="off" required></textarea>
          <div class="attachment-preview" id="attachmentPreview"></div>
          <div class="composer-tools">
            <label class="toggle" id="searchControl"><input id="searchToggle" type="checkbox" checked>联网搜索</label>
            <label class="toggle" id="thinkingControl"><input id="thinkingToggle" type="checkbox">深度思考</label>
            <button class="tool-button" id="imageButton" type="button">图片附件</button>
            <input id="imageInput" type="file" accept="image/*" hidden>
          </div>
        </div>
        <button class="send" id="sendButton" type="submit" title="发送">↑</button>
      </div>
    </form>
  </section>
</main>

<aside class="drawer" id="docsDrawer" aria-hidden="true">
  <div class="drawer-backdrop" id="docsBackdrop"></div>
  <section class="drawer-panel" aria-label="API 文档">
    <header class="drawer-head">
      <h2>API 文档</h2>
      <button class="icon-button" id="docsClose" type="button" title="关闭">×</button>
    </header>
    <div class="docs-list" id="docsList"></div>
  </section>
</aside>
<div class="lightbox" id="lightbox" aria-hidden="true">
  <button class="lightbox-close" id="lightboxClose" type="button" title="关闭">×</button>
  <img id="lightboxImage" alt="image preview">
</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>

<script type="application/json" id="homeData">${htmlJson(HOME_DATA)}</script>
<script>
  const homeData = JSON.parse(document.getElementById("homeData").textContent);
  const modelList = document.getElementById("modelList");
  const modelFilters = document.getElementById("modelFilters");
  const modelSearch = document.getElementById("modelSearch");
  const modelCount = document.getElementById("modelCount");
  const docsList = document.getElementById("docsList");
  const docsButton = document.getElementById("docsButton");
  const modelToggle = document.getElementById("modelToggle");
  const sidebar = document.querySelector(".sidebar");
  const docsDrawer = document.getElementById("docsDrawer");
  const docsBackdrop = document.getElementById("docsBackdrop");
  const docsClose = document.getElementById("docsClose");
  const modelSelect = document.getElementById("modelSelect");
  const selectedTitle = document.getElementById("selectedTitle");
  const selectedDesc = document.getElementById("selectedDesc");
  const capabilityNote = document.getElementById("capabilityNote");
  const currentEndpoint = document.getElementById("currentEndpoint");
  const chatShell = document.querySelector(".chat-shell");
  const transcript = document.getElementById("transcript");
  const chatForm = document.getElementById("chatForm");
  const promptInput = document.getElementById("promptInput");
  const searchControl = document.getElementById("searchControl");
  const searchToggle = document.getElementById("searchToggle");
  const thinkingControl = document.getElementById("thinkingControl");
  const thinkingToggle = document.getElementById("thinkingToggle");
  const imageButton = document.getElementById("imageButton");
  const imageInput = document.getElementById("imageInput");
  const attachmentPreview = document.getElementById("attachmentPreview");
  const composerBox = document.querySelector(".composer-box");
  const sendButton = document.getElementById("sendButton");
  const clearButton = document.getElementById("clearButton");
  const lightbox = document.getElementById("lightbox");
  const lightboxImage = document.getElementById("lightboxImage");
  const lightboxClose = document.getElementById("lightboxClose");
  const toast = document.getElementById("toast");
  const messages = [];
  let activeCategory = "全部";
  let selectedImage = null;
  let toastTimer = 0;

  function text(tagName, className, value) {
    const el = document.createElement(tagName);
    if (className) el.className = className;
    el.textContent = value || "";
    return el;
  }

  function selectedModel() {
    return homeData.models.find(function(model) {
      return model.id === modelSelect.value;
    }) || homeData.models[0];
  }

  function categories() {
    const values = ["全部"];
    homeData.models.forEach(function(model) {
      if (!values.includes(model.category)) values.push(model.category);
    });
    return values;
  }

  function filteredModels() {
    const term = modelSearch.value.trim().toLowerCase();
    return homeData.models.filter(function(model) {
      const matchesCategory = activeCategory === "全部" || model.category === activeCategory;
      const haystack = [model.id, model.name, model.description, model.category].join(" ").toLowerCase();
      return matchesCategory && (!term || haystack.includes(term));
    });
  }

  function renderFilters() {
    modelFilters.innerHTML = "";
    categories().forEach(function(category) {
      const button = text("button", "filter" + (category === activeCategory ? " active" : ""), category);
      button.type = "button";
      button.addEventListener("click", function() {
        activeCategory = category;
        renderFilters();
        renderModelList();
      });
      modelFilters.appendChild(button);
    });
  }

  function renderModelList() {
    const models = filteredModels();
    modelList.innerHTML = "";
    modelCount.textContent = models.length + " / " + homeData.models.length + " 个模型";
    models.forEach(function(model) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "model-card" + (model.id === modelSelect.value ? " active" : "");
      const head = document.createElement("div");
      head.className = "model-card-head";
      head.appendChild(text("div", "model-name", model.name));
      head.appendChild(text("span", "badge", model.category));
      card.appendChild(head);
      card.appendChild(text("code", "model-id", model.id));
      card.appendChild(text("p", "model-desc", model.description));
      card.addEventListener("click", function() {
        selectModel(model.id);
      });
      modelList.appendChild(card);
    });
  }

  function renderModelOptions() {
    modelSelect.innerHTML = "";
    homeData.models.forEach(function(model) {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = model.category + " · " + model.name + " (" + model.id + ")";
      modelSelect.appendChild(option);
    });
  }

  function collapseMobileModels() {
    if (!window.matchMedia("(max-width: 940px)").matches) return;
    sidebar.classList.remove("models-open");
    modelToggle.setAttribute("aria-expanded", "false");
  }

  function selectModel(id) {
    const previous = modelSelect.value;
    modelSelect.value = id;
    updateSelectedModel();
    renderModelList();
    collapseMobileModels();
    if (previous && previous !== id && messages.length) resetChat();
    promptInput.focus();
  }

  function updateSelectedModel() {
    const model = selectedModel();
    selectedTitle.textContent = model.name;
    selectedDesc.textContent = model.description || model.id;
    currentEndpoint.textContent = model.method + " " + model.path;
    updateModelCapabilities();
  }

  function supportsAttachment(model) {
    return model.kind === "gemini" || model.category === "视觉";
  }

  function supportsSearch(model) {
    return model.kind !== "image" && model.category !== "向量";
  }

  function supportsThinking(model) {
    return model.kind !== "image" && model.category !== "向量";
  }

  function setToolVisible(element, visible) {
    element.classList.toggle("tool-hidden", !visible);
    element.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  function updateModelCapabilities() {
    const model = selectedModel();
    const canSearch = supportsSearch(model);
    const canAttach = supportsAttachment(model);
    const canThink = supportsThinking(model);
    setToolVisible(searchControl, canSearch);
    setToolVisible(thinkingControl, canThink);
    setToolVisible(imageButton, canAttach);
    searchToggle.disabled = !canSearch;
    thinkingToggle.disabled = !canThink;
    imageButton.disabled = !canAttach;
    searchToggle.checked = canSearch;
    if (!canThink) thinkingToggle.checked = false;
    if (!canAttach) clearImage();
    const tags = [];
    if (canSearch) tags.push("联网搜索");
    if (canThink) tags.push("深度思考");
    if (canAttach) tags.push("图片附件");
    if (model.kind === "image") tags.push("生图");
    capabilityNote.textContent = tags.length ? "能力：" + tags.join(" / ") : "能力：基础对话";
  }

  function fullEndpointUrl() {
    return new URL(selectedModel().path, window.location.origin).href;
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = setTimeout(function() {
      toast.classList.remove("show");
    }, 1800);
  }

  async function copyEndpoint() {
    const url = fullEndpointUrl();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    showToast("已复制 API URL");
  }

  function renderDocs() {
    homeData.apiDocs.forEach(function(doc) {
      const details = document.createElement("details");
      details.className = "doc-card";
      const summary = document.createElement("summary");
      summary.className = "doc-summary";
      summary.appendChild(text("span", "", doc.title));
      summary.appendChild(text("span", "method", doc.method));
      details.appendChild(summary);

      const body = document.createElement("div");
      body.className = "doc-body";
      body.appendChild(text("div", "doc-path", doc.method + " " + doc.path));
      body.appendChild(text("p", "", doc.description));
      if (doc.body) {
        body.appendChild(text("pre", "doc-code", JSON.stringify(doc.body, null, 2)));
      }
      details.appendChild(body);
      docsList.appendChild(details);
    });
  }

  function createWelcome() {
    const welcome = document.createElement("div");
    welcome.className = "welcome";
    welcome.id = "welcome";
    const box = document.createElement("div");
    box.className = "welcome-box";
    box.appendChild(text("h2", "", "开始测试模型"));
    box.appendChild(text("p", "", selectedModel().name + " · " + selectedModel().description));
    const grid = document.createElement("div");
    grid.className = "quick-grid";
    [
      "用三句话介绍你的能力",
      "写一个 curl 调用示例",
      "生成一段中文测试回复",
      "解释当前模型适合哪些任务",
    ].forEach(function(prompt) {
      const button = text("button", "quick", prompt);
      button.type = "button";
      button.addEventListener("click", function() {
        promptInput.value = prompt;
        chatForm.requestSubmit();
      });
      grid.appendChild(button);
    });
    box.appendChild(grid);
    welcome.appendChild(box);
    return welcome;
  }

  function clearWelcome() {
    const welcome = document.getElementById("welcome");
    if (welcome) welcome.remove();
  }

  function resetChat() {
    messages.length = 0;
    transcript.innerHTML = "";
    transcript.appendChild(createWelcome());
    clearImage();
    promptInput.focus();
  }

  function appendMedia(container, media) {
    if (!media || !media.length) return;
    const list = document.createElement("div");
    const imageOnly = media.every(function(item) { return item.type === "image"; });
    list.className = "media-list" + (imageOnly ? " image-only" : "") + (imageOnly ? (media.length > 1 ? " multiple" : " single") : "");
    if (imageOnly) container.classList.add("media-bubble");
    media.forEach(function(item) {
      if (!item.url) return;
      if (item.type === "image") {
        const img = document.createElement("img");
        img.src = item.url;
        img.alt = "image";
        img.addEventListener("click", function() {
          openLightbox(item.url);
        });
        list.appendChild(img);
      }
    });
    container.appendChild(list);
  }

  function openLightbox(url) {
    lightboxImage.src = url;
    lightbox.classList.add("open");
    lightbox.setAttribute("aria-hidden", "false");
  }

  function closeLightbox() {
    lightbox.classList.remove("open");
    lightbox.setAttribute("aria-hidden", "true");
    lightboxImage.src = "";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderInlineMarkdown(value) {
    return escapeHtml(value)
      .replace(/\\x60([^\\x60]+)\\x60/g, "<code>$1</code>")
      .replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>")
      .replace(/__([^_]+)__/g, "<strong>$1</strong>")
      .replace(/\\*([^*]+)\\*/g, "<em>$1</em>")
      .replace(/_([^_]+)_/g, "<em>$1</em>")
      .replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }

  function renderMarkdown(markdown) {
    const source = String(markdown || "");
    if (!source.trim()) return "";
    const blocks = [];
    const codeBlocks = [];
    const withoutCode = source.replace(/\\x60\\x60\\x60([\\w-]*)\\n?([\\s\\S]*?)\\x60\\x60\\x60/g, function(_, lang, code) {
      const token = "\\u0000CODE" + codeBlocks.length + "\\u0000";
      codeBlocks.push('<pre><code>' + escapeHtml(code.replace(/\\n$/, "")) + '</code></pre>');
      return "\\n\\n" + token + "\\n\\n";
    });
    const lines = withoutCode.split(/\\r?\\n/);
    let paragraph = [];
    let list = [];
    let ordered = false;

    function splitTableRow(line) {
      const trimmed = line.trim().replace(/^\\|/, "").replace(/\\|$/, "");
      return trimmed.split("|").map(function(cell) {
        return cell.trim();
      });
    }

    function isTableDivider(line) {
      return /^\\s*\\|?\\s*:?-{3,}:?\\s*(\\|\\s*:?-{3,}:?\\s*)+\\|?\\s*$/.test(line);
    }

    function renderTable(rows) {
      const head = splitTableRow(rows[0]);
      const body = rows.slice(2).map(splitTableRow).filter(function(row) {
        return row.length && row.some(function(cell) { return cell; });
      });
      const headHtml = head.map(function(cell) {
        return "<th>" + renderInlineMarkdown(cell) + "</th>";
      }).join("");
      const bodyHtml = body.map(function(row) {
        const cells = head.map(function(_, index) {
          return "<td>" + renderInlineMarkdown(row[index] || "") + "</td>";
        }).join("");
        return "<tr>" + cells + "</tr>";
      }).join("");
      return '<div class="table-wrap"><table><thead><tr>' + headHtml + '</tr></thead><tbody>' + bodyHtml + '</tbody></table></div>';
    }

    function flushParagraph() {
      if (!paragraph.length) return;
      blocks.push("<p>" + renderInlineMarkdown(paragraph.join(" ")) + "</p>");
      paragraph = [];
    }

    function flushList() {
      if (!list.length) return;
      const tag = ordered ? "ol" : "ul";
      blocks.push("<" + tag + ">" + list.map(function(item) {
        return "<li>" + renderInlineMarkdown(item) + "</li>";
      }).join("") + "</" + tag + ">");
      list = [];
    }

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const trimmed = line.trim();
      const codeMatch = trimmed.match(/^\\u0000CODE(\\d+)\\u0000$/);
      if (codeMatch) {
        flushParagraph();
        flushList();
        blocks.push(codeBlocks[Number(codeMatch[1])]);
        continue;
      }
      if (!trimmed) {
        flushParagraph();
        flushList();
        continue;
      }
      if (trimmed.includes("|") && lines[index + 1] && isTableDivider(lines[index + 1])) {
        flushParagraph();
        flushList();
        const rows = [line, lines[index + 1]];
        index += 2;
        while (index < lines.length && lines[index].trim().includes("|") && lines[index].trim()) {
          rows.push(lines[index]);
          index++;
        }
        index--;
        blocks.push(renderTable(rows));
        continue;
      }
      const heading = trimmed.match(/^(#{1,3})\\s+(.+)$/);
      if (heading) {
        flushParagraph();
        flushList();
        const level = heading[1].length + 2;
        blocks.push("<h" + level + ">" + renderInlineMarkdown(heading[2]) + "</h" + level + ">");
        continue;
      }
      const bullet = trimmed.match(/^[-*+]\\s+(.+)$/);
      const numbered = trimmed.match(/^\\d+\\.\\s+(.+)$/);
      if (bullet || numbered) {
        flushParagraph();
        const nextOrdered = !!numbered;
        if (list.length && ordered !== nextOrdered) flushList();
        ordered = nextOrdered;
        list.push((bullet || numbered)[1]);
        continue;
      }
      const quote = trimmed.match(/^>\\s?(.+)$/);
      if (quote) {
        flushParagraph();
        flushList();
        blocks.push("<blockquote>" + renderInlineMarkdown(quote[1]) + "</blockquote>");
        continue;
      }
      paragraph.push(trimmed);
    }
    flushParagraph();
    flushList();
    return blocks.join("");
  }

  function setBubbleContent(bubble, content, markdown) {
    if (markdown) {
      bubble.innerHTML = renderMarkdown(content) || escapeHtml(content);
    } else {
      bubble.textContent = content || "";
    }
  }

  function setReasoningContent(bubble, reasoning) {
    const existing = bubble.querySelector(".reasoning");
    if (!reasoning) {
      if (existing) existing.remove();
      return;
    }
    let details = existing;
    if (!details) {
      details = document.createElement("details");
      details.className = "reasoning";
      const summary = text("summary", "", "思考");
      const body = text("div", "reasoning-body", "");
      details.appendChild(summary);
      details.appendChild(body);
      bubble.prepend(details);
    }
    const body = details.querySelector(".reasoning-body");
    body.textContent = reasoning;
  }

  function appendMessage(role, content, media) {
    clearWelcome();
    const row = document.createElement("div");
    row.className = "message-row " + role;
    const avatar = text("div", "avatar", role === "user" ? "你" : role === "error" ? "!" : "AI");
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    setBubbleContent(bubble, content, role === "assistant");
    appendMedia(bubble, media);
    row.appendChild(avatar);
    row.appendChild(bubble);
    transcript.appendChild(row);
    transcript.scrollTop = transcript.scrollHeight;
    return bubble;
  }

  function renderAttachment() {
    attachmentPreview.innerHTML = "";
    if (!selectedImage) {
      attachmentPreview.classList.remove("active");
      return;
    }
    const img = document.createElement("img");
    img.src = selectedImage.dataUrl;
    img.alt = selectedImage.name;
    attachmentPreview.appendChild(img);
    attachmentPreview.appendChild(text("span", "", selectedImage.name));
    const remove = text("button", "", "×");
    remove.type = "button";
    remove.addEventListener("click", clearImage);
    attachmentPreview.appendChild(remove);
    attachmentPreview.classList.add("active");
  }

  function attachImageFile(file) {
    const model = selectedModel();
    if (!supportsAttachment(model)) {
      showToast("当前模型不支持图片附件");
      return;
    }
    if (!file || !file.type || !file.type.startsWith("image/")) {
      showToast("请上传图片文件");
      return;
    }
    const reader = new FileReader();
    reader.onload = function() {
      selectedImage = { name: file.name || "image", dataUrl: String(reader.result || "") };
      renderAttachment();
      showToast("已添加图片附件");
    };
    reader.readAsDataURL(file);
  }

  function clearImage() {
    selectedImage = null;
    imageInput.value = "";
    renderAttachment();
  }

  function userMessageContent(prompt) {
    if (!selectedImage) return prompt;
    return [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: selectedImage.dataUrl } }
    ];
  }

  function requestForModel(model, prompt) {
    if (model.kind === "gemini") {
      const contents = messages.map(function(message) {
        const content = typeof message.content === "string"
          ? message.content
          : Array.isArray(message.content)
            ? message.content.filter(function(item) { return item.type === "text"; }).map(function(item) { return item.text || ""; }).join("\\n")
            : "";
        return { role: message.role === "assistant" ? "model" : "user", parts: [{ text: content }] };
      });
      const parts = [{ text: prompt }];
      if (selectedImage) {
        const dataUrlParts = selectedImage.dataUrl.split(",");
        const mimeMatch = selectedImage.dataUrl.match(/^data:([^;]+);base64,/);
        parts.push({ inlineData: { mimeType: mimeMatch ? mimeMatch[1] : "image/png", data: dataUrlParts[1] || "" } });
      }
      contents.push({ role: "user", parts: parts });
      return {
        path: model.path.replace(":generateContent", ":streamGenerateContent"),
        stream: true,
        body: {
          contents: contents,
          search: supportsSearch(model) && searchToggle.checked,
          web_search: supportsSearch(model) && searchToggle.checked,
          is_networking: supportsSearch(model) && searchToggle.checked,
          thinking: supportsThinking(model) && thinkingToggle.checked,
          enable_thinking: supportsThinking(model) && thinkingToggle.checked,
          reasoning: supportsThinking(model) && thinkingToggle.checked
        }
      };
    }
    if (model.kind === "image") {
      return { path: "/v1/images/generations", stream: false, body: { model: model.id, prompt: prompt, response_format: "url" } };
    }
    return {
      path: "/v1/chat/completions",
      stream: true,
      body: {
        model: model.id,
        messages: messages.concat([{ role: "user", content: userMessageContent(prompt) }]),
        stream: true,
        search: supportsSearch(model) && searchToggle.checked,
        web_search: supportsSearch(model) && searchToggle.checked,
        is_networking: supportsSearch(model) && searchToggle.checked,
        thinking: supportsThinking(model) && thinkingToggle.checked,
        enable_thinking: supportsThinking(model) && thinkingToggle.checked,
        reasoning: supportsThinking(model) && thinkingToggle.checked
      }
    };
  }

  function extractAnswer(model, data) {
    if (model.kind === "gemini" && data.candidates && data.candidates[0]) {
      const parts = data.candidates[0].content && data.candidates[0].content.parts ? data.candidates[0].content.parts : [];
      return parts.map(function(part) { return part.text || ""; }).join("\\n") || JSON.stringify(data, null, 2);
    }
    if (model.kind === "image" && data.data) {
      return "";
    }
    if (data && data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content || "";
    }
    return JSON.stringify(data, null, 2);
  }

  function extractReasoning(model, data) {
    if (data && data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.reasoning_content || "";
    }
    return "";
  }

  function extractMedia(model, data) {
    if (model.kind !== "image" || !data.data) return [];
    return data.data.map(function(item) {
      const url = item.url || item.b64_json;
      return { type: model.kind, url: url };
    }).filter(function(item) {
      return !!item.url;
    });
  }

  function extractSseText(model, data) {
    if (model.kind === "gemini" && data.candidates && data.candidates[0]) {
      const parts = data.candidates[0].content && data.candidates[0].content.parts ? data.candidates[0].content.parts : [];
      return parts.map(function(part) { return part.text || ""; }).join("");
    }
    if (data && data.choices && data.choices[0] && data.choices[0].delta) {
      return data.choices[0].delta.content || "";
    }
    return "";
  }

  function extractSseReasoning(data) {
    if (data && data.choices && data.choices[0] && data.choices[0].delta) {
      return data.choices[0].delta.reasoning_content || "";
    }
    return "";
  }

  async function readSseResponse(response, model, onUpdate) {
    if (!response.body) return { answer: "", reasoning: "" };
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let answer = "";
    let reasoning = "";

    function consumeEvent(block) {
      const dataLines = block.split("\\n").filter(function(line) {
        return line.startsWith("data:");
      }).map(function(line) {
        return line.replace(/^data:\\s?/, "");
      });
      if (!dataLines.length) return;
      const payload = dataLines.join("\\n").trim();
      if (!payload || payload === "[DONE]") return;
      const parsed = JSON.parse(payload);
      const chunk = extractSseText(model, parsed);
      const reasoningChunk = extractSseReasoning(parsed);
      if (chunk) answer += chunk;
      if (reasoningChunk) reasoning += reasoningChunk;
      if (chunk || reasoningChunk) onUpdate({ answer: answer, reasoning: reasoning });
    }

    while (true) {
      const result = await reader.read();
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      const events = buffer.split("\\n\\n");
      buffer = events.pop() || "";
      events.forEach(consumeEvent);
    }
    buffer += decoder.decode();
    if (buffer.trim()) consumeEvent(buffer);
    return { answer: answer, reasoning: reasoning };
  }

  function openDocs() {
    docsDrawer.classList.add("open");
    docsDrawer.setAttribute("aria-hidden", "false");
  }

  function closeDocs() {
    docsDrawer.classList.remove("open");
    docsDrawer.setAttribute("aria-hidden", "true");
  }

  docsButton.addEventListener("click", openDocs);
  modelToggle.addEventListener("click", function() {
    const isOpen = sidebar.classList.toggle("models-open");
    modelToggle.setAttribute("aria-expanded", String(isOpen));
  });
  docsBackdrop.addEventListener("click", closeDocs);
  docsClose.addEventListener("click", closeDocs);
  currentEndpoint.addEventListener("click", copyEndpoint);
  lightbox.addEventListener("click", function(event) {
    if (event.target === lightbox) closeLightbox();
  });
  lightboxClose.addEventListener("click", closeLightbox);
  imageButton.addEventListener("click", function() {
    imageInput.click();
  });
  imageInput.addEventListener("change", function() {
    const file = imageInput.files && imageInput.files[0];
    if (file) attachImageFile(file);
  });

  function handleDrag(event) {
    event.preventDefault();
    if (!supportsAttachment(selectedModel())) return;
    chatShell.classList.add("drag-over");
    composerBox.classList.add("drag-over");
  }

  function clearDrag() {
    chatShell.classList.remove("drag-over");
    composerBox.classList.remove("drag-over");
  }

  function handleDrop(event) {
    event.preventDefault();
    clearDrag();
    const files = Array.from(event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files : []);
    const image = files.find(function(file) { return file.type && file.type.startsWith("image/"); });
    if (image) attachImageFile(image);
  }

  [chatShell, composerBox, promptInput].forEach(function(target) {
    target.addEventListener("dragenter", handleDrag);
    target.addEventListener("dragover", handleDrag);
    target.addEventListener("dragleave", function(event) {
      if (event.currentTarget.contains(event.relatedTarget)) return;
      clearDrag();
    });
    target.addEventListener("drop", handleDrop);
  });

  clearButton.addEventListener("click", resetChat);
  modelSearch.addEventListener("input", renderModelList);
  modelSelect.addEventListener("change", function() {
    selectModel(modelSelect.value);
  });

  promptInput.addEventListener("keydown", function(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      chatForm.requestSubmit();
    }
  });

  chatForm.addEventListener("submit", async function(event) {
    event.preventDefault();
    const prompt = promptInput.value.trim();
    if (!prompt) return;

    const model = selectedModel();
    if (!supportsAttachment(model) && selectedImage) clearImage();
    const request = requestForModel(model, prompt);
    const userContent = userMessageContent(prompt);
    const attachedImage = selectedImage ? selectedImage.dataUrl : null;
    appendMessage("user", prompt, attachedImage ? [{ type: "image", url: attachedImage }] : []);
    promptInput.value = "";
    clearImage();
    sendButton.disabled = true;
    sendButton.textContent = "…";
    const pending = appendMessage("assistant", "正在生成...");

    try {
      const response = await fetch(request.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.body)
      });
      let answer = "";
      if (request.stream && response.ok) {
        setBubbleContent(pending, "", true);
        const streamResult = await readSseResponse(response, model, function(state) {
          setBubbleContent(pending, state.answer, true);
          setReasoningContent(pending, state.reasoning);
          transcript.scrollTop = transcript.scrollHeight;
        });
        answer = streamResult.answer;
        setBubbleContent(pending, answer || "(empty)", true);
        setReasoningContent(pending, streamResult.reasoning);
      } else {
        const raw = await response.text();
        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          data = { message: raw };
        }
        if (!response.ok) {
          throw new Error(data.message || raw || "请求失败");
        }
        answer = extractAnswer(model, data);
        const reasoning = extractReasoning(model, data);
        const media = extractMedia(model, data);
        setBubbleContent(pending, answer || (media.length ? "" : "(empty)"), true);
        setReasoningContent(pending, reasoning);
        appendMedia(pending, media);
      }
      if (model.kind === "chat" || model.kind === "gemini") {
        messages.push({ role: "user", content: userContent });
        messages.push({ role: "assistant", content: answer });
      } else {
        messages.length = 0;
      }
    } catch (err) {
      pending.parentElement.remove();
      appendMessage("error", err instanceof Error ? err.message : String(err));
    } finally {
      sendButton.disabled = false;
      sendButton.textContent = "↑";
      promptInput.focus();
    }
  });

  renderModelOptions();
  renderFilters();
  selectModel(homeData.models[0].id);
  renderDocs();
  resetChat();
</script>
</body>
</html>`;
}

export interface Env extends KimiEnv {
  SIGN_SECRET?: string;
  API_KEYS?: string;
  GLM_REFRESH_TOKEN?: string;
  GEMINI_COOKIE?: string;
  SAPISID?: string;
  GEMINI_BL?: string;
  GEMINI_ORIGIN?: string;
  UPSTREAM_SOCKET?: string;
  RETRY_ATTEMPTS?: string;
  RETRY_DELAY_SEC?: string;
  REQUEST_TIMEOUT_SEC?: string;
  LOG_REQUESTS?: string;
}

const DEFAULT_SIGN_SECRET = "8a1317a7468aa3ad86e997d08f3f31cb";

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ code: -1, message, data: null }, status);
}

function sseResponse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      ...corsHeaders(),
    },
  });
}

const GEMINI_WEB_MODEL_IDS = new Set(Object.keys(GEMINI_WEB_MODELS));
const KIMI_MODEL_SET = new Set<string>([...KIMI_MODEL_IDS]);

function modelIdFromRequestBody(body: any): string {
  const model = typeof body?.model === "string" ? body.model : "";
  return model.replace(/^models\//, "");
}

function isGeminiWebModel(model: string): boolean {
  return GEMINI_WEB_MODEL_IDS.has(model) || GEMINI_WEB_MODEL_IDS.has(model.replace(/^models\//, ""));
}

function isKimiModel(model: string): boolean {
  return KIMI_MODEL_SET.has(model);
}


function cloneJsonRequest(request: Request, body: unknown, path?: string, method = request.method): Request {
  const url = new URL(request.url);
  if (path) url.pathname = path;
  return new Request(url.toString(), {
    method,
    headers: request.headers,
    body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(body),
  });
}

function geminiWebPathFor(path: string, model?: string): string {
  if (path.startsWith("/gemini-web/")) return path.slice("/gemini-web".length) || "/";
  if (path.includes(":generateContent") || path.includes(":streamGenerateContent")) return path;
  if (model && isGeminiWebModel(model) && path.startsWith("/v1beta/")) return path;
  return path;
}

async function callGeminiWeb(request: Request, env: Env, path: string, body?: unknown, method = request.method): Promise<Response> {
  const url = new URL(request.url);
  url.pathname = path;
  const proxied = new Request(url.toString(), {
    method,
    headers: request.headers,
    body: method === "GET" || method === "HEAD" ? undefined : body === undefined ? await request.text() : JSON.stringify(body),
  });
  return geminiWebWorker.fetch(proxied, env, {} as ExecutionContext);
}

function isClaudePath(path: string): boolean {
  return path === "/v1/messages" || path === "/anthropic/v1/messages";
}

async function generateChatGLMSign(secret: string): Promise<{ timestamp: string; nonce: string; sign: string }> {
  const now = Date.now().toString();
  const length = now.length;
  const digits = now.split("").map((char) => Number(char));
  const checksum = (digits.reduce((sum, value) => sum + value, 0) - digits[length - 2]) % 10;
  const timestamp = now.substring(0, length - 2) + checksum + now.substring(length - 1, length);
  const nonce = uuid(false);
  const sign = await md5(`${timestamp}-${nonce}-${secret}`);
  return { timestamp, nonce, sign };
}

async function requestGuestRefreshToken(env: Env): Promise<{ refreshToken: string; accessToken: string; userId: string }> {
  const signSecret = env.SIGN_SECRET || DEFAULT_SIGN_SECRET;
  const sign = await generateChatGLMSign(signSecret);
  const response = await fetch("https://chatglm.cn/chatglm/user-api/guest/access", {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=utf-8",
      "App-Name": "chatglm",
      "X-Device-Id": uuid(false),
      "X-Request-Id": uuid(false),
      "X-App-Platform": "pc",
      "X-App-Version": "0.0.1",
      "X-App-fr": "browser",
      "X-Lang": "zh-CN",
      "X-Exp-Groups": "",
      "X-Device-Model": "",
      "X-Device-Brand": "",
      "X-Timestamp": sign.timestamp,
      "X-Nonce": sign.nonce,
      "X-Sign": sign.sign,
    },
    body: "{}",
  });

  const rawText = await response.text();
  let data: any = null;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`[Neo] guest/access 返回了非 JSON 内容: ${rawText.slice(0, 200)}`);
  }

  const success = data?.status === 0 || data?.code === 0 || data?.message === "success";
  if (!response.ok || !success) {
    throw new Error(`[Neo] 获取游客 token 失败: ${data?.message || response.statusText}`);
  }

  const result = data?.result;
  if (!result?.refresh_token || !result?.access_token || !result?.user_id) {
    throw new Error("[Neo] guest/access 未返回完整 token 信息");
  }

  return {
    refreshToken: result.refresh_token,
    accessToken: result.access_token,
    userId: result.user_id,
  };
}

async function authenticate(env: Env): Promise<string> {
  if (env.GLM_REFRESH_TOKEN) return env.GLM_REFRESH_TOKEN;
  const guest = await requestGuestRefreshToken(env);
  return guest.refreshToken;
}

async function handleChatCompletions(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as any;

  if (!Array.isArray(body.messages)) throw new Error("messages must be an array");

  const requestedModel = modelIdFromRequestBody(body);
  if (isKimiModel(requestedModel)) {
    try {
      return await kimiChatCompletion(env, body);
    } catch (err) {
      if (err instanceof KimiHttpError) return commonJsonResponse({ error: { message: err.message } }, err.status);
      throw err;
    }
  }
  if (isGeminiWebModel(requestedModel)) {
    return callGeminiWeb(request, env, "/v1/chat/completions", body);
  }

  const refreshToken = await authenticate(env);
  const { model, conversation_id: convId, messages, stream, tools, tool_choice } = body;
  const isNetworking = body.search !== false && body.web_search !== false && body.is_networking !== false;
  const isThinking = body.thinking === true || body.enable_thinking === true || body.reasoning === true || body.chat_mode === "zero";
  if (stream) {
    const glmStream = await createCompletionStream(messages, refreshToken, model, convId, 0, tools, isNetworking, isThinking);
    return sseResponse(glmStream);
  } else {
    const result = await createCompletion(messages, refreshToken, model, convId, 0, tools, isNetworking, isThinking);
    return jsonResponse(result);
  }
}

async function handleClaudeMessages(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as any;

  if (!Array.isArray(body.messages)) throw new Error("messages must be an array");


  const refreshToken = await authenticate(env);
  const { model, messages, system, stream, conversation_id: convId, tools } = body;
  const isNetworking = body.search !== false && body.web_search !== false && body.is_networking !== false;
  const isThinking = body.thinking === true || body.enable_thinking === true || body.reasoning === true || body.chat_mode === "zero";
  const result = await createClaudeCompletion(model, messages, system, refreshToken, stream, convId, tools, isNetworking, isThinking);
  if (stream && result instanceof ReadableStream) {
    return sseResponse(result);
  }
  return jsonResponse(result);
}

async function handleGeminiModels(): Promise<Response> {
  const geminiWebModelMap = GEMINI_WEB_MODELS as Record<string, { desc?: string }>;
  const geminiWebModels = Object.keys(geminiWebModelMap).map((id) => ({
    name: `models/${id}`,
    displayName: id,
    description: geminiWebModelMap[id]?.desc || "Gemini Web model",
    inputTokenLimit: 1048576,
    outputTokenLimit: 8192,
    supportedGenerationMethods: ["generateContent", "streamGenerateContent"],
  }));
  return jsonResponse({ models: [...GEMINI_MODELS, ...geminiWebModels] });
}

async function handleGeminiGenerateContent(request: Request, path: string, env: Env): Promise<Response> {
  const body = (await request.json()) as any;

  const modelMatch = path.match(/^\/v1beta\/models\/(.+):generateContent$/);
  const model = modelMatch ? modelMatch[1] : "gemini-pro";
  if (isGeminiWebModel(model)) {
    return callGeminiWeb(request, env, path, body);
  }
  const refreshToken = await authenticate(env);
  const { contents, systemInstruction, conversation_id: convId } = body;
  const isNetworking = body.search !== false && body.web_search !== false && body.is_networking !== false;
  const isThinking = body.thinking === true || body.enable_thinking === true || body.reasoning === true || body.chat_mode === "zero";
  const result = await createGeminiCompletion(model, contents, systemInstruction, refreshToken, false, convId, isNetworking, isThinking);
  return jsonResponse(result);
}

async function handleGeminiStreamGenerateContent(request: Request, path: string, env: Env): Promise<Response> {
  const body = (await request.json()) as any;

  const modelMatch = path.match(/^\/v1beta\/models\/(.+):streamGenerateContent$/);
  const model = modelMatch ? modelMatch[1] : "gemini-pro";
  if (isGeminiWebModel(model)) {
    return callGeminiWeb(request, env, path, body);
  }
  const refreshToken = await authenticate(env);
  const { contents, systemInstruction, conversation_id: convId } = body;
  const isNetworking = body.search !== false && body.web_search !== false && body.is_networking !== false;
  const isThinking = body.thinking === true || body.enable_thinking === true || body.reasoning === true || body.chat_mode === "zero";
  const result = await createGeminiCompletion(model, contents, systemInstruction, refreshToken, true, convId, isNetworking, isThinking);
  if (result instanceof ReadableStream) {
    return sseResponse(result);
  }
  return jsonResponse(result);
}

async function handleImageGenerations(request: Request, env: Env): Promise<Response> {
  const refreshToken = await authenticate(env);
  const body = (await request.json()) as any;

  if (!isString(body.prompt)) throw new Error("prompt must be a string");
  const prompt = body.prompt;
  const responseFormat = defaultTo(body.response_format, "url");
  const assistantId = /^[a-z0-9]{24,}$/.test(body.model) ? body.model : undefined;
  const imageUrls = await generateImages(assistantId, prompt, refreshToken);

  let data: any[];
  if (responseFormat == "b64_json") {
    data = (await Promise.all(imageUrls.map((url: string) => fetchBase64(url)))).map((b64) => ({ b64_json: b64 }));
  } else {
    data = imageUrls.map((url: string) => ({ url }));
  }
  return jsonResponse({ created: unixTimestamp(), data });
}

async function fetchBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return "data:image/png;base64," + btoa(binary);
}

async function handleVideoGenerations(request: Request, env: Env): Promise<Response> {
  const refreshToken = await authenticate(env);
  const body = (await request.json()) as any;

  if (!isString(body.prompt)) throw new Error("prompt must be a string");
  const {
    model,
    conversation_id: convId,
    prompt,
    image_url: imageUrl,
    video_style: videoStyle = "",
    emotional_atmosphere: emotionalAtmosphere = "",
    mirror_mode: mirrorMode = "",
    audio_id: audioId,
  } = body;

  const validStyles = ["卡通3D", "黑白老照片", "油画", "电影感"];
  const validEmotions = ["温馨和谐", "生动活泼", "紧张刺激", "凄凉寂寞"];
  const validMirrors = ["水平", "垂直", "推近", "拉远"];
  if (videoStyle && !validStyles.includes(videoStyle)) throw new Error(`video_style must be one of ${validStyles.join("/")}`);
  if (emotionalAtmosphere && !validEmotions.includes(emotionalAtmosphere)) throw new Error(`emotional_atmosphere must be one of ${validEmotions.join("/")}`);
  if (mirrorMode && !validMirrors.includes(mirrorMode)) throw new Error(`mirror_mode must be one of ${validMirrors.join("/")}`);

  const result = await generateVideos(model, prompt, refreshToken, {
    imageUrl,
    videoStyle,
    emotionalAtmosphere,
    mirrorMode,
    audioId,
  }, convId);
  return jsonResponse({
    created: unixTimestamp(),
    data: result.map((item: any) => ({ url: item.url || item.video_url, cover_url: item.cover_url, duration: item.video_duration, resolution: item.resolution })),
  });
}

async function handleResponses(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as any;
  const model = modelIdFromRequestBody(body);
  if (isGeminiWebModel(model)) {
    return callGeminiWeb(request, env, "/v1/responses", body);
  }

  const chatReq = responsesToChat(body);
  const chatRequest = cloneJsonRequest(request, chatReq, "/v1/chat/completions", "POST");
  if (chatReq.stream) {
    const chatResp = await handleChatCompletions(chatRequest, env);
    if (!chatResp.ok || !chatResp.body) return chatResp;
    return chatSseToResponses(chatResp.body, chatReq.model || "");
  }
  const chatResp = await handleChatCompletions(chatRequest, env);
  if (!chatResp.ok) return chatResp;
  return jsonResponse(chatToResponses(await responseToJson(chatResp)));
}

async function handleModels(): Promise<Response> {
  return jsonResponse({
    object: "list",
    data: MODEL_CATALOG.map((model) => ({
      id: model.id,
      object: "model",
      created: 1700000000,
      owned_by: model.category.toLowerCase().replace(/\s+/g, "-"),
      description: model.description,
    })),
  });
}

// ==================== Main Export ====================

export default {
  async fetch(request: Request, env: Env, _ctx: any): Promise<Response> {
    if (env.SIGN_SECRET) setSignSecret(env.SIGN_SECRET);

    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (path !== "/" && path !== "/ping" && !isAuthorized(request, env)) {
      return commonJsonResponse({ error: { message: "invalid api key" } }, 401);
    }

    try {
      let response: Response;

      if (path === "/" && request.method === "GET") {
        response = new Response(renderHomeHtml(), {
          headers: { "Content-Type": "text/html", ...corsHeaders() },
        });      } else if (path.startsWith("/gemini-web/")) {
        const gwPath = path.slice("/gemini-web".length) || "/";
        response = await callGeminiWeb(request, env, gwPath);
      } else if (path === "/kimi/v1/models" && request.method === "GET") {
        response = listKimiModels();
      } else if (path === "/v1/chat/completions" && request.method === "POST") {
        response = await handleChatCompletions(request, env);
      } else if (path === "/v1/responses" && request.method === "POST") {
        response = await handleResponses(request, env);
      } else if (path === "/v1/messages" && request.method === "POST") {
        response = await handleClaudeMessages(request, env);
      } else if (path === "/v1beta/models" && request.method === "GET") {
        response = await handleGeminiModels();
      } else if (path.match(/^\/v1beta\/models\/[^:]+:generateContent$/) && request.method === "POST") {
        response = await handleGeminiGenerateContent(request, path, env);
      } else if (path.match(/^\/v1beta\/models\/[^:]+:streamGenerateContent$/) && request.method === "POST") {
        response = await handleGeminiStreamGenerateContent(request, path, env);
      } else if (path === "/v1/images/generations" && request.method === "POST") {
        response = await handleImageGenerations(request, env);
      } else if (path === "/v1/videos/generations" && request.method === "POST") {
        response = await handleVideoGenerations(request, env);
      } else if (path === "/v1/models" && request.method === "GET") {
        response = await handleModels();
      } else if (path === "/ping" && request.method === "GET") {
        response = new Response("pong", { headers: corsHeaders() });
      } else {
        const message = `[请求有误]: 正确请求为 POST -> /v1/chat/completions，当前请求为 ${request.method} -> ${path} 请纠正`;
        response = errorResponse(message, 404);
      }

      return response;
    } catch (err: any) {
      console.error(err);
      return errorResponse(err.message || "Internal error", 500);
    }
  },
};
