/**
 * ArchiveOrgIE / YoutubeWebArchiveIE — aligned with yt-dlp archiveorg.py (main paths)
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import {
  clean_html,
  int_or_none,
  merge_dicts,
  parse_duration,
  str_or_none,
  url_or_none,
} from '../../utils';
import {
  archiveMetadataFields,
  buildArchiveFormats,
  parseArchivePlaylist,
} from './helpers';

export class ArchiveOrgIE extends InfoExtractor {
  static IE_NAME = 'archive.org';
  static IE_DESC = 'archive.org video and audio';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?archive\.org\/(?:details|embed)\/(?<id>[^?#]+)(?:[?].*)?$/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = decodeURIComponent(this._match_id(url));
    const [identifier, , entryId] = videoId.split('/');

    const embedPage = await this._download_webpage(`https://archive.org/embed/${identifier}`, identifier);
    const playlist = parseArchivePlaylist(embedPage);

    const entries: Record<string, Record<string, unknown>> = {};
    for (const p of playlist) {
      const orig = String(p.orig || '');
      if (entryId && orig !== entryId) continue;
      entries[orig] = {
        formats: [] as Format[],
        thumbnails: [] as Thumbnail[],
        artist: p.artist,
        track: p.title,
        subtitles: {} as Record<string, { url: string }>,
      };
      for (const track of (p.tracks as Record<string, unknown>[]) || []) {
        if (track.kind !== 'subtitles') continue;
        const label = String(track.label || 'en');
        (entries[orig]!.subtitles as Record<string, { url: string }>)[label] = {
          url: `https://archive.org/${String(track.file).replace(/^\//, '')}`,
        };
      }
    }

    const metadata = await this._download_json<{ metadata?: Record<string, unknown>; files?: Record<string, unknown>[] }>(
      `https://archive.org/metadata/${identifier}`,
      identifier,
    );
    const m = metadata.metadata || {};
    const id = String(m.identifier || identifier);

    const info: VideoInfo = {
      ...archiveMetadataFields(m),
      id,
      webpage_url: `https://archive.org/details/${id}`,
      original_url: url,
      extractor: 'archive.org',
      extractor_key: 'ArchiveOrg',
    };

    for (const f of metadata.files || []) {
      const name = String(f.name || '');
      if (name in entries) {
        entries[name] = merge_dicts(entries[name], {
          id: `${id}/${name}`,
          title: str_or_none(f.title || f.name) || name,
          display_id: name,
          description: clean_html(f.description != null ? String(f.description) : null),
          duration: parse_duration(f.length) ?? undefined,
          track_number: int_or_none(f.track) ?? undefined,
          album: str_or_none(f.album) || undefined,
        }) as Record<string, unknown>;
      }

      const entry =
        name in entries
          ? entries[name]
          : f.original && String(f.original) in entries
            ? entries[String(f.original)]
            : null;
      if (!entry) continue;

      if (f.format === 'Thumbnail') {
        (entry.thumbnails as Thumbnail[]).push({
          id: name,
          url: `https://archive.org/download/${id}/${encodeURIComponent(name)}`,
          width: int_or_none(f.width) ?? undefined,
          height: int_or_none(f.height) ?? undefined,
        });
        continue;
      }

      const fmt = buildArchiveFormats(id, name, f);
      if (fmt) (entry.formats as Format[]).push(fmt);
    }

    const entryValues = Object.values(entries);
    if (entryValues.length === 1) {
      const only = entryValues[0] as VideoInfo;
      return merge_dicts(entryId ? merge_dicts(only, info) : merge_dicts(info, only), {
        webpage_url: url,
        original_url: url,
      }) as VideoInfo;
    }

    return {
      ...info,
      _type: 'playlist',
      entries: entryValues as VideoInfo[],
      playlist_count: entryValues.length,
    };
  }
}

export class YoutubeWebArchiveIE extends InfoExtractor {
  static IE_NAME = 'web.archive:youtube';
  static IE_DESC = 'web.archive.org saved youtube videos';
  static _VALID_URL =
    /(?:(?<prefix>ytarchive:)|(?:https?:\/\/)?web\.archive\.org\/(?:web\/)?(?:(?<date>[0-9]{14})?[0-9A-Za-z_*]*\/)?(?:https?(?::|%3[Aa])\/\/)?(?:(?:\w+\.)?youtube\.com(?::(?:80|443))?\/watch(?:\.php)?(?:\?|%3[fF])(?:[^#]+(?:&|%26))?v(?:=|%3[dD])|(?:wayback-fakeurl\.archive\.org\/yt\/)))(?<id>[0-9A-Za-z_-]{11})/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups?.id ?? m[2] ?? '';

    const videoInfo = await this._download_json<{
      formats?: Record<string, unknown>[] | { video?: Record<string, unknown>[]; audio?: Record<string, unknown>[] };
      dmux?: boolean;
    }>('https://web.archive.org/__wb/videoinfo', videoId, undefined, {
      query: { vtype: 'youtube', vid: videoId },
    });

    if (!videoInfo.formats) {
      throw new ExtractorError('The requested video is not archived or indexed', { expected: true });
    }

    const formats: Format[] = [];
    const pushFmt = (vf: Record<string, unknown>, extra?: Partial<Format>) => {
      const u = url_or_none(vf.url);
      if (!u) return;
      formats.push({
        url: u,
        format_id: vf.itag != null ? String(vf.itag) : '0',
        ext: vf.ext != null ? String(vf.ext) : 'mp4',
        height: int_or_none(vf.height) ?? undefined,
        width: int_or_none(vf.width) ?? undefined,
        ...extra,
      });
    };

    if (videoInfo.dmux) {
      const grouped = videoInfo.formats as { video?: Record<string, unknown>[]; audio?: Record<string, unknown>[] };
      for (const vf of grouped.video || []) pushFmt(vf, { acodec: 'none' });
      for (const af of grouped.audio || []) pushFmt(af, { vcodec: 'none' });
    } else {
      const list = videoInfo.formats as Record<string, unknown>[];
      for (const vf of list) pushFmt(vf);
    }

    return {
      id: videoId,
      title: videoId,
      formats,
      webpage_url: url,
      original_url: url,
      extractor: 'web.archive:youtube',
      extractor_key: 'YoutubeWebArchive',
    };
  }
}
