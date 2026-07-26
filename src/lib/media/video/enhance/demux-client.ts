/**
 * Rust demux HTTP 客户端（门禁 B）
 * @see docs/VIDEO_WEB_ENHANCE.md
 */

export type DemuxOpenResult = {
  sessionId: number;
  videoCodec: string;
  audioCodec: string;
  codedWidth: number;
  codedHeight: number;
  descriptionB64?: string;
  baseUrl: string;
  /** 服务端回传的实际起始 PTS（seek 后重锚用） */
  actualStartPts?: number;
};

export async function ensureDemuxServer(): Promise<{
  available: boolean;
  baseUrl: string | null;
  detail: string;
}> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const st = await invoke<{
      available: boolean;
      detail: string;
      baseUrl?: string | null;
    }>('video_demux_ensure');
    return {
      available: !!st.available,
      baseUrl: st.baseUrl ?? null,
      detail: st.detail,
    };
  } catch (e) {
    return {
      available: false,
      baseUrl: null,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function demuxOpen(path: string): Promise<DemuxOpenResult> {
  const st = await ensureDemuxServer();
  if (!st.available || !st.baseUrl) {
    throw new Error(st.detail || 'demux unavailable');
  }
  const url = `${st.baseUrl}/demux/open?path=${encodeURIComponent(path)}`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error(`demux open ${res.status}`);
  const j = (await res.json()) as Record<string, unknown>;
  return {
    sessionId: Number(j.sessionId),
    videoCodec: String(j.videoCodec ?? ''),
    audioCodec: String(j.audioCodec ?? ''),
    codedWidth: Number(j.codedWidth ?? 0),
    codedHeight: Number(j.codedHeight ?? 0),
    descriptionB64: j.descriptionB64 ? String(j.descriptionB64) : undefined,
    baseUrl: st.baseUrl,
  };
}

/**
 * 拉视频样本；响应头 X-Actual-Pts 为 snap 后关键帧 PTS。
 * body：f64 LE actual_pts + u32 LE len + payload
 */
export async function demuxPullVideo(
  baseUrl: string,
  sessionId: number,
  fromPts: number,
  signal?: AbortSignal,
): Promise<{ actualPts: number; data: Uint8Array }> {
  const res = await fetch(
    `${baseUrl}/demux/${sessionId}/video?from_pts=${encodeURIComponent(String(fromPts))}`,
    { signal },
  );
  if (!res.ok) throw new Error(`demux video ${res.status}`);
  const headerPts = res.headers.get('X-Actual-Pts');
  const buf = new Uint8Array(await res.arrayBuffer());
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const actualPts = headerPts != null ? Number(headerPts) : view.getFloat64(0, true);
  const len = view.getUint32(8, true);
  const data = buf.subarray(12, 12 + len);
  return { actualPts, data };
}

/** 音频：精确 from_pts 裁剪（协议与视频同构） */
export async function demuxPullAudio(
  baseUrl: string,
  sessionId: number,
  fromPts: number,
  signal?: AbortSignal,
): Promise<{ actualPts: number; data: Uint8Array }> {
  const res = await fetch(
    `${baseUrl}/demux/${sessionId}/audio?from_pts=${encodeURIComponent(String(fromPts))}`,
    { signal },
  );
  if (!res.ok) throw new Error(`demux audio ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const actualPts = view.getFloat64(0, true);
  const len = view.getUint32(8, true);
  const data = buf.subarray(12, 12 + len);
  return { actualPts, data };
}
