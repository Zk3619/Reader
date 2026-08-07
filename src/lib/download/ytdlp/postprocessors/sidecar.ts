/**
 * Sidecar writers �?subtitles / thumbnail / description beside media.
 */

import type { PostProcessorContext, PostProcessorResult, Subtitle, VideoInfo } from '../types';
import { PostProcessorBase } from './base';

import { downloadBinaryProxyArgs } from '@/lib/http/download-binary-proxy';
function stemPath(path: string): string {
  return path.replace(/\.[^.\\/]+$/, '');
}

async function writeTextBeside(basePath: string, suffix: string, text: string): Promise<string | null> {
  const out = `${stemPath(basePath)}${suffix}`;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('write_binary_file', {
      path: out,
      data: Array.from(new TextEncoder().encode(text)),
    });
    return out;
  } catch (e) {
    console.warn(`[sidecar] write ${suffix}: ${(e as Error).message || e}`);
    return null;
  }
}

async function writeBytesBeside(basePath: string, suffix: string, data: Uint8Array): Promise<string | null> {
  const out = `${stemPath(basePath)}${suffix}`;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('write_binary_file', { path: out, data: Array.from(data) });
    return out;
  } catch (e) {
    console.warn(`[sidecar] write ${suffix}: ${(e as Error).message || e}`);
    return null;
  }
}

async function fetchBinary(url: string): Promise<Uint8Array | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const r = await invoke<{ data: number[]; status: number }>('download_binary', {
      url,
      method: 'GET',
      headers: {},
      body: null,
      timeoutMs: 30000,
      useOkhttpUserAgent: false,
      ...downloadBinaryProxyArgs(),
    });
    if (r.status >= 400) return null;
    return new Uint8Array(r.data);
  } catch {
    if (typeof fetch === 'function') {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return new Uint8Array(await res.arrayBuffer());
      } catch {
        return null;
      }
    }
    return null;
  }
}

function pickSubtitles(info: VideoInfo): Array<{ lang: string; sub: Subtitle }> {
  const requested = info.requested_subtitles;
  if (requested && typeof requested === 'object') {
    return Object.entries(requested).map(([lang, sub]) => ({ lang, sub }));
  }
  const subs = info.subtitles || {};
  const out: Array<{ lang: string; sub: Subtitle }> = [];
  for (const [lang, list] of Object.entries(subs)) {
    const first = Array.isArray(list) ? list[0] : undefined;
    if (first) out.push({ lang, sub: first });
  }
  return out.slice(0, 8);
}

export class WriteDescriptionPP extends PostProcessorBase {
  name = 'WriteDescription';
  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    const path = ctx.filename || ctx.info._filename;
    const desc = ctx.info.description;
    if (!path || !desc) return { info: ctx.info, filename: ctx.filename };
    const written = await writeTextBeside(path, '.description', String(desc));
    if (written) (ctx.info as VideoInfo & { _description_filename?: string })._description_filename = written;
    return { info: ctx.info, filename: ctx.filename };
  }
}

export class WriteThumbnailPP extends PostProcessorBase {
  name = 'WriteThumbnail';
  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    const path = ctx.filename || ctx.info._filename;
    if (!path) return { info: ctx.info, filename: ctx.filename };
    const url =
      ctx.info.thumbnail ||
      ctx.info.thumbnails?.slice().sort((a, b) => (b.preference || 0) - (a.preference || 0))[0]?.url;
    if (!url) return { info: ctx.info, filename: ctx.filename };
    const bytes = await fetchBinary(url);
    if (!bytes) return { info: ctx.info, filename: ctx.filename };
    const ext = /\.webp(\?|$)/i.test(url) ? '.webp' : /\.png(\?|$)/i.test(url) ? '.png' : '.jpg';
    const written = await writeBytesBeside(path, ext, bytes);
    if (written) (ctx.info as VideoInfo & { _thumbnail_filename?: string })._thumbnail_filename = written;
    return { info: ctx.info, filename: ctx.filename };
  }
}

export class WriteSubtitlesPP extends PostProcessorBase {
  name = 'WriteSubtitles';
  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    const path = ctx.filename || ctx.info._filename;
    if (!path) return { info: ctx.info, filename: ctx.filename };
    const picks = pickSubtitles(ctx.info);
    const written: string[] = [];
    for (const { lang, sub } of picks) {
      let text = sub.data;
      if (!text && sub.url) {
        const bytes = await fetchBinary(sub.url);
        if (bytes) text = new TextDecoder().decode(bytes);
      }
      if (!text) continue;
      const ext = (sub.ext || 'vtt').replace(/^\./, '');
      const out = await writeTextBeside(path, `.${lang}.${ext}`, text);
      if (out) written.push(out);
    }
    if (written.length) {
      (ctx.info as VideoInfo & { _subtitle_files?: string[] })._subtitle_files = written;
    }
    return { info: ctx.info, filename: ctx.filename };
  }
}

/** Run enabled sidecar writers for an info dict (called from YoutubeDL.process_video_result). */
export async function writeSidecars(info: VideoInfo, options: PostProcessorContext['options']): Promise<void> {
  const filename = info._filename;
  if (!filename) return;
  const ctx = { info, filename, options };
  if (options.writedescription) await new WriteDescriptionPP().run(ctx);
  if (options.writethumbnail) await new WriteThumbnailPP().run(ctx);
  if (options.writesubtitles || options.writeautomaticsub) await new WriteSubtitlesPP().run(ctx);
}
