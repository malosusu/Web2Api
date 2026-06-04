export interface BaseEnv {
  API_KEYS?: string;
}

export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };
}

export function jsonResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(), ...extraHeaders },
  });
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: { message }, code: -1, message, data: null }, status);
}

export function sseResponse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...corsHeaders(),
    },
  });
}

export function parseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function readApiKeys(value: string | undefined): string[] {
  if (!value) return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      // Fall through to comma parsing.
    }
  }
  return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
}

export function isAuthorized(request: Request, env: BaseEnv): boolean {
  const keys = readApiKeys(env.API_KEYS);
  if (!keys.length) return true;
  const url = new URL(request.url);
  const auth = request.headers.get("authorization") || "";
  const candidates = [
    auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : null,
    request.headers.get("x-api-key"),
    request.headers.get("api-key"),
    request.headers.get("x-goog-api-key"),
    url.searchParams.get("key"),
  ];
  return candidates.some((key) => !!key && keys.includes(key));
}

export function approxTokens(value: string | null | undefined): number {
  if (!value) return 0;
  return Math.max(1, Math.ceil(value.length / 3));
}

export function normalizeProxyHeaders(headers: Record<string, string> | null | undefined): HeadersInit {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const lower = key.toLowerCase();
    if (["content-length", "transfer-encoding", "content-encoding", "connection"].includes(lower)) continue;
    normalized[key] = String(value);
  }
  return { ...normalized, ...corsHeaders() };
}

export async function responseToJson(response: Response): Promise<any> {
  const text = await response.text();
  const parsed = parseJson(text);
  if (parsed === null) throw new Error(`Expected JSON response, got: ${text.slice(0, 200)}`);
  return parsed;
}
