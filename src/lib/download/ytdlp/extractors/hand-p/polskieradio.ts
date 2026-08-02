/** PolskieRadio* IEs — ported from yt-dlp polskieradio.py (category tab/postback pagination simplified) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  determine_ext,
  extract_attributes,
  int_or_none,
  js_to_json,
  traverse_obj,
  unified_timestamp,
  url_or_none,
} from '../../utils';
import { parse_iso8601, searchNextjsData, strip_or_none, urljoin } from './_helpers';

export class PolskieRadioBaseIE extends InfoExtractor {
  static IE_NAME = 'polskieradiobase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('PolskieRadioBaseIE is not a standalone extractor', { expected: true });
  }

  protected *_extractWebpagePlayerEntries(
    webpage: string,
    playlistId: string,
    baseData: Partial<VideoInfo>,
  ): Generator<VideoInfo> {
    const seen = new Set<string>();
    for (const m of webpage.matchAll(/<[^>]+data-media="?({[^>]+})"?/g)) {
      const media = this._parse_json<Record<string, unknown>>(m[1]!, playlistId, (s) => s, false);
      if (!media?.file || !media.desc) continue;
      const mediaUrl = media.file.toString().startsWith('//') ? `https:${media.file}` : String(media.file);
      if (seen.has(mediaUrl)) continue;
      seen.add(mediaUrl);
      const entryTitle = decodeURIComponent(String(media.desc));
      yield {
        ...baseData,
        id: String(media.id ?? playlistId),
        url: mediaUrl,
        duration: int_or_none(media.length) ?? undefined,
        vcodec: media.provider === 'audio' ? 'none' : undefined,
        title: entryTitle || baseData.title,
      };
    }
  }
}

export class PolskieRadioLegacyIE extends PolskieRadioBaseIE {
  static IE_NAME = 'polskieradio:legacy';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?polskieradio(?:24)?\.pl\/\d+\/\d+\/[Aa]rtykul\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    const finalUrl = url;
    if (PolskieRadioIE._VALID_URL instanceof RegExp && PolskieRadioIE._VALID_URL.test(finalUrl)) {
      return this.url_result(finalUrl, 'PolskieRadio', playlistId);
    }

    const content = this._search_regex(
      /<div[^>]+class="\s*this-article\s*"[^>]*>([\s\S]+?)<div[^>]+class="tags"[^>]*>/,
      webpage,
      'content',
      null,
      false,
    );
    const timestamp = unified_timestamp(
      this._html_search_regex(/<span[^>]+id="datetime2"[^>]*>([\s\S]+?)<\/span>/, webpage, 'timestamp', null, false),
    );
    const thumbnail = this._og_search_thumbnail(webpage) ?? undefined;
    const title = (this._og_search_title(webpage) || '').trim();
    const description = strip_or_none(this._og_search_description(webpage))?.replace(/\xa0/g, ' ') ?? undefined;

    if (!content) {
      const auditionUrl = this._search_regex(
        /source:\s*["'](\/\/static\.prsa\.pl\/[^"']+)["']/,
        webpage,
        'audition record url',
      );
      const mediaUrl = auditionUrl ? (auditionUrl.startsWith('//') ? `https:${auditionUrl}` : auditionUrl) : undefined;
      return {
        id: playlistId,
        url: mediaUrl,
        title,
        description,
        timestamp: timestamp ?? undefined,
        thumbnail,
      };
    }

    const entries: VideoInfo[] = [];
    for (const e of this._extractWebpagePlayerEntries(content, playlistId, { title, timestamp: timestamp ?? undefined, thumbnail })) {
      entries.push(e);
    }
    return this.playlist_result(entries, playlistId, title, description);
  }
}

export class PolskieRadioIE extends PolskieRadioBaseIE {
  static IE_NAME = 'polskieradio';
  static _VALID_URL =
    /https?:\/\/(?:[^/]+\.)?(?:polskieradio(?:24)?|radiokierowcow)\.pl\/artykul\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    const nextData = searchNextjsData(this, webpage, playlistId);
    const articleData =
      traverse_obj(nextData, ['pageProps', 'data']) ||
      traverse_obj(nextData, ['pageProps', 'articleData']) ||
      traverse_obj(nextData, ['pageProps', 'post', 'data']) ||
      {};

    const title = strip_or_none((articleData as Record<string, unknown>).title) || undefined;
    const description = strip_or_none((articleData as Record<string, unknown>).lead) ?? undefined;
    const entries: VideoInfo[] = [];

    for (const entry of ((articleData as Record<string, unknown>).attachments as Array<Record<string, unknown>>) || []) {
      if (entry.fileType !== 'Audio' || !entry.file) continue;
      const file = String(entry.file);
      entries.push({
        url: file,
        ext: determine_ext(entry.fileName as string | undefined) || undefined,
        id:
          file.match(/([a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12})/)?.[1] ||
          String(entry.id ?? playlistId),
        title: strip_or_none(entry.description) || title,
        format_id: 'audio',
      });
    }

    if (!entries.length && (articleData as Record<string, unknown>).content) {
      for (const e of this._extractWebpagePlayerEntries(String((articleData as Record<string, unknown>).content), playlistId, { title })) {
        entries.push(e);
      }
    }

    return this.playlist_result(entries, playlistId, title, description);
  }
}

export class PolskieRadioAuditionIE extends InfoExtractor {
  static IE_NAME = 'polskieradio:audition';
  static _VALID_URL = /https?:\/\/(?:[^/]+\.)?polskieradio\.pl\/audycj[ae]\/(?<id>\d+)/;

  protected async _callLp3(path: string, query: Record<string, string | number>, videoId: string, note: string) {
    return this._download_json<Record<string, unknown>>(
      `https://lp3test.polskieradio.pl/${path}`,
      videoId,
      note,
      { query: Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])) as Record<string, string>, headers: { 'x-api-key': '9bf6c5a2-a7d0-4980-9ed7-a3f7291f2a81' } },
    );
  }

  protected async *_entries(playlistId: string, hasEpisodes: boolean, hasArticles: boolean): AsyncGenerator<VideoInfo> {
    if (hasEpisodes) {
      for (let i = 0; ; i++) {
        const page = await this._callLp3(
          'AudioArticle/GetListByCategoryId',
          { categoryId: playlistId, PageSize: 10, skip: i, format: 400 },
          playlistId,
          `Downloading episode list page ${i + 1}`,
        );
        const data = page.data as Array<Record<string, unknown>> | undefined;
        if (!data?.length) break;
        for (const episode of data) {
          yield {
            id: String(episode.id ?? ''),
            url: String(episode.file ?? ''),
            title: episode.title as string | undefined,
            duration: int_or_none(episode.duration) ?? undefined,
            timestamp: parse_iso8601(episode.datePublic) ?? undefined,
          };
        }
      }
    }
    if (hasArticles) {
      for (let i = 0; ; i++) {
        const page = await this._callLp3(
          'Article/GetListByCategoryId',
          { categoryId: playlistId, PageSize: 9, skip: i, format: 400 },
          playlistId,
          `Downloading article list page ${i + 1}`,
        );
        const data = page.data as Array<Record<string, unknown>> | undefined;
        if (!data?.length) break;
        for (const article of data) {
          yield {
            _type: 'url_transparent',
            id: String(article.id ?? ''),
            url: String(article.url ?? ''),
            title: article.shortTitle as string | undefined,
            description: traverse_obj(article, ['description', 'lead']) as string | undefined,
            timestamp: parse_iso8601(article.datePublic) ?? undefined,
            ie_key: 'PolskieRadio',
          };
        }
      }
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    const pageProps = searchNextjsData(this, webpage, playlistId).pageProps as Record<string, unknown>;
    const data = (pageProps.data as Record<string, unknown>) || {};
    const hasEpisodes = Boolean(data.episodes || data.audios);
    const hasArticles = Boolean(data['articles']);
    const details = (data.details as Record<string, unknown>) || {};
    const entries: VideoInfo[] = [];
    for await (const e of this._entries(playlistId, hasEpisodes, hasArticles)) entries.push(e);
    return this.playlist_result(
      entries,
      playlistId,
      traverse_obj(details, 'name') as string | undefined,
      traverse_obj(details, ['description', 'lead']) as string | undefined,
    );
  }
}

export class PolskieRadioCategoryIE extends InfoExtractor {
  static IE_NAME = 'polskieradio:category';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?polskieradio\.pl\/(?:\d+(?:,[^/]+)?\/|[^/]+\/Tag)(?<id>\d+)/;

  protected async *_entries(url: string, webpage: string, categoryId: string): AsyncGenerator<VideoInfo> {
    let content = webpage;
    for (let pageNum = 1; ; pageNum++) {
      for (const m of content.matchAll(
        /<article[^>]+>[\s\S]*?(<a[^>]+href=["'](?:(?:https?)?:\/\/[^/]+)?\/\d+\/\d+\/Artykul\/(\d+)[^>]+>)[\s\S]*?<\/article>/g,
      )) {
        const attrs = extract_attributes(m[1] || '');
        if (attrs.href) {
          yield this.url_result(urljoin(url, attrs.href), 'PolskieRadio:legacy', m[2], attrs.title);
        }
      }
      for (const raw of content.match(/<span data-media=({[^ ]+})/g) || []) {
        const parsed = this._parse_json<Record<string, unknown>>(raw.replace('<span data-media=', ''), categoryId, (s) => s, false);
        if (!parsed) continue;
        yield {
          url: parsed.file as string,
          id: String(parsed.uid ?? categoryId),
          duration: int_or_none(parsed.length) ?? undefined,
          title: decodeURIComponent(String(parsed.title ?? parsed.desc ?? '')),
        };
      }
      const nextUrl = this._search_regex(
        /<div[^>]+class=["']next["'][^>]*>\s*<a[^>]+href=(["'])(?<url>(?:(?!\1).)+)\1/,
        content,
        'next page url',
        'url',
        false,
      );
      if (!nextUrl) break;
      content = await this._download_webpage(urljoin(url, nextUrl), categoryId, `Downloading page ${pageNum + 1}`);
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const categoryId = this._match_id(url);
    const webpage = await this._download_webpage(url, categoryId);
    const finalUrl = url;
    if (PolskieRadioAuditionIE._VALID_URL instanceof RegExp && PolskieRadioAuditionIE._VALID_URL.test(finalUrl)) {
      return this.url_result(finalUrl, 'PolskieRadio:audition', categoryId);
    }
    const title =
      this._html_search_regex(/<title>([^<]+)(?: - [^<]+ - [^<]+| w [Pp]olskie[Rr]adio\.pl\s*)<\/title>/, webpage, 'title', null, false) ||
      undefined;
    const entries: VideoInfo[] = [];
    for await (const e of this._entries(url, webpage, categoryId)) entries.push(e);
    return this.playlist_result(entries, categoryId, title);
  }
}

export class PolskieRadioPlayerIE extends InfoExtractor {
  static IE_NAME = 'polskieradio:player';
  static _VALID_URL = /https?:\/\/player\.polskieradio\.pl\/anteny\/(?<id>[^/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const channelUrl = this._match_id(url);
    const playerCode = await this._download_webpage('https://player.polskieradio.pl/main.bundle.js', channelUrl, 'Downloading js player');
    const channelListRaw = this._search_regex(/;var r="anteny",a=(\[.+?\])},/, playerCode, 'channel list');
    const channelList = this._parse_json<Array<Record<string, unknown>>>(channelListRaw, channelUrl, js_to_json) || [];
    const channel = channelList.find((c) => c.url === channelUrl);
    if (!channel) throw new ExtractorError('Channel not found', { expected: true });

    const stationList = await this._download_json<Array<Record<string, unknown>>>(
      'https://apipr.polskieradio.pl/api/stacje',
      channelUrl,
      'Downloading stream url list',
      { headers: { Accept: 'application/json', Referer: url, Origin: 'https://player.polskieradio.pl' } },
    );
    const station = stationList.find(
      (s) => s.Name === (channel.streamName || channel.name),
    );
    if (!station) throw new ExtractorError('Station not found even though we extracted channel', { expected: true });

    const formats: Format[] = [];
    for (const streamUrlRaw of (station.Streams as string[]) || []) {
      const streamUrl = streamUrlRaw.startsWith('//') ? `https:${streamUrlRaw}` : streamUrlRaw;
      if (streamUrl.endsWith('/playlist.m3u8')) {
        formats.push(...(await this._extract_m3u8_formats(streamUrl, channelUrl, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, true)));
      } else {
        formats.push({ url: streamUrl, format_id: 'http' });
      }
    }

    return {
      id: String(channel.id ?? channelUrl),
      formats,
      title: (channel.name || channel.streamName) as string | undefined,
      display_id: channelUrl,
      thumbnail: `https://player.polskieradio.pl/images/${channelUrl}-color-logo.png`,
      is_live: true,
    };
  }
}

export class PolskieRadioPodcastBaseIE extends InfoExtractor {
  static IE_NAME = 'polskieradiopodcastbase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _API_BASE = 'https://apipodcasts.polskieradio.pl/api';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('PolskieRadioPodcastBaseIE is not a standalone extractor', { expected: true });
  }

  protected _parseEpisode(data: Record<string, unknown>): VideoInfo {
    return {
      id: String(data.guid ?? ''),
      formats: [{ url: String(data.url ?? ''), format_id: 'http', filesize: int_or_none(data.fileSize) ?? undefined }],
      title: data.title as string | undefined,
      description: data.description as string | undefined,
      duration: int_or_none(data.length) ?? undefined,
      timestamp: parse_iso8601(data.publishDate) ?? undefined,
      thumbnail: url_or_none(data.image) ?? undefined,
      series: data.podcastTitle as string | undefined,
      episode: data.title as string | undefined,
    };
  }
}

export class PolskieRadioPodcastListIE extends PolskieRadioPodcastBaseIE {
  static IE_NAME = 'polskieradio:podcast:list';
  static _VALID_URL = /https?:\/\/podcasty\.polskieradio\.pl\/podcast\/(?<id>\d+)/;
  static _PAGE_SIZE = 10;

  async _real_extract(url: string): Promise<VideoInfo> {
    const podcastId = this._match_id(url);
    const entries: VideoInfo[] = [];
    let podcastMeta: Record<string, unknown> = {};
    for (let page = 1; ; page++) {
      const resp = await this._download_json<Record<string, unknown>>(
        `${PolskieRadioPodcastBaseIE._API_BASE}/Podcasts/${podcastId}/?pageSize=${PolskieRadioPodcastListIE._PAGE_SIZE}&page=${page}`,
        podcastId,
      );
      if (page === 1) podcastMeta = resp;
      const episodes = (resp.episodes as Array<Record<string, unknown>>) || [];
      if (!episodes.length) break;
      for (const ep of episodes) entries.push(this._parseEpisode(ep));
      if (episodes.length < PolskieRadioPodcastListIE._PAGE_SIZE) break;
    }
    return this.playlist_result(entries, podcastId, podcastMeta.title as string | undefined, podcastMeta.description as string | undefined);
  }
}

export class PolskieRadioPodcastIE extends PolskieRadioPodcastBaseIE {
  static IE_NAME = 'polskieradio:podcast';
  static _VALID_URL = /https?:\/\/podcasty\.polskieradio\.pl\/[^/]+\/podcast,(\d+)+\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const podcastId = this._match_id(url);
    const data = await this._download_json<Record<string, unknown>>(
      `${PolskieRadioPodcastBaseIE._API_BASE}/Podcasts/GetPodcastEpisode?guid=${podcastId}`,
      podcastId,
    );
    return this._parseEpisode(data);
  }
}
