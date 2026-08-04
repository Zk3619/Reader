// @ts-nocheck
/**
 * YoutubeNotificationsIE â€?ported from yt-dlp youtube/_notifications.py
 * Pragmatic Innertube notification menu; requires cookies.
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Thumbnail, VideoInfo } from '../../types';
import { traverse_obj } from '../../utils';
import { extractYtcfg, getText } from '../youtube/shared';

const DEFAULT_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const DEFAULT_CLIENT_VERSION = '2.20240101.00.00';

function ucidOrNone(browseId: unknown): string | null {
  if (typeof browseId !== 'string') return null;
  return /^UC[\w-]{22}$/.test(browseId) ? browseId : null;
}

function extractThumbnails(node: unknown, key: string): Thumbnail[] {
  if (!node || typeof node !== 'object') return [];
  const thumbs = (node as Record<string, unknown>)[key] as
    | { thumbnails?: Array<{ url?: string; width?: number; height?: number }> }
    | undefined;
  return (thumbs?.thumbnails || [])
    .filter((t) => t.url)
    .map((t) => ({
      url: String(t.url),
      width: t.width,
      height: t.height,
    }));
}

export class YoutubeNotificationsIE extends InfoExtractor {
  static IE_NAME = 'youtube:notif';
  static IE_DESC = 'YouTube notifications; ":ytnotif" keyword (requires cookies)';
  static _VALID_URL = /:ytnotif(?:ication)?s?/;
  static _LOGIN_REQUIRED = true;

  protected _extractNotificationRenderer(
    notification: Record<string, unknown> | null | undefined,
  ): VideoInfo | null {
    if (!notification) return null;

    const videoId = traverse_obj(notification, ['navigationEndpoint', 'watchEndpoint', 'videoId'], {
      expected_type: (v) => (typeof v === 'string' ? v : undefined),
    }) as string | undefined;

    let url: string;
    let channelId: string | null = null;
    if (videoId) {
      url = `https://www.youtube.com/watch?v=${videoId}`;
    } else {
      const browseEp = traverse_obj(notification, ['navigationEndpoint', 'browseEndpoint'], {
        expected_type: (v) => (v && typeof v === 'object' ? v : undefined),
      }) as Record<string, unknown> | undefined;
      channelId = ucidOrNone(browseEp?.browseId);
      const postId = this._search_regex(
        /\/post\/(.+)/,
        String(browseEp?.canonicalBaseUrl || ''),
        'post id',
        null,
        false,
      );
      if (!channelId || !postId) return null;
      url = `https://www.youtube.com/channel/${channelId}/community?lb=${postId}`;
    }

    const channel = traverse_obj(
      notification,
      [
        'contextualMenu',
        'menuRenderer',
        'items',
        1,
        'menuServiceItemRenderer',
        'text',
        'runs',
        1,
        'text',
      ],
      { expected_type: (v) => (typeof v === 'string' ? v : undefined) },
    ) as string | undefined;

    let notificationTitle = getText(notification, 'shortMessage');
    if (notificationTitle) notificationTitle = notificationTitle.replace(/\u00ad/g, '');

    let title: string | undefined;
    if (notificationTitle) {
      const escaped = (channel || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      title =
        this._search_regex(
          new RegExp(`${escaped}[^:]+: (.+)`),
          notificationTitle,
          'video title',
          null,
          false,
        ) || undefined;
    }

    return {
      _type: 'url',
      url,
      ie_key: videoId ? 'Youtube' : 'YoutubeTab',
      id: videoId || channelId || url,
      title: title || videoId || channelId || url,
      video_id: videoId,
      channel_id: channelId || undefined,
      channel,
      uploader: channel,
      thumbnails: extractThumbnails(notification, 'videoThumbnail'),
      extractor: videoId ? 'youtube' : 'youtube:tab',
      extractor_key: videoId ? 'Youtube' : 'YoutubeTab',
    };
  }

  protected *_extractNotificationMenu(
    response: Record<string, unknown>,
    continuationList: Array<Record<string, unknown> | null>,
  ): Generator<VideoInfo> {
    const notificationList =
      (traverse_obj(response, [
        ['actions', 0, 'openPopupAction', 'popup', 'multiPageMenuRenderer', 'sections', 0, 'multiPageMenuNotificationSectionRenderer', 'items'],
        ['actions', 0, 'appendContinuationItemsAction', 'continuationItems'],
      ]) as unknown[]) ||
      [];
    const list = Array.isArray(notificationList) ? notificationList : [];
    continuationList[0] = null;
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const entry = this._extractNotificationRenderer(
        rec.notificationRenderer as Record<string, unknown> | undefined,
      );
      if (entry) yield entry;
      const continuation = rec.continuationItemRenderer as Record<string, unknown> | undefined;
      if (continuation) continuationList[0] = continuation;
    }
  }

  protected async *_notificationMenuEntries(
    ytcfg: Record<string, unknown>,
  ): AsyncGenerator<VideoInfo> {
    const continuationList: Array<Record<string, unknown> | null> = [null];
    let response: Record<string, unknown> | null = null;
    const apiKey = String(ytcfg.INNERTUBE_API_KEY || DEFAULT_API_KEY);
    const context =
      (ytcfg.INNERTUBE_CONTEXT as Record<string, unknown>) ||
      ({
        client: {
          clientName: 'WEB',
          clientVersion: DEFAULT_CLIENT_VERSION,
          hl: 'en',
          gl: 'US',
        },
      } as Record<string, unknown>);
    const clientVersion = String(
      ((context.client as Record<string, unknown> | undefined)?.clientVersion as string) ||
        ytcfg.INNERTUBE_CLIENT_VERSION ||
        DEFAULT_CLIENT_VERSION,
    );

    for (let page = 1; page <= 50; page++) {
      const ctoken = traverse_obj(
        continuationList[0],
        ['continuationEndpoint', 'getNotificationMenuEndpoint', 'ctoken'],
        { expected_type: (v) => (typeof v === 'string' ? v : undefined) },
      ) as string | undefined;

      const endpoint = `https://www.youtube.com/youtubei/v1/notification/get_notification_menu?key=${apiKey}&prettyPrint=false`;
      const body: Record<string, unknown> = {
        context,
        notificationsMenuRequestType: 'NOTIFICATIONS_MENU_REQUEST_TYPE_INBOX',
      };
      if (ctoken) body.ctoken = ctoken;

      response = await this._download_json<Record<string, unknown>>(
        endpoint,
        `page ${page}`,
        'Downloading notification menu',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-YouTube-Client-Name': String(ytcfg.INNERTUBE_CONTEXT_CLIENT_NAME || '1'),
            'X-YouTube-Client-Version': clientVersion,
            Origin: 'https://www.youtube.com',
          },
          data: JSON.stringify(body),
          fatal: false,
        },
      );

      if (!response || !Object.keys(response).length) break;

      let yielded = 0;
      for (const entry of this._extractNotificationMenu(response, continuationList)) {
        yielded++;
        yield entry;
      }
      if (!continuationList[0] || !yielded) break;
    }
  }

  async _real_extract(_url: string): Promise<VideoInfo> {
    const displayId = 'notifications';
    const webpage = await this._download_webpage(
      'https://www.youtube.com/',
      displayId,
      'Downloading YouTube homepage',
      { fatal: false, headers: { 'Accept-Language': 'en-US,en;q=0.9' } },
    );
    const ytcfg = webpage ? extractYtcfg(webpage) : {};
    if (!webpage) {
      throw new ExtractorError(
        'YouTube notifications require cookies; failed to download homepage',
        { expected: true },
      );
    }

    const entries: VideoInfo[] = [];
    for await (const e of this._notificationMenuEntries(ytcfg)) entries.push(e);
    return this.playlist_result(entries, displayId, displayId);
  }
}
