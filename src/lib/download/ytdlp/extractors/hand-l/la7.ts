/**
 * LA7IE / LA7PodcastEpisodeIE / LA7PodcastIE — ported from yt-dlp la7.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { float_or_none, int_or_none, parse_duration, unified_strdate } from '../../utils';

const HOST = 'https://awsvodpkg.iltrovatore.it';

export class LA7IE extends InfoExtractor {
  static IE_NAME = 'la7.it';
  static _VALID_URL =
    /https?:\/\/(?:(?:www\.)?la7\.it\/[^/]+\/(?:rivedila7|video|news)\/|tg\.la7\.it\/repliche-tgla7\?id=)(?<id>.+)/;

  protected async _generateMp4Url(quality: string, m3u8Formats: Format[]): Promise<Format | null> {
    for (const f of m3u8Formats) {
      if (f.vcodec !== 'none' && f.url?.includes(quality)) {
        const httpUrl = `${HOST}${quality}.mp4`;
        const urlh = await this._request_webpage(httpUrl, quality, 'Check filesize', { fatal: false });
        if (urlh) {
          const httpF: Format = { ...f, format_id: (f.format_id || 'hls').replace('hls-', 'https-'), url: httpUrl, protocol: 'https' };
          delete (httpF as { manifest_url?: string }).manifest_url;
          const cl = urlh.headers?.['content-length'];
          if (cl) httpF.filesize_approx = int_or_none(cl) ?? undefined;
          return httpF;
        }
        return null;
      }
    }
    return null;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    if (/drmsupport\s*:\s*true/i.test(webpage)) {
      throw new ExtractorError(`DRM protected: ${videoId}`, { expected: true });
    }

    const videoPath = this._search_regex(/(\/content\/[\w/,]+?)\.mp4(?:\.csmil)?\/master\.m3u8/, webpage, 'video_path')!;

    const formats: Format[] = [];
    formats.push(...(await this._extract_mpd_formats(`${HOST}/local/dash/,${videoPath}.mp4.urlset/manifest.mpd`, videoId, 'dash', undefined, false)));
    const m3u8Formats = await this._extract_m3u8_formats(`${HOST}/local/hls/,${videoPath}.mp4.urlset/master.m3u8`, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false);
    formats.push(...m3u8Formats);

    for (const q of videoPath.split(',').filter(Boolean)) {
      const httpF = await this._generateMp4Url(q, m3u8Formats);
      if (httpF) formats.push(httpF);
    }

    return {
      id: videoId,
      title: this._og_search_title(webpage, false) || undefined,
      description: this._og_search_description(webpage) || undefined,
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
      formats,
      upload_date: unified_strdate(this._search_regex(/datetime="(.+?)"/, webpage, 'upload_date', null, false)) || undefined,
    };
  }
}

export class LA7PodcastEpisodeIE extends InfoExtractor {
  static IE_NAME = 'la7.it:pod:episode';
  static _VALID_URL = /https?:\/\/(?:www\.)?la7\.it\/[^/]+\/podcast\/(?:[^/]+-)?(?<id>\d+)/;

  protected _extractInfo(webpage: string, videoId?: string, ppn?: string | null): VideoInfo {
    const vid =
      videoId ||
      this._search_regex(/data-nid=(['"])(?<vid>\d+)\1/, webpage, 'video_id', null, true, 'vid')!;

    const mediaUrl = this._search_regex(
      [/src\s*:\s*(['"])(?<url>\S+?mp3.+?)\1/, /data-podcast\s*=\s*(['"])(?<url>\S+?mp3.+?)\1/],
      webpage,
      'media_url',
      null,
      true,
      'url',
    )!;

    const formats: Format[] = [{ url: mediaUrl, format_id: 'http-mp3', ext: 'mp3', acodec: 'mp3', vcodec: 'none' }];

    let title =
      this._html_search_regex(
        [/<div class="title">(?<title>.+?)</, /<title>(?<title>[^<]+)<\/title>/, /title:\s*(['"])(?<title>.+?)\1/],
        webpage,
        'title',
        null,
        true,
        'title',
      ) || vid;

    const description =
      this._html_search_regex(
        [
          /<div class="description">(.+?)<\/div>/,
          /<div class="description-mobile">(.+?)<\/div>/,
          /<div class="box-txt">([^<]+?)<\/div>/,
          /<div class="field-content"><p>(.+?)<\/p><\/div>/,
        ],
        webpage,
        'description',
        null,
        false,
      ) ||
      this._html_search_meta('description', webpage) ||
      undefined;

    const thumb =
      this._html_search_regex(
        [
          /<div class="podcast-image"><img src="(.+?)"><\/div>/,
          /<div class="container-embed"[^<]+url\((.+?)\);">/,
          /<div class="field-content"><img src="(.+?)"/,
        ],
        webpage,
        'thumbnail',
        null,
        false,
      ) || undefined;

    const duration = parse_duration(
      this._html_search_regex(/<span class="(?:durata|duration)">([\d:]+)<\/span>/, webpage, 'duration', null, false),
    );

    const date = this._html_search_regex(/class="data">\s*(?:<span>)?([\d.]+)\s*</, webpage, 'date', null, false);
    const dateAlt = this._search_regex(/(\d+[./]\d+[./]\d+)/, title, 'date_alt', null, false);
    const ppnVal =
      ppn ||
      this._search_regex(/ppN:\s*(['"])(?<ppn>.+?)\1/, webpage, 'ppn', null, false, 'ppn');

    if (date && !dateAlt && ppnVal && ppnVal.toLowerCase() === String(title).toLowerCase()) {
      title = `${title} del ${date}`;
    }

    return {
      id: vid,
      title,
      description,
      duration: float_or_none(duration) ?? undefined,
      formats,
      thumbnail: thumb || undefined,
      upload_date: unified_strdate(date) || undefined,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    return this._extractInfo(webpage, videoId);
  }
}

export class LA7PodcastIE extends LA7PodcastEpisodeIE {
  static IE_NAME = 'la7.it:podcast';
  static _VALID_URL = /https?:\/\/(?:www\.)?la7\.it\/(?<id>[^/]+)\/podcast\/?(?:$|[#?])/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);

    const title =
      this._html_search_regex(/<h1.*?>(.+?)<\/h1>/, webpage, 'title', null, false) ||
      this._og_search_title(webpage) ||
      playlistId;
    const ppn = this._search_regex(/window\.ppN\s*=\s*(['"])(?<ppn>.+?)\1/, webpage, 'ppn', null, false, 'ppn');

    const entries: VideoInfo[] = [];
    for (const m of webpage.matchAll(/<div class="container-podcast-property">([\s\S]+?)(?:<\/div>\s*){3}/g)) {
      entries.push(this._extractInfo(m[1]!, undefined, ppn));
    }

    return this.playlist_result(entries, playlistId, title);
  }
}
