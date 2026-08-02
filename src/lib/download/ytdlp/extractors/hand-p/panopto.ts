/** PanoptoBaseIE / PanoptoIE / PanoptoPlaylistIE — ported from yt-dlp panopto.py (main path) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { int_or_none, str_or_none, traverse_obj, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

const BASE_URL_RE = '(?<base_url>https?:\\/\\/[\\w.-]+\\.panopto\\.(?:com|eu)\\/Panopto)';

export class PanoptoBaseIE extends InfoExtractor {
  static IE_NAME = 'panoptobase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('PanoptoBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _callApi(
    baseUrl: string,
    path: string,
    videoId: string,
    opts: { query?: Record<string, string>; data?: unknown; fatal?: boolean; note?: string } = {},
  ): Promise<Record<string, unknown> | null> {
    const response = await this._download_json<Record<string, unknown>>(
      baseUrl + path,
      videoId,
      opts.note,
      {
        query: opts.query,
        data: opts.data ? JSON.stringify(opts.data) : undefined,
        fatal: opts.fatal ?? true,
        headers: { accept: 'application/json', 'content-type': 'application/json' },
      },
    );
    if (!response) return null;
    const errorCode = traverse_obj(response, ['ErrorCode']);
    if (errorCode === 2) this.raise_login_required(undefined, true, 'cookies');
    if (errorCode != null) {
      const msg = `Panopto said: ${response.ErrorMessage ?? errorCode}`;
      if (opts.fatal !== false) throw new ExtractorError(msg, { expected: true });
      this.report_warning(`${msg} (${videoId})`);
    }
    return response;
  }

  protected _extractChapters(timestamps: Array<Record<string, unknown>> | undefined) {
    const chapters: Array<{ start_time: number; end_time: number; title: string }> = [];
    for (const ts of timestamps || []) {
      const caption = str_or_none(ts.Caption);
      const start = int_or_none(ts.Time);
      const duration = int_or_none(ts.Duration);
      if (!caption || start == null || duration == null) continue;
      chapters.push({ start_time: start, end_time: start + duration, title: caption });
    }
    return chapters;
  }

  protected async _extractStreamsFormats(
    videoId: string,
    streams: Array<Record<string, unknown>> | undefined,
    fmtExtra: Record<string, unknown> = {},
  ): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    for (const stream of streams || []) {
      for (const key of ['StreamHttpUrl', 'StreamUrl'] as const) {
        const streamUrl = url_or_none(stream[key]);
        if (!streamUrl) continue;
        const mediaType = str_or_none(stream.ViewerMediaFileTypeName);
        if (mediaType === 'hls') {
          const res = await extractM3u8FormatsAndSubtitles(this, streamUrl, videoId, 'hls');
          for (const fmt of res.formats) {
            formats.push({ ...fmt, format_note: str_or_none(stream.Tag) ?? undefined, ...fmtExtra });
          }
          subtitles = { ...subtitles, ...res.subtitles };
        } else {
          formats.push({
            url: streamUrl,
            format_id: mediaType || 'http',
            ext: mediaType || 'mp4',
            format_note: str_or_none(stream.Tag) ?? undefined,
            ...fmtExtra,
          });
        }
      }
    }
    return { formats, subtitles };
  }
}

export class PanoptoIE extends PanoptoBaseIE {
  static IE_NAME = 'panopto';
  static _VALID_URL = new RegExp(`${BASE_URL_RE}\\/Pages\\/(?:Viewer|Embed)\\.aspx.*(?:\\?|&)id=(?<id>[a-f0-9-]+)`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const baseUrl = m.groups?.base_url!;
    const videoId = m.groups?.id!;
    const deliveryInfo = (await this._callApi(baseUrl, '/Pages/Viewer/DeliveryInfo.aspx', videoId, {
      query: {
        deliveryId: videoId,
        invocationId: '',
        isLiveNotes: 'false',
        refreshAuthCookie: 'true',
        isActiveBroadcast: 'false',
        isEditing: 'false',
        isKollectiveAgentInstalled: 'false',
        isEmbed: 'false',
        responseType: 'json',
      },
    }))!;
    const delivery = (deliveryInfo.Delivery as Record<string, unknown>) || {};
    const sessionStart = int_or_none(delivery.SessionStartTime);
    const timestamps = delivery.Timestamps as Array<Record<string, unknown>> | undefined;

    const podcast = await this._extractStreamsFormats(videoId, delivery.PodcastStreams as Array<Record<string, unknown>>, {
      format_note: 'PODCAST',
    });
    const streams = await this._extractStreamsFormats(videoId, delivery.Streams as Array<Record<string, unknown>>);

    return {
      id: videoId,
      title: str_or_none(delivery.SessionName) ?? undefined,
      timestamp: sessionStart != null ? sessionStart - 11640000000 : undefined,
      duration: int_or_none(delivery.Duration) ?? undefined,
      thumbnail: `${baseUrl}/Services/FrameGrabber.svc/FrameRedirect?objectId=${videoId}&mode=Delivery`,
      uploader: str_or_none(delivery.OwnerDisplayName) ?? undefined,
      uploader_id: str_or_none(delivery.OwnerId) ?? undefined,
      description: str_or_none(delivery.SessionAbstract) ?? undefined,
      channel_id: str_or_none(delivery.SessionGroupPublicID) ?? undefined,
      channel: str_or_none(delivery.SessionGroupLongName) || str_or_none(delivery.SessionGroupShortName) || undefined,
      chapters: this._extractChapters(timestamps),
      formats: [...podcast.formats, ...streams.formats],
      subtitles: { ...podcast.subtitles, ...streams.subtitles },
    };
  }
}

export class PanoptoPlaylistIE extends PanoptoBaseIE {
  static IE_NAME = 'panoptoplaylist';
  static _VALID_URL = new RegExp(`${BASE_URL_RE}\\/Pages\\/(?:Viewer|Embed)\\.aspx.*(?:\\?|&)pid=(?<id>[a-f0-9-]+)`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const baseUrl = m.groups?.base_url!;
    const playlistId = m.groups?.id!;
    const resp = await this._callApi(baseUrl, '/Services/Portal.svc/GetPlaylistItems', playlistId, {
      data: { playlistId },
      note: 'Downloading playlist',
    });
    const items = (resp?.Items as Array<Record<string, unknown>>) || [];
    const entries = items
      .map((item) => {
        const id = str_or_none(item.Id);
        if (!id) return null;
        return this.url_result(`${baseUrl}/Pages/Viewer.aspx?id=${id}`, 'panopto', id, str_or_none(item.Title) ?? undefined);
      })
      .filter(Boolean) as VideoInfo[];
    return this.playlist_result(entries, playlistId, str_or_none(resp?.Name) ?? undefined, str_or_none(resp?.Description) ?? undefined);
  }
}

export class PanoptoListIE extends PanoptoBaseIE {
  static IE_NAME = 'panoptolist';
  static _VALID_URL = new RegExp(`${BASE_URL_RE}\\/Pages\\/Sessions\\/List\\.aspx`);
  static _PAGE_SIZE = 250;

  protected async *_fetchPage(
    baseUrl: string,
    queryParams: Record<string, unknown>,
    displayId: string,
  ): AsyncGenerator<VideoInfo> {
    for (let page = 0; page < 40; page++) {
      const params = {
        sortColumn: 1,
        getFolderData: true,
        includePlaylists: true,
        ...queryParams,
        page,
        maxResults: PanoptoListIE._PAGE_SIZE,
      };
      const response = await this._callApi(baseUrl, '/Services/Data.svc/GetSessions', `${displayId} page ${page + 1}`, {
        data: { queryParameters: params },
        fatal: false,
      });
      const results = ((response as Record<string, unknown> | null)?.Results as Array<Record<string, unknown>>) || [];
      const subfolders =
        ((response as Record<string, unknown> | null)?.Subfolders as Array<Record<string, unknown>>) || [];
      if (!results.length && !subfolders.length) break;
      for (const result of results) {
        const itemId = str_or_none(result.DeliveryID);
        if (!itemId) continue;
        const itemUrl =
          url_or_none(result.ViewerUrl) ||
          url_or_none(result.EmbedUrl) ||
          `${baseUrl}/Pages/Viewer.aspx?id=${itemId}`;
        yield this.url_result(itemUrl, 'Panopto', itemId, str_or_none(result.SessionName) ?? undefined);
      }
      for (const folder of subfolders) {
        const folderId = str_or_none(folder.ID);
        if (!folderId) continue;
        yield this.url_result(
          `${baseUrl}/Pages/Sessions/List.aspx#folderID="${folderId}"`,
          'PanoptoList',
          folderId,
          str_or_none(folder.Name) ?? undefined,
        );
      }
      if (results.length < PanoptoListIE._PAGE_SIZE) break;
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const baseUrl = m.groups?.base_url!;
    const hash = url.includes('#') ? url.split('#')[1]! : '';
    const queryParams: Record<string, unknown> = {};
    for (const part of hash.split('&')) {
      const [k, ...rest] = part.split('=');
      if (!k) continue;
      try {
        queryParams[decodeURIComponent(k)] = decodeURIComponent(rest.join('=') || '').replace(/^"|"$/g, '');
      } catch {
        queryParams[k] = rest.join('=');
      }
    }
    let displayId = 'panopto_list';
    const folderId = str_or_none(queryParams.folderID);
    if (queryParams.isSubscriptionsPage) displayId = 'subscriptions';
    else if (queryParams.isSharedWithMe) displayId = 'sharedwithme';
    else if (folderId) displayId = folderId;

    let title = displayId;
    if (folderId) {
      const folderInfo = await this._callApi(baseUrl, '/Services/Data.svc/GetFolderInfo', folderId, {
        data: { folderID: folderId },
        fatal: false,
      });
      title = str_or_none(folderInfo?.Name) || displayId;
    }

    const entries: VideoInfo[] = [];
    for await (const entry of this._fetchPage(baseUrl, queryParams, displayId)) {
      entries.push(entry);
    }
    return this.playlist_result(entries, displayId, title);
  }
}
