/**
 * DreiSatIE — ported from yt-dlp dreisat.py (extends local ZDFBaseIE subset)
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import {
  determine_ext,
  float_or_none,
  int_or_none,
  join_nonempty,
  merge_dicts,
  str_or_none,
  url_or_none,
} from '../../utils';
import { parseIso8601, urljoin } from './_helpers';

class ZDFBaseIE extends InfoExtractor {
  static IE_NAME = 'zdfbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('ZDFBaseIE is not a standalone extractor', { expected: true });
  }

  protected async callApi(
    url: string,
    videoId: string,
    item: string,
    apiToken?: string,
  ): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {};
    if (apiToken) headers['Api-Auth'] = apiToken;
    return this._download_json(url, videoId, `Downloading ${item}`, { headers, fatal: true });
  }

  protected parseAspectRatio(aspectRatio: unknown): number | null {
    if (!aspectRatio || typeof aspectRatio !== 'string') return null;
    const m = /^(\d+):(\d+)$/.exec(aspectRatio);
    return m ? Number(m[1]) / Number(m[2]) : null;
  }

  protected expandPtmdTemplate(apiBaseUrl: string, template: string): string {
    return urljoin(apiBaseUrl, template.replace('{playerId}', 'android_native_6'));
  }

  protected extractThumbnails(source: unknown): Thumbnail[] {
    if (!source || typeof source !== 'object') return [];
    return Object.entries(source as Record<string, unknown>)
      .filter(([, v]) => url_or_none(v))
      .map(([formatId, v]) => ({
        id: formatId,
        url: url_or_none(v)!,
        preference: formatId === 'original' ? 1 : 0,
      }));
  }

  protected extractChapters(data: unknown): Array<{ start_time: number; title?: string }> | undefined {
    if (!Array.isArray(data)) return undefined;
    const chapters = data
      .filter((v) => v && typeof v === 'object' && (v as Record<string, unknown>).anchorOffset != null)
      .map((v) => {
        const item = v as Record<string, unknown>;
        return {
          start_time: float_or_none(item.anchorOffset) ?? 0,
          title: str_or_none(item.anchorLabel) ?? undefined,
        };
      });
    return chapters.length ? chapters : undefined;
  }

  protected async extractPtmd(
    ptmdUrl: string,
    videoId: string,
    apiToken?: string,
    aspectRatio?: number | null,
  ): Promise<Partial<VideoInfo>> {
    const ptmd = await this.callApi(ptmdUrl, videoId, 'PTMD data', apiToken);
    const basename =
      str_or_none(ptmd.basename) ||
      this._search_regex(/\/vod\/ptmd\/[^/?#]+\/(\w+)/, ptmdUrl, 'content ID', null, false);
    const duration = float_or_none(
      ((ptmd.attributes as Record<string, unknown>)?.duration as Record<string, unknown>)?.value,
      1000,
    );
    const formats: Format[] = [];
    const priorityList = Array.isArray(ptmd.priorityList) ? ptmd.priorityList : [];
    for (const stream of priorityList) {
      if (!stream || typeof stream !== 'object') continue;
      const formitaeten = Array.isArray((stream as Record<string, unknown>).formitaeten)
        ? ((stream as Record<string, unknown>).formitaeten as Record<string, unknown>[])
        : [];
      for (const fmt of formitaeten) {
        const qualities = Array.isArray(fmt.qualities) ? fmt.qualities : [];
        for (const quality of qualities) {
          const tracks = ((quality.audio as Record<string, unknown>)?.tracks as Record<string, unknown>[]) || [];
          for (const variant of tracks) {
            const formatUrl = url_or_none(variant.uri);
            if (!formatUrl) continue;
            const ext = determine_ext(formatUrl);
            if (ext === 'm3u8') {
              formats.push(
                ...(await this._extract_m3u8_formats(formatUrl, videoId, 'mp4', 'm3u8', undefined, undefined, 'hls', undefined, false)),
              );
            } else if (ext === 'mp4' || ext === 'webm') {
              const height = int_or_none(quality.highestVerticalResolution) ?? undefined;
              formats.push({
                url: formatUrl,
                height,
                width: aspectRatio && height ? Math.round(aspectRatio * height) : undefined,
                filesize: int_or_none(variant.filesize) ?? undefined,
                format_id: join_nonempty('http', String(stream.type ?? '')),
              });
            }
          }
        }
      }
    }
    return { id: basename || videoId, duration: duration ?? undefined, formats };
  }
}

export class DreiSatIE extends ZDFBaseIE {
  static IE_NAME = '3sat';
  static _VALID_URL = /https?:\/\/(?:www\.)?3sat\.de\/(?:[^/?#]+\/)*(?<id>[^/?#&]+)\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const player = this._search_json<Record<string, unknown>>(
      /data-zdfplayer-jsb=(["'])/,
      webpage,
      'player JSON',
      videoId,
    )!;
    const playerUrl = String(player.content ?? '');
    const apiToken = `Bearer ${player.apiToken}`;

    const content = await this.callApi(playerUrl, videoId, 'video metadata', apiToken);
    const mainVideo = (content.mainVideoContent as Record<string, unknown>) || {};
    const videoTarget = (mainVideo['http://zdf.de/rels/target'] as Record<string, unknown>) || {};
    const streams = (videoTarget.streams as Record<string, unknown>) || {};
    const defaultStreams = (streams.default as Record<string, unknown>) || {};
    const ptmdPath =
      str_or_none(defaultStreams['http://zdf.de/rels/streams/ptmd']) ||
      str_or_none(defaultStreams['http://zdf.de/rels/streams/ptmd-template']);
    if (!ptmdPath) throw new ExtractorError('Unable to extract ptmd path');
    const ptmdUrl = this.expandPtmdTemplate(playerUrl, ptmdPath);
    const aspectRatio = this.parseAspectRatio(videoTarget.aspectRatio);
    const info = await this.extractPtmd(ptmdUrl, videoId, apiToken, aspectRatio);

    const programmeItem = Array.isArray(content.programmeItem) ? content.programmeItem[0] : null;
    const programmeTarget =
      programmeItem && typeof programmeItem === 'object'
        ? ((programmeItem as Record<string, unknown>)['http://zdf.de/rels/target'] as Record<string, unknown>)
        : null;

    return merge_dicts(info, {
      title: str_or_none(content.title) || str_or_none(content.teaserHeadline) || undefined,
      episode: str_or_none(content.title) || str_or_none(content.teaserHeadline) || undefined,
      description: str_or_none(content.leadParagraph) || str_or_none(content.teasertext) || undefined,
      timestamp: parseIso8601(content.editorialDate) ?? undefined,
      duration: int_or_none(videoTarget.duration) ?? undefined,
      chapters: this.extractChapters(videoTarget.streamAnchorTag),
      thumbnails: this.extractThumbnails(
        ((content.teaserImageRef as Record<string, unknown>)?.layouts as Record<string, unknown>) || {},
      ),
      series_id: str_or_none(
        ((programmeTarget?.['http://zdf.de/rels/cmdm/series'] as Record<string, unknown>) || {}).seriesUuid,
      ),
      series: str_or_none(
        ((programmeTarget?.['http://zdf.de/rels/cmdm/series'] as Record<string, unknown>) || {}).seriesTitle,
      ),
      season: str_or_none(
        ((programmeTarget?.['http://zdf.de/rels/cmdm/season'] as Record<string, unknown>) || {}).seasonTitle,
      ),
      season_number: int_or_none(
        ((programmeTarget?.['http://zdf.de/rels/cmdm/season'] as Record<string, unknown>) || {}).seasonNumber,
      ),
      season_id: str_or_none(
        ((programmeTarget?.['http://zdf.de/rels/cmdm/season'] as Record<string, unknown>) || {}).seasonUuid,
      ),
      episode_number: int_or_none(programmeTarget?.episodeNumber),
      episode_id: str_or_none(programmeTarget?.contentId),
    }) as VideoInfo;
  }
}

export { ZDFBaseIE };
