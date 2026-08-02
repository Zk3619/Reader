/** TumblrIE — ported from yt-dlp tumblr.py (main IE class) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, str_or_none, traverse_obj, url_or_none } from '../../utils';
import { urlencodePostdata as postData } from './_helpers';

const PROVIDERS: Record<string, string | null> = {
  instagram: 'Instagram',
  vimeo: 'Vimeo',
  youtube: 'Youtube',
  dailymotion: 'Dailymotion',
  tiktok: 'TikTok',
  twitch_live: 'TwitchStream',
  bandcamp: null,
  soundcloud: null,
};

const UNSUPPORTED_PROVIDERS = new Set(['spotify']);

export class TumblrIE extends InfoExtractor {
  static IE_NAME = 'tumblr';
  static _VALID_URL =
    /https?:\/\/(?<blog_name_1>[^/?#&]+)\.tumblr\.com\/(?:post|video|(?<blog_name_2>[a-zA-Z\d-]+))\/(?<id>[0-9]+)(?:$|[/?#])/;

  protected _ACCESS_TOKEN: string | null = null;
  protected _LOGIN_URL = 'https://www.tumblr.com/login';
  protected _OAUTH_URL = 'https://www.tumblr.com/api/v2/oauth2/token';

  protected async _initialize_pre_login(): Promise<void> {
    const loginPage = await this._download_webpage(this._LOGIN_URL, undefined, 'Downloading login page', {
      fatal: false,
    });
    if (loginPage) {
      this._ACCESS_TOKEN =
        this._search_regex(/"API_TOKEN":\s*"(\w+)"/, loginPage, 'API access token', undefined, false) ||
        null;
    }
    if (!this._ACCESS_TOKEN) {
      this.report_warning(
        'Failed to get access token; metadata will be missing and some videos may not work',
      );
    }
  }

  protected async _perform_login(username: string, password: string): Promise<void> {
    if (!this._ACCESS_TOKEN) return;
    const data: Record<string, string> = {
      password,
      grant_type: 'password',
      username,
    };
    const tfa = this.params.twofactor;
    if (tfa) data.tfa_token = String(tfa);

    const callLogin = () =>
      this._download_json<Record<string, unknown>>(this._OAUTH_URL, undefined, 'Logging in', {
        data: postData(data),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Bearer ${this._ACCESS_TOKEN}`,
        },
        fatal: false,
      });

    let response = await callLogin();
    if (response.error === 'tfa_required') {
      const tfaInfo = this.params.twofactor;
      if (tfaInfo) {
        data.tfa_token = String(tfaInfo);
        response = await callLogin();
      }
    }
    if (response.error) {
      throw new ExtractorError(
        `API returned error ${response.error}${response.error_description ? `: ${response.error_description}` : ''}`,
      );
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const blog = m.groups!.blog_name_2 || m.groups!.blog_name_1!;
    const videoId = m.groups!.id!;
    const postUrl = `http://${blog}.tumblr.com/post/${videoId}`;

    const handle = await this._request_webpage(postUrl, videoId, undefined, {
      headers: { 'User-Agent': 'WhatsApp/2.0' },
    });
    if (!handle) throw new ExtractorError('Failed to download Tumblr post');
    const webpage = handle.text;
    const redirectUrl = handle.url;

    const apiOnly = Boolean(
      this._search_regex(
        /(tumblr.com|^)\/(safe-mode|login_required|blog\/view)/,
        redirectUrl,
        'redirect',
        undefined,
        false,
      ),
    );

    if (apiOnly && !this._ACCESS_TOKEN) {
      throw new ExtractorError('Cannot get data for dashboard-only post without access token', {
        expected: true,
      });
    }

    let postJson: Record<string, unknown> = {};
    if (this._ACCESS_TOKEN) {
      const apiResp = await this._download_json<Record<string, unknown>>(
        `https://www.tumblr.com/api/v2/blog/${blog}/posts/${videoId}/permalink`,
        videoId,
        undefined,
        {
          headers: { Authorization: `Bearer ${this._ACCESS_TOKEN}` },
          fatal: false,
        },
      );
      postJson =
        (traverse_obj(apiResp, ['response', 'timeline', 'elements', 0]) as Record<string, unknown>) ||
        {};
    }

    const trail0 = traverse_obj(postJson, ['trail', 0]) as Record<string, unknown> | undefined;
    const contentJson =
      (trail0 ? traverse_obj(trail0, ['content']) : traverse_obj(postJson, ['content'])) as
        | Array<Record<string, unknown>>
        | undefined;

    let description: string | undefined;
    if (contentJson) {
      description =
        contentJson
          .filter((item) => item.type === 'text' && item.text)
          .map((item) => String(item.text))
          .join('\n\n') || undefined;
    } else {
      description = this._og_search_description(webpage) || undefined;
    }

    const uploaderId =
      str_or_none(postJson.reblogged_root_name) || str_or_none(postJson.blog_name) || undefined;

    const infoDict: Partial<VideoInfo> = {
      id: videoId,
      title:
        str_or_none(postJson.summary) ||
        (apiOnly
          ? blog
          : this._html_search_regex(/<title>(?<title>[\s\S]*?)(?: \| Tumblr)?<\/title>/s, webpage, 'title', 'title', false) ||
            blog),
      description,
      uploader_id: uploaderId,
      uploader_url: uploaderId ? `https://${uploaderId}.tumblr.com/` : undefined,
      timestamp:
        int_or_none(traverse_obj(postJson, ['trail', 0, 'post', 'timestamp'])) ??
        int_or_none(postJson.timestamp) ??
        undefined,
      like_count: int_or_none(postJson.like_count) ?? undefined,
      repost_count: int_or_none(postJson.reblog_count) ?? undefined,
      tags: Array.isArray(postJson.tags) ? postJson.tags.map(String) : undefined,
      age_limit: postJson.is_nsfw === true ? 18 : postJson.is_nsfw === false ? 0 : undefined,
    };

    let fallbackFormat: Partial<Format> | null = null;
    const formats: Format[] = [];
    const videoUrl = this._og_search_video_url(webpage);
    const entries: VideoInfo[] = [];
    const ignoredProviders = new Set<string>();
    const unknownProviders = new Set<string>();

    for (const videoJson of traverse_obj(contentJson, [
      (v: unknown) => ['video', 'audio'].includes(String((v as Record<string, unknown>).type)),
    ]) as Array<Record<string, unknown>>) {
      const mediaJson = (videoJson.media as Record<string, unknown>) || {};
      if (apiOnly && !mediaJson.url && !videoJson.url) {
        throw new ExtractorError('Failed to find video data for dashboard-only post', { expected: true });
      }
      const provider = str_or_none(videoJson.provider);

      if (!provider || provider === 'tumblr') {
        fallbackFormat = {
          url: str_or_none(mediaJson.url) || videoUrl || undefined,
          width:
            int_or_none(mediaJson.width) ??
            int_or_none(this._og_search_property('video:width', webpage, undefined, false)) ??
            undefined,
          height:
            int_or_none(mediaJson.height) ??
            int_or_none(this._og_search_property('video:height', webpage, undefined, false)) ??
            undefined,
        };
        continue;
      }
      if (UNSUPPORTED_PROVIDERS.has(provider)) {
        ignoredProviders.add(provider);
        continue;
      }
      if (!(provider in PROVIDERS)) unknownProviders.add(provider);
      if (videoJson.url) {
        entries.push(this.url_result(String(videoJson.url), PROVIDERS[provider] || provider));
      }
    }

    let duration: number | undefined;
    const iframeUrl = this._search_regex(
      new RegExp(`src='(https?://www\\.tumblr\\.com/video/${blog}/${videoId}/[^']+)'`),
      webpage,
      'iframe url',
      undefined,
      false,
    );
    if (iframeUrl) {
      const iframe = await this._download_webpage(iframeUrl, videoId, 'Downloading iframe page', {
        headers: { Referer: redirectUrl },
      });
      const optionsRaw = this._search_regex(
        /data-crt-options=(["'])(?<options>.+?)\1/,
        iframe,
        'hd video url',
        undefined,
        false,
        'options',
      );
      const options = optionsRaw
        ? (this._parse_json(optionsRaw.replace(/&quot;/g, '"'), videoId, null, false) as Record<
            string,
            unknown
          >)
        : null;
      if (options) {
        duration = int_or_none(options.duration) ?? undefined;
        const hdUrl = str_or_none(options.hdUrl);
        if (hdUrl) {
          const sources: Array<[string, string]> = [];
          const sdUrl = this._search_regex(
            /<source[^>]+src=(["'])(?<url>.+?)\1/,
            iframe,
            'sd video url',
            undefined,
            false,
            'url',
          );
          if (sdUrl) sources.push([sdUrl, 'sd']);
          sources.push([hdUrl, 'hd']);
          for (const [vUrl, formatId] of sources) {
            formats.push({
              url: vUrl,
              format_id: formatId,
              height:
                int_or_none(vUrl.match(/_(\d+)\.\w+$/)?.[1]) ?? undefined,
              quality: formatId === 'hd' ? 1 : 0,
            });
          }
        }
      }
    }

    if (!formats.length && fallbackFormat?.url) formats.push(fallbackFormat as Format);

    if (formats.length) {
      const thumb =
        url_or_none(traverse_obj(contentJson?.[0], ['poster', 0, 'url'])) ||
        this._og_search_thumbnail(webpage);
      entries.unshift({
        ...infoDict,
        id: videoId,
        formats,
        duration,
        thumbnail: thumb || undefined,
      } as VideoInfo);
    }

    if (ignoredProviders.size) {
      if (!entries.length) {
        throw new ExtractorError(
          `None of embed providers are supported: ${[...ignoredProviders].join(', ')}`,
          { expected: true },
        );
      }
      this.report_warning(`Skipped embeds from unsupported providers: ${[...ignoredProviders].join(', ')}`);
    }
    if (unknownProviders.size) {
      this.report_warning(`Unrecognized providers, please report: ${[...unknownProviders].join(', ')}`);
    }

    if (!entries.length) {
      this.raise_no_formats('No video could be found in this post', true);
    }
    if (entries.length === 1) {
      return { ...infoDict, ...entries[0], id: videoId } as VideoInfo;
    }
    return {
      ...infoDict,
      id: videoId,
      _type: 'playlist',
      entries,
    } as VideoInfo;
  }
}
