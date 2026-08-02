/**
 * DisneyIE — ported from yt-dlp disney.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  determine_ext,
  int_or_none,
  join_nonempty,
  unified_strdate,
  update_url_query,
} from '../../utils';

export class DisneyIE extends InfoExtractor {
  static IE_NAME = 'disney';
  static _VALID_URL =
    /https?:\/\/(?<domain>(?:[^/]+\.)?(?:disney\.[a-z]{2,3}(?:\.[a-z]{2})?|disney(?:(?:me|latino)\.com|turkiye\.com\.tr|channel\.de)|(?:starwars|marvelkids)\.com))\/(?:(?:embed\/|(?:[^/]+\/)+[\w-]+-)(?<id>[a-z0-9]{24})|(?:[^/]+\/)?(?<display_id>[^/?#]+))/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const domain = m.groups!.domain!;
    let videoId = m.groups!.id;
    const displayId = m.groups!.display_id;

    let pageData: Record<string, unknown>;
    let videoData: Record<string, unknown>;

    if (!videoId) {
      const webpage = await this._download_webpage(url, displayId!);
      const grill = this._search_regex(/Grill\.burger\s*=\s*({.+})\s*:/, webpage, 'grill data')!.replace(
        /"\s*\+\s*"/g,
        '',
      );
      const parsed = this._parse_json<{ stack: Record<string, unknown>[] }>(grill, displayId!)!;
      const page = parsed.stack.find((s) => s.type === 'video');
      if (!page) throw new Error('No video data in grill stack');
      pageData = page;
      const dataArr = page.data as Record<string, unknown>[];
      videoData = dataArr[0]!;
    } else {
      const webpage = await this._download_webpage(`http://${domain}/embed/${videoId}`, videoId);
      pageData = this._parse_json<Record<string, unknown>>(
        this._search_regex(/Disney\.EmbedVideo\s*=\s*({.+});/, webpage, 'embed data')!,
        videoId,
      )!;
      videoData = pageData.video as Record<string, unknown>;
    }

    const externals = Array.isArray(videoData.externals) ? videoData.externals : [];
    for (const external of externals) {
      if (external && typeof external === 'object' && (external as Record<string, unknown>).source === 'vevo') {
        return this.url_result(`vevo:${(external as Record<string, unknown>).data_id}`, 'Vevo');
      }
    }

    videoId = String(videoData.id ?? videoId);
    const title = String(videoData.title ?? videoId);
    const formats: Format[] = [];
    const flavors = Array.isArray(videoData.flavors) ? videoData.flavors : [];

    for (const flavor of flavors) {
      if (!flavor || typeof flavor !== 'object') continue;
      const f = flavor as Record<string, unknown>;
      const flavorFormat = f.format as string | undefined;
      let flavorUrl = f.url as string | undefined;
      if (!flavorUrl || !/^https?:\/\//.test(flavorUrl) || flavorFormat === 'mp4_access') continue;
      const tbr = int_or_none(f.bitrate);
      if (tbr === 99999) {
        flavorUrl = update_url_query(flavorUrl, { ks: '' });
        const m3u8Formats = await this._extract_m3u8_formats(
          flavorUrl,
          videoId,
          'mp4',
          'm3u8',
          undefined,
          undefined,
          flavorFormat,
          undefined,
          false,
        );
        for (const fmt of m3u8Formats) {
          if (fmt.url?.includes('/fpshls/')) continue;
          formats.push(fmt);
        }
        continue;
      }
      const ext = determine_ext(flavorUrl);
      let outExt = ext;
      if (flavorFormat === 'applehttp' || ext === 'm3u8') outExt = 'mp4';
      const width = int_or_none(f.width) ?? undefined;
      const height = int_or_none(f.height) ?? undefined;
      formats.push({
        format_id: join_nonempty(flavorFormat, tbr != null ? String(tbr) : null),
        url: flavorUrl,
        width,
        height,
        tbr: tbr ?? undefined,
        ext: outExt || undefined,
        vcodec: width === 0 && height === 0 ? 'none' : undefined,
      });
    }

    if (!formats.length && videoData.expired) {
      const translations = (pageData.translations as Record<string, unknown>) || {};
      this.raise_no_formats(`${this.IE_NAME} said: ${translations.video_expired}`, true);
    }

    const subtitles: Record<string, Subtitle[]> = {};
    const captions = Array.isArray(videoData.captions) ? videoData.captions : [];
    for (const caption of captions) {
      if (!caption || typeof caption !== 'object') continue;
      const c = caption as Record<string, unknown>;
      const captionUrl = c.url as string | undefined;
      const captionFormat = c.format as string | undefined;
      if (!captionUrl || captionFormat?.startsWith('unknown')) continue;
      const lang = String(c.language ?? 'en');
      const extMap: Record<string, string> = { webvtt: 'vtt' };
      const subExt = captionFormat ? extMap[captionFormat] || captionFormat : 'vtt';
      (subtitles[lang] ||= []).push({
        url: captionUrl,
        ext: subExt,
      });
    }

    return {
      id: videoId,
      title,
      description: (videoData.description as string) || (videoData.short_desc as string) || undefined,
      thumbnail: (videoData.thumb as string) || (videoData.thumb_secure as string) || undefined,
      duration: int_or_none(videoData.duration_sec) ?? undefined,
      upload_date: unified_strdate(videoData.publish_date) ?? undefined,
      formats,
      subtitles,
    };
  }
}
