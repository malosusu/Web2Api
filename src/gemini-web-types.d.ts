declare module "./gemini-web.js" {
  export const MODELS: Record<string, { mode: number; think: number; desc: string; extra?: Record<string, unknown> }>;
  const worker: ExportedHandler<Record<string, unknown>>;
  export default worker;
}
