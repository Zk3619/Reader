/**
 * GoogleDriveIE / GoogleDriveFolderIE — ported from yt-dlp googledrive.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  determine_ext,
  int_or_none,
  mimetype2ext,
  parse_duration,
  str_or_none,
  traverse_obj,
  update_url_query,
  url_or_none,
} from '../../utils';

export class GoogleDriveIE extends InfoExtractor {
  static IE_NAME = 'googledrive';
  static _VALID_URL =
    /https?:\/\/(?:(?:docs|drive|drive\.usercontent)\.google\.com\/(?:(?:uc|open|download)\?.*?id=|file\/d\/)|video\.google\.com\/get_player\?.*?docid=)(?<id>[a-zA-Z0-9_-]{28,})/;

  static extractEmbedUrls(_url: string, webpage: string): string[] {
    const m = webpage.match(
      /<iframe[^>]+src="https?:\/\/(?:video\.google\.com\/get_player\?.*?docid=|(?:docs|drive)\.google\.com\/file\/d\/)(?<id>[a-zA-Z0-9_-]{28,})/,
    );
    return m?.groups?.id ? [`https://drive.google.com/file/d/${m.groups.id}`] : [];
  }

  protected _constructSubtitleUrl(baseUrl: string, videoId: string, language: string, fmt: string, kind?: string) {
    const q: Record<string, string> = { hl: 'en-US', v: videoId, type: 'track', lang: language, fmt };
    if (kind) q.kind = kind;
    return update_url_query(baseUrl, q);
  }

  protected async _getSubtitles(videoId: string, videoInfo: Record<string, unknown>) {
    const subtitles: Record<string, Subtitle[]> = {};
    const timedTextBaseUrl = url_or_none(traverse_obj(videoInfo, ['timedTextDetails', 'timedTextBaseUrl']));
    if (!timedTextBaseUrl) return subtitles;

    const subtitleData = await this._download_webpage(timedTextBaseUrl, videoId, 'Downloading subtitles XML', {
      fatal: false,
      query: { hl: 'en-US', type: 'list', tlangs: '1', v: videoId, vssids: '1' },
    });
    if (!subtitleData) return subtitles;

    const subtitleFormats = [
      ...subtitleData.matchAll(/<format[^>]*fmt_code="([^"]+)"/g),
    ].map((m) => m[1]!);

    for (const trackMatch of subtitleData.matchAll(/<track[^>]*lang_code="([^"]+)"[^>]*kind="([^"]*)"/g)) {
      const language = trackMatch[1]!;
      const kind = trackMatch[2];
      for (const subFmt of subtitleFormats) {
        (subtitles[language] ||= []).push({
          url: this._constructSubtitleUrl(timedTextBaseUrl, videoId, language, subFmt, kind),
          ext: subFmt,
        });
      }
    }
    return subtitles;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const videoInfo = await this._download_json<Record<string, unknown>>(
      `https://content-workspacevideo-pa.googleapis.com/v1/drive/media/${videoId}/playback`,
      videoId,
      'Downloading video webpage',
      {
        query: { key: 'AIzaSyDVQw45DwoYh632gvsP5vPDqEKvb-Ywnb8' },
        headers: { Referer: 'https://drive.google.com/' },
      },
    );

    const formats: Format[] = [];
    const groups = [
      traverse_obj(videoInfo, ['mediaStreamingData', 'formatStreamingData']),
      traverse_obj(videoInfo, ['mediaStreamingData', 'adaptiveTranscodes']),
      traverse_obj(videoInfo, ['mediaStreamingData', 'progressiveTranscodes']),
    ];
    for (const group of groups) {
      const list = Array.isArray(group) ? group : group ? [group] : [];
      for (const fmt of list) {
        const f = fmt as Record<string, unknown>;
        const fmtUrl = url_or_none(f.url);
        if (!fmtUrl) continue;
        const meta = (f.transcodeMetadata as Record<string, unknown>) || {};
        formats.push({
          url: fmtUrl,
          format_id: str_or_none(meta.itag ?? f.itag) || 'unknown',
          ext: mimetype2ext(String(meta.mimeType ?? '')) || undefined,
          width: int_or_none(meta.width) ?? undefined,
          height: int_or_none(meta.height) ?? undefined,
          fps: int_or_none(meta.videoFps) ?? undefined,
          filesize: int_or_none(meta.contentLength) ?? undefined,
          vcodec: str_or_none(meta.videoCodecString) || 'none',
          acodec: str_or_none(meta.audioCodecString) || 'none',
        });
      }
    }

    let title = str_or_none(traverse_obj(videoInfo, ['mediaMetadata', 'title'])) || undefined;
    const sourceUrl = update_url_query('https://drive.usercontent.google.com/download', {
      id: videoId,
      export: 'download',
      confirm: 't',
    });
    const sourceRes = await this._request_webpage(sourceUrl, videoId, 'Requesting source file', { fatal: false });
    if (sourceRes?.headers?.['content-disposition']) {
      if (!title) {
        title =
          /filename="([^"]+)"/.exec(sourceRes.headers['content-disposition'])?.[1] || undefined;
      }
      formats.push({
        url: sourceRes.url || sourceUrl,
        ext: determine_ext(title, 'mp4').toLowerCase(),
        format_id: 'source',
        quality: 1,
      });
    }

    return {
      id: videoId,
      title,
      duration: parse_duration(traverse_obj(videoInfo, ['mediaMetadata', 'duration']) as string | undefined) ?? undefined,
      thumbnails: ((videoInfo.thumbnails as Array<Record<string, unknown>>) || [])
        .map((t) => ({
          url: url_or_none(t.url) || '',
          ext: mimetype2ext(String(t.mimeType ?? '')) || undefined,
          width: int_or_none(t.width) ?? undefined,
          height: int_or_none(t.height) ?? undefined,
        }))
        .filter((t) => t.url) as VideoInfo['thumbnails'],
      formats,
      subtitles: await this._getSubtitles(videoId, videoInfo),
    };
  }
}

export class GoogleDriveFolderIE extends InfoExtractor {
  static IE_NAME = 'GoogleDrive:Folder';
  static _VALID_URL = /https?:\/\/(?:docs|drive)\.google\.com\/drive\/folders\/(?<id>[\w-]{28,})/;

  static _BOUNDARY = '=====vc17a3rwnndj=====';

  protected async _callApi(folderId: string, key: string, requestPath: string, fatal = true) {
    const data = `--${GoogleDriveFolderIE._BOUNDARY}\r\ncontent-type: application/http\r\ncontent-transfer-encoding: binary\r\n\r\nGET ${requestPath}\r\n\r\n--${GoogleDriveFolderIE._BOUNDARY}\r\n`;
    const response = await this._download_json<Record<string, unknown>>(
      'https://clients6.google.com/batch/drive/v2beta',
      folderId,
      undefined,
      {
        method: 'POST',
        data,
        headers: {
          'Content-Type': `multipart/mixed; boundary="${GoogleDriveFolderIE._BOUNDARY}"`,
          Origin: 'https://drive.google.com',
        },
        query: { $ct: `multipart/mixed; boundary="${GoogleDriveFolderIE._BOUNDARY}"`, key },
        fatal,
      },
    );
    return response;
  }

  protected async *_getFolderItems(folderId: string, key: string): AsyncGenerator<Record<string, unknown>> {
    let pageToken = '';
    const requestTemplate =
      "/drive/v2beta/files?openDrive=true&reason=102&syncType=0&errorRecovery=false&q=trashed%20%3D%20false%20and%20'{folder_id}'%20in%20parents&fields=kind%2CnextPageToken%2Citems(kind%2CmodifiedDate%2CmodifiedByMeDate%2ClastViewedByMeDate%2CfileSize%2Cowners(kind%2CpermissionId%2Cid)%2ClastModifyingUser(kind%2CpermissionId%2Cid)%2ChasThumbnail%2CthumbnailVersion%2Ctitle%2Cid%2CresourceKey%2Cshared%2CsharedWithMeDate%2CuserPermission(role)%2CexplicitlyTrashed%2CmimeType%2CquotaBytesUsed%2Ccopyable%2CfileExtension%2CsharingUser(kind%2CpermissionId%2Cid)%2Cspaces%2Cversion%2CteamDriveId%2ChasAugmentedPermissions%2CcreatedDate%2CtrashingUser(kind%2CpermissionId%2Cid)%2CtrashedDate%2Cparents(id)%2CshortcutDetails(targetId%2CtargetMimeType%2CtargetLookupStatus)%2Ccapabilities(canCopy%2CcanDownload%2CcanEdit%2CcanAddChildren%2CcanDelete%2CcanRemoveChildren%2CcanShare%2CcanTrash%2CcanRename%2CcanReadTeamDrive%2CcanMoveTeamDriveItem)%2Clabels(starred%2Ctrashed%2Crestricted%2Cviewed))%2CincompleteSearch&appDataFilter=NO_APP_DATA&spaces=drive&pageToken={page_token}&maxResults=50&supportsTeamDrives=true&includeItemsFromAllDrives=true&corpora=default&orderBy=folder%2Ctitle_natural%20asc&retryCount=0&key={key} HTTP/1.1";

    while (pageToken !== null as unknown as string) {
      const request = requestTemplate
        .replace('{folder_id}', folderId)
        .replace('{page_token}', pageToken)
        .replace('{key}', key);
      const page = await this._callApi(folderId, key, request);
      for (const item of (page.items as Array<Record<string, unknown>>) || []) yield item;
      pageToken = (page.nextPageToken as string | undefined) ?? (null as unknown as string);
      if (!page.nextPageToken) break;
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const folderId = this._match_id(url);
    const webpage = await this._download_webpage(url, folderId);
    const key = this._search_regex(/"(\w{39})"/, webpage, 'key')!;
    const folderInfo = await this._callApi(folderId, key, `/drive/v2beta/files/${folderId} HTTP/1.1`, false);
    const entries: VideoInfo[] = [];
    for await (const item of this._getFolderItems(folderId, key)) {
      entries.push(this.url_result(`https://drive.google.com/file/d/${item.id}`, 'GoogleDrive', String(item.id ?? '')));
    }
    return this.playlist_result(entries, folderId, folderInfo.title as string | undefined);
  }
}
