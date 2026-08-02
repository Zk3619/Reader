/** OmnyfmIE / OmnyfmPlaylistIE / OmnyfmShowIE — ported from yt-dlp omnyfm.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import {
  clean_html,
  filter_dict,
  float_or_none,
  int_or_none,
  parse_duration,
  parse_qs,
  url_or_none,
} from '../../utils';
import { parseIso8601, searchNextjsData } from './_helpers';

function stripUrlQuery(raw: string): string {
  try {
    const u = new URL(raw);
    u.search = '';
    return u.toString();
  } catch {
    return raw.split('?')[0] || raw;
  }
}

const API_BASE = 'https://api.omny.fm';
const BASE_URL = 'https://omny.fm/shows';
const PAGE_SIZE = 100;

export class OmnyfmPlaylistBaseIE extends InfoExtractor {
  static IE_NAME = 'omnyfmplaylistbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('OmnyfmPlaylistBaseIE is not a standalone extractor', { expected: true });
  }

  protected *_yieldClips(clips: Record<string, unknown>, uploaderId: string): Generator<VideoInfo> {
    for (const clip of (clips.Clips as Array<Record<string, unknown>>) || []) {
      const slug = String(clip.Slug ?? '');
      if (slug) yield this.url_result(`${BASE_URL}/${uploaderId}/${slug}`, 'Omnyfm');
    }
  }
}

export class OmnyfmIE extends InfoExtractor {
  static IE_NAME = 'omnyfm';
  static _VALID_URL =
    /https?:\/\/omny\.fm\/shows\/(?<uploader_id>[\w-]+)\/(?<id>(?!playlists(?:[/?#"']|$))[\w-]+)(?:\/embed)?(?=[?#"']|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const uploaderId = m.groups!.uploader_id!;
    const audioId = m.groups!.id!;
    const webpage = await this._download_webpage(url, audioId);
    const nextjsData = searchNextjsData(this, webpage, audioId);
    const clip = (nextjsData.pageProps as Record<string, unknown>)?.clip as Record<string, unknown> | undefined;
    if (!clip) throw new ExtractorError('Unable to extract clip data', { expected: true });

    const qs = parse_qs(url);
    const sectionStart = parse_duration(qs.t?.[qs.t.length - 1] ?? '') ?? undefined;
    const program = (clip.Program as Record<string, unknown>) || {};

    return {
      id: audioId,
      section_start: sectionStart,
      uploader_id: uploaderId,
      vcodec: 'none',
      title: clean_html(String(clip.Title ?? '')) || undefined,
      chapters: ((clip.Chapters as Array<Record<string, unknown>>) || [])
        .filter((c) => parse_duration(String(c.Position ?? '')) != null)
        .map((c) => ({
          title: clean_html(String(c.Name ?? '')) || undefined,
          start_time: parse_duration(String(c.Position ?? '')) ?? 0,
        })),
      description: clean_html(String(clip.Description ?? '')) || undefined,
      duration: float_or_none(clip.DurationSeconds) ?? undefined,
      episode_number: int_or_none(clip.Episode) ?? undefined,
      filesize: int_or_none(clip.PublishedAudioSizeInBytes) ?? undefined,
      modified_timestamp: parseIso8601(clip.ModifiedAtUtc) ?? undefined,
      season_number: int_or_none(clip.Season) ?? undefined,
      tags: ((clip.Tags as string[]) || []).map((t) => clean_html(t)).filter(Boolean) as string[],
      thumbnail: stripUrlQuery(String(clip.ImageUrl ?? '')) || undefined,
      timestamp: parseIso8601(clip.PublishedUtc) ?? undefined,
      url: url_or_none(clip.AudioUrl) || undefined,
      webpage_url: url_or_none(clip.PublishedUrl) ?? undefined,
      categories: ((program.Categories as string[]) || []).map((c) => clean_html(c)).filter(Boolean) as string[],
      uploader: clean_html(String(program.Name ?? '')) || undefined,
    };
  }
}

export class OmnyfmPlaylistIE extends OmnyfmPlaylistBaseIE {
  static IE_NAME = 'omnyfm:playlist';
  static _VALID_URL =
    /https?:\/\/omny\.fm\/shows\/(?<uploader_id>[\w-]+)\/playlists(?:\/(?<id>[\w-]+))?(?:\/embed)?\/?(?=[?#"']|$)/;

  protected async *_entries(uploaderId: string, playlistId: string): AsyncGenerator<VideoInfo> {
    let clipId: string | undefined;
    for (let page = 1; ; page++) {
      const clips = await this._download_json<Record<string, unknown>>(
        `${API_BASE}/programs/${uploaderId}/playlists/${playlistId}/clips`,
        playlistId,
        `Downloading page ${page}`,
        {
          query: filter_dict({
            clipId: clipId ?? '',
            direction: 'AfterExclusive',
            pageSize: String(PAGE_SIZE),
          }) as Record<string, string>,
        },
      );
      yield* this._yieldClips(clips, uploaderId);
      if (!clips.NextClipsAvailable) break;
      const clipsArr = (clips.Clips as Array<Record<string, unknown>>) || [];
      clipId = String(clipsArr[clipsArr.length - 1]?.Id ?? '');
      if (!clipId) break;
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const uploaderId = m.groups!.uploader_id!;
    const playlistId = m.groups!.id;
    const webpage = await this._download_webpage(url, playlistId || uploaderId);
    const pageProps = (searchNextjsData(this, webpage, playlistId || uploaderId).pageProps ||
      {}) as Record<string, unknown>;

    if (!playlistId) {
      const slugs = ((pageProps.playlistsWithClips as Array<Record<string, unknown>>) || [])
        .map((p) => (p.playlist as Record<string, unknown> | undefined)?.Slug)
        .filter(Boolean) as string[];
      const entries = slugs.map((slug) =>
        this.url_result(`${BASE_URL}/${uploaderId}/playlists/${slug}`, 'OmnyfmPlaylist'),
      );
      return this.playlist_result(entries, uploaderId);
    }

    const entries: VideoInfo[] = [];
    for await (const entry of this._entries(uploaderId, playlistId)) entries.push(entry);
    const playlist = (pageProps.playlist as Record<string, unknown>) || {};
    const title = clean_html(String(playlist.Title ?? '')) || undefined;
    const description = clean_html(String(playlist.Description ?? '')) || undefined;

    return {
      ...this.playlist_result(entries, playlistId, title, description),
      thumbnail: stripUrlQuery(String(playlist.ArtworkUrl ?? '')) || undefined,
      webpage_url: String(playlist.EmbedUrl ?? '').replace(/\/embed$/, '') || undefined,
    };
  }
}

export class OmnyfmShowIE extends OmnyfmPlaylistBaseIE {
  static IE_NAME = 'omnyfm:show';
  static _VALID_URL = /https?:\/\/omny\.fm\/shows\/(?<id>[\w-]+)\/?(?:[?#]|$)/;

  protected async *_fetchPage(
    uploaderId: string,
    organizationId: string,
    programId: string,
    page: number,
  ): AsyncGenerator<VideoInfo> {
    const clips = await this._download_json<Record<string, unknown>>(
      `${API_BASE}/orgs/${organizationId}/programs/${programId}/clips`,
      uploaderId,
      `Downloading page ${page + 1}`,
      { query: { cursor: String(page), pageSize: String(PAGE_SIZE) } },
    );
    yield* this._yieldClips(clips, uploaderId);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const uploaderId = this._match_id(url);
    const webpage = await this._download_webpage(url, uploaderId);
    const program = (searchNextjsData(this, webpage, uploaderId).pageProps as Record<string, unknown>)
      ?.program as Record<string, unknown> | undefined;
    if (!program) throw new ExtractorError('Unable to extract program data', { expected: true });

    const organizationId = String(program.OrganizationId ?? '');
    const programId = String(program.Id ?? '');
    if (!organizationId || !programId) {
      throw new ExtractorError('Unable to extract organization/program ID', { expected: true });
    }

    const entries: VideoInfo[] = [];
    for (let page = 0; ; page++) {
      let count = 0;
      for await (const entry of this._fetchPage(uploaderId, organizationId, programId, page)) {
        entries.push(entry);
        count++;
      }
      if (count < PAGE_SIZE) break;
    }

    const title = clean_html(String(program.Name ?? '')) || undefined;
    const description = clean_html(String(program.Description ?? '')) || undefined;
    return {
      ...this.playlist_result(entries, uploaderId, title, description),
      thumbnail: stripUrlQuery(String(program.ArtworkUrl ?? '')) || undefined,
    };
  }
}
