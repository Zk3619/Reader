/**
 * FranceTVIE / FranceTVSiteIE / FranceTVInfoIE ??ported from yt-dlp francetv.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  clean_html,
  determine_ext,
  filter_dict,
  int_or_none,
  join_nonempty,
  smuggle_url,
  traverse_obj,
  unsmuggle_url,
  url_or_none,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles, parseIso8601, searchNextjsData } from './_helpers';

abstract class FranceTVBaseInfoExtractor extends InfoExtractor {
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  protected _makeUrlResult(videoId: string, pageUrl?: string): VideoInfo {
    const bareId = videoId.split('@')[0]!;
    let fullId = `francetv:${bareId}`;
    if (pageUrl) {
      fullId = smuggle_url(fullId, { hostname: new URL(pageUrl).hostname });
    }
    return this.url_result(fullId, 'FranceTV', bareId);
  }
}

export class FranceTVIE extends InfoExtractor {
  static IE_NAME = 'francetv';
  static _VALID_URL = /francetv:(?<id>[^@#]+)/;

  protected async _extractVideo(videoId: string, hostname = 'www.france.tv'): Promise<VideoInfo> {
    let isLive: boolean | undefined;
    const videos: Record<string, unknown>[] = [];
    let drmFormats = false;
    let title: string | undefined;
    let subtitle: string | undefined;
    let episodeNumber: string | undefined;
    let seasonNumber: string | undefined;
    let image: string | undefined;
    let duration: unknown;
    let timestamp: number | undefined;
    const geoCountries = ['FR'];

    for (const [deviceType, browser] of [
      ['desktop', 'chrome'],
      ['mobile', 'safari'],
    ] as const) {
      const dinfo = await this._download_json<Record<string, unknown>>(
        `https://k7.ftven.fr/videos/${videoId}`,
        videoId,
        `Downloading ${deviceType} ${browser} video JSON`,
        {
          query: filter_dict({
            device_type: deviceType,
            browser,
            domain: hostname,
          }) as Record<string, string>,
          fatal: false,
        },
      );

      if (!dinfo || !Object.keys(dinfo).length) continue;

      const video = traverse_obj(dinfo, ['video']) as Record<string, unknown> | undefined;
      if (video) {
        videos.push(video);
        duration ??= video.duration;
        isLive ??= video.is_live as boolean | undefined;
      } else {
        const code = int_or_none(traverse_obj(dinfo, ['code']));
        if (code === 2009) this.raise_geo_restricted(`Only available in ${geoCountries.join(', ')}`);
        if (code === 2015 || code === 2017 || code === 2019) {
          drmFormats = true;
          continue;
        }
        const message = clean_html(String(dinfo.message ?? ''));
        if (code) this.report_warning(`${FranceTVIE.IE_NAME} said: ${code} "${message}"`);
        continue;
      }

      const meta = traverse_obj(dinfo, ['meta']) as Record<string, unknown> | undefined;
      if (meta) {
        title ??= meta.title as string | undefined;
        const preTitle = String(meta.pre_title ?? '');
        const epMatch = /S(\d+)\s*E(\d+)/.exec(preTitle);
        if (epMatch) {
          seasonNumber ??= epMatch[1];
          episodeNumber ??= epMatch[2];
        }
        subtitle ??= meta.additional_title as string | undefined;
        image ??= meta.image_url as string | undefined;
        timestamp ??= parseIso8601(meta.broadcasted_at) ?? undefined;
      }
    }

    if (!videos.length && drmFormats) {
      this.report_warning(`Video ${videoId} is DRM protected`);
    }

    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};

    for (const video of videos) {
      let videoUrl = url_or_none(video.url);
      if (!videoUrl) continue;
      const formatId = String(video.format ?? '');

      const tokenUrl = traverse_obj(video, ['token', url_or_none]) as string | null;
      const akamaiToken = traverse_obj(video, ['token', 'akamai', url_or_none]) as string | null;
      const tokenEndpoint = tokenUrl || akamaiToken;
      if (tokenEndpoint) {
        const tokenized = await this._download_json<{ url?: string }>(
          tokenEndpoint,
          videoId,
          `Downloading signed ${formatId} manifest URL`,
          {
            query: { format: 'json', url: videoUrl },
            fatal: false,
          },
        );
        if (tokenized.url) videoUrl = tokenized.url;
      }

      const ext = determine_ext(videoUrl);
      if (ext === 'm3u8') {
        const res = await extractM3u8FormatsAndSubtitles(this, videoUrl, videoId, formatId || 'hls');
        formats.push(...res.formats);
        mergeSubtitles(subtitles, res.subtitles);
      } else if (ext === 'mpd') {
        formats.push(...(await this._extract_mpd_formats(videoUrl, videoId, formatId || 'dash', undefined, false)));
      } else if (videoUrl.startsWith('rtmp')) {
        formats.push({ url: videoUrl, format_id: join_nonempty('rtmp', formatId), ext: 'flv' });
      } else {
        formats.push({ url: videoUrl, format_id: formatId || 'http' });
      }
    }

    return {
      id: videoId,
      title: join_nonempty(title, subtitle, ' - ').trim() || videoId,
      thumbnail: image,
      duration: int_or_none(duration) ?? undefined,
      timestamp,
      is_live: isLive,
      formats,
      subtitles,
      episode: episodeNumber ? subtitle : undefined,
      series: episodeNumber ? title : undefined,
      episode_number: int_or_none(episodeNumber) ?? undefined,
      season_number: int_or_none(seasonNumber) ?? undefined,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const [cleanUrl, smuggled] = unsmuggle_url(url, {});
    const videoId = this._match_id(cleanUrl);
    const hostname = (smuggled.hostname as string | undefined) || 'www.france.tv';
    return this._extractVideo(videoId, hostname);
  }
}

export class FranceTVSiteIE extends FranceTVBaseInfoExtractor {
  static IE_NAME = 'francetv:site';
  static _VALID_URL =
    /https?:\/\/(?:(?:www\.)?france\.tv|mobile\.france\.tv)\/(?:[^/]+\/)*(?<id>[^/]+)\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const nextData = searchNextjsData(this, webpage, displayId);
    const options = (nextData.options as Record<string, unknown>) || {};
    const videoId = options.id ? String(options.id) : null;
    if (!videoId) throw new ExtractorError('Unable to extract video ID', { expected: true });
    return this._makeUrlResult(videoId, url);
  }
}

export class FranceTVInfoIE extends FranceTVBaseInfoExtractor {
  static IE_NAME = 'franceinfo';
  static IE_DESC = 'franceinfo.fr (formerly francetvinfo.fr)';
  static _VALID_URL =
    /https?:\/\/(?:www|mobile|france3-regions)\.france(?:tv)?info.fr\/(?:[^/?#]+\/)*(?<id>[^/?#&.]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const dmMatch = webpage.match(
      /https?:\/\/(?:geo\.dailymotion\.com\/player\.html\?video=|(?:www\.)?dailymotion\.com\/(?:video|embed\/video)\/)([a-z0-9]+)/i,
    );
    if (dmMatch) {
      return this.playlist_result([
        this.url_result(`https://www.dailymotion.com/video/${dmMatch[1]}`, 'Dailymotion'),
      ]);
    }

    const playerWrapper = webpage.match(
      /<(?:button|div)[^>]*data-cy=["']francetv-player-wrapper["'][^>]*id=["']([^"']+)["']/i,
    );
    const videoId =
      playerWrapper?.[1] ||
      this._search_regex(
        [
          /player\.load[^;]+src:\s*["']([^"']+)"/,
          /id-video=([^@]+@[^"]+)/,
          /<a[^>]+href="(?:https?:)?\/\/videos\.francetv\.fr\/video\/([^@]+@[^"]+)"/,
          /(?:data-id|<figure[^<]+\bid)=["']([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})"/,
        ],
        webpage,
        'video id',
        null,
        false,
      );

    if (!videoId) throw new ExtractorError('Unable to extract video ID', { expected: true });
    return this._makeUrlResult(videoId, url);
  }
}
