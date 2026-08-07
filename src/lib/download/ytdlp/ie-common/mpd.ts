/**
 * MPD/DASH period parse — yt-dlp _parse_mpd_periods subset with SegmentTemplate/List.
 */

import type { Format, Subtitle } from '../types';
import {
  determine_ext,
  float_or_none,
  int_or_none,
  mimetype2ext,
  parse_codecs,
  parse_duration,
} from '../utils';
import {
  attr,
  findAll,
  findOne,
  parseXmlString,
  tagLocal,
  text,
  type XmlDoc,
  type XmlEl,
} from './xml';

export interface MpdPeriod {
  id: string;
  formats: Format[];
  subtitles: Record<string, Subtitle[]>;
}

type MsInfo = {
  start_number: number;
  timescale: number;
  total_number?: number;
  segment_duration?: number;
  media?: string;
  initialization?: string;
  initialization_url?: string;
  segment_urls?: string[];
  s?: Array<{ t: number; d: number; r: number }>;
};

function joinUrl(base: string, rel: string): string {
  try {
    return new URL(rel, base.endsWith('/') ? base : `${base}/`).toString();
  } catch {
    return rel;
  }
}

function prepareTemplate(tmpl: string, representationId: string | null, bandwidth?: number): string {
  let t = tmpl;
  if (representationId != null) t = t.replace(/\$RepresentationID\$/g, representationId);
  if (bandwidth != null) t = t.replace(/\$Bandwidth\$/g, String(bandwidth));
  // Escape bare % outside $...$
  let out = '';
  let inT = false;
  for (const c of t) {
    out += c;
    if (c === '$') inT = !inT;
    else if (c === '%' && !inT) out += '%';
  }
  out = out
    .replace(/\$Number(?:%([^$]+))?\$/g, (_m, fmt) => `%${fmt || 'd'}`)
    .replace(/\$Time(?:%([^$]+))?\$/g, (_m, fmt) => `%${fmt || 'd'}`)
    .replace(/\$\$/g, '$');
  return out;
}

function formatNumber(template: string, n: number): string {
  // Support %d / %05d style after prepareTemplate
  return template.replace(/%0?(\d*)d/g, (_m, width) => {
    const w = Number(width) || 0;
    const s = String(n);
    return w > 0 ? s.padStart(w, '0') : s;
  });
}

function extractMsInfo(el: XmlEl, parent: MsInfo): MsInfo {
  const ms: MsInfo = { ...parent };
  const segList = findOne(el, 'SegmentList', false);
  const segTpl = findOne(el, 'SegmentTemplate', false);
  const source = segList || segTpl;
  if (!source) return ms;

  const timeline = findOne(source, 'SegmentTimeline', true);
  if (timeline) {
    ms.total_number = 0;
    ms.s = [];
    for (const s of findAll(timeline, 'S', false)) {
      const r = int_or_none(attr(s, 'r')) || 0;
      const d = int_or_none(attr(s, 'd')) || 0;
      const t = int_or_none(attr(s, 't')) || 0;
      ms.total_number! += 1 + r;
      ms.s.push({ t, d, r });
    }
  }
  const startNumber = attr(source, 'startNumber');
  if (startNumber) ms.start_number = int_or_none(startNumber) || 1;
  const timescale = attr(source, 'timescale');
  if (timescale) ms.timescale = int_or_none(timescale) || 1;
  const dur = attr(source, 'duration');
  if (dur) ms.segment_duration = float_or_none(dur) ?? undefined;

  if (segList) {
    const init = findOne(segList, 'Initialization', false);
    if (init && attr(init, 'sourceURL')) ms.initialization_url = attr(init, 'sourceURL')!;
    const urls = findAll(segList, 'SegmentURL', false)
      .map((u) => attr(u, 'media'))
      .filter(Boolean) as string[];
    if (urls.length) ms.segment_urls = urls;
  } else if (segTpl) {
    const media = attr(segTpl, 'media');
    if (media) ms.media = media;
    const initialization = attr(segTpl, 'initialization');
    if (initialization) ms.initialization = initialization;
    else {
      const init = findOne(segTpl, 'Initialization', false);
      if (init && attr(init, 'sourceURL')) ms.initialization_url = attr(init, 'sourceURL')!;
    }
  }
  return ms;
}

function buildFragments(
  ms: MsInfo,
  baseUrl: string,
  representationId: string | null,
  bandwidth?: number,
): Format['fragments'] {
  const frags: NonNullable<Format['fragments']> = [];
  if (ms.initialization || ms.initialization_url) {
    const initTpl = ms.initialization
      ? prepareTemplate(ms.initialization, representationId, bandwidth)
      : ms.initialization_url!;
    frags.push({ url: joinUrl(baseUrl, formatNumber(initTpl, ms.start_number)) });
  }
  if (ms.segment_urls?.length) {
    for (const u of ms.segment_urls) {
      frags.push({ url: joinUrl(baseUrl, u) });
    }
    return frags;
  }
  if (ms.media) {
    const mediaTpl = prepareTemplate(ms.media, representationId, bandwidth);
    if (ms.s?.length) {
      let number = ms.start_number;
      let time = ms.s[0]?.t ?? 0;
      for (const s of ms.s) {
        for (let i = 0; i <= s.r; i++) {
          let url = mediaTpl
            .replace(/%d/g, String(number))
            .replace(/%0(\d+)d/g, (_m, w) => String(number).padStart(Number(w), '0'));
          if (url.includes('%') && /Time|time/.test(ms.media!)) {
            url = formatNumber(
              prepareTemplate(ms.media!, representationId, bandwidth).replace(
                /\$Time[^$]*\$|%d/,
                String(time),
              ),
              number,
            );
          }
          // Simpler: replace $Number$ leftovers
          url = url
            .replace(/\$Number\$/g, String(number))
            .replace(/\$Time\$/g, String(time));
          frags.push({
            url: joinUrl(baseUrl, url.includes('://') ? url : formatNumber(mediaTpl, number)),
            duration: s.d / (ms.timescale || 1),
          });
          number += 1;
          time += s.d;
        }
      }
    } else {
      const count = ms.total_number || 1;
      for (let i = 0; i < count; i++) {
        const n = ms.start_number + i;
        frags.push({ url: joinUrl(baseUrl, formatNumber(mediaTpl, n)) });
      }
    }
  }
  return frags.length ? frags : undefined;
}

function resolveBaseUrl(
  nodes: Array<XmlEl | null | undefined>,
  mpdBaseUrl: string,
): string {
  let base = '';
  for (const el of nodes) {
    if (!el) continue;
    const b = findOne(el, 'BaseURL', false);
    const t = text(b);
    if (t) {
      base = t + base;
      if (/^https?:\/\//i.test(base)) break;
    }
  }
  if (!base) return mpdBaseUrl;
  if (/^https?:\/\//i.test(base)) return base;
  return joinUrl(mpdBaseUrl, base);
}

function isDrm(el: XmlEl): boolean {
  return findAll(el, 'ContentProtection', true).length > 0;
}

export function parseMpdPeriods(
  mpdDoc: XmlDoc | string,
  mpdId?: string,
  mpdBaseUrl = '',
  mpdUrl?: string,
  opts?: { dynamicMpd?: boolean },
): MpdPeriod[] {
  const doc = typeof mpdDoc === 'string' ? parseXmlString(mpdDoc) : mpdDoc;
  const root = doc.documentElement;
  if (!root || tagLocal(root).toLowerCase() !== 'mpd') {
    // still try
  }
  if (opts?.dynamicMpd === false && attr(root, 'type') === 'dynamic') {
    return [];
  }

  const mpdDuration = parse_duration(attr(root, 'mediaPresentationDuration'));
  const periods: MpdPeriod[] = [];
  const periodEls = findAll(root || doc, 'Period', true).filter(
    (el) => tagLocal(el.parentNode as XmlEl) === 'MPD' || el.parentNode === root,
  );
  // Fallback: all Period elements
  const periodList = periodEls.length ? periodEls : findAll(doc, 'Period', true);

  periodList.forEach((period, periodIdx) => {
    const entry: MpdPeriod = {
      id: attr(period, 'id') || `period-${periodIdx}`,
      formats: [],
      subtitles: {},
    };
    const periodDuration = parse_duration(attr(period, 'duration')) || mpdDuration;
    let periodMs = extractMsInfo(period, { start_number: 1, timescale: 1 });

    for (const adaptation of findAll(period, 'AdaptationSet', false)) {
      const adaptMs = extractMsInfo(adaptation, periodMs);
      for (const representation of findAll(adaptation, 'Representation', false)) {
        const mime =
          attr(representation, 'mimeType') ||
          attr(adaptation, 'mimeType') ||
          'application/octet-stream';
        let contentType =
          attr(representation, 'contentType') ||
          attr(adaptation, 'contentType') ||
          mime.split('/')[0] ||
          '';
        const codecStr = attr(representation, 'codecs') || attr(adaptation, 'codecs') || '';
        const codecs = parse_codecs(codecStr);
        if (!['video', 'audio', 'text'].includes(contentType)) {
          if (codecs.vcodec && codecs.vcodec !== 'none') contentType = 'video';
          else if (codecs.acodec && codecs.acodec !== 'none') contentType = 'audio';
          else if (['tt', 'ttml', 'xml', 'vtt', 'json'].includes(mimetype2ext(mime) || ''))
            contentType = 'text';
          else continue;
        }

        const baseUrl = resolveBaseUrl(
          [representation, adaptation, period, root],
          mpdBaseUrl || mpdUrl || '',
        );
        const representationId = attr(representation, 'id');
        const bandwidth = int_or_none(attr(representation, 'bandwidth'));
        const lang = attr(representation, 'lang') || attr(adaptation, 'lang');
        let formatId = representationId || contentType;
        if (mpdId) formatId = `${mpdId}-${formatId}`;

        const repMs = extractMsInfo(representation, adaptMs);
        const fragments = buildFragments(repMs, baseUrl, representationId, bandwidth ?? undefined);

        if (contentType === 'text') {
          const langKey = lang || 'und';
          if (!entry.subtitles[langKey]) entry.subtitles[langKey] = [];
          entry.subtitles[langKey]!.push({
            url: fragments?.[0]?.url || baseUrl,
            ext: mimetype2ext(mime) || 'ttml',
          });
          continue;
        }

        const f: Format = {
          format_id: formatId,
          manifest_url: mpdUrl,
          url: fragments?.[0]?.url || baseUrl,
          ext: mimetype2ext(mime) || determine_ext(baseUrl, 'mp4'),
          width: int_or_none(attr(representation, 'width') || attr(adaptation, 'width')),
          height: int_or_none(attr(representation, 'height') || attr(adaptation, 'height')),
          tbr: float_or_none(bandwidth, 1000),
          asr: int_or_none(attr(representation, 'audioSamplingRate')),
          fps: int_or_none(attr(representation, 'frameRate') || attr(adaptation, 'frameRate')),
          language: lang && !['mul', 'und', 'zxx', 'mis'].includes(lang) ? lang : null,
          format_note: `DASH ${contentType}`,
          protocol: fragments?.length ? 'http_dash_segments' : 'https',
          fragments,
          vcodec: contentType === 'audio' ? 'none' : codecs.vcodec || 'unknown',
          acodec: contentType === 'video' ? 'none' : codecs.acodec || 'unknown',
          has_drm: isDrm(adaptation) || isDrm(representation) || undefined,
        };
        if (periodDuration && !f.fragments?.length) {
          /* keep */
        }
        entry.formats.push(f);
      }
    }
    periods.push(entry);
  });

  return periods;
}

export function mergeMpdPeriods(
  periods: MpdPeriod[],
): { formats: Format[]; subtitles: Record<string, Subtitle[]> } {
  const formatsMap = new Map<string, Format>();
  const subtitles: Record<string, Subtitle[]> = {};
  for (const period of periods) {
    for (const f of period.formats) {
      (f as Format & { is_dash_periods?: boolean }).is_dash_periods = true;
      const key = [
        f.ext,
        f.width,
        f.height,
        f.tbr,
        f.vcodec,
        f.acodec,
        f.language,
        f.format_note,
      ].join('|');
      const existing = formatsMap.get(key);
      if (!existing) {
        formatsMap.set(key, f);
      } else if (f.fragments?.length) {
        existing.fragments = [...(existing.fragments || []), ...f.fragments];
      }
    }
    for (const [lang, list] of Object.entries(period.subtitles)) {
      if (!subtitles[lang]) subtitles[lang] = [];
      subtitles[lang]!.push(...list);
    }
  }
  return { formats: [...formatsMap.values()], subtitles };
}

export function parseMpdFormatsAndSubtitles(
  mpdXml: string,
  mpdId?: string,
  mpdBaseUrl = '',
  mpdUrl?: string,
  opts?: { dynamicMpd?: boolean },
): { formats: Format[]; subtitles: Record<string, Subtitle[]> } {
  const periods = parseMpdPeriods(mpdXml, mpdId, mpdBaseUrl, mpdUrl, opts);
  return mergeMpdPeriods(periods);
}
