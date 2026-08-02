/** RAI* — ported from yt-dlp rai.py (main paths, simplified relinker) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  determine_ext,
  int_or_none,
  join_nonempty,
  parse_duration,
  remove_start,
  traverse_obj,
  unified_timestamp,
  update_url_query,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, strip_or_none } from './_helpers';

const UUID_RE = '[\\da-f]{8}-[\\da-f]{4}-[\\da-f]{4}-[\\da-f]{4}-[\\da-f]{12}';

export class RaiBaseIE extends InfoExtractor {
  static IE_NAME = 'RaiBase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _GEO_COUNTRIES = ['IT'];

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('RaiBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _extractRelinkerInfo(relinkerUrl: string, videoId: string): Promise<{ formats: Format[]; is_live?: boolean; duration?: number }> {
    if (!/^https?:\/\//.test(relinkerUrl)) {
      return { formats: [{ url: relinkerUrl, format_id: 'http' }] };
    }
    const xml = await this._download_webpage(relinkerUrl, videoId, 'Downloading XML metadata', {
      query: { output: '64' },
      headers: { ...this.geo_verification_headers(), 'User-Agent': 'Rai' },
    });
    if (/license_url[^>]*>\{\}/.test(xml)) this.report_warning('This video is probably DRM protected.');
    const isLive = /<is_live>Y<\/is_live>/.test(xml);
    const duration = parse_duration(xml.match(/<duration>([^<]+)/)?.[1]);
    const mediaUrl = xml.match(/<url type="content">([^<]+)/)?.[1];
    if (!mediaUrl) throw new ExtractorError('The relinker returned no media url');
    if (/<geoprotection>Y<\/geoprotection>/.test(xml) || mediaUrl.includes('/video_no_available.mp4')) {
      this.raise_geo_restricted(undefined, RaiBaseIE._GEO_COUNTRIES);
    }
    const ext = determine_ext(mediaUrl).toLowerCase();
    let formats: Format[] = [];
    if (ext === 'mp3') {
      formats = [{ url: mediaUrl, vcodec: 'none', acodec: 'mp3', format_id: 'https-mp3' }];
    } else if (ext === 'm3u8' || mediaUrl.includes('format=m3u8')) {
      formats = (await extractM3u8FormatsAndSubtitles(this, mediaUrl, videoId, 'hls')).formats;
    } else if (ext === 'mp4') {
      const bitrate = int_or_none(xml.match(/<bitrate>(\d+)/)?.[1]);
      formats = [{ url: mediaUrl, tbr: bitrate && bitrate > 0 ? bitrate : undefined, format_id: join_nonempty('https', String(bitrate || ''), '-') || 'https' }];
    } else {
      formats = [{ url: mediaUrl, format_id: ext || 'http' }];
    }
    return { formats, is_live: isLive, duration: duration ?? undefined };
  }
}

export class RaiPlayIE extends RaiBaseIE {
  static IE_NAME = 'RaiPlay';
  static _VALID_URL = new RegExp(`(?<base>https?:\\/\\/(?:www\\.)?raiplay\\.it\\/.+?-(?<id>${UUID_RE}))\\.(?:html|json)`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const base = m.groups!.base!;
    const videoId = m.groups!.id!;
    const media = await this._download_json<Record<string, unknown>>(`${base}.json`, videoId, 'Downloading video JSON');
    if (traverse_obj(media, ['rights_management', 'rights', 'drm'])) this.report_warning('This video is probably DRM protected.');
    const video = (media.video as Record<string, unknown>) || {};
    const relinker = await this._extractRelinkerInfo(String(video.content_url || ''), videoId);
    const datePublished = join_nonempty(media.date_published as string, media.time_published as string, ' ');
    return {
      id: remove_start(String(media.id || ''), 'ContentItem-') || videoId,
      display_id: videoId,
      title: media.name as string | undefined,
      alt_title: strip_or_none(join_nonempty(media.subtitle as string, media.toptitle as string, ' - ')) ?? undefined,
      description: media.description as string | undefined,
      uploader: strip_or_none(String(traverse_obj(media, ['program_info', 'channel']) || media.channel || '')) ?? undefined,
      duration: parse_duration(video.duration as string) ?? relinker.duration,
      timestamp: unified_timestamp(datePublished) ?? undefined,
      series: traverse_obj(media, ['program_info', 'name']) as string | undefined,
      season: media.season as string | undefined,
      episode: media.name as string | undefined,
      formats: relinker.formats,
      is_live: relinker.is_live,
    };
  }
}

export class RaiPlayLiveIE extends RaiPlayIE {
  static IE_NAME = 'RaiPlayLive';
  static _VALID_URL = new RegExp(`https?:\\/\\/(?:www\\.)?raiplay\\.it\\/dirette\\/(?<id>${UUID_RE})`);
}

export class RaiPlayPlaylistIE extends InfoExtractor {
  static IE_NAME = 'RaiPlayPlaylist';
  static _VALID_URL = /https?:\/\/(?:www\.)?raiplay\.it\/programmi\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    const entries = [...webpage.matchAll(new RegExp(`href="(/video/[^"]+-(${UUID_RE})\\.html)"`, 'g'))].map((m) =>
      this.url_result(`https://www.raiplay.it${m[1]}`, 'RaiPlay', m[2]),
    );
    return this.playlist_result(entries, playlistId, this._og_search_title(webpage) ?? undefined);
  }
}

export class RaiPlaySoundIE extends RaiBaseIE {
  static IE_NAME = 'RaiPlaySound';
  static _VALID_URL = new RegExp(`https?:\\/\\/(?:www\\.)?raiplaysound\\.it\\/(?:audio|podcast|programmi)\\/[^/?#]+-(?<id>${UUID_RE})\\.html`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const relinkerUrl = this._search_regex(/"content_url"\s*:\s*"([^"]+)"/, webpage, 'relinker url')!;
    const relinker = await this._extractRelinkerInfo(relinkerUrl.replace(/\\u0026/g, '&'), videoId);
    return {
      id: videoId,
      title: this._og_search_title(webpage) ?? undefined,
      description: this._og_search_description(webpage) ?? undefined,
      thumbnail: this._og_search_thumbnail(webpage) ?? undefined,
      formats: relinker.formats,
    };
  }
}

export class RaiPlaySoundLiveIE extends RaiPlaySoundIE {
  static IE_NAME = 'RaiPlaySoundLive';
  static _VALID_URL = /https?:\/\/(?:www\.)?raiplaysound\.it\/dirette\/(?<id>[\w-]+)/;
}

export class RaiPlaySoundPlaylistIE extends InfoExtractor {
  static IE_NAME = 'RaiPlaySoundPlaylist';
  static _VALID_URL = /https?:\/\/(?:www\.)?raiplaysound\.it\/programmi\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    const entries = [...webpage.matchAll(new RegExp(`href="(/audio/[^"]+-(${UUID_RE})\\.html)"`, 'g'))].map((m) =>
      this.url_result(`https://www.raiplaysound.it${m[1]}`, 'RaiPlaySound', m[2]),
    );
    return this.playlist_result(entries, playlistId, this._og_search_title(webpage) ?? undefined);
  }
}

export class RaiIE extends RaiBaseIE {
  static IE_NAME = 'Rai';
  static _VALID_URL = /https?:\/\/(?:www\.)?rai\.it\/(?:dl\/[^/]+\/)?(?:[^/]+\/){2,}(?<id>[\w-]+-\d+)\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const relinkerUrl = update_url_query(
      this._search_regex(/"audio"\s*:\s*"([^"]+)"/, webpage, 'relinker', null, false) ||
        this._search_regex(/"video"\s*:\s*"([^"]+)"/, webpage, 'relinker')!,
      { output: '64' },
    );
    const relinker = await this._extractRelinkerInfo(relinkerUrl, videoId);
    return {
      id: videoId,
      title: this._html_search_regex(/<h1[^>]*class="title"[^>]*>([\s\S]+?)<\/h1>/, webpage, 'title')!,
      description: this._og_search_description(webpage) ?? undefined,
      thumbnail: this._og_search_thumbnail(webpage) ?? undefined,
      formats: relinker.formats,
    };
  }
}

export class RaiNewsIE extends RaiBaseIE {
  static IE_NAME = 'RaiNews';
  static _VALID_URL = /https?:\/\/(?:www\.)?rainews\.it\/(?:[^/]+\/){1,2}(?<id>[^/?#.]+?)(?:\.html)?(?:$|[?#])/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const jsonData = this._search_json(/var\s+videoInfo\s*=\s*/, webpage, 'video info', videoId) as Record<string, unknown>;
    const relinker = await this._extractRelinkerInfo(String(jsonData.contentUrl || ''), videoId);
    return {
      id: videoId,
      title: jsonData.title as string | undefined,
      description: jsonData.description as string | undefined,
      formats: relinker.formats,
    };
  }
}

export class RaiCulturaIE extends RaiNewsIE {
  static IE_NAME = 'RaiCultura';
  static _VALID_URL = /https?:\/\/(?:www\.)?raicultura\.it\/(?:[^/]+\/){1,2}(?<id>[^/?#.]+?)(?:\.html)?(?:$|[?#])/;
}

export class RaiSudtirolIE extends RaiBaseIE {
  static IE_NAME = 'RaiSudtirol';
  static _VALID_URL = /https?:\/\/(?:www\.)?raisudtirol\.it\/(?:[^/]+\/){1,2}(?<id>[^/?#.]+?)(?:\.html)?(?:$|[?#])/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const mediaUrl = this._search_regex(/data-media-url="([^"]+)"/, webpage, 'media url')!;
    const relinker = await this._extractRelinkerInfo(mediaUrl, videoId);
    return {
      id: videoId,
      title: this._og_search_title(webpage) ?? undefined,
      formats: relinker.formats,
    };
  }
}
