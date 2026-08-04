// @ts-nocheck
/** VidioBaseIE / VidioIE / VidioPremierIE / VidioLiveIE â€?ported from yt-dlp vidio.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  clean_html,
  get_element_by_class,
  int_or_none,
  smuggle_url,
  str_or_none,
  try_get,
  unsmuggle_url,
} from '../../utils';
import {
  extractM3u8FormatsAndSubtitles,
  extractMpdFormatsAndSubtitles,
  hiddenInputs,
  mergeSubtitles,
  parse_iso8601,
  playlistFromMatches,
  strip_or_none,
  urlencodePostdata,
} from './_helpers';

export class VidioBaseIE extends InfoExtractor {
  static IE_NAME = 'vidio:base';
  static _VALID_URL = false as const;
  static _LOGIN_URL = 'https://www.vidio.com/users/login';
  static _NETRC_MACHINE = 'vidio';

  protected _apiKey = '';

  protected async _initializePreLogin(): Promise<void> {
    const auth = await this._download_json<{ api_key: string }>(
      'https://www.vidio.com/auth',
      undefined,
      undefined,
      { data: '', method: 'POST' },
    );
    this._apiKey = auth.api_key;
  }

  protected async _callApi<T = unknown>(url: string, videoId: string, note?: string): Promise<T> {
    if (!this._apiKey) await this._initializePreLogin();
    return this._download_json<T>(url, videoId, note, {
      headers: {
        'Content-Type': 'application/vnd.api+json',
        'X-API-KEY': this._apiKey,
      },
    });
  }

  protected async _performLogin(username: string, password: string): Promise<void> {
    const check = await this._download_json<{ current_user?: unknown }>(
      'https://www.vidio.com/interactions.json',
      undefined,
      'Checking if logged in',
      { fatal: false },
    );
    if (check?.current_user) return;

    const loginPage = await this._download_webpage(
      VidioBaseIE._LOGIN_URL,
      undefined,
      'Downloading log in page',
    );
    const loginForm = {
      ...hiddenInputs(loginPage),
      'user[login]': username,
      'user[password]': password,
    };

    try {
      await this._download_webpage(VidioBaseIE._LOGIN_URL, undefined, 'Logging in', {
        data: urlencodePostdata(loginForm),
        method: 'POST',
      });
    } catch (e) {
      const page = String((e as Error)?.message || '');
      if (get_element_by_class('onboarding-content-register-popup__title', page)) {
        throw new ExtractorError(
          'Unable to log in: The provided email has not registered yet.',
          { expected: true },
        );
      }
      const reason =
        get_element_by_class('onboarding-form__general-error', page) ||
        get_element_by_class('onboarding-modal__title', page);
      if (reason?.includes('Akun terhubung ke')) {
        throw new ExtractorError(
          'Unable to log in: Your account is linked to a social media account. Use cookies instead',
          { expected: true },
        );
      }
      if (reason) {
        const sub =
          get_element_by_class('onboarding-modal__description-text', page) || '';
        throw new ExtractorError(`Unable to log in: ${reason}. ${clean_html(sub) || ''}`, {
          expected: true,
        });
      }
      throw new ExtractorError('Unable to log in', { expected: true });
    }
  }
}

export class VidioIE extends VidioBaseIE {
  static IE_NAME = 'vidio';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?vidio\.com\/(?:watch|embed)\/(?<id>\d+)-(?<display_id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const displayId = m.groups!.display_id!;
    const data = await this._callApi<Record<string, unknown>>(
      `https://api.vidio.com/videos/${videoId}`,
      displayId,
    );
    const video = ((data.videos as unknown[]) || [])[0] as Record<string, unknown>;
    const title = String(video.title || '').trim();
    const isPremium = !!video.is_premium;

    let formats: Format[] = [];
    let subs: Record<string, Subtitle[]> = {};

    if (isPremium) {
      const sources = await this._download_json<Record<string, unknown>>(
        `https://www.vidio.com/interactions_stream.json?video_id=${videoId}&type=videos`,
        displayId,
        'Downloading premier API JSON',
      );
      if (!(sources.source || sources.source_dash)) {
        this.raise_login_required(
          'This video is only available for registered users with the appropriate subscription',
        );
      }
      if (sources.source) {
        const hls = await extractM3u8FormatsAndSubtitles(
          this,
          String(sources.source),
          displayId,
          'hls',
        );
        formats.push(...hls.formats);
        mergeSubtitles(subs, hls.subtitles);
      }
      if (sources.source_dash) {
        const dash = await extractMpdFormatsAndSubtitles(
          this,
          String(sources.source_dash),
          displayId,
          'dash',
        );
        formats.push(...dash.formats);
        mergeSubtitles(subs, dash.subtitles);
      }
    } else {
      const hlsUrl = String(
        ((data.clips as Array<Record<string, unknown>>) || [])[0]?.hls_url || '',
      );
      const hls = await extractM3u8FormatsAndSubtitles(this, hlsUrl, displayId, 'hls');
      formats = hls.formats;
      subs = hls.subtitles;
    }

    const getFirst = (x: string) =>
      (try_get(data, (y) => ((y as Record<string, unknown>)[`${x}s`] as unknown[])[0]) as
        | Record<string, unknown>
        | undefined) || {};
    const channel = getFirst('channel');
    const user = getFirst('user');
    const username = user.username != null ? String(user.username) : undefined;
    const getCount = (x: string) => int_or_none(video[`total_${x}`]);

    return {
      id: videoId,
      display_id: displayId,
      title,
      description: strip_or_none(video.description) || undefined,
      thumbnail: video.image_url_medium != null ? String(video.image_url_medium) : undefined,
      duration: int_or_none(video.duration) ?? undefined,
      like_count: getCount('likes') ?? undefined,
      formats,
      subtitles: subs,
      uploader: user.name != null ? String(user.name) : undefined,
      timestamp: parse_iso8601(video.created_at) ?? undefined,
      uploader_id: username,
      uploader_url: username ? `https://www.vidio.com/@${username}` : undefined,
      channel: channel.name != null ? String(channel.name) : undefined,
      channel_id: str_or_none(channel.id) || undefined,
      view_count: getCount('view_count') ?? undefined,
      dislike_count: getCount('dislikes') ?? undefined,
      comment_count: getCount('comments') ?? undefined,
      tags: video.tag_list as string[] | undefined,
    };
  }
}

export class VidioPremierIE extends VidioBaseIE {
  static IE_NAME = 'vidio:premier';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?vidio\.com\/premier\/(?<id>\d+)\/(?<display_id>[^/?#&]+)/;

  protected async *_playlistEntries(
    playlistUrl: string,
    displayId: string,
  ): AsyncGenerator<VideoInfo> {
    let next: string | null | undefined = playlistUrl;
    let index = 1;
    while (next) {
      const playlistJson = await this._callApi<Record<string, unknown>>(
        next,
        displayId,
        `Downloading API JSON page ${index}`,
      );
      for (const videoJson of (playlistJson.data as Array<Record<string, unknown>>) || []) {
        const link = (videoJson.links as Record<string, string>)?.watchpage;
        if (link) yield this.url_result(link, 'vidio', String(videoJson.id));
      }
      next = try_get(playlistJson, (x) =>
        String(((x as Record<string, unknown>).links as Record<string, string>)?.next || ''),
      );
      if (!next) break;
      index += 1;
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const [cleanUrl, idata] = unsmuggle_url(url, {});
    const m = this._match_valid_url(cleanUrl)!;
    let playlistId = m.groups!.id!;
    const displayId = m.groups!.display_id!;

    const smuggledUrl = idata.url as string | undefined;
    if (smuggledUrl) {
      playlistId = String(idata.id || playlistId);
      const entries: VideoInfo[] = [];
      for await (const e of this._playlistEntries(smuggledUrl, playlistId)) entries.push(e);
      return this.playlist_result(
        entries,
        playlistId,
        idata.title != null ? String(idata.title) : undefined,
      );
    }

    const playlistData = await this._callApi<Record<string, unknown>>(
      `https://api.vidio.com/content_profiles/${playlistId}/playlists`,
      displayId,
    );

    const urls = ((playlistData.data as Array<Record<string, unknown>>) || []).map((data) =>
      smuggle_url(cleanUrl, {
        url: try_get(data, (x) =>
          String(
            (
              (
                ((x as Record<string, unknown>).relationships as Record<string, unknown>)
                  ?.videos as Record<string, unknown>
              )?.links as Record<string, string>
            )?.related || '',
          ),
        ),
        id: data.id,
        title: try_get(data, (x) =>
          String(
            ((x as Record<string, unknown>).attributes as Record<string, unknown>)?.name || '',
          ),
        ),
      }),
    );

    return playlistFromMatches(this, urls, playlistId, { ie: this.ie_key });
  }
}

export class VidioLiveIE extends VidioBaseIE {
  static IE_NAME = 'vidio:live';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?vidio\.com\/live\/(?<id>\d+)-(?<display_id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const displayId = m.groups!.display_id!;

    const streamData = await this._callApi<Record<string, unknown>>(
      `https://www.vidio.com/api/livestreamings/${videoId}/detail`,
      displayId,
    );
    const streamMeta = ((streamData.livestreamings as unknown[]) || [])[0] as Record<
      string,
      unknown
    >;
    const user = ((streamData.users as unknown[]) || [{}])[0] as Record<string, unknown>;
    const title = streamMeta.title != null ? String(streamMeta.title) : videoId;
    const username = user.username != null ? String(user.username) : undefined;

    const formats: Format[] = [];
    if (streamMeta.is_drm) {
      if (!(this as unknown as { params: { allow_unplayable_formats?: boolean } }).params
        ?.allow_unplayable_formats) {
        this.report_drm(videoId);
      }
    }

    if (streamMeta.is_premium) {
      const sources = await this._download_json<Record<string, unknown>>(
        `https://www.vidio.com/interactions_stream.json?video_id=${videoId}&type=livestreamings`,
        displayId,
        'Downloading premier API JSON',
      );
      if (!(sources.source || sources.source_dash)) {
        this.raise_login_required(
          'This video is only available for registered users with the appropriate subscription',
        );
      }
      if (str_or_none(sources.source)) {
        const tokenJson = await this._download_json<{ token?: string }>(
          `https://www.vidio.com/live/${videoId}/tokens`,
          displayId,
          'Downloading HLS token JSON',
          { data: '', method: 'POST' },
        );
        formats.push(
          ...(await this._extract_m3u8_formats(
            `${sources.source}?${tokenJson.token || ''}`,
            displayId,
            'mp4',
            'm3u8_native',
          )),
        );
      }
    } else {
      if (streamMeta.stream_token_url) {
        const tokenJson = await this._download_json<{ token?: string }>(
          `https://www.vidio.com/live/${videoId}/tokens`,
          displayId,
          'Downloading HLS token JSON',
          { data: '', method: 'POST' },
        );
        formats.push(
          ...(await this._extract_m3u8_formats(
            `${streamMeta.stream_token_url}?${tokenJson.token || ''}`,
            displayId,
            'mp4',
            'm3u8_native',
          )),
        );
      }
      if (streamMeta.stream_url) {
        formats.push(
          ...(await this._extract_m3u8_formats(
            String(streamMeta.stream_url),
            displayId,
            'mp4',
            'm3u8_native',
          )),
        );
      }
    }

    return {
      id: videoId,
      display_id: displayId,
      title,
      is_live: true,
      description: strip_or_none(streamMeta.description) || undefined,
      thumbnail: streamMeta.image != null ? String(streamMeta.image) : undefined,
      like_count: int_or_none(streamMeta.like) ?? undefined,
      dislike_count: int_or_none(streamMeta.dislike) ?? undefined,
      formats,
      uploader: user.name != null ? String(user.name) : undefined,
      timestamp: parse_iso8601(streamMeta.start_time) ?? undefined,
      uploader_id: username,
      uploader_url: username ? `https://www.vidio.com/@${username}` : undefined,
    };
  }
}
