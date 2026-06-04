/**
 * 通用工具函数（替代原项目的 util.ts + lodash 常用功能）
 */

export function uuid(separator = true): string {
  const id = crypto.randomUUID();
  return separator ? id : id.replace(/-/g, "");
}

function rotateLeft(value: number, shift: number): number {
  return (value << shift) | (value >>> (32 - shift));
}

function addUnsigned(a: number, b: number): number {
  return (a + b) >>> 0;
}

function md5Round(
  fn: (b: number, c: number, d: number) => number,
  a: number,
  b: number,
  c: number,
  d: number,
  x: number,
  shift: number,
  constant: number
): number {
  return addUnsigned(rotateLeft(addUnsigned(addUnsigned(a, fn(b, c, d)), addUnsigned(x, constant)), shift), b);
}

function bytesToMd5Words(bytes: Uint8Array): number[] {
  const bitLength = bytes.length * 8;
  const paddedLength = (((bytes.length + 8) >>> 6) + 1) * 16;
  const words = new Array<number>(paddedLength).fill(0);

  for (let i = 0; i < bytes.length; i++) {
    words[i >>> 2] |= bytes[i] << ((i % 4) * 8);
  }

  words[bytes.length >>> 2] |= 0x80 << ((bytes.length % 4) * 8);
  words[paddedLength - 2] = bitLength >>> 0;
  words[paddedLength - 1] = Math.floor(bitLength / 0x100000000);
  return words;
}

function wordToHex(value: number): string {
  let hex = "";
  for (let i = 0; i < 4; i++) {
    hex += ((value >>> (i * 8)) & 0xff).toString(16).padStart(2, "0");
  }
  return hex;
}

export async function md5(text: string): Promise<string> {
  const words = bytesToMd5Words(new TextEncoder().encode(text));
  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  const f = (x: number, y: number, z: number) => (x & y) | (~x & z);
  const g = (x: number, y: number, z: number) => (x & z) | (y & ~z);
  const h = (x: number, y: number, z: number) => x ^ y ^ z;
  const i = (x: number, y: number, z: number) => y ^ (x | ~z);

  for (let offset = 0; offset < words.length; offset += 16) {
    const aa = a;
    const bb = b;
    const cc = c;
    const dd = d;

    a = md5Round(f, a, b, c, d, words[offset + 0], 7, 0xd76aa478);
    d = md5Round(f, d, a, b, c, words[offset + 1], 12, 0xe8c7b756);
    c = md5Round(f, c, d, a, b, words[offset + 2], 17, 0x242070db);
    b = md5Round(f, b, c, d, a, words[offset + 3], 22, 0xc1bdceee);
    a = md5Round(f, a, b, c, d, words[offset + 4], 7, 0xf57c0faf);
    d = md5Round(f, d, a, b, c, words[offset + 5], 12, 0x4787c62a);
    c = md5Round(f, c, d, a, b, words[offset + 6], 17, 0xa8304613);
    b = md5Round(f, b, c, d, a, words[offset + 7], 22, 0xfd469501);
    a = md5Round(f, a, b, c, d, words[offset + 8], 7, 0x698098d8);
    d = md5Round(f, d, a, b, c, words[offset + 9], 12, 0x8b44f7af);
    c = md5Round(f, c, d, a, b, words[offset + 10], 17, 0xffff5bb1);
    b = md5Round(f, b, c, d, a, words[offset + 11], 22, 0x895cd7be);
    a = md5Round(f, a, b, c, d, words[offset + 12], 7, 0x6b901122);
    d = md5Round(f, d, a, b, c, words[offset + 13], 12, 0xfd987193);
    c = md5Round(f, c, d, a, b, words[offset + 14], 17, 0xa679438e);
    b = md5Round(f, b, c, d, a, words[offset + 15], 22, 0x49b40821);

    a = md5Round(g, a, b, c, d, words[offset + 1], 5, 0xf61e2562);
    d = md5Round(g, d, a, b, c, words[offset + 6], 9, 0xc040b340);
    c = md5Round(g, c, d, a, b, words[offset + 11], 14, 0x265e5a51);
    b = md5Round(g, b, c, d, a, words[offset + 0], 20, 0xe9b6c7aa);
    a = md5Round(g, a, b, c, d, words[offset + 5], 5, 0xd62f105d);
    d = md5Round(g, d, a, b, c, words[offset + 10], 9, 0x02441453);
    c = md5Round(g, c, d, a, b, words[offset + 15], 14, 0xd8a1e681);
    b = md5Round(g, b, c, d, a, words[offset + 4], 20, 0xe7d3fbc8);
    a = md5Round(g, a, b, c, d, words[offset + 9], 5, 0x21e1cde6);
    d = md5Round(g, d, a, b, c, words[offset + 14], 9, 0xc33707d6);
    c = md5Round(g, c, d, a, b, words[offset + 3], 14, 0xf4d50d87);
    b = md5Round(g, b, c, d, a, words[offset + 8], 20, 0x455a14ed);
    a = md5Round(g, a, b, c, d, words[offset + 13], 5, 0xa9e3e905);
    d = md5Round(g, d, a, b, c, words[offset + 2], 9, 0xfcefa3f8);
    c = md5Round(g, c, d, a, b, words[offset + 7], 14, 0x676f02d9);
    b = md5Round(g, b, c, d, a, words[offset + 12], 20, 0x8d2a4c8a);

    a = md5Round(h, a, b, c, d, words[offset + 5], 4, 0xfffa3942);
    d = md5Round(h, d, a, b, c, words[offset + 8], 11, 0x8771f681);
    c = md5Round(h, c, d, a, b, words[offset + 11], 16, 0x6d9d6122);
    b = md5Round(h, b, c, d, a, words[offset + 14], 23, 0xfde5380c);
    a = md5Round(h, a, b, c, d, words[offset + 1], 4, 0xa4beea44);
    d = md5Round(h, d, a, b, c, words[offset + 4], 11, 0x4bdecfa9);
    c = md5Round(h, c, d, a, b, words[offset + 7], 16, 0xf6bb4b60);
    b = md5Round(h, b, c, d, a, words[offset + 10], 23, 0xbebfbc70);
    a = md5Round(h, a, b, c, d, words[offset + 13], 4, 0x289b7ec6);
    d = md5Round(h, d, a, b, c, words[offset + 0], 11, 0xeaa127fa);
    c = md5Round(h, c, d, a, b, words[offset + 3], 16, 0xd4ef3085);
    b = md5Round(h, b, c, d, a, words[offset + 6], 23, 0x04881d05);
    a = md5Round(h, a, b, c, d, words[offset + 9], 4, 0xd9d4d039);
    d = md5Round(h, d, a, b, c, words[offset + 12], 11, 0xe6db99e5);
    c = md5Round(h, c, d, a, b, words[offset + 15], 16, 0x1fa27cf8);
    b = md5Round(h, b, c, d, a, words[offset + 2], 23, 0xc4ac5665);

    a = md5Round(i, a, b, c, d, words[offset + 0], 6, 0xf4292244);
    d = md5Round(i, d, a, b, c, words[offset + 7], 10, 0x432aff97);
    c = md5Round(i, c, d, a, b, words[offset + 14], 15, 0xab9423a7);
    b = md5Round(i, b, c, d, a, words[offset + 5], 21, 0xfc93a039);
    a = md5Round(i, a, b, c, d, words[offset + 12], 6, 0x655b59c3);
    d = md5Round(i, d, a, b, c, words[offset + 3], 10, 0x8f0ccc92);
    c = md5Round(i, c, d, a, b, words[offset + 10], 15, 0xffeff47d);
    b = md5Round(i, b, c, d, a, words[offset + 1], 21, 0x85845dd1);
    a = md5Round(i, a, b, c, d, words[offset + 8], 6, 0x6fa87e4f);
    d = md5Round(i, d, a, b, c, words[offset + 15], 10, 0xfe2ce6e0);
    c = md5Round(i, c, d, a, b, words[offset + 6], 15, 0xa3014314);
    b = md5Round(i, b, c, d, a, words[offset + 13], 21, 0x4e0811a1);
    a = md5Round(i, a, b, c, d, words[offset + 4], 6, 0xf7537e82);
    d = md5Round(i, d, a, b, c, words[offset + 11], 10, 0xbd3af235);
    c = md5Round(i, c, d, a, b, words[offset + 2], 15, 0x2ad7d2bb);
    b = md5Round(i, b, c, d, a, words[offset + 9], 21, 0xeb86d391);

    a = addUnsigned(a, aa);
    b = addUnsigned(b, bb);
    c = addUnsigned(c, cc);
    d = addUnsigned(d, dd);
  }

  return wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d);
}

export function unixTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

export function timestamp(): number {
  return Date.now();
}

export function encodeBASE64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function decodeBASE64(str: string): string {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export async function fetchFileBASE64(url: string): Promise<string> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function isBASE64Data(value: string): boolean {
  return typeof value === "string" && /^data:/.test(value);
}

export function extractBASE64DataFormat(value: string): string | null {
  const match = value.trim().match(/^data:(.+);base64,/);
  return match ? match[1] : null;
}

export function removeBASE64DataHeader(value: string): string {
  return value.replace(/^data:(.+);base64,/, "");
}

export function buildDataBASE64(type: string, ext: string, buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${type}/${ext.replace("jpg", "jpeg")};base64,${btoa(binary)}`;
}

const MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  pdf: "application/pdf",
  txt: "text/plain",
  json: "application/json",
  html: "text/html",
};

export function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return MIME_MAP[ext] || "application/octet-stream";
}

export function getExtension(mimeType: string): string | null {
  for (const [ext, mime] of Object.entries(MIME_MAP)) {
    if (mime === mimeType) return ext;
  }
  return null;
}

export function basename(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return pathname.split("/").pop() || "unknown";
  } catch {
    return "unknown";
  }
}

export function urlJoin(...values: string[]): string {
  let url = "";
  for (let i = 0; i < values.length; i++) {
    url += `${i > 0 ? "/" : ""}${values[i].replace(/^\/*/, "").replace(/\/*$/, "")}`;
  }
  return url;
}

export function isURL(value: any): boolean {
  return typeof value === "string" && /^(http|https)/.test(value);
}

export function randomChoice<T>(arr: T[]): T | undefined {
  if (!arr || arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 轻量类型判断（替代 lodash）
export function isString(value: any): boolean {
  return typeof value === "string";
}

export function isArray(value: any): boolean {
  return Array.isArray(value);
}

export function isObject(value: any): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isUndefined(value: any): boolean {
  return value === undefined;
}

export function isNumber(value: any): boolean {
  return typeof value === "number" && !isNaN(value);
}

export function isFiniteNumber(value: any): boolean {
  return isNumber(value) && isFinite(value);
}

export function isFunction(value: any): boolean {
  return typeof value === "function";
}

export function defaultTo<T>(value: T | undefined | null, defaultValue: T): T {
  return value == null ? defaultValue : value;
}

export function get(obj: any, path: string): any {
  return path.split(".").reduce((o, k) => o?.[k], obj);
}

export function pickBy(obj: any, predicate: (value: any, key: string) => boolean): any {
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (predicate(value, key)) result[key] = value;
  }
  return result;
}

export function attempt<T>(fn: () => T): T | Error {
  try {
    return fn();
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err));
  }
}

export function isError(value: any): boolean {
  return value instanceof Error;
}
