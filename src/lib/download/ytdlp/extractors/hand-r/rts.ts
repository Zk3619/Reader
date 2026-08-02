/** RTSIE — ported from yt-dlp rts.py (main paths, simplified) */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, int_or_none, parse_duration, unescapeHTML } from '../../utils';
import { extractM3u8FormatsAndSubtitles, parseIso8601 } from './_helpers';

export class RTSIE extends InfoExtractor {
  static IE_NAME = 'stvr';
  static IE_DESC = 'Slovak Television and Radio (formerly RTVS)';
  static _VALID_URL =
    /(?:rts:(?<rts_id>\d+)|https?:\/\/(?:.+?\.)?rts\.ch\/(?:[^/]+\/){2,}(?<id>[0-9]+)-(?<display_id>.+?)\.html)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const mediaId = m.groups!.rts_id || m.groups!.id!;
    const displayId = m.groups!.display_id || mediaId;

    const downloadJson = (internalId: string) =>
      this._download_json<Record<string, unknown>>(
        `http://www.rts.ch/a/${internalId}.html?f=json/article`,
        displayId,
      );

    let allInfo = await downloadJson(mediaId);
    if (!('video' in allInfo) && !('audio' in allInfo)) {
      const entries: VideoInfo[] = [];
      for (const item of (allInfo.items as Array<{ url?: string }>) || []) {
        if (item.url) entries.push(this.url_result(item.url, 'RTS'));
      }
      if (entries.length) return this.playlist_result(entries, mediaId, allInfo.title as string | undefined);

      const page = await this._download_webpage(url, displayId);
      const videos = [
        ...page.matchAll(/<article[^>]+class="content-item"[^>]*>\s*<a[^>]+data-video-urn="urn:([^"]+)"/g),
        ...page.matchAll(/<iframe[^>]+class="srg-player"[^>]+src="[^"]+urn:([^"]+)"/g),
      ].map((vm) => vm[1]!);
      if (videos.length) {
        return this.playlist_result(
          videos.map((v) => this.url_result(`srgssr:${v}`, 'SRGSSR')),
          mediaId,
          allInfo.title as string | undefined,
        );
      }
      const internalId = this._html_search_regex(/<(?:video|audio) data-id="([0-9]+)"/, page, 'internal video id')!;
      allInfo = await downloadJson(internalId);
    }

    const info = (allInfo.video as Record<string, unknown>)?.JSONinfo
      ? ((allInfo.video as Record<string, unknown>).JSONinfo as Record<string, unknown>)
      : (allInfo.audio as Record<string, unknown>);
    const formats: Format[] = [];
    const streams = (info.streams as Record<string, string>) || {};
    for (const [formatId, formatUrl] of Object.entries(streams)) {
      if ((formatId === 'hds_sd' && streams.hds) || (formatId === 'hls_sd' && streams.hls)) continue;
      const ext = determine_ext(formatUrl);
      if (ext === 'm3u8') {
        formats.push(...(await extractM3u8FormatsAndSubtitles(this, formatUrl, mediaId, formatId)).formats);
      } else if (ext !== 'f4m') {
        formats.push({ format_id: formatId, url: formatUrl });
      }
    }
    const downloadBase = `http://rtsww${'audio' in allInfo ? '-a' : ''}-d.rts.ch/`;
    for (const media of (info.media as Array<Record<string, unknown>>) || []) {
      const mediaUrl = media.url as string | undefined;
      if (!mediaUrl || /^https?:\/\//.test(mediaUrl)) continue;
      const rate = media.rate as number | undefined;
      const ext = (media.ext as string) || determine_ext(mediaUrl, 'mp4');
      formats.push({
        format_id: rate ? `${ext}-${rate}k` : ext,
        url: downloadBase + mediaUrl,
        tbr: rate,
      });
    }

    let duration = info.duration ?? info.cutout ?? info.cutduration;
    if (typeof duration === 'string') duration = parse_duration(duration);

    return {
      id: mediaId,
      display_id: displayId,
      formats,
      title: info.title as string,
      description: info.intro as string | undefined,
      duration: duration as number | undefined,
      view_count: int_or_none(info.plays) ?? undefined,
      uploader: info.programName as string | undefined,
      timestamp: parseIso8601(info.broadcast_date as string) ?? undefined,
      thumbnail: unescapeHTML(info.preview_image_url as string) || undefined,
    };
  }
}
