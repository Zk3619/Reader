/**
 * LinkedInLearningBaseIE / LinkedInIE / LinkedInLearningIE / LinkedInLearningCourseIE / LinkedInEventsIE
 * — ported from yt-dlp linkedin.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  extract_attributes,
  float_or_none,
  int_or_none,
  mimetype2ext,
  str_or_none,
  traverse_obj,
  url_or_none,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, htmlExtractTitle, mergeSubtitles } from './_helpers';

export class LinkedInLearningBaseIE extends InfoExtractor {
  static IE_NAME = 'linkedinlearningbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('LinkedInLearningBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _callApi(
    courseSlug: string,
    fields: string,
    videoSlug?: string,
    resolution?: number,
  ): Promise<Record<string, unknown>> {
    const query: Record<string, string> = { courseSlug, fields, q: 'slugs' };
    if (videoSlug) {
      query.videoSlug = videoSlug;
      query.resolution = `_${resolution}`;
    }
    const apiUrl = 'https://www.linkedin.com/learning-api/detailedCourses';
    const cookies = this._get_cookies(apiUrl);
    if (!cookies.JSESSIONID) this.raise_login_required();
    const resp = await this._download_json<{ elements?: Array<Record<string, unknown>> }>(apiUrl, videoSlug, undefined, {
      headers: { 'Csrf-Token': cookies.JSESSIONID },
      query,
    });
    return resp.elements?.[0] || {};
  }

  protected _getUrnId(videoData: Record<string, unknown>): string | null {
    const urn = str_or_none(videoData.urn);
    const m = urn?.match(/urn:li:lyndaCourse:\d+,(\d+)/);
    return m?.[1] || null;
  }

  protected _getVideoId(videoData: Record<string, unknown>, courseSlug: string, videoSlug: string): string {
    return this._getUrnId(videoData) || `${courseSlug}/${videoSlug}`;
  }
}

export class LinkedInIE extends InfoExtractor {
  static IE_NAME = 'linkedin';
  static _VALID_URL = [
    /https?:\/\/(?:www\.)?linkedin\.com\/posts\/[^/?#]+-(?<id>\d+)-\w{4}\/?(?:[?#]|$)/,
    /https?:\/\/(?:www\.)?linkedin\.com\/feed\/update\/urn:li:activity:(?<id>\d+)/,
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const videoTag = this._search_regex(/(<video[^>]+>)/, webpage, 'video')!;
    const videoAttrs = extract_attributes(videoTag);
    const sources = this._parse_json<Array<Record<string, unknown>>>(videoAttrs['data-sources'] || '[]', videoId) || [];
    const formats: Format[] = sources.map((source) => ({
      url: String(source.src ?? ''),
      ext: mimetype2ext(str_or_none(source.type)) || undefined,
      format_id: mimetype2ext(str_or_none(source.type)) || 'http',
      tbr: float_or_none(source['data-bitrate'], 1000) ?? undefined,
    }));

    const captionsUrl = url_or_none(videoAttrs['data-captions-url']);
    const subtitles: Record<string, Subtitle[]> = captionsUrl ? { en: [{ url: captionsUrl, ext: 'vtt' }] } : {};

    const ld = this._search_json_ld(webpage, videoId, { fatal: false });
    let uploader: string | undefined;
    if (ld['@type'] === 'SocialMediaPosting') {
      const author = ld.author as Record<string, unknown> | undefined;
      uploader = str_or_none(author?.name) ?? undefined;
    }

    return {
      id: videoId,
      formats,
      title: this._og_search_title(webpage, false) || htmlExtractTitle(webpage) || videoId,
      like_count: int_or_none(this._search_regex(/\bdata-num-reactions="(\d+)"/, webpage, 'reactions', null, false)) ?? undefined,
      uploader,
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
      description: this._og_search_description(webpage) || undefined,
      subtitles: Object.keys(subtitles).length ? subtitles : undefined,
    };
  }
}

function srtTimecode(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export class LinkedInLearningIE extends LinkedInLearningBaseIE {
  static IE_NAME = 'linkedin:learning';
  static _VALID_URL = /https?:\/\/(?:www\.)?linkedin\.com\/learning\/(?<course_slug>[^/]+)\/(?<id>[^/?#]+)/;

  protected json2srt(transcriptLines: Array<Record<string, unknown>>, duration?: number | null): string {
    let srt = '';
    for (let i = 0; i < transcriptLines.length; i++) {
      const line = transcriptLines[i]!;
      const next = transcriptLines[i + 1];
      const start = Number(line.transcriptStartAt || 0) / 1000;
      const end = next ? Number(next.transcriptStartAt || 0) / 1000 : duration || start + 1;
      srt += `${i + 1}\n${srtTimecode(start)} --> ${srtTimecode(end)}\n${line.caption}\n\n`;
    }
    return srt;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const courseSlug = m.groups?.course_slug || '';
    const videoSlug = m.groups?.id || '';

    const formats: Format[] = [];
    let videoData: Record<string, unknown> = {};
    for (const [width, height] of [
      [640, 360],
      [960, 540],
      [1280, 720],
    ] as const) {
      videoData = await this._callApi(courseSlug, 'selectedVideo', videoSlug, height);
      const selected = (videoData.selectedVideo as Record<string, unknown>) || {};
      const videoUrlData = (selected.url as Record<string, unknown>) || {};
      const progressiveUrl = str_or_none(videoUrlData.progressiveUrl);
      if (progressiveUrl) {
        formats.push({
          format_id: `progressive-${height}p`,
          url: progressiveUrl,
          ext: 'mp4',
          height,
          width,
          source_preference: 1,
        });
      }
    }

    const selectedVideo = (videoData.selectedVideo as Record<string, unknown>) || {};
    const title = String(selectedVideo.title ?? videoSlug);
    const videoUrlData = (selectedVideo.url as Record<string, unknown>) || {};

    const audioUrl = str_or_none(traverse_obj(selectedVideo, ['audio', 'progressiveUrl']));
    if (audioUrl) {
      formats.push({ abr: 64, ext: 'm4a', format_id: 'audio', url: audioUrl, vcodec: 'none' });
    }

    const streamingUrl = str_or_none(videoUrlData.streamingUrl);
    if (streamingUrl) {
      formats.push(
        ...(await this._extract_m3u8_formats(streamingUrl, videoSlug, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
      );
    }

    const subtitles: Record<string, Subtitle[]> = {};
    const duration = int_or_none(selectedVideo.durationInSeconds) ?? undefined;
    const transcriptLines = traverse_obj(selectedVideo, ['transcript', 'lines']) as Array<Record<string, unknown>> | undefined;
    if (transcriptLines?.length) {
      subtitles.en = [{ ext: 'srt', data: this.json2srt(transcriptLines, duration) }];
    }

    return {
      id: this._getVideoId(selectedVideo, courseSlug, videoSlug),
      title,
      formats,
      thumbnail: selectedVideo.defaultThumbnail ? String(selectedVideo.defaultThumbnail) : undefined,
      timestamp: float_or_none(selectedVideo.publishedOn, 1000) ?? undefined,
      duration,
      subtitles: Object.keys(subtitles).length ? subtitles : undefined,
    };
  }
}

export class LinkedInLearningCourseIE extends LinkedInLearningBaseIE {
  static IE_NAME = 'linkedin:learning:course';
  static _VALID_URL = /https?:\/\/(?:www\.)?linkedin\.com\/learning\/(?<id>[^/?#]+)/;

  static suitable(url: string): boolean {
    if (LinkedInLearningIE.suitable(url)) return false;
    return InfoExtractor.suitable.call(this, url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const courseSlug = this._match_id(url);
    const courseData = await this._callApi(courseSlug, 'chapters,description,title');

    const entries: VideoInfo[] = [];
    let chapterNumber = 0;
    for (const chapter of (courseData.chapters as Array<Record<string, unknown>>) || []) {
      chapterNumber += 1;
      const chapterTitle = str_or_none(chapter.title);
      const chapterId = this._getUrnId(chapter);
      for (const video of (chapter.videos as Array<Record<string, unknown>>) || []) {
        const videoSlug = str_or_none(video.slug);
        if (!videoSlug) continue;
        entries.push({
          _type: 'url_transparent',
          id: this._getVideoId(video, courseSlug, videoSlug),
          title: str_or_none(video.title) ?? undefined,
          url: `https://www.linkedin.com/learning/${courseSlug}/${videoSlug}`,
          chapter: chapterTitle ?? undefined,
          chapter_number: chapterNumber,
          chapter_id: chapterId ?? undefined,
          ie_key: 'LinkedInLearning',
        });
      }
    }

    return this.playlist_result(
      entries,
      courseSlug,
      str_or_none(courseData.title) ?? courseSlug,
      str_or_none(courseData.description) ?? undefined,
    );
  }
}

export class LinkedInEventsIE extends InfoExtractor {
  static IE_NAME = 'linkedin:events';
  static _VALID_URL = /https?:\/\/(?:www\.)?linkedin\.com\/events\/(?<id>[\w-]+)/;

  async _real_initialize(): Promise<void> {
    if (!this._get_cookies('https://www.linkedin.com/').li_at) {
      this.raise_login_required();
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const eventId = this._match_id(url);
    const webpage = await this._download_webpage(url, eventId);

    const codeBlocks = [...webpage.matchAll(/<code[^>]+style="display:\s*none"[^>]*>([\s\S]*?)<\/code>/gi)].map((m) => m[1]);
    const baseData: unknown[] = [];
    for (const block of codeBlocks) {
      try {
        const parsed = JSON.parse(block || '{}') as { included?: unknown[] };
        if (parsed.included) baseData.push(...parsed.included);
      } catch {
        /* skip */
      }
    }

    let metaData: Record<string, unknown> = {};
    for (const item of baseData) {
      if (item && typeof item === 'object' && (item as Record<string, unknown>)['$type'] === 'com.linkedin.voyager.dash.events.ProfessionalEvent') {
        metaData = item as Record<string, unknown>;
        break;
      }
    }

    const liveStatusMap: Record<string, string> = { PAST: 'was_live', ONGOING: 'is_live', FUTURE: 'is_upcoming' };
    const liveStatus = liveStatusMap[String(metaData.lifecycleState || '')];

    let playerData: Record<string, unknown> = {};
    if (liveStatus === 'is_upcoming') {
      const eventTime = str_or_none(traverse_obj(metaData, ['displayEventTime']));
      this.raise_no_formats(eventTime ? `This live event is scheduled for ${eventTime}` : 'This live event has not yet started', true);
    } else {
      for (const item of baseData) {
        if (item && typeof item === 'object' && (item as Record<string, unknown>)['$type'] === 'com.linkedin.videocontent.VideoPlayMetadata') {
          playerData = item as Record<string, unknown>;
          break;
        }
      }
      if (!Object.keys(playerData).length) {
        throw new ExtractorError('Unable to extract video player data');
      }
    }

    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    for (const progFmts of (playerData.progressiveStreams as Array<Record<string, unknown>>) || []) {
      for (const loc of (progFmts.streamingLocations as Array<Record<string, unknown>>) || []) {
        const fmtUrl = url_or_none(loc.url);
        if (!fmtUrl) continue;
        formats.push({
          url: fmtUrl,
          format_id: `progressive-${progFmts.height || formats.length}`,
          width: int_or_none(progFmts.width) ?? undefined,
          height: int_or_none(progFmts.height) ?? undefined,
          tbr: int_or_none(progFmts.bitRate, 1000) ?? undefined,
          filesize: int_or_none(progFmts.size) ?? undefined,
          ext: mimetype2ext(str_or_none(progFmts.mediaType)) || undefined,
        });
      }
    }

    for (const stream of (playerData.adaptiveStreams as Array<Record<string, unknown>>) || []) {
      if (stream.protocol !== 'HLS') continue;
      for (const pl of (stream.masterPlaylists as Array<Record<string, unknown>>) || []) {
        const m3u8Url = url_or_none(pl.url);
        if (!m3u8Url) continue;
        const res = await extractM3u8FormatsAndSubtitles(this, m3u8Url, eventId, 'hls');
        formats.push(...res.formats);
        subtitles = mergeSubtitles(subtitles, res.subtitles);
      }
    }

    const descriptionObj = metaData.description as Record<string, unknown> | undefined;

    return {
      id: eventId,
      formats,
      subtitles: Object.keys(subtitles).length ? subtitles : undefined,
      live_status: liveStatus as VideoInfo['live_status'],
      title: str_or_none(metaData.name) ?? eventId,
      description: str_or_none(descriptionObj?.text) ?? undefined,
      timestamp: int_or_none(metaData.createdAt, 1000) ?? undefined,
      release_timestamp:
        int_or_none(traverse_obj(metaData, ['timeRange', 'start']), 1000) ??
        int_or_none(playerData.liveStreamCreatedAt, 1000) ??
        undefined,
      duration: int_or_none(playerData.duration, 1000) ?? undefined,
    };
  }
}
