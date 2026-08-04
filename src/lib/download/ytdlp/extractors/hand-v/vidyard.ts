// @ts-nocheck
/** VidyardBaseIE / VidyardIE â€?ported from yt-dlp vidyard.py */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, Thumbnail, VideoInfo } from '../../types';
import {
  float_or_none,
  int_or_none,
  join_nonempty,
  mimetype2ext,
  str_or_none,
  unescapeHTML,
  url_or_none,
} from '../../utils';
import {
  extractM3u8FormatsAndSubtitles,
  mergeSubtitles,
  parse_resolution,
} from './_helpers';

export class VidyardBaseIE extends InfoExtractor {
  static IE_NAME = 'vidyard:base';
  static _VALID_URL = false as const;
  static _HEADERS = { Referer: 'https://play.vidyard.com/' };

  protected async _getFormatsAndSubtitles(
    sources: Record<string, unknown>,
    videoId: string,
  ): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};

    const addHls = async (m3u8Url: string) => {
      const { formats: fmts, subtitles: subs } = await extractM3u8FormatsAndSubtitles(
        this,
        m3u8Url,
        videoId,
        'hls',
      );
      for (const f of fmts) f.http_headers = { ...VidyardBaseIE._HEADERS };
      formats.push(...fmts);
      mergeSubtitles(subtitles, subs);
    };

    const hlsList = sources.hls;
    const sourcesCopy = { ...sources };
    delete sourcesCopy.hls;

    if (Array.isArray(hlsList)) {
      const master = (hlsList as Array<Record<string, unknown>>).find(
        (v) => v.profile === 'auto' && url_or_none(v.url),
      );
      if (master) await addHls(String(master.url));
      if (!formats.length) {
        for (const variant of hlsList as Array<Record<string, unknown>>) {
          const u = url_or_none(variant.url);
          if (u) await addHls(u);
        }
      }
    }

    for (const [sourceType, sourceList] of Object.entries(sourcesCopy)) {
      if (!Array.isArray(sourceList)) continue;
      for (const source of sourceList as Array<Record<string, unknown>>) {
        const u = url_or_none(source.url);
        if (!u) continue;
        const profile = source.profile != null ? String(source.profile) : undefined;
        formats.push({
          url: u,
          ext: mimetype2ext(source.mimeType != null ? String(source.mimeType) : undefined) || undefined,
          format_id: join_nonempty('http', sourceType, profile),
          ...parse_resolution(profile),
        });
      }
    }

    // Deduplicate by URL
    const seen = new Set<string>();
    const unique = formats.filter((f) => {
      if (!f.url || seen.has(f.url)) return false;
      seen.add(f.url);
      return true;
    });

    return { formats: unique, subtitles };
  }

  protected _getDirectSubtitles(
    captionJson: unknown,
  ): Record<string, Subtitle[]> {
    const subs: Record<string, Subtitle[]> = {};
    if (!Array.isArray(captionJson)) return subs;
    for (const caption of captionJson as Array<Record<string, unknown>>) {
      const vtt = url_or_none(caption.vttUrl);
      if (!vtt) continue;
      const lang = (caption.language as string) || 'und';
      (subs[lang] ||= []).push({
        url: vtt,
        name: caption.name != null ? String(caption.name) : undefined,
      });
    }
    return subs;
  }

  protected async _getAdditionalMetadata(videoId: string): Promise<Partial<VideoInfo>> {
    const additional = await this._download_json<Record<string, unknown>>(
      `https://play.vidyard.com/video/${videoId}`,
      videoId,
      'Downloading additional metadata',
      { fatal: false },
    );
    const thumbUrl = url_or_none(additional.thumbnailUrl);
    const chapters = Array.isArray(additional.videoSections)
      ? (additional.videoSections as Array<Record<string, unknown>>)
          .filter((v) => float_or_none(v.milliseconds) != null)
          .map((v) => ({
            title: v.title != null ? String(v.title) : '',
            start_time: float_or_none(v.milliseconds, 1000) ?? 0,
          }))
      : undefined;
    return {
      title: additional.name != null ? String(additional.name) : undefined,
      duration: int_or_none(additional.seconds) ?? undefined,
      thumbnails: thumbUrl ? [{ url: thumbUrl } as Thumbnail] : undefined,
      chapters,
    };
  }

  protected async _fetchVideoJson(videoId: string): Promise<Record<string, unknown>> {
    const data = await this._download_json<{ payload: Record<string, unknown> }>(
      `https://play.vidyard.com/player/${videoId}.json`,
      videoId,
    );
    return data.payload;
  }

  protected async _processVideoJson(
    jsonData: Record<string, unknown>,
    videoId: string,
  ): Promise<VideoInfo> {
    const { formats, subtitles } = await this._getFormatsAndSubtitles(
      (jsonData.sources as Record<string, unknown>) || {},
      videoId,
    );
    mergeSubtitles(subtitles, this._getDirectSubtitles(jsonData.captions));

    const facadeUuid = String(jsonData.facadeUuid || videoId);
    const extra = await this._getAdditionalMetadata(facadeUuid);

    const thumbnails: Thumbnail[] = [];
    const thumbUrls = jsonData.thumbnailUrls as Record<string, string> | undefined;
    for (const key of ['small', 'normal'] as const) {
      const u = url_or_none(thumbUrls?.[key]);
      if (u) thumbnails.push({ url: u });
    }

    const durationMs = float_or_none(jsonData.milliseconds, 1000);
    const durationSec = int_or_none(jsonData.seconds);

    return {
      ...extra,
      id: facadeUuid,
      display_id: str_or_none(jsonData.videoId) || undefined,
      title:
        (jsonData.name != null ? String(jsonData.name) : undefined) ||
        extra.title ||
        facadeUuid,
      description:
        unescapeHTML(jsonData.description != null ? String(jsonData.description) : null) ||
        undefined,
      duration: durationMs ?? durationSec ?? extra.duration ?? undefined,
      thumbnails: thumbnails.length ? thumbnails : extra.thumbnails,
      tags: Array.isArray(jsonData.tags)
        ? (jsonData.tags as Array<Record<string, unknown>>)
            .map((t) => (t.name != null ? String(t.name) : null))
            .filter(Boolean) as string[]
        : undefined,
      formats,
      subtitles,
      http_headers: VidyardBaseIE._HEADERS,
    };
  }
}

export class VidyardIE extends VidyardBaseIE {
  static IE_NAME = 'vidyard';
  static _VALID_URL = [
    /https?:\/\/[\w-]+(?:\.hubs)?\.vidyard\.com\/watch\/(?<id>[\w-]+)/,
    /https?:\/\/(?:embed|share)\.vidyard\.com\/share\/(?<id>[\w-]+)/,
    /https?:\/\/play\.vidyard\.com\/(?:player\/)?(?<id>[\w-]+)/,
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url).replace(/\.html$/, '').replace(/\.json.*$/, '');
    const videoJson = await this._fetchVideoJson(videoId);
    const chapters = (videoJson.chapters as Array<Record<string, unknown>>) || [];

    if (chapters.length === 1) {
      return this._processVideoJson(chapters[0]!, videoId);
    }

    const entries: VideoInfo[] = [];
    for (const chapter of chapters) {
      entries.push(await this._processVideoJson(chapter, videoId));
    }
    return this.playlist_result(
      entries,
      String(videoJson.playerUuid || videoId),
      videoJson.name != null ? String(videoJson.name) : undefined,
    );
  }
}
