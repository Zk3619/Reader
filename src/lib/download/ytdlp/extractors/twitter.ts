/**
 * TwitterIE / X — syndication / guest API / login-wall detection.
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { Format, VideoInfo } from '../types';

const AUTH =
  'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

const REFERER = 'https://x.com/';

function generateSyndicationToken(twid: string): string {
  const n = (Number(twid) / 1e15) * Math.PI;
  return n.toString(36).replace(/0|\./g, '');
}

function normalizeSyndicationStatus(status: Record<string, unknown>, twid: string): Record<string, unknown> {
  const media: Record<string, unknown>[] = [];
  const quoted = status.quoted_tweet as Record<string, unknown> | undefined;
  const sources = [status, quoted].filter(Boolean) as Record<string, unknown>[];
  for (const src of sources) {
    const details = (src.mediaDetails as Record<string, unknown>[]) || [];
    for (const detail of details) {
      media.push({
        ...detail,
        id_str: String(detail.id_str || detail.id || twid),
      });
    }
  }
  if (media.length) {
    status.extended_entities = { media };
  }
  return status;
}

function tweetLoginReason(data: Record<string, unknown>): string | null {
  const errors = data.errors as Array<{ message?: string; code?: number }> | undefined;
  if (errors?.length) {
    const msg = errors.map((e) => String(e.message || '')).join(', ');
    if (/not authorized|authenticate|login|protected|nsfw/i.test(msg)) return msg;
  }
  if (data.reason === 'Nsfw') return 'NSFW tweet requires authentication';
  if (data.reason === 'Protected') return 'You are not authorized to view this protected tweet';
  const text = String(data.full_text || data.text || '');
  if (/login to view|sign in to view|this account.*protected/i.test(text)) {
    return 'Login required to view this tweet';
  }
  return null;
}

export class TwitterIE extends InfoExtractor {
  static IE_NAME = 'twitter';
  static IE_DESC = 'Twitter / X';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|m(?:obile)?)\.)?(?:twitter\.com|x\.com)\/(?:#!\/)?(?:(?:i\/(?:web\/)?status)|(?:(?:[^/]+\/)?status(?:es)?))\/(?<id>\d+)/i;

  private static _GRAPHQL_ENDPOINT = '2ICDjqPd81tulZcYrtpTuQ/TweetResultByRestId';

  private _buildTweetGraphqlQuery(tweetId: string) {
    return {
      variables: {
        tweetId,
        withCommunity: false,
        includePromotedContent: false,
        withVoice: false,
      },
      features: {
        creator_subscriptions_tweet_preview_api_enabled: true,
        tweetypie_unmention_optimization_enabled: true,
        responsive_web_edit_tweet_api_enabled: true,
        graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
        view_counts_everywhere_api_enabled: true,
        longform_notetweets_consumption_enabled: true,
        responsive_web_twitter_article_tweet_consumption_enabled: false,
        tweet_awards_web_tipping_enabled: false,
        freedom_of_speech_not_reach_fetch_enabled: true,
        standardized_nudges_misinfo: true,
        tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
        longform_notetweets_rich_text_read_enabled: true,
        longform_notetweets_inline_media_enabled: true,
        responsive_web_graphql_exclude_directive_enabled: true,
        verified_phone_label_enabled: false,
        responsive_web_media_download_video_enabled: false,
        responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
        responsive_web_graphql_timeline_navigation_enabled: true,
        responsive_web_enhance_cards_enabled: false,
      },
      fieldToggles: { withArticleRichContentState: false },
    };
  }

  /** Convert GraphQL TweetResult payload to legacy-ish status dict. */
  private _graphqlToLegacy(data: Record<string, unknown>, twid: string): Record<string, unknown> | null {
    let result =
      ((data.tweetResult as Record<string, unknown>)?.result as Record<string, unknown>) || {};
    const typename = String(result.__typename || '');
    if (result.tombstone) {
      const cause = String(
        ((result.tombstone as Record<string, unknown>)?.text as Record<string, unknown>)?.text ||
          'Unknown error',
      );
      throw new ExtractorError(`Twitter API says: ${cause.replace(/\. Learn more$/, '')}`, {
        expected: true,
      });
    }
    if (typename === 'TweetUnavailable') {
      const reason = String(result.reason || '');
      if (reason === 'NsfwLoggedOut' || reason === 'NsfwViewerHasNoStatedAge') {
        this.raise_login_required('NSFW tweet requires authentication');
      }
      if (reason === 'Protected') {
        this.raise_login_required('You are not authorized to view this protected tweet');
      }
      throw new ExtractorError(reason || 'Requested tweet is unavailable', { expected: true });
    }
    if (typename === 'TweetWithVisibilityResults') {
      result = ((result.tweet as Record<string, unknown>) || {}) as Record<string, unknown>;
    }
    const status = { ...((result.legacy as Record<string, unknown>) || {}) };
    const user = (
      ((result.core as Record<string, unknown>)?.user_results as Record<string, unknown>)
        ?.result as Record<string, unknown>
    )?.legacy;
    if (user && typeof user === 'object') status.user = user;
    const views = (result.views as Record<string, unknown>)?.count;
    if (views != null) status.view_count = Number(views) || views;
    if (!Object.keys(status).length) {
      this.report_warning(`Empty GraphQL legacy for tweet ${twid}`);
      return null;
    }
    return status;
  }

  private async _fetchTweetGraphql(tweetId: string): Promise<Record<string, unknown> | null> {
    const guest = await this._download_json<{ guest_token?: string }>(
      'https://api.x.com/1.1/guest/activate.json',
      tweetId,
      'Activating guest for GraphQL',
      {
        method: 'POST',
        headers: { Authorization: AUTH },
        data: '{}',
        fatal: false,
      },
    );
    const token = guest?.guest_token;
    if (!token) return null;
    const q = this._buildTweetGraphqlQuery(tweetId);
    const query: Record<string, string> = {
      variables: JSON.stringify(q.variables),
      features: JSON.stringify(q.features),
      fieldToggles: JSON.stringify(q.fieldToggles),
    };
    const raw = await this._download_json<{ data?: Record<string, unknown> }>(
      `https://x.com/i/api/graphql/${TwitterIE._GRAPHQL_ENDPOINT}`,
      tweetId,
      'Downloading GraphQL tweet',
      {
        fatal: false,
        query,
        headers: {
          Authorization: AUTH,
          'x-guest-token': token,
          'x-twitter-client-language': 'en',
          'x-twitter-active-user': 'yes',
          Referer: REFERER,
        },
      },
    );
    if (!raw?.data) return null;
    return this._graphqlToLegacy(raw.data, tweetId);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const id = this._match_id(url);
    if (!id) throw new ExtractorError('Unable to extract tweet id', { expected: true });

    let data: Record<string, unknown> | null = null;

    // 1) syndication CDN (public tweets, no login)
    const synToken = generateSyndicationToken(id);
    try {
      data = await this._download_json<Record<string, unknown>>(
        `https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${synToken}`,
        id,
        'Downloading syndication tweet',
        {
          fatal: false,
          headers: { Referer: REFERER, 'User-Agent': 'Googlebot' },
        },
      );
      if (data) data = normalizeSyndicationStatus(data, id);
    } catch {
      data = null;
    }

    const loginReason = data ? tweetLoginReason(data) : null;
    if (loginReason) this.raise_login_required(loginReason);

    // 2) guest token + legacy show.json
    if (!data || !hasTwitterVideo(data)) {
      try {
        const guest = await this._download_json<{ guest_token?: string; errors?: unknown[] }>(
          'https://api.x.com/1.1/guest/activate.json',
          id,
          'Activating guest',
          {
            method: 'POST',
            headers: { Authorization: AUTH },
            data: '{}',
            fatal: false,
          },
        );
        const token = guest?.guest_token;
        if (token) {
          data = await this._download_json<Record<string, unknown>>(
            `https://api.x.com/1.1/statuses/show/${id}.json?include_entities=true&tweet_mode=extended&cards_platform=Web-12`,
            id,
            'Downloading tweet API',
            {
              fatal: false,
              headers: {
                Authorization: AUTH,
                'x-guest-token': token,
              },
            },
          );
          const apiLogin = data ? tweetLoginReason(data) : null;
          if (apiLogin) this.raise_login_required(apiLogin);
        }
      } catch (e) {
        if (e instanceof ExtractorError && /login required/i.test(String(e.message))) throw e;
      }
    }

    // 3) GraphQL TweetResultByRestId (when syndication/legacy miss media)
    if (!data || !hasTwitterVideo(data)) {
      try {
        const gql = await this._fetchTweetGraphql(id);
        if (gql) {
          data = gql;
          const gqlLogin = tweetLoginReason(data);
          if (gqlLogin) this.raise_login_required(gqlLogin);
        }
      } catch (e) {
        if (e instanceof ExtractorError && /login required|NSFW|protected/i.test(String(e.message))) {
          throw e;
        }
        this.report_warning(`Twitter GraphQL fallback failed: ${(e as Error).message || e}`);
      }
    }

    if (!data) throw new ExtractorError('Unable to fetch tweet', { expected: true });

    const formats = await collectTwitterFormats(this, data, id);
    if (!formats.length) {
      throw new ExtractorError('Tweet has no downloadable video', { expected: true });
    }

    const user = (data.user as Record<string, unknown>) || {};
    const description = String(data.full_text || data.text || '');
    const uploader = String(user.name || '') || undefined;
    let title =
      String(description || user.name || `tweet-${id}`).slice(0, 200) || `tweet-${id}`;
    if (uploader && !title.startsWith(uploader)) title = `${uploader} - ${title}`;

    return {
      id,
      title,
      description: description || null,
      uploader,
      uploader_id: String(user.screen_name || '') || undefined,
      webpage_url: `https://x.com/i/status/${id}`,
      original_url: url,
      formats: this._sort_formats(formats),
      extractor: 'twitter',
      extractor_key: 'Twitter',
      thumbnail: formats[0]?.url,
      http_headers: { Referer: REFERER },
    };
  }
}

/** Resolve t.co / tco: short links to the final tweet URL. */
export class TwitterShortenerIE extends InfoExtractor {
  static IE_NAME = 'twitter:shortener';
  static IE_DESC = 'Twitter t.co shortener';
  static _VALID_URL = /https?:\/\/t\.co\/(?<id>[^?#]+)|tco:(?<eid>[^?#]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = url.match(TwitterShortenerIE._VALID_URL);
    const shortcode = m?.groups?.eid || m?.groups?.id;
    if (!shortcode) {
      throw new ExtractorError('Unable to extract t.co shortcode', { expected: true });
    }

    const shortUrl = m?.groups?.eid ? `https://t.co/${shortcode}` : url;
    let newUrl = shortUrl;
    try {
      const http = await import('@/lib/http');
      const res = await http.request(shortUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'curl' },
      });
      newUrl = res.url || shortUrl;
    } catch {
      /* keep original short URL */
    }

    const unsafePrefix = 'https://twitter.com/safety/unsafe_link_warning?unsafe_link=';
    if (newUrl.startsWith(unsafePrefix)) {
      newUrl = newUrl.slice(unsafePrefix.length);
    }

    return this.url_result(newUrl);
  }
}

function hasTwitterVideo(data: Record<string, unknown>): boolean {
  if (data.video) return true;
  const mediaDetails = (data.mediaDetails as Record<string, unknown>[]) || [];
  if (mediaDetails.some((m) => m.video_info || m.type === 'video')) return true;
  const entities = (data.extended_entities || data.entities) as Record<string, unknown> | undefined;
  const media = (entities?.media as Record<string, unknown>[]) || [];
  return media.some((m) => m.video_info || m.type === 'video');
}

async function collectTwitterFormats(
  ie: InfoExtractor,
  data: Record<string, unknown>,
  videoId: string,
): Promise<Format[]> {
  const out: Format[] = [];
  const seen = new Set<string>();
  const headers = { Referer: REFERER };

  const pushVariant = async (v: Record<string, unknown>, prefix: string) => {
    const u = String(v.url || '');
    if (!u || seen.has(u)) return;
    seen.add(u);
    const br = Number(v.bitrate || v.bit_rate) || 0;
    if (u.includes('.m3u8')) {
      const fmts = await ie._extract_m3u8_formats(
        u,
        videoId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        `${prefix}-hls`,
        undefined,
        false,
        { headers },
      );
      for (const f of fmts) {
        if (!f.tbr && br) f.tbr = Math.round(br / 1000);
        out.push(f);
      }
      if (!fmts.length) {
        out.push({
          format_id: `${prefix}-${br || out.length}`,
          url: u,
          ext: 'mp4',
          protocol: 'm3u8_native',
          tbr: br ? Math.round(br / 1000) : null,
          vcodec: 'unknown',
          acodec: 'unknown',
          http_headers: headers,
        });
      }
      return;
    }
    const fmt: Format = {
      format_id: `${prefix}-${br || out.length}`,
      url: u,
      ext: 'mp4',
      protocol: 'https',
      tbr: br ? Math.round(br / 1000) : null,
      vcodec: 'unknown',
      acodec: 'unknown',
      http_headers: headers,
    };
    const dim = /\/(\d+)x(\d+)\//.exec(u);
    if (dim) {
      fmt.width = Number(dim[1]);
      fmt.height = Number(dim[2]);
    }
    out.push(fmt);
  };

  const handleMedia = async (m: Record<string, unknown>, prefix: string) => {
    const videoInfo = m.video_info as Record<string, unknown> | undefined;
    const variants = (videoInfo?.variants as Record<string, unknown>[]) || [];
    for (const v of variants) {
      const ct = String(v.content_type || '');
      if (ct.includes('mp4') || ct.includes('mpegurl') || String(v.url || '').includes('.m3u8')) {
        await pushVariant(v, prefix);
      }
    }
  };

  // Prefer extended_entities (full variant list from API / syndication normalization)
  const entities = (data.extended_entities || data.entities) as Record<string, unknown> | undefined;
  const extMedia = (entities?.media as Record<string, unknown>[]) || [];
  if (extMedia.length) {
    for (let i = 0; i < extMedia.length; i++) {
      const prefix = extMedia.length > 1 ? `api-${i}` : 'api';
      await handleMedia(extMedia[i]!, prefix);
    }
  } else {
    const mediaDetails = (data.mediaDetails as Record<string, unknown>[]) || [];
    for (const m of mediaDetails) await handleMedia(m, 'syn');
  }

  const video = data.video as Record<string, unknown> | undefined;
  const variants2 = (video?.variants as Record<string, unknown>[]) || [];
  for (const v of variants2) await pushVariant(v, 'syn');

  return out;
}
