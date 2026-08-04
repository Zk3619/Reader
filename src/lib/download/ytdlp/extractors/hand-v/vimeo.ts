// @ts-nocheck
/**
 * Vimeo sibling extractors �?ported from yt-dlp vimeo.py
 * NOTE: VimeoIE itself lives in ../sites.ts (手写精品) and is NOT exported here.
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, Thumbnail, VideoInfo } from '../../types';
import {
  clean_html,
  filter_dict,
  int_or_none,
  js_to_json,
  smuggle_url,
  str_or_none,
  traverse_obj,
  unsmuggle_url,
  url_or_none,
} from '../../utils';
import {
  extractM3u8FormatsAndSubtitles,
  extractMpdFormatsAndSubtitles,
  hiddenInputs,
  jwtIsExpired,
  mergeSubtitles,
  parse_iso8601,
  urlencodePostdata,
  urljoin,
} from './_helpers';

type ViewerInfo = { jwt: string; xsrft?: string; [k: string]: unknown };

/** Shared helpers for Vimeo album/channel/review/event/etc. (not the main VimeoIE). */
export class VimeoBaseInfoExtractor extends InfoExtractor {
  static IE_NAME = 'vimeo:base';
  static _VALID_URL = false as const;
  static _NETRC_MACHINE = 'vimeo';
  static _LOGIN_REQUIRED = false;
  static _REFERER_HINT =
    'Cannot download embed-only video without embedding URL. Please provide the page that embeds this video.';

  protected _viewer_info: ViewerInfo | null = null;

  protected static _smuggle_referrer(url: string, referrerUrl: string): string {
    return smuggle_url(url, { referer: referrerUrl });
  }

  protected _unsmuggle_headers(url: string): [string, Record<string, unknown>, Record<string, string>] {
    const [clean, data] = unsmuggle_url(url, {});
    const headers = { ...(this.params.http_headers || {}) };
    if (typeof data.referer === 'string') headers.Referer = data.referer;
    return [clean, data, headers];
  }

  protected async _fetch_viewer_info(displayId?: string): Promise<ViewerInfo> {
    if (this._viewer_info?.jwt && !jwtIsExpired(this._viewer_info.jwt)) {
      return this._viewer_info;
    }
    this._viewer_info = await this._download_json<ViewerInfo>(
      'https://vimeo.com/_next/viewer',
      displayId,
      'Downloading web token info',
      { headers: { Accept: 'application/json' } },
    );
    return this._viewer_info!;
  }

  protected _get_video_password(): string {
    const password = this.params.videopassword;
    if (password == null) {
      throw new ExtractorError(
        'This video is protected by a password, use the --video-password option',
        { expected: true },
      );
    }
    return String(password);
  }

  protected async _verify_video_password(videoId: string, path?: string): Promise<void> {
    const videoPassword = this._get_video_password();
    const token = (await this._fetch_viewer_info(videoId)).xsrft;
    const url = ['https://vimeo.com', path, videoId].filter(Boolean).join('/');
    await this._download_webpage(`${url}/password`, videoId, 'Submitting video password', {
      method: 'POST',
      data: JSON.stringify({ password: videoPassword, token }),
      headers: {
        Accept: '*/*',
        'Content-Type': 'application/json',
        Referer: url,
      },
    });
  }

  protected _extract_config_url(webpage: string, opts?: { fatal?: boolean }): string | null {
    return this._html_search_regex(
      /\bdata-config-url="([^"]+)"/,
      webpage,
      'config URL',
      null,
      opts?.fatal !== false,
    );
  }

  protected async _parse_config(
    config: Record<string, unknown>,
    videoId: string,
  ): Promise<VideoInfo> {
    const videoData = (config.video as Record<string, unknown>) || {};
    const liveEvent = (videoData.live_event as Record<string, unknown>) || {};
    const liveStatusMap: Record<string, string> = {
      pending: 'is_upcoming',
      active: 'is_upcoming',
      started: 'is_live',
      ended: 'post_live',
    };
    const liveStatus = liveStatusMap[String(liveEvent.status || '')];
    const isLive = liveStatus === 'is_live';
    const request = (config.request as Record<string, unknown>) || {};
    const configFiles =
      (videoData.files as Record<string, unknown>) ||
      (request.files as Record<string, unknown>) ||
      {};

    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};

    for (const f of (configFiles.progressive as Array<Record<string, unknown>>) || []) {
      const videoUrl = f.url as string | undefined;
      if (!videoUrl) continue;
      formats.push({
        url: videoUrl,
        format_id: `http-${f.quality ?? formats.length}`,
        source_preference: 10,
        width: int_or_none(f.width) ?? undefined,
        height: int_or_none(f.height) ?? undefined,
        fps: int_or_none(f.fps) ?? undefined,
        tbr: int_or_none(f.bitrate) ?? undefined,
      });
    }

    for (const filesType of ['hls', 'dash'] as const) {
      const cdns =
        ((configFiles[filesType] as Record<string, unknown> | undefined)?.cdns as Record<
          string,
          Record<string, unknown>
        >) || {};
      for (const [cdnName, cdnData] of Object.entries(cdns)) {
        let manifestUrl = cdnData.url as string | undefined;
        if (!manifestUrl) continue;
        const formatId = `${filesType}-${cdnName}`;
        if (filesType === 'hls') {
          const { formats: fmts, subtitles: subs } = await extractM3u8FormatsAndSubtitles(
            this,
            manifestUrl,
            videoId,
            formatId,
          );
          formats.push(...fmts);
          mergeSubtitles(subtitles, subs);
        } else {
          if (manifestUrl.includes('json=1')) {
            const resolved = await this._download_json<{ url?: string }>(
              manifestUrl,
              videoId,
              undefined,
              { fatal: false },
            );
            if (resolved?.url) manifestUrl = resolved.url;
          }
          const mpdUrl = manifestUrl.replace('/master.json', '/master.mpd');
          const { formats: fmts, subtitles: subs } = await extractMpdFormatsAndSubtitles(
            this,
            mpdUrl,
            videoId,
            formatId,
          );
          formats.push(...fmts);
          mergeSubtitles(subtitles, subs);
        }
      }
    }

    const liveArchive = (liveEvent.archive as Record<string, unknown>) || {};
    const liveArchiveSource = liveArchive.source_url as string | undefined;
    if (liveArchiveSource && liveArchive.status === 'done') {
      formats.push({
        format_id: 'live-archive-source',
        url: liveArchiveSource,
        quality: 10,
      });
    }

    for (const tt of (request.text_tracks as Array<Record<string, unknown>>) || []) {
      if (!tt.url || !tt.lang) continue;
      (subtitles[String(tt.lang)] ||= []).push({
        ext: 'vtt',
        url: urljoin('https://player.vimeo.com/', String(tt.url)),
      });
    }

    const thumbnails: Thumbnail[] = [];
    if (!isLive) {
      for (const [key, thumb] of Object.entries(
        (videoData.thumbs as Record<string, string>) || {},
      )) {
        thumbnails.push({ id: key, width: int_or_none(key) ?? undefined, url: thumb });
      }
      for (const key of ['thumbnail', 'thumbnail_url'] as const) {
        const u = url_or_none(videoData[key]);
        if (u) thumbnails.push({ url: u });
      }
    }

    const owner = (videoData.owner as Record<string, unknown>) || {};
    const uploaderUrl = owner.url ? String(owner.url) : undefined;

    return {
      id: str_or_none(videoData.id) || videoId,
      title: videoData.title ? String(videoData.title) : undefined,
      uploader: owner.name ? String(owner.name) : undefined,
      uploader_id: uploaderUrl ? uploaderUrl.split('/').pop() : undefined,
      uploader_url: uploaderUrl,
      thumbnails,
      duration: int_or_none(videoData.duration) ?? undefined,
      formats,
      subtitles,
      live_status: liveStatus,
    };
  }

  protected static _get_embed_params(
    isEmbed: boolean,
    referer?: string,
  ): Record<string, string> {
    let hostname = '';
    if (referer && isEmbed) {
      try {
        hostname = new URL(referer).hostname;
      } catch {
        hostname = '';
      }
    }
    return {
      is_embed: isEmbed ? 'true' : 'false',
      referrer: hostname,
    };
  }

  protected async _get_album_data_and_hashed_pass(
    albumId: string,
    isEmbed: boolean | string | null,
    referer?: string,
  ): Promise<[Record<string, unknown>, string | null]> {
    const viewer = await this._fetch_viewer_info(albumId);
    const album = await this._download_json<Record<string, unknown>>(
      `https://api.vimeo.com/albums/${albumId}`,
      albumId,
      undefined,
      {
        headers: { Authorization: `jwt ${viewer.jwt}`, Accept: 'application/json' },
        query: {
          ...VimeoBaseInfoExtractor._get_embed_params(Boolean(isEmbed), referer),
          fields: 'description,name,privacy',
        },
      },
    );
    let hashedPass: string | null = null;
    if (traverse_obj(album, ['privacy', 'view']) === 'password') {
      const password = this.params.videopassword;
      if (!password) {
        throw new ExtractorError(
          'This album is protected by a password, use the --video-password option',
          { expected: true },
        );
      }
      const auth = await this._download_json<{ hashed_pass: string }>(
        `https://vimeo.com/showcase/${albumId}/auth`,
        albumId,
        'Verifying the password',
        {
          method: 'POST',
          data: urlencodePostdata({ password: String(password), token: String(viewer.xsrft || '') }),
          headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );
      hashedPass = auth.hashed_pass;
    }
    return [album, hashedPass];
  }
}

export class VimeoOndemandIE extends VimeoBaseInfoExtractor {
  static IE_NAME = 'vimeo:ondemand';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?vimeo\.com\/ondemand\/(?:[^/]+\/)?(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const pageConfig = this._parse_json<Record<string, unknown>>(
      this._search_regex(
        /vimeo\.(?:clip|vod_title)_page_config\s*=\s*({.+?});/,
        webpage,
        'page config',
        '{}',
        false,
      ) || '{}',
      displayId,
      undefined,
      false,
    );

    const configUrl = traverse_obj(pageConfig, ['player', 'config_url']) as string | undefined;
    if (configUrl) {
      const config = await this._download_json<Record<string, unknown>>(configUrl, displayId);
      const info = await this._parse_config(config, displayId);
      const video = (config.video as Record<string, unknown>) || {};
      const vod = (video.vod as Record<string, unknown>) || {};
      if (vod.is_trailer && vod.feature_id) {
        return {
          _type: 'url_transparent',
          ie_key: 'Vimeo',
          url: `https://player.vimeo.com/video/${vod.feature_id}`,
          id: String(vod.feature_id),
          title: info.title,
        };
      }
      const vid = info.id || displayId;
      // Prefer hand-written VimeoIE for full format extraction when numeric id known
      if (/^\d+$/.test(String(vid))) {
        return {
          _type: 'url_transparent',
          ie_key: 'Vimeo',
          url: `https://vimeo.com/${vid}`,
          id: String(vid),
          title: info.title,
          description: info.description,
        };
      }
      return info;
    }

    const ogVideo = this._og_search_video_url(webpage);
    const videoId =
      this._search_regex(/player\.vimeo\.com\/video\/(\d+)/, webpage, 'video id', null, false) ||
      this._search_regex(/vimeo\.com\/(?:video\/)?(\d+)/, ogVideo || '', 'video id', null, false);
    if (videoId) {
      return {
        _type: 'url_transparent',
        ie_key: 'Vimeo',
        url: `https://vimeo.com/${videoId}`,
        id: videoId,
      };
    }
    throw new ExtractorError('Unable to extract ondemand video', { expected: true });
  }
}

export class VimeoChannelIE extends VimeoBaseInfoExtractor {
  static IE_NAME = 'vimeo:channel';
  static _VALID_URL = /https:\/\/vimeo\.com\/channels\/(?<id>[^/?#]+)\/?(?:$|[?#])/;
  static _MORE_PAGES_INDICATOR = /<a.+?rel="next"/s;
  static _TITLE: string | null = null;
  static _TITLE_RE = /<link rel="alternate"[^>]+?title="(.*?)"/;
  static _BASE_URL_TEMPL = 'https://vimeo.com/channels/%s';

  protected _page_url(baseUrl: string, pagenum: number): string {
    return `${baseUrl}/videos/page:${pagenum}/`;
  }

  protected _extract_list_title(webpage: string): string | null {
    const ctor = this.constructor as typeof VimeoChannelIE;
    return (
      ctor._TITLE ||
      this._html_search_regex(ctor._TITLE_RE, webpage, 'list title', null, false)
    );
  }

  protected async _extract_videos(listId: string, baseUrl: string): Promise<VideoInfo> {
    const entries: VideoInfo[] = [];
    let listTitle: string | null = null;
    const moreRe = (this.constructor as typeof VimeoChannelIE)._MORE_PAGES_INDICATOR;

    for (let pagenum = 1; ; pagenum++) {
      const pageUrl = this._page_url(baseUrl, pagenum);
      const webpage = await this._download_webpage(
        pageUrl,
        listId,
        `Downloading page ${pagenum}`,
      );
      if (pagenum === 1) listTitle = this._extract_list_title(webpage);

      const clips = [
        ...webpage.matchAll(
          /id="clip_(\d+)"[^>]*>\s*<a[^>]+href="(\/(?:[^/]+\/)*\1)(?:[^>]+\btitle="([^"]+)")?/g,
        ),
      ];
      if (clips.length) {
        for (const m of clips) {
          entries.push(
            this.url_result(urljoin(baseUrl, m[2]!), 'Vimeo', m[1], m[3] || undefined),
          );
        }
      } else {
        for (const m of webpage.matchAll(/id=["']clip_(\d+)/g)) {
          entries.push(this.url_result(`https://vimeo.com/${m[1]}`, 'Vimeo', m[1]));
        }
      }

      if (!moreRe.test(webpage)) break;
    }

    return this.playlist_result(entries, listId, listTitle || undefined);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const channelId = this._match_id(url);
    const templ = (this.constructor as typeof VimeoChannelIE)._BASE_URL_TEMPL;
    return this._extract_videos(channelId, templ.replace('%s', channelId));
  }
}

export class VimeoUserIE extends VimeoChannelIE {
  static IE_NAME = 'vimeo:user';
  static _VALID_URL =
    /https:\/\/vimeo\.com\/(?!(?:[0-9]+|watchlater)(?:$|[?#/]))(?<id>[^/]+)(?:\/videos)?\/?(?:$|[?#])/;
  static _TITLE_RE = /<a[^>]+?class="user">([^<>]+?)<\/a>/;
  static _BASE_URL_TEMPL = 'https://vimeo.com/%s';
}

export class VimeoAlbumIE extends VimeoBaseInfoExtractor {
  static IE_NAME = 'vimeo:album';
  static _VALID_URL =
    /https:\/\/vimeo\.com\/(?:album|showcase)\/(?<id>[^/?#]+)(?:$|[?#]|(?<is_embed>\/embed))/;
  static _PAGE_SIZE = 100;

  protected async _fetch_page(
    albumId: string,
    hashedPass: string | null,
    isEmbed: boolean,
    referer: string | undefined,
    page: number,
  ): Promise<VideoInfo[]> {
    const apiPage = page + 1;
    const query: Record<string, string> = {
      ...VimeoBaseInfoExtractor._get_embed_params(isEmbed, referer),
      fields: 'link,uri',
      page: String(apiPage),
      per_page: String(VimeoAlbumIE._PAGE_SIZE),
    };
    if (hashedPass) query._hashed_pass = hashedPass;

    const viewer = await this._fetch_viewer_info(albumId);
    let videos: Array<Record<string, unknown>>;
    try {
      const resp = await this._download_json<{ data: Array<Record<string, unknown>> }>(
        `https://api.vimeo.com/albums/${albumId}/videos`,
        albumId,
        `Downloading page ${apiPage}`,
        {
          query,
          headers: {
            Authorization: `jwt ${viewer.jwt}`,
            Accept: 'application/json',
          },
        },
      );
      videos = resp.data || [];
    } catch {
      return [];
    }

    const entries: VideoInfo[] = [];
    for (const video of videos) {
      let link = video.link as string | undefined;
      if (!link) continue;
      const uri = video.uri as string | undefined;
      const videoId = uri
        ? this._search_regex(/\/videos\/(\d+)/, uri, 'id', null, false)
        : null;
      if (isEmbed) {
        if (!videoId) {
          this.report_warning(`Skipping due to missing video ID: ${link}`);
          continue;
        }
        link = `https://player.vimeo.com/video/${videoId}`;
        if (referer) link = VimeoBaseInfoExtractor._smuggle_referrer(link, referer);
      }
      entries.push(this.url_result(link, 'Vimeo', videoId || undefined));
    }
    return entries;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const [cleanUrl, , httpHeaders] = this._unsmuggle_headers(url);
    const m = this._match_valid_url(cleanUrl)!;
    let albumId = m.groups!.id!;
    const isEmbed = Boolean(m.groups!.is_embed);
    const referer = httpHeaders.Referer;

    if (!/^[0-9]+$/.test(albumId)) {
      const authInfo = await this._download_json<Record<string, unknown>>(
        `https://vimeo.com/showcase/${albumId}/auth`,
        albumId,
        'Downloading album info',
        {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          fatal: false,
        },
      );
      const numericId = str_or_none(traverse_obj(authInfo, ['metadata', 'id']));
      if (!numericId) throw new ExtractorError('Unable to extract album ID', { expected: true });
      albumId = numericId;
    }

    let album: Record<string, unknown>;
    let hashedPass: string | null;
    try {
      [album, hashedPass] = await this._get_album_data_and_hashed_pass(albumId, isEmbed, referer);
    } catch (e) {
      if (isEmbed && !referer) {
        throw new ExtractorError(VimeoBaseInfoExtractor._REFERER_HINT, { expected: true });
      }
      throw e;
    }

    const entries: VideoInfo[] = [];
    for (let page = 0; ; page++) {
      const chunk = await this._fetch_page(albumId, hashedPass, isEmbed, referer, page);
      entries.push(...chunk);
      if (chunk.length < VimeoAlbumIE._PAGE_SIZE) break;
    }

    return this.playlist_result(
      entries,
      albumId,
      album.name ? String(album.name) : undefined,
      album.description ? String(album.description) : undefined,
    );
  }
}

export class VimeoGroupsIE extends VimeoChannelIE {
  static IE_NAME = 'vimeo:group';
  static _VALID_URL = /https:\/\/vimeo\.com\/groups\/(?<id>[^/]+)(?:\/(?!videos?\/\d+)|$)/;
  static _BASE_URL_TEMPL = 'https://vimeo.com/groups/%s';
}

export class VimeoReviewIE extends VimeoBaseInfoExtractor {
  static IE_NAME = 'vimeo:review';
  static IE_DESC = 'Review pages on vimeo';
  static _VALID_URL =
    /https?:\/\/vimeo\.com\/(?<user>[^/?#]+)\/review\/(?<id>\d+)\/(?<hash>[\da-f]{10})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const user = m.groups!.user!;
    const videoId = m.groups!.id!;
    const reviewHash = m.groups!.hash!;
    const dataUrl = `https://vimeo.com/${user}/review/data/${videoId}/${reviewHash}`;
    let data = await this._download_json<Record<string, unknown>>(dataUrl, videoId);
    if (data.isLocked === true) {
      await this._verify_video_password(videoId);
      data = await this._download_json<Record<string, unknown>>(dataUrl, videoId);
    }
    const clipData = data.clipData as Record<string, unknown>;
    const config = await this._download_json<Record<string, unknown>>(
      String(clipData.configUrl),
      videoId,
    );
    const info = await this._parse_config(config, videoId);
    info.description = clean_html(String(clipData.description || '')) || undefined;
    return info;
  }
}

export class VimeoWatchLaterIE extends VimeoChannelIE {
  static IE_NAME = 'vimeo:watchlater';
  static IE_DESC =
    'Vimeo watch later list, ":vimeowatchlater" keyword (requires authentication)';
  static _VALID_URL = /https:\/\/vimeo\.com\/(?:home\/)?watchlater|:vimeowatchlater/;
  static _TITLE = 'Watch Later';
  static _LOGIN_REQUIRED = true;

  protected _page_url(baseUrl: string, pagenum: number): string {
    return `${baseUrl}/page:${pagenum}/`;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    void url;
    return this._extract_videos('watchlater', 'https://vimeo.com/watchlater');
  }
}

export class VimeoLikesIE extends VimeoChannelIE {
  static IE_NAME = 'vimeo:likes';
  static IE_DESC = 'Vimeo user likes';
  static _VALID_URL =
    /https:\/\/(?:www\.)?vimeo\.com\/(?<id>[^/]+)\/likes\/?(?:$|[?#]|sort:)/;

  protected _page_url(baseUrl: string, pagenum: number): string {
    return `${baseUrl}/page:${pagenum}/`;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const userId = this._match_id(url);
    return this._extract_videos(userId, `https://vimeo.com/${userId}/likes`);
  }
}

export class VHXEmbedIE extends VimeoBaseInfoExtractor {
  static IE_NAME = 'vhx:embed';
  static _VALID_URL = /https?:\/\/embed\.vhx\.tv\/videos\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const [cleanUrl, , headers] = this._unsmuggle_headers(url);
    const webpage = await this._download_webpage(cleanUrl, videoId, undefined, { headers });
    const ottRaw = this._search_regex(/window\.OTTData\s*=\s*({.+})/, webpage, 'ott data')!;
    const ott = this._parse_json<Record<string, unknown>>(ottRaw, videoId, js_to_json)!;
    const config = await this._download_json<Record<string, unknown>>(
      String(ott.config_url),
      videoId,
    );
    const info = await this._parse_config(config, videoId);
    info.id = videoId;
    return info;
  }
}

export class VimeoProIE extends VimeoBaseInfoExtractor {
  static IE_NAME = 'vimeo:pro';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?vimeopro\.com\/[^/?#]+\/(?<slug>[^/?#]+)(?:(?:\/videos?\/(?<id>[0-9]+)))?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    let displayId = m.groups!.slug!;
    const videoId = m.groups!.id;
    if (videoId) displayId = videoId;

    let webpage = await this._download_webpage(url, displayId);
    const passwordForm = this._search_regex(
      /<form[^>]+?method=["']post["'][^>]*>([\s\S]+?password[\s\S]+?)<\/form>/i,
      webpage,
      'password form',
      null,
      false,
    );
    if (passwordForm) {
      webpage = await this._download_webpage(url, displayId, 'Logging in with video password', {
        method: 'POST',
        data: urlencodePostdata({
          password: this._get_video_password(),
          ...hiddenInputs(passwordForm),
        }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    }

    let description: string | undefined;
    let vimeoUrl =
      this._search_regex(
        /(?:https?:)?\/\/(?:player\.)?vimeo\.com\/(?:video\/)?(\d+)/i,
        webpage,
        'vimeo url',
        null,
        false,
      );
    if (vimeoUrl && !vimeoUrl.startsWith('http')) {
      /* matched id only */
    }
    const embedMatch = webpage.match(
      /(?:https?:)?\/\/(?:player\.)?vimeo\.com\/(?:video\/)?(\d+)/i,
    );
    if (embedMatch) {
      vimeoUrl = `https://vimeo.com/${embedMatch[1]}`;
      description = this._html_search_meta('description', webpage) || undefined;
    } else if (videoId) {
      vimeoUrl = `https://vimeo.com/${videoId}`;
    } else {
      throw new ExtractorError(
        'No Vimeo embed or video ID could be found in VimeoPro page',
        { expected: true },
      );
    }

    return {
      _type: 'url_transparent',
      ie_key: 'Vimeo',
      url: vimeoUrl!,
      id: videoId || embedMatch?.[1] || displayId,
      description,
    };
  }
}

export class VimeoEventIE extends VimeoBaseInfoExtractor {
  static IE_NAME = 'vimeo:event';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?vimeo\.com\/event\/(?<id>\d+)(?:\/(?:(?:embed\/)?(?<unlisted_hash>[\da-f]{10})|videos\/(?<video_id>\d+)))?/;

  static _EVENT_FIELDS = [
    'title',
    'uri',
    'schedule',
    'stream_description',
    'stream_privacy.embed',
    'stream_privacy.view',
    'clip_to_play.name',
    'clip_to_play.uri',
    'clip_to_play.config_url',
    'clip_to_play.live.status',
    'clip_to_play.privacy.embed',
    'clip_to_play.privacy.view',
    'clip_to_play.password',
    'streamable_clip.name',
    'streamable_clip.uri',
    'streamable_clip.config_url',
    'streamable_clip.live.status',
  ];

  static _VIDEOS_FIELDS = ['items', 'uri', 'name', 'config_url', 'duration', 'live.status'];

  protected async _call_events_api(
    eventId: string,
    opts?: {
      ep?: string;
      unlistedHash?: string;
      note?: string;
      fields?: string[];
      referrer?: string;
      query?: Record<string, string>;
      headers?: Record<string, string>;
    },
  ): Promise<Record<string, unknown>> {
    const viewer = await this._fetch_viewer_info(eventId);
    const path = ['https://api.vimeo.com/live_events', [eventId, opts?.unlistedHash].filter(Boolean).join(':'), opts?.ep]
      .filter(Boolean)
      .join('/');
    return this._download_json<Record<string, unknown>>(
      path,
      eventId,
      `Downloading event ${opts?.note || ''} API JSON`.trim(),
      {
        query: filter_dict({
          fields: (opts?.fields || []).join(',') || undefined,
          referrer: opts?.referrer,
          ...(opts?.query || {}),
        }) as Record<string, string>,
        headers: filter_dict({
          Accept: 'application/json',
          Authorization: `jwt ${viewer.jwt}`,
          Referer: opts?.referrer,
          ...(opts?.headers || {}),
        }) as Record<string, string>,
      },
    );
  }

  protected static _extract_video_id_and_unlisted_hash(
    video: Record<string, unknown> | undefined,
  ): [string | null, string | null] {
    const uri = video?.uri;
    if (typeof uri !== 'string' || !uri.startsWith('/videos/')) return [null, null];
    const rest = uri.slice(8);
    const [videoId, unlistedHash] = rest.split(':');
    return [videoId || null, unlistedHash || null];
  }

  protected _vimeo_url_result(
    videoId: string,
    unlistedHash?: string | null,
    eventId?: string,
  ): VideoInfo {
    const path = [videoId, unlistedHash].filter(Boolean).join('/');
    return {
      _type: 'url_transparent',
      ie_key: 'Vimeo',
      url: `https://vimeo.com/${path}`,
      id: videoId,
      display_id: eventId,
      live_status: 'was_live',
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const [cleanUrl, , headers] = this._unsmuggle_headers(url);
    const referrer = headers.Referer;
    const m = this._match_valid_url(cleanUrl)!;
    const eventId = m.groups!.id!;
    const unlistedHash = m.groups!.unlisted_hash;
    const videoId = m.groups!.video_id;

    let liveEventData: Record<string, unknown>;
    try {
      liveEventData = await this._call_events_api(eventId, {
        unlistedHash,
        fields: VimeoEventIE._EVENT_FIELDS,
        referrer,
        query: { clip_to_play_id: videoId || '0' },
        headers: { Accept: 'application/vnd.vimeo.*+json;version=3.4.9' },
      });
    } catch (e) {
      // Password / referer errors �?simplified retry once after password
      try {
        await this._verify_video_password(eventId, 'event');
        liveEventData = await this._call_events_api(eventId, {
          unlistedHash,
          fields: VimeoEventIE._EVENT_FIELDS,
          referrer,
          query: { clip_to_play_id: videoId || '0' },
          headers: { Accept: 'application/vnd.vimeo.*+json;version=3.4.9' },
        });
      } catch {
        throw e;
      }
    }

    const viewPolicy = String(
      traverse_obj(liveEventData, ['stream_privacy', 'view']) || '',
    );
    if (viewPolicy === 'nobody') {
      throw new ExtractorError('This event has not been made available to anyone', {
        expected: true,
      });
    }

    const clipData = (liveEventData.clip_to_play as Record<string, unknown>) || {};
    const clipStatus = traverse_obj(clipData, ['live', 'status']) as string | undefined;
    const startTime = traverse_obj(liveEventData, ['schedule', 'start_time']) as
      | string
      | undefined;
    const releaseTimestamp = parse_iso8601(startTime) ?? undefined;

    let liveStatus: string | undefined;
    let configUrl: string | null | undefined;
    let info: VideoInfo;

    if (
      clipStatus === 'unavailable' &&
      releaseTimestamp &&
      releaseTimestamp > Date.now() / 1000
    ) {
      // Upcoming: return metadata without formats (raise_no_formats always throws here)
      return {
        id: eventId,
        display_id: eventId,
        title: liveEventData.title ? String(liveEventData.title) : undefined,
        description: liveEventData.stream_description
          ? String(liveEventData.stream_description)
          : undefined,
        live_status: 'is_upcoming',
        release_timestamp: releaseTimestamp,
        formats: [],
      };
    } else if (viewPolicy === 'embed_only') {
      const embedPath = ['https://vimeo.com/event', eventId, 'embed', unlistedHash]
        .filter(Boolean)
        .join('/');
      const webpage = await this._download_webpage(
        embedPath,
        eventId,
        'Downloading embed iframe webpage',
        { headers },
      );
      liveStatus = 'was_live';
      configUrl = this._extract_config_url(webpage, { fatal: false });
    } else {
      if (videoId) {
        const [clipId, clipHash] = VimeoEventIE._extract_video_id_and_unlisted_hash(clipData);
        if (videoId === clipId && clipStatus === 'done' && (clipHash || viewPolicy !== 'unlisted')) {
          return this._vimeo_url_result(clipId!, clipHash, eventId);
        }
      }

      let video: Record<string, unknown> | undefined;
      for (let page = 1; ; page++) {
        const videosData = await this._call_events_api(eventId, {
          ep: 'videos',
          unlistedHash,
          note: `page ${page}`,
          fields: VimeoEventIE._VIDEOS_FIELDS,
          referrer,
          query: { page: String(page) },
          headers: { Accept: 'application/vnd.vimeo.*;version=3.4.1' },
        });
        const data = (videosData.data as Array<Record<string, unknown>>) || [];
        video = videoId
          ? data.find((v) => VimeoEventIE._extract_video_id_and_unlisted_hash(v)[0] === videoId)
          : data.find((v) => traverse_obj(v, ['live', 'status']) !== 'unavailable');
        if (video || !traverse_obj(videosData, ['paging', 'next'])) break;
      }

      if (!video) throw new ExtractorError('This event video is unavailable', { expected: true });

      liveStatus = ({ streaming: 'is_live', done: 'was_live' } as Record<string, string>)[
        String(traverse_obj(video, ['live', 'status']) || '')
      ] || 'was_live';

      if (liveStatus === 'was_live') {
        const [vid, hash] = VimeoEventIE._extract_video_id_and_unlisted_hash(video);
        if (vid) return this._vimeo_url_result(vid, hash, eventId);
      }
      configUrl = video.config_url as string;
    }

    if (configUrl) {
      info = await this._parse_config(
        await this._download_json(configUrl, eventId, 'Downloading config JSON'),
        eventId,
      );
    } else {
      info = { id: eventId };
    }

    return {
      title: liveEventData.title ? String(liveEventData.title) : undefined,
      description: liveEventData.stream_description
        ? String(liveEventData.stream_description)
        : undefined,
      display_id: eventId,
      live_status: liveStatus,
      release_timestamp: releaseTimestamp,
      ...info,
    };
  }
}
