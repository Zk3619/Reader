/** MailRuIE / MailRuMusicIE / MailRuMusicSearchIE — ported from yt-dlp mailru.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  int_or_none,
  parse_duration,
  remove_end,
  str_or_none,
  try_get,
  traverse_obj,
} from '../../utils';
import { urljoin } from './_helpers';

export class MailRuMusicSearchBaseIE extends InfoExtractor {
  static IE_NAME = 'mailrumusicsearchbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('MailRuMusicSearchBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _search(
    query: string,
    pageUrl: string,
    audioId: string,
    limit = 100,
    offset = 0,
  ): Promise<Record<string, unknown>> {
    const search = await this._download_json<unknown[]>(
      'https://my.mail.ru/cgi-bin/my/ajax',
      audioId,
      `Downloading songs JSON page ${offset / limit + 1}`,
      {
        headers: { Referer: pageUrl, 'X-Requested-With': 'XMLHttpRequest' },
        query: {
          xemail: '',
          ajax_call: '1',
          func_name: 'music.search',
          mna: '',
          mnb: '',
          arg_query: query,
          arg_extended: '1',
          arg_search_params: JSON.stringify({ music: { limit, offset } }),
          arg_limit: String(limit),
          arg_offset: String(offset),
        },
      },
    );
    return (search.find((e) => e && typeof e === 'object') as Record<string, unknown>) || {};
  }

  protected static _extractTrack(t: Record<string, unknown>, fatal = true): VideoInfo | undefined {
    const audioUrl = fatal ? (t.URL as string) : (t.URL as string | undefined);
    if (!audioUrl) return undefined;
    const audioId = fatal ? (t.File as string) : (t.File as string | undefined);
    if (!audioId) return undefined;

    const track = str_or_none(t.Name) || str_or_none(t.Name_Text_HTML);
    const artist = str_or_none(t.Author) || str_or_none(t.Author_Text_HTML);
    const title = track ? (artist ? `${artist} - ${track}` : track) : audioId;

    return {
      extractor_key: 'MailRuMusic',
      id: audioId,
      title,
      thumbnail: str_or_none(t.AlbumCoverURL) || str_or_none(t.FiledAlbumCover) || undefined,
      uploader: str_or_none(t.OwnerName) || str_or_none(t.OwnerName_Text_HTML) || undefined,
      uploader_id: str_or_none(t.UploaderID) ?? undefined,
      duration:
        int_or_none(t.DurationInSeconds) ??
        parse_duration(t.Duration ?? t.DurationStr) ??
        undefined,
      view_count: int_or_none(t.PlayCount ?? t.PlayCount_hr) ?? undefined,
      vcodec: 'none',
      abr: int_or_none(t.BitRate) ?? undefined,
      track: track ?? undefined,
      artist: artist ?? undefined,
      album: str_or_none(t.Album) ?? undefined,
      url: audioUrl,
      formats: [{ url: audioUrl, format_id: 'http', vcodec: 'none' }],
    };
  }
}

export class MailRuIE extends InfoExtractor {
  static IE_NAME = 'mailru';
  static IE_DESC = 'Видео@Mail.Ru';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|m|videoapi)\.)?my\.mail\.ru\/+(?:video\/.*#video=\/?(?<idv1>(?:[^/]+\/){3}\d+)|(?:videos\/embed\/)?(?<idv2prefix>(?:[^/]+\/+){2})(?:video\/(?:embed\/)?)?(?<idv2suffix>[^/]+\/\d+)(?:\.html)?|(?:video\/embed|\+(?:\/video\/meta))\/(?<metaid>\d+))/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const mobj = this._match_valid_url(url)!;
    const metaId = mobj.groups?.metaid;
    let videoId = mobj.groups?.idv1 || undefined;
    let metaUrl: string | null = null;

    if (metaId) {
      metaUrl = `https://my.mail.ru/+/video/meta/${metaId}`;
    } else {
      if (!videoId) videoId = `${mobj.groups?.idv2prefix}${mobj.groups?.idv2suffix}`;
      const webpage = await this._download_webpage(url, videoId);
      const pageConfigRaw =
        this._search_regex(
          [/<script[^>]+class="sp-video__page-config"[^>]*>([\s\S]+?)<\/script>/, /"video":\s*(\{[\s\S]+?\}),/],
          webpage,
          'page config',
          '{}',
          false,
        ) || '{}';
      const pageConfig = this._parse_json<Record<string, unknown>>(pageConfigRaw, videoId, undefined, false) || {};
      metaUrl =
        str_or_none(pageConfig.metaUrl) ||
        str_or_none(traverse_obj(pageConfig, ['video', 'metaUrl'])) ||
        str_or_none(pageConfig.metadataUrl);
    }

    let videoData: Record<string, unknown> | null = null;
    if (metaUrl && /^\/\+\//.test(metaUrl)) metaUrl = urljoin('https://my.mail.ru', metaUrl);

    if (metaUrl) {
      videoData = await this._download_json(metaUrl, videoId || metaId!, 'Downloading video meta JSON', {
        fatal: !videoId,
      });
    }
    if (!videoData && videoId) {
      videoData = await this._download_json(
        `http://api.video.mail.ru/videos/${videoId}.json?new=1`,
        videoId,
        'Downloading video JSON',
      );
    }
    if (!videoData) throw new ExtractorError('Unable to extract video data');

    const videoKey = this._get_cookies('https://my.mail.ru').video_key;
    const formats: Format[] = [];
    for (const f of (videoData.videos as Array<Record<string, unknown>>) || []) {
      const fUrl = str_or_none(f.url);
      if (!fUrl) continue;
      if (videoKey) {
        try {
          const host = new URL(fUrl).hostname;
          void host;
        } catch {
          /* ignore */
        }
      }
      const formatId = str_or_none(f.key);
      const height = formatId ? int_or_none(this._search_regex(/^(\d+)[pP]$/, formatId, 'height', null, false)) : null;
      formats.push({ url: fUrl, format_id: formatId || 'http', height: height ?? undefined });
    }

    const meta = (videoData.meta as Record<string, unknown>) || {};
    const author = (videoData.author as Record<string, unknown>) || {};
    const accId = meta.accId;
    const itemId = meta.itemId;
    const contentId = accId && itemId ? `${accId}_${itemId}` : videoId;

    return {
      id: String(contentId ?? videoId ?? metaId),
      title: remove_end(String(meta.title ?? ''), '.mp4') ?? undefined,
      thumbnail: str_or_none(meta.poster) ?? undefined,
      timestamp: int_or_none(meta.timestamp) ?? undefined,
      uploader: str_or_none(author.name) ?? undefined,
      uploader_id: str_or_none(author.id) || str_or_none(author.email) || undefined,
      duration: int_or_none(meta.duration) ?? undefined,
      view_count: int_or_none(videoData.viewsCount ?? videoData.views_count) ?? undefined,
      formats,
    };
  }
}

export class MailRuMusicIE extends MailRuMusicSearchBaseIE {
  static IE_NAME = 'mailru:music';
  static IE_DESC = 'Музыка@Mail.Ru';
  static _VALID_URL = /https?:\/\/my\.mail\.ru\/+music\/+songs\/+[^/?#&]+-(?<id>[\da-f]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const audioId = this._match_id(url);
    const webpage = await this._download_webpage(url, audioId);
    const title = this._og_search_title(webpage)!;
    const musicData = (await this._search(title, url, audioId)).MusicData as Array<Record<string, unknown>>;
    const t = musicData.find((row) => row.File === audioId);
    if (!t) throw new ExtractorError('Unable to find track');
    const info = MailRuMusicSearchBaseIE._extractTrack(t)!;
    info.title = title;
    return info;
  }
}

export class MailRuMusicSearchIE extends MailRuMusicSearchBaseIE {
  static IE_NAME = 'mailru:music:search';
  static IE_DESC = 'Музыка@Mail.Ru';
  static _VALID_URL = /https?:\/\/my\.mail\.ru\/+music\/+search\/+(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const query = decodeURIComponent(this._match_id(url));
    const entries: VideoInfo[] = [];
    const limit = 100;
    let offset = 0;

    for (;;) {
      const search = await this._search(query, url, query, limit, offset);
      const musicData = search.MusicData;
      if (!Array.isArray(musicData) || !musicData.length) break;
      for (const t of musicData) {
        const track = MailRuMusicSearchBaseIE._extractTrack(t as Record<string, unknown>, false);
        if (track) entries.push(track);
      }
      const total = try_get(search, (x) => (x as Record<string, unknown>).Results as Record<string, unknown>, undefined);
      const musicTotal = try_get(total, (x) => (x as Record<string, unknown>).music as Record<string, unknown>, undefined);
      const totalNum = int_or_none((musicTotal as Record<string, unknown>)?.Total);
      if (totalNum != null && offset > totalNum) break;
      offset += limit;
    }

    return this.playlist_result(entries, query);
  }
}
