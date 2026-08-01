/**
 * KalturaIE — aligned with yt-dlp kaltura.py (multirequest API, flavor assets, embed URLs).
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { Format, VideoInfo } from '../types';

const KALTURA_VALID_URL =
  /(?:kaltura:(?<k_partner_id>\w+):(?<k_id>\w+)(?::(?<k_player_type>\w+))?|https?:\/\/(?:(?:www|cdnapi(?:sec)?)\.)?kaltura\.com(?::\d+)?\/(?:index\.php\/(?:kwidget|extwidget\/preview)|html5\/html5lib\/[^/]+\/mwEmbedFrame\.php)(?:\/(?<path>[^?]+))?(?:\?(?<query>.*))?)/i;

const SERVICE_URL = 'https://cdnapi.kaltura.com';
const SERVICE_BASE = '/api_v3/service/multirequest';

const CAPTION_TYPES: Record<number, string> = { 1: 'srt', 2: 'ttml', 3: 'vtt' };

function buildWidgetId(partnerId: string): string {
  return partnerId.includes('_') ? partnerId : `_${partnerId}`;
}

function parsePathParams(path: string): Record<string, string> {
  const parts = path.split('/').filter(Boolean);
  const out: Record<string, string> = {};
  for (let i = 0; i + 1 < parts.length; i += 2) {
    out[parts[i]!] = parts[i + 1]!;
  }
  return out;
}

function parseQuery(qs: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of qs.replace(/^[?]/, '').split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const k = decodeURIComponent(eq >= 0 ? part.slice(0, eq) : part);
    const v = decodeURIComponent((eq >= 0 ? part.slice(eq + 1) : '').replace(/\+/g, ' '));
    if (!out[k]) out[k] = [];
    out[k]!.push(v);
  }
  return out;
}

function intOrNone(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function extractKalturaEmbedUrls(webpage: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  const add = (partnerId: string, entryId: string) => {
    const key = `${partnerId}:${entryId}`;
    if (seen.has(key)) return;
    seen.add(key);
    urls.push(`kaltura:${partnerId}:${entryId}`);
  };

  for (const m of webpage.matchAll(
    /kWidget\.(?:thumb)?[Ee]mbed\(\{[\s\S]*?wid\s*:\s*(["'])_?(?<partner_id>(?:(?!\1).)+)\1[\s\S]*?entry_?[Ii]d\s*:\s*(["'])(?<id>(?:(?!\4).)+)\4/gi,
  )) {
    add(m.groups!.partner_id!, m.groups!.id!);
  }

  for (const m of webpage.matchAll(
    /(?:https?:)?\/\/cdnapi(?:sec)?\.kaltura\.com[\s\S]*?\b(?:p|partner_id)\/(?<partner_id>\d+)[\s\S]*?(?:entry_?[Ii]d\s*:\s*|entry_id=)(?<q>["']?)(?<id>(?:(?!\k<q>).)+)\k<q>/gi,
  )) {
    add(m.groups!.partner_id!, m.groups!.id!);
  }

  for (const m of webpage.matchAll(
    /(?:https?:)?\/\/(?:(?:www|cdnapi(?:sec)?)\.)?kaltura\.com[\s\S]*?\b(?:p|partner_id)\/(?<partner_id>\d+)[\s\S]*?[?&;]entry_id=(?<id>[^&"'\s]+)/gi,
  )) {
    add(m.groups!.partner_id!, m.groups!.id!);
  }

  return urls;
}

export class KalturaIE extends InfoExtractor {
  static IE_NAME = 'kaltura';
  static IE_DESC = 'Kaltura';
  static _VALID_URL = KALTURA_VALID_URL;
  static _TESTS = [
    { url: 'kaltura:269692:1_1jc2y3e4', only_matching: true },
    {
      url: 'https://cdnapisec.kaltura.com/html5/html5lib/v2.46/mwEmbedFrame.php/p/691292/uiconf_id/20499062/entry_id/0_c076mna6?wid=_691292',
      only_matching: true,
    },
  ];

  private async kalturaApiCall(
    videoId: string,
    actions: Record<string, unknown>[],
    serviceUrl = SERVICE_URL,
  ): Promise<unknown[]> {
    const params: Record<string, unknown> = { ...actions[0] };
    actions.slice(1).forEach((action, idx) => {
      params[String(idx + 1)] = action;
    });

    const data = await this._download_json<unknown[]>(
      `${serviceUrl}${SERVICE_BASE}`,
      videoId,
      'Downloading Kaltura API',
      {
        method: 'POST',
        data: JSON.stringify(params),
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      },
    );

    if (!Array.isArray(data)) throw new ExtractorError('Invalid Kaltura API response', { expected: true });
    for (let idx = 0; idx < data.length; idx++) {
      const status = data[idx];
      if (status && typeof status === 'object' && (status as Record<string, unknown>).objectType === 'KalturaAPIException') {
        const err = status as Record<string, unknown>;
        throw new ExtractorError(`Kaltura said: ${err.message} (${idx})`, { expected: true });
      }
    }
    return data;
  }

  private async getVideoInfoHtml5(
    entryId: string,
    partnerId: string,
    serviceUrl = SERVICE_URL,
  ): Promise<[unknown, Record<string, unknown>, Record<string, unknown>[], Record<string, unknown>]> {
    const actions = [
      {
        apiVersion: '3.3.0',
        clientTag: 'html5:v3.1.0',
        format: 1,
        ks: '',
        partnerId,
      },
      {
        expiry: 86400,
        service: 'session',
        action: 'startWidgetSession',
        widgetId: buildWidgetId(partnerId),
      },
      {
        action: 'list',
        filter: { redirectFromEntryId: entryId },
        service: 'baseentry',
        ks: '{1:result:ks}',
        responseProfile: {
          type: 1,
          fields: 'createdAt,dataUrl,duration,name,plays,thumbnailUrl,userId,description',
        },
      },
      {
        action: 'getbyentryid',
        entryId,
        service: 'flavorAsset',
        ks: '{1:result:ks}',
      },
      {
        action: 'list',
        'filter:entryIdEqual': entryId,
        service: 'caption_captionasset',
        ks: '{1:result:ks}',
      },
    ];

    const data = await this.kalturaApiCall(entryId, actions, serviceUrl);
    const infoList = data[2] as Record<string, unknown> | undefined;
    const objects = (infoList?.objects as Record<string, unknown>[]) || [];
    const info = objects[0] || {};
    const flavorAssets = (data[3] as Record<string, unknown>[]) || [];
    const captions = (data[4] as Record<string, unknown>) || {};
    return [data[1], info, flavorAssets, captions];
  }

  private perVideoExtract(
    entryId: string,
    info: Record<string, unknown>,
    flavorAssets: Record<string, unknown>[],
    captions: Record<string, unknown>,
    ks?: string | null,
  ): VideoInfo {
    const dataUrl = String(info.dataUrl || '');
    const signUrl = (unsigned: string) => {
      let u = unsigned;
      if (ks) u += `/ks/${ks}`;
      return u;
    };

    const formats: Format[] = [];
    for (const f of flavorAssets) {
      if (f.status != null && f.status !== 2) continue;
      if (f.fileExt === 'chun') continue;
      if (f.fileExt === 'wvm') continue;

      let ext = String(f.fileExt || '');
      if (!ext) {
        ext = f.containerFormat === 'qt' ? 'mov' : 'mp4';
      }

      const videoUrl = signUrl(`${dataUrl.replace(/\/flvclipper\/.*$/, '/serveFlavor')}/flavorId/${f.id}`);
      const vcodec =
        !('videoCodecId' in f) && f.frameRate === 0 ? 'none' : String(f.videoCodecId || 'unknown');

      formats.push({
        format_id: `${ext}-${f.bitrate || formats.length}`,
        url: videoUrl,
        ext,
        tbr: intOrNone(f.bitrate),
        fps: intOrNone(f.frameRate),
        width: intOrNone(f.width),
        height: intOrNone(f.height),
        container: f.containerFormat ? String(f.containerFormat) : undefined,
        vcodec,
        protocol: 'https',
      });
    }

    if (dataUrl.includes('/playManifest/')) {
      const m3u8Url = signUrl(dataUrl.replace('format/url', 'format/applehttp'));
      // HLS manifest added as single format entry; full variant parse optional
      formats.push({
        format_id: 'hls',
        url: m3u8Url,
        ext: 'mp4',
        protocol: 'm3u8_native',
        vcodec: 'unknown',
        acodec: 'unknown',
      });
    }

    const subtitles: Record<string, Array<{ url: string; ext: string }>> = {};
    for (const caption of (captions.objects as Record<string, unknown>[]) || []) {
      if (caption.status != null && caption.status !== 2) continue;
      if (!caption.id) continue;
      const lang = String(caption.languageCode || caption.language || 'en');
      const fmt = intOrNone(caption.format);
      subtitles[lang] = [
        {
          url: `${SERVICE_URL}/api_v3/service/caption_captionasset/action/serve/captionAssetId/${caption.id}`,
          ext: String(caption.fileExt || (fmt != null ? CAPTION_TYPES[fmt] : '') || 'ttml'),
        },
      ];
    }

    if (!formats.length) throw new ExtractorError('No Kaltura formats found', { expected: true });

    return {
      id: entryId,
      title: String(info.name || entryId),
      description: String(info.description || '').replace(/<[^>]+>/g, '') || undefined,
      thumbnail: info.thumbnailUrl ? String(info.thumbnailUrl) : undefined,
      duration: intOrNone(info.duration),
      timestamp: intOrNone(info.createdAt),
      uploader_id: info.userId && info.userId !== 'None' ? String(info.userId) : undefined,
      view_count: intOrNone(info.plays),
      formats: this._sort_formats(formats),
      subtitles: Object.keys(subtitles).length ? subtitles : undefined,
      extractor: 'kaltura',
      extractor_key: 'Kaltura',
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = url.match(KALTURA_VALID_URL);
    if (!m?.groups) throw new ExtractorError('Invalid Kaltura URL', { expected: true });

    let partnerId = m.groups.k_partner_id || '';
    let entryId = m.groups.k_id || '';
    let playerType = m.groups.k_player_type || '';
    let ks: string | null = null;

    if (!playerType) {
      playerType = url.includes('html5lib/v2') ? 'kwidget' : 'html5';
    }

    if (!partnerId || !entryId) {
      const path = m.groups.path || '';
      const query = m.groups.query || '';
      const params: Record<string, string[]> = query ? parseQuery(query) : {};
      if (path) {
        for (const [k, v] of Object.entries(parsePathParams(path))) {
          params[k] = [v];
        }
      }

      if (params.wid?.[0]) partnerId = params.wid[0].replace(/^_/, '');
      else if (params.p?.[0]) partnerId = params.p[0];
      else if (params.partner_id?.[0]) partnerId = params.partner_id[0];
      else throw new ExtractorError('Invalid Kaltura URL (no partner id)', { expected: true });

      ks = params['flashvars[ks]']?.[0] || null;

      if (params.entry_id?.[0]) {
        entryId = params.entry_id[0];
      } else if (params.uiconf_id && params['flashvars[referenceId]']?.[0]) {
        const referenceId = params['flashvars[referenceId]'][0]!;
        const webpage = await this._download_webpage(url, referenceId);
        const pkg = this._search_json<Record<string, unknown>>(
          /window\.kalturaIframePackageData\s*=/,
          webpage,
          'kalturaIframePackageData',
          referenceId,
          { fatal: true },
        );
        const entryResult = pkg?.entryResult as Record<string, unknown> | undefined;
        const meta = (entryResult?.meta as Record<string, unknown>) || {};
        entryId = String(meta.id || referenceId);
        try {
          const [, info, flavorAssets, captions] = await this.getVideoInfoHtml5(entryId, partnerId);
          return {
            ...this.perVideoExtract(entryId, info, flavorAssets, captions, ks),
            webpage_url: url,
            original_url: url,
          };
        } catch {
          const flavorAssets = (entryResult?.contextData as Record<string, unknown>)?.flavorAssets as
            | Record<string, unknown>[]
            | undefined;
          return {
            ...this.perVideoExtract(entryId, meta, flavorAssets || [], {}, ks),
            webpage_url: url,
            original_url: url,
          };
        }
      } else if (params.uiconf_id && params['flashvars[playlistAPI.kpl0Id]']?.[0]) {
        const playlistId = params['flashvars[playlistAPI.kpl0Id]'][0]!;
        const webpage = await this._download_webpage(url, playlistId);
        const pkg = this._search_json<Record<string, unknown>>(
          /window\.kalturaIframePackageData\s*=/,
          webpage,
          'kalturaIframePackageData',
          playlistId,
          { fatal: true },
        );
        const playlistResult = pkg?.playlistResult as Record<string, unknown> | undefined;
        const playlist = (playlistResult?.[playlistId] as Record<string, unknown>) || {};
        const items = (playlist.items as Record<string, unknown>[]) || [];
        const entries = items
          .filter((it) => it.id)
          .map((it) =>
            this.url_result(`kaltura:${partnerId}:${String(it.id)}:${playerType}`, 'Kaltura', String(it.id)),
          );
        return this.playlist_result(entries, playlistId, String(playlist.name || playlistId));
      } else {
        throw new ExtractorError('Invalid Kaltura URL', { expected: true });
      }
    }

    const [, info, flavorAssets, captions] = await this.getVideoInfoHtml5(entryId, partnerId);
    return {
      ...this.perVideoExtract(entryId, info, flavorAssets, captions, ks),
      webpage_url: url,
      original_url: url,
    };
  }
}
