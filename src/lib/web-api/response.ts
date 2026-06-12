/**
 * Web API 分发结果（JSON 或二进制）
 */

import type { LegadoReturnData } from '@/lib/web-api/return-data';

export type WebApiDispatchResult =
  | { kind: 'json'; payload: LegadoReturnData<unknown> }
  | {
      kind: 'binary';
      contentType: string;
      filename?: string;
      data: Uint8Array;
    };

export function jsonApiResult(payload: LegadoReturnData<unknown>): WebApiDispatchResult {
  return { kind: 'json', payload };
}

export function binaryApiResult(
  data: Uint8Array,
  contentType: string,
  filename?: string,
): WebApiDispatchResult {
  return { kind: 'binary', contentType, filename, data };
}

/** Tauri / Node 桥接序列化 */
export function serializeWebApiDispatchResult(result: WebApiDispatchResult): string {
  if (result.kind === 'json') {
    return JSON.stringify({ kind: 'json', body: JSON.stringify(result.payload) });
  }
  let binary = '';
  for (let i = 0; i < result.data.length; i += 1) {
    binary += String.fromCharCode(result.data[i]!);
  }
  return JSON.stringify({
    kind: 'binary',
    contentType: result.contentType,
    filename: result.filename ?? null,
    base64: btoa(binary),
  });
}

export function deserializeWebApiDispatchResult(raw: string): WebApiDispatchResult {
  const parsed = JSON.parse(raw) as {
    kind?: string;
    body?: string;
    contentType?: string;
    filename?: string | null;
    base64?: string;
  };
  if (parsed.kind === 'binary' && parsed.base64) {
    const bin = atob(parsed.base64);
    const data = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) {
      data[i] = bin.charCodeAt(i);
    }
    return {
      kind: 'binary',
      contentType: parsed.contentType ?? 'application/octet-stream',
      filename: parsed.filename ?? undefined,
      data,
    };
  }
  const body = parsed.body ?? raw;
  return { kind: 'json', payload: JSON.parse(body) as LegadoReturnData<unknown> };
}
