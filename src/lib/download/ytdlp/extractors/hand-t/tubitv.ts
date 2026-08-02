/** TubiTvIE / TubiTvShowIE — ported from yt-dlp tubitv.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, Thumbnail, VideoInfo } from '../../types';
import { int_or_none, js_to_json, str_or_none, traverse_obj, url_or_none } from '../../utils';
import { strip_or_none } from './_helpers';

const UNPLAYABLE_FORMATS = new Set([
  'hlsv6_widevine',
  'hlsv6_widevine_nonclearlead',
  'hlsv6_playready_psshv0',
  'hlsv6_fairplay',
  'dash_widevine',
  'dash_widevine_nonclearlead',
]);

function stripOrNone(v: unknown): string | undefined {
  const s = strip_or_none(v);
  return s ?? undefined;
}

export class TubiTvIE extends InfoExtractor {
  static IE_NAME = 'tubitv';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?tubitv\.com\/(?:[a-z]{2}-[a-z]{2}\/)?(?<type>video|movies|tv-shows)\/(?<id>\d+)/;

  protected async _perform_login(username: string, password: string): Promise<void> {
    const loginPage = await this._download_json<Record<string, unknown>>(
      'http://tubitv.com/login',
      undefined,
      undefined,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        data: new URLSearchParams({ username, password }).toString(),
        fatal: false,
      },
    );
    void loginPage;
    const verifyPage = await this._download_webpage('http://tubitv.com/login', undefined, undefined, {
      fatal: false,
    });
    if (!/id="tubi-logout"/.test(verifyPage)) {
      throw new ExtractorError('Login failed (invalid username/password)', { expected: true });
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const videoType = m.groups!.type!;
    const webpage = await this._download_webpage(
      `https://tubitv.com/${videoType}/${videoId}/`,
      videoId,
    );
    const data = this._search_json<{ video: { byId: Record<string, Record<string, unknown>> } }>(
      /window\.__data\s*=/,
      webpage,
      'data',
      videoId,
      { transform_source: js_to_json },
    );
    if (!data) throw new ExtractorError('Unable to extract video data', { expected: true });
    const videoData = data.video.byId[videoId]!;

    const formats: Format[] = [];
    let drmFormats = false;

    for (const resource of traverse_obj(videoData, [
      'video_resources',
      (v: unknown) => url_or_none((v as Record<string, unknown>)?.manifest && (v as { manifest: { url?: string } }).manifest?.url),
    ]) as Array<Record<string, unknown>>) {
      const resourceType = str_or_none(resource.type);
      const manifest = (resource.manifest as Record<string, unknown>) || {};
      const manifestUrl = str_or_none(manifest.url);
      if (!manifestUrl) continue;
      if (resourceType === 'dash') {
        formats.push(...(await this._extract_mpd_formats(manifestUrl, videoId, resourceType, undefined, false)));
      } else if (resourceType === 'hlsv3' || resourceType === 'hlsv6') {
        formats.push(
          ...(await this._extract_m3u8_formats(
            manifestUrl,
            videoId,
            'mp4',
            'm3u8_native',
            undefined,
            undefined,
            resourceType,
            undefined,
            false,
          )),
        );
      } else if (resourceType && UNPLAYABLE_FORMATS.has(resourceType)) {
        drmFormats = true;
      } else if (resourceType) {
        this.report_warning(`Skipping unknown resource type "${resourceType}"`);
      }
    }

    if (!formats.length && drmFormats) {
      this.report_warning(`DRM protected: ${videoId}`);
    } else if (!formats.length && videoData.policy_match === false) {
      throw new ExtractorError('This content is currently unavailable', { expected: true });
    }

    const subtitles: Record<string, Subtitle[]> = {};
    for (const sub of traverse_obj(videoData, [
      'subtitles',
      (v: unknown) => url_or_none((v as Record<string, unknown>).url),
    ]) as Array<Record<string, unknown>>) {
      const lang = str_or_none(sub.lang) || 'English';
      const subUrl = str_or_none(sub.url);
      if (!subUrl) continue;
      (subtitles[lang] ||= []).push({
        url: subUrl.startsWith('//') ? `https:${subUrl}` : subUrl,
        ext: 'vtt',
      });
    }

    const title = str_or_none(videoData.title);
    const episodeInfo = title?.match(/^S(\d+):E(\d+) - (.+)/);
    const seasonNumber = episodeInfo?.[1];
    const episodeNumber = episodeInfo?.[2];
    const episodeTitle = episodeInfo?.[3];

    const thumbs = traverse_obj(videoData, ['thumbnails']) as Array<{ url?: string }> | undefined;

    return {
      id: videoId,
      title: stripOrNone(title),
      formats,
      subtitles: Object.keys(subtitles).length ? subtitles : undefined,
      season_number: int_or_none(seasonNumber) ?? undefined,
      episode_number: int_or_none(episodeNumber) ?? undefined,
      episode: stripOrNone(episodeTitle),
      description: str_or_none(videoData.description) ?? undefined,
      duration: int_or_none(videoData.duration) ?? undefined,
      uploader_id: str_or_none(videoData.publisher_id) ?? undefined,
      release_year: int_or_none(videoData.year) ?? undefined,
      thumbnails: thumbs
        ?.map((t) => {
          const u = str_or_none(t.url);
          return u ? { url: u.startsWith('//') ? `https:${u}` : u } : null;
        })
        .filter(Boolean) as Thumbnail[] | undefined,
    };
  }
}

export class TubiTvShowIE extends InfoExtractor {
  static IE_NAME = 'tubitv:series';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?tubitv\.com\/series\/\d+\/(?<show_name>[^/?#]+)(?:\/season-(?<season>\d+))?/;

  protected async *_entries(
    showUrl: string,
    playlistId: string,
    selectedSeason: string | undefined,
  ): AsyncGenerator<VideoInfo> {
    const webpage = await this._download_webpage(showUrl, playlistId);
    const data = this._search_json<{ queries: Array<{ state: { data: Record<string, unknown> } }> }>(
      /window\.__REACT_QUERY_STATE__\s*=/,
      webpage,
      'data',
      playlistId,
      { transform_source: js_to_json },
    );
    if (!data) throw new ExtractorError('Unable to extract show data', { expected: true });
    const seasons = (data.queries[0]?.state?.data?.seasons as Array<Record<string, unknown>>) || [];

    for (const season of seasons) {
      if (selectedSeason && String(season.number) !== selectedSeason) continue;
      const seasonNumber = int_or_none(season.number);
      for (const episode of (season.episodes as Array<Record<string, unknown>>) || []) {
        if (!episode.id) continue;
        const episodeId = String(episode.id);
        yield this.url_result(
          `https://tubitv.com/tv-shows/${episodeId}/`,
          'TubiTv',
          episodeId,
          undefined,
        );
        void seasonNumber;
        void episode.num;
      }
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const showName = m.groups!.show_name!;
    const selectedSeason = m.groups!.season;
    const playlistId = selectedSeason ? `${showName}-season-${selectedSeason}` : showName;
    const entries: VideoInfo[] = [];
    for await (const entry of this._entries(url, playlistId, selectedSeason)) {
      entries.push(entry);
    }
    return this.playlist_result(entries, playlistId);
  }
}
