/**
 * SMIL parse — yt-dlp _parse_smil* subset (video/audio/media/textstream/imagestream).
 */

import type { Format, Subtitle, Thumbnail, VideoInfo } from '../types';
import {
  determine_ext,
  float_or_none,
  int_or_none,
  mimetype2ext,
} from '../utils';
import { attr, findAll, findOne, parseXmlString, tagLocal, text, type XmlDoc, type XmlEl } from './xml';

function joinUrl(base: string, rel: string): string {
  try {
    return new URL(rel, base.endsWith('/') ? base : `${base}/`).toString();
  } catch {
    return rel;
  }
}

export function parseSmilNamespace(smil: XmlDoc | XmlEl): string | null {
  const root =
    (smil as XmlDoc).documentElement != null
      ? (smil as XmlDoc).documentElement!
      : (smil as XmlEl);
  const tag = root.tagName || root.nodeName || '';
  const m = /^\{([^}]+)\}/i.exec(tag);
  if (m) return m[1] || null;
  const ns = root.namespaceURI;
  return ns || null;
}

export function parseSmilSubtitles(
  smil: XmlDoc | string,
  _namespace?: string | null,
  subtitlesLang = 'en',
): Record<string, Subtitle[]> {
  const doc = typeof smil === 'string' ? parseXmlString(smil) : smil;
  const subtitles: Record<string, Subtitle[]> = {};
  const seen = new Set<string>();
  for (const ts of findAll(doc, 'textstream', true)) {
    const src = attr(ts, 'src');
    if (!src || seen.has(src)) continue;
    seen.add(src);
    const ext =
      attr(ts, 'ext') || mimetype2ext(attr(ts, 'type')) || determine_ext(src, 'vtt');
    const lang =
      attr(ts, 'systemLanguage') ||
      attr(ts, 'systemLanguageName') ||
      attr(ts, 'lang') ||
      subtitlesLang;
    if (!subtitles[lang]) subtitles[lang] = [];
    subtitles[lang]!.push({ url: src, ext });
  }
  return subtitles;
}

export type SmilMediaCtx = {
  extractM3u8: (
    url: string,
  ) => Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }>;
  extractMpd: (
    url: string,
  ) => Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }>;
  extractF4m?: (url: string) => Promise<Format[]>;
  extractIsm?: (
    url: string,
  ) => Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }>;
  isValidUrl?: (url: string) => boolean | Promise<boolean>;
  mergeSubtitles: (
    target: Record<string, Subtitle[]>,
    ...dicts: Array<Record<string, Subtitle[]> | undefined>
  ) => void;
};

export async function parseSmilFormatsAndSubtitles(
  smil: XmlDoc | string,
  smilUrl: string,
  videoId?: string,
  ctx?: SmilMediaCtx,
  f4mParams?: Record<string, string> | null,
): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
  const doc = typeof smil === 'string' ? parseXmlString(smil) : smil;
  let base = smilUrl;
  const head = findOne(doc, 'head', true);
  if (head) {
    for (const meta of findAll(head, 'meta', false)) {
      const b = attr(meta, 'base') || attr(meta, 'httpBase');
      if (b) {
        base = b;
        break;
      }
    }
  }

  const formats: Format[] = [];
  const subtitles: Record<string, Subtitle[]> = {};
  const srcs = new Set<string>();
  let rtmpCount = 0;
  let httpCount = 0;
  let m3u8Count = 0;
  let imgsCount = 0;

  const mediaEls = [
    ...findAll(doc, 'video', true),
    ...findAll(doc, 'audio', true),
    ...findAll(doc, 'media', true),
  ];

  for (const medium of mediaEls) {
    const src = attr(medium, 'src');
    if (!src || srcs.has(src)) continue;
    srcs.add(src);

    const bitrate = float_or_none(
      attr(medium, 'system-bitrate') || attr(medium, 'systemBitrate'),
      1000,
    );
    const filesize = int_or_none(attr(medium, 'size') || attr(medium, 'fileSize'));
    const width = int_or_none(attr(medium, 'width'));
    const height = int_or_none(attr(medium, 'height'));
    const proto = attr(medium, 'proto');
    const ext = attr(medium, 'ext');
    const streamer = attr(medium, 'streamer') || base;
    const srcExt = determine_ext(src, '') || ext || '';

    if (proto === 'rtmp' || streamer.startsWith('rtmp')) {
      rtmpCount += 1;
      formats.push({
        url: streamer,
        play_path: src,
        ext: 'flv',
        format_id: `rtmp-${bitrate ?? rtmpCount}`,
        tbr: bitrate,
        filesize,
        width,
        height,
      });
      continue;
    }

    const srcUrl = /^https?:/i.test(src) ? src.trim() : joinUrl(base, src).trim();

    if (proto === 'm3u8' || srcExt === 'm3u8') {
      if (ctx?.extractM3u8) {
        const { formats: m3u8Formats, subtitles: m3u8Subs } = await ctx.extractM3u8(srcUrl);
        ctx.mergeSubtitles(subtitles, m3u8Subs);
        if (m3u8Formats.length === 1) {
          m3u8Count += 1;
          m3u8Formats[0] = {
            ...m3u8Formats[0]!,
            format_id: `hls-${bitrate ?? m3u8Count}`,
            tbr: bitrate ?? m3u8Formats[0]!.tbr,
            width: width ?? m3u8Formats[0]!.width,
            height: height ?? m3u8Formats[0]!.height,
          };
        }
        formats.push(...m3u8Formats);
      } else {
        formats.push({
          format_id: `hls-${bitrate ?? ++m3u8Count}`,
          url: srcUrl,
          ext: ext || 'mp4',
          protocol: 'm3u8_native',
          tbr: bitrate,
          width,
          height,
        });
      }
    } else if (srcExt === 'f4m' && ctx?.extractF4m) {
      let f4mUrl = srcUrl;
      const params = f4mParams || { hdcore: '3.2.0', plugin: 'flowplayer-3.2.0.1' };
      const qs = new URLSearchParams(params).toString();
      f4mUrl += (f4mUrl.includes('?') ? '&' : '?') + qs;
      formats.push(...(await ctx.extractF4m(f4mUrl)));
    } else if (srcExt === 'mpd' && ctx?.extractMpd) {
      const { formats: mpdFormats, subtitles: mpdSubs } = await ctx.extractMpd(srcUrl);
      formats.push(...mpdFormats);
      ctx.mergeSubtitles(subtitles, mpdSubs);
    } else if (/\.ism\/[Mm]anifest/.test(srcUrl) && ctx?.extractIsm) {
      const { formats: ismFormats, subtitles: ismSubs } = await ctx.extractIsm(srcUrl);
      formats.push(...ismFormats);
      ctx.mergeSubtitles(subtitles, ismSubs);
    } else if (/^https?:/i.test(srcUrl)) {
      const ok = ctx?.isValidUrl ? await ctx.isValidUrl(src) : true;
      if (ok) {
        httpCount += 1;
        formats.push({
          url: srcUrl,
          ext: ext || srcExt || 'flv',
          format_id: `http-${bitrate || httpCount}`,
          tbr: bitrate,
          filesize,
          width,
          height,
        });
      }
    }
  }

  for (const medium of findAll(doc, 'imagestream', true)) {
    const src = attr(medium, 'src');
    if (!src || srcs.has(src)) continue;
    srcs.add(src);
    imgsCount += 1;
    formats.push({
      format_id: `imagestream-${imgsCount}`,
      url: src,
      ext: mimetype2ext(attr(medium, 'type')) || 'jpg',
      acodec: 'none',
      vcodec: 'none',
      width: int_or_none(attr(medium, 'width')),
      height: int_or_none(attr(medium, 'height')),
      format_note: 'SMIL storyboards',
    });
  }

  // also <ref href=...>
  for (const ref of findAll(doc, 'ref', true)) {
    const href = attr(ref, 'href') || attr(ref, 'src');
    if (!href || srcs.has(href)) continue;
    srcs.add(href);
    const abs = joinUrl(base, href);
    if (/\.m3u8/i.test(abs) && ctx?.extractM3u8) {
      const { formats: m3u8Formats, subtitles: m3u8Subs } = await ctx.extractM3u8(abs);
      formats.push(...m3u8Formats);
      ctx.mergeSubtitles(subtitles, m3u8Subs);
    } else {
      formats.push({
        format_id: `smil-ref-${formats.length}`,
        url: abs,
        ext: determine_ext(abs, 'mp4'),
      });
    }
  }

  const smilSubs = parseSmilSubtitles(doc);
  if (ctx) ctx.mergeSubtitles(subtitles, smilSubs);
  else Object.assign(subtitles, smilSubs);

  void videoId;
  return { formats, subtitles };
}

export async function parseSmilInfo(
  smil: XmlDoc | string,
  smilUrl: string,
  videoId?: string,
  ctx?: SmilMediaCtx,
  f4mParams?: Record<string, string> | null,
): Promise<Partial<VideoInfo> & { formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
  const doc = typeof smil === 'string' ? parseXmlString(smil) : smil;
  const { formats, subtitles } = await parseSmilFormatsAndSubtitles(
    doc,
    smilUrl,
    videoId,
    ctx,
    f4mParams,
  );

  let id = videoId;
  try {
    const base = new URL(smilUrl).pathname.split('/').pop() || '';
    id = id || base.replace(/\.[^.]+$/, '') || 'smil';
  } catch {
    id = id || 'smil';
  }

  let title: string | null = null;
  let description: string | null = null;
  let uploadDate: string | null = null;
  const head = findOne(doc, 'head', true);
  if (head) {
    for (const meta of findAll(head, 'meta', false)) {
      const name = attr(meta, 'name');
      const content = attr(meta, 'content');
      if (!name || !content) continue;
      if (!title && name === 'title') title = content;
      else if (!description && (name === 'description' || name === 'abstract')) description = content;
      else if (!uploadDate && name === 'date') uploadDate = content;
    }
  }

  const thumbnails: Thumbnail[] = [];
  for (const image of findAll(doc, 'image', true)) {
    const src = attr(image, 'src');
    if (!src) continue;
    thumbnails.push({
      id: attr(image, 'type') || undefined,
      url: src,
      width: int_or_none(attr(image, 'width')) ?? undefined,
      height: int_or_none(attr(image, 'height')) ?? undefined,
    });
  }

  return {
    id,
    title: title || id,
    description: description || undefined,
    upload_date: uploadDate || undefined,
    thumbnails: thumbnails.length ? thumbnails : undefined,
    formats,
    subtitles,
  };
}

export function parseSmilXmlString(xml: string): XmlDoc {
  return parseXmlString(xml);
}

export { tagLocal, text };
