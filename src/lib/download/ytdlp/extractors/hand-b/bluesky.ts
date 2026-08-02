/**
 * BlueskyIE — ported from yt-dlp bluesky.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  int_or_none,
  mimetype2ext,
  truncate_string,
  update_url_query,
  url_or_none,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, orderedSet, parseIso8601, urlBasename } from './_helpers';

const BLOB_URL_TMPL = (endpoint: string) => `${endpoint}/xrpc/com.atproto.sync.getBlob`;

function getPath(obj: unknown, path: Array<string | number>): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur == null) return undefined;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}

function buildProfileUrl(path: unknown): string | undefined {
  return path ? `https://bsky.app/profile/${path}` : undefined;
}

interface ExtractVideosOpts {
  embedPath?: Array<string | number>;
  recordPath?: Array<string | number>;
  recordSubpath?: Array<string | number>;
}

export class BlueskyIE extends InfoExtractor {
  static IE_NAME = 'bluesky';
  static _VALID_URL = [
    /https?:\/\/(?:www\.)?(?:bsky\.app|main\.bsky\.dev)\/profile\/(?<handle>[\w.:%-]+)\/post\/(?<id>\w+)/,
    /at:\/\/(?<handle>[\w.:%-]+)\/app\.bsky\.feed\.post\/(?<id>\w+)/,
  ];

  protected async _getServiceEndpoint(did: string, videoId: string): Promise<string> {
    const url = did.startsWith('did:web:')
      ? `https://${did.slice(8)}/.well-known/did.json`
      : `https://plc.directory/${did}`;
    const services = await this._download_json<Record<string, unknown>>(
      url,
      videoId,
      'Fetching service endpoint',
      { fatal: false },
    );
    const list = (services?.service as Array<Record<string, unknown>>) || [];
    const found = list.find((s) => s.type === 'AtprotoPersonalDataServer');
    return url_or_none(found?.serviceEndpoint) || 'https://bsky.social';
  }

  protected async _extractPost(handle: string, postId: string): Promise<Record<string, unknown>> {
    const resp = await this._download_json<{ thread: { post: Record<string, unknown> } }>(
      'https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread',
      postId,
      undefined,
      { query: { uri: `at://${handle}/app.bsky.feed.post/${postId}`, depth: '0', parentHeight: '0' } },
    );
    return resp.thread.post;
  }

  protected async _extractVideos(
    root: Record<string, unknown>,
    videoId: string,
    opts?: ExtractVideosOpts,
  ): Promise<VideoInfo[]> {
    const embedPath = opts?.embedPath ?? ['embed'];
    const recordPath = opts?.recordPath ?? ['record'];
    const recordSubpath = opts?.recordSubpath ?? ['embed'];

    const entries: VideoInfo[] = [];

    const externalUri =
      url_or_none(getPath(root, [...recordPath, ...recordSubpath, 'external', 'uri'])) ||
      url_or_none(getPath(root, [...embedPath, 'external', 'uri']));
    if (externalUri) entries.push(this.url_result(externalUri));

    const playlist = url_or_none(getPath(root, [...embedPath, 'playlist']));
    if (!playlist) return entries;

    const { formats } = await extractM3u8FormatsAndSubtitles(this, playlist, videoId);
    const subtitles: Record<string, Subtitle[]> = {};

    const videoCid =
      (getPath(root, [...embedPath, 'cid']) as string | undefined) ||
      (getPath(root, [...recordPath, ...recordSubpath, 'video', 'ref', '$link']) as string | undefined);
    const did = getPath(root, ['author', 'did']) as string | undefined;

    if (did && videoCid) {
      const endpoint = await this._getServiceEndpoint(did, videoId);
      const aspectRatio = getPath(root, [...embedPath, 'aspectRatio']) as Record<string, unknown> | undefined;
      const videoNode = getPath(root, [...recordPath, ...recordSubpath, 'video']) as
        | Record<string, unknown>
        | undefined;
      formats.push({
        format_id: 'blob',
        quality: 1,
        url: update_url_query(BLOB_URL_TMPL(endpoint), { did, cid: videoCid }),
        width: int_or_none(aspectRatio?.width) ?? undefined,
        height: int_or_none(aspectRatio?.height) ?? undefined,
        filesize: int_or_none(videoNode?.size) ?? undefined,
        ext: mimetype2ext(videoNode?.mimeType as string | undefined) || undefined,
      } as Format);

      const captions =
        (getPath(root, [...recordPath, ...recordSubpath, 'captions']) as Array<Record<string, unknown>>) || [];
      for (const subData of captions) {
        const link = getPath(subData, ['file', 'ref', '$link']) as string | undefined;
        if (!link) continue;
        const lang = (subData.lang as string) || 'und';
        (subtitles[lang] ||= []).push({
          ext: mimetype2ext(getPath(subData, ['file', 'mimeType']) as string | undefined) || 'vtt',
          url: update_url_query(BLOB_URL_TMPL(endpoint), { did, cid: link }),
        });
      }
    }

    const author = (root.author as Record<string, unknown>) || {};
    const recordText = (getPath(root, [...recordPath, 'text']) as string) || '';
    const labels = ((root.labels as Array<Record<string, unknown>>) || []).map((l) => l.val).filter(Boolean) as string[];

    entries.push({
      id: (root.uri ? urlBasename(String(root.uri)) : null) || videoId,
      formats,
      subtitles,
      thumbnail: url_or_none(getPath(root, [...embedPath, 'thumbnail'])) || undefined,
      alt_title: (getPath(root, [...embedPath, 'alt']) as string) || undefined,
      uploader: (author.displayName as string) || undefined,
      uploader_id: (author.handle as string) || undefined,
      uploader_url: buildProfileUrl(author.handle),
      channel_id: (author.did as string) || undefined,
      channel_url: buildProfileUrl(author.did),
      like_count: int_or_none(root.likeCount) ?? undefined,
      repost_count: int_or_none(root.repostCount) ?? undefined,
      comment_count: int_or_none(root.replyCount) ?? undefined,
      timestamp: parseIso8601(root.indexedAt) ?? undefined,
      tags: orderedSet(labels),
      age_limit: labels.some((v) => ['sexual', 'porn', 'graphic-media'].includes(v)) ? 18 : undefined,
      description: recordText || undefined,
      title: truncate_string(recordText.replace(/\n/g, ' '), 72) || undefined,
    });
    return entries;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const handle = m.groups!.handle!;
    const videoId = m.groups!.id!;
    const post = await this._extractPost(handle, videoId);

    const entries: VideoInfo[] = [];
    entries.push(...(await this._extractVideos(post, videoId)));
    entries.push(
      ...(await this._extractVideos(post, videoId, {
        embedPath: ['embed', 'media'],
        recordSubpath: ['embed', 'media'],
      })),
    );

    const nestedPost =
      (getPath(post, ['embed', 'record', 'record']) as Record<string, unknown> | undefined) ||
      (getPath(post, ['embed', 'record']) as Record<string, unknown> | undefined);
    if (nestedPost && typeof nestedPost === 'object') {
      entries.push(
        ...(await this._extractVideos(nestedPost, videoId, { embedPath: ['embeds', 0], recordPath: ['value'] })),
      );
    }

    if (!entries.length) throw new ExtractorError('No video could be found in this post', { expected: true });
    if (entries.length === 1) return entries[0]!;
    return this.playlist_result(entries, videoId);
  }
}
