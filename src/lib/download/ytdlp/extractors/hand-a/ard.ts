/**
 * ARDBetaMediathekIE / ARDMediathekCollectionIE / ARDAudiothekIE / ARDAudiothekPlaylistIE
 * — aligned with yt-dlp ard.py main paths
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  determine_ext,
  int_or_none,
  join_nonempty,
  remove_start,
  str_or_none,
  traverse_obj,
  url_or_none,
} from '../../utils';
import { parseIso8601 } from './helpers';

export class ARDBetaMediathekIE extends InfoExtractor {
  static IE_NAME = 'ARDMediathek';
  static _VALID_URL =
    /https?:\/\/(?:(?:beta|www)\.)?ardmediathek\.de\/(?:[^/]+\/)?(?:player|live|video)\/(?:[^?#]+\/)?(?<id>[a-zA-Z0-9]+)\/?(?:[?#]|$)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const pageData = await this._download_json<Record<string, unknown>>(
      `https://api.ardmediathek.de/page-gateway/pages/ard/item/${displayId}`,
      displayId,
      undefined,
      { query: { embedded: 'false', mcV6: 'true' } },
    );

    const oldId = int_or_none(traverse_obj(pageData, ['tracking', 'atiCustomVars', 'contentId']));
    const videoId = oldId != null ? String(oldId) : displayId;

    const widgets = (pageData.widgets as Record<string, unknown>[]) || [];
    const playerData = widgets.find((w) => w.type === 'player_ondemand' || w.type === 'player_live') as
      | Record<string, unknown>
      | undefined;
    if (!playerData) throw new ExtractorError('No player widget found', { expected: true });
    if (playerData.blockedByFsk) this.raise_login_required('This video is only available for age verified users or after 22:00');

    const isLive = playerData.type === 'player_live';
    const mediaData = traverse_obj(playerData, ['mediaCollection', 'embedded']) as Record<string, unknown>;

    const formats: Format[] = [];
    const subtitles: VideoInfo['subtitles'] = {};
    for (const stream of (mediaData.streams as Record<string, unknown>[]) || []) {
      const kind = stream.kind != null ? String(stream.kind) : '';
      const preference = kind === 'main' ? 1 : undefined;
      for (const media of (stream.media as Record<string, unknown>[]) || []) {
        const mediaUrl = url_or_none(media.url);
        if (!mediaUrl) continue;
        const langCode = str_or_none(traverse_obj(media, ['audios', 0, 'languageCode'])) || 'deu';
        const audioKind = String(traverse_obj(media, ['audios', 0, 'kind']) || '').replace('standard', '');
        const lang = join_nonempty(langCode, audioKind);
        if (determine_ext(mediaUrl) === 'm3u8') {
          const fmts = await this._extract_m3u8_formats(
            mediaUrl,
            videoId,
            'mp4',
            'm3u8_native',
            preference,
            undefined,
            `hls-${kind}`,
            undefined,
            false,
          );
          for (const f of fmts) {
            f.language = lang;
          }
          formats.push(...fmts);
        } else {
          formats.push({
            url: mediaUrl,
            format_id: `http-${kind}`,
            preference,
            language: lang,
            format_note: str_or_none(media.forcedLabel) || undefined,
            width: int_or_none(media.maxHResolutionPx) ?? undefined,
            height: int_or_none(media.maxVResolutionPx) ?? undefined,
            vcodec: str_or_none(media.videoCodec) || undefined,
          });
        }
      }
    }

    for (const sub of (mediaData.subtitles as Record<string, unknown>[]) || []) {
      for (const src of (sub.sources as Record<string, unknown>[]) || []) {
        const subUrl = url_or_none(src.url);
        if (!subUrl) continue;
        const code = str_or_none(sub.languageCode) || 'deu';
        if (!subtitles[code]) subtitles[code] = [];
        subtitles[code]!.push({
          url: subUrl,
          ext: src.kind === 'webvtt' ? 'vtt' : src.kind === 'ebutt' ? 'ttml' : 'unknown',
        });
      }
    }

    const meta = (mediaData.meta as Record<string, unknown>) || {};
    const fsk = remove_start(String(pageData.fskRating || ''), 'FSK');

    return {
      id: videoId,
      display_id: displayId,
      formats,
      subtitles,
      is_live: isLive,
      age_limit: int_or_none(fsk) ?? undefined,
      title: str_or_none(meta.title) || videoId,
      description: str_or_none(meta.synopsis) || null,
      timestamp: parseIso8601(traverse_obj(meta, ['broadcastedOnDateTime'])) ?? undefined,
      series: str_or_none(meta.seriesTitle) || undefined,
      thumbnail: url_or_none(traverse_obj(meta, ['images', 0, 'url'])) || undefined,
      duration: int_or_none(meta.durationSeconds) ?? undefined,
      channel: str_or_none(meta.clipSourceName) || undefined,
      webpage_url: url,
      original_url: url,
      extractor: 'ARDMediathek',
      extractor_key: 'ARDBetaMediathek',
    };
  }
}

export class ARDMediathekCollectionIE extends InfoExtractor {
  static IE_NAME = 'ardmediathekcollection';
  static _VALID_URL =
    /https?:\/\/(?:(?:beta|www)\.)?ardmediathek\.de\/(?:[^/?#]+\/)?(?<playlist>sendung|serie|sammlung)\/(?:(?<display_id>[^?#]+?)\/)?(?<id>[a-zA-Z0-9]+)(?:\/(?<season>\d+)(?:\/(?<version>OV|AD))?)?\/?(?:[?#]|$)/i;

  private static PAGE_SIZE = 100;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const playlistId = m.groups?.id ?? m[3] ?? '';
    const displayId = m.groups?.display_id ?? m[2];
    void displayId;
    const playlistType = m.groups?.playlist ?? m[1] ?? '';
    const seasonNumber = m.groups?.season;
    const version = m.groups?.version;

    const callApi = async (pageNum: number) => {
      const apiPath = playlistType === 'sammlung' ? 'compilations/ard' : 'widgets/ard/asset';
      return this._download_json<Record<string, unknown>>(
        `https://api.ardmediathek.de/page-gateway/${apiPath}/${playlistId}`,
        playlistId,
        `Downloading playlist page ${pageNum}`,
        {
          query: {
            pageNumber: String(pageNum),
            pageSize: String(ARDMediathekCollectionIE.PAGE_SIZE),
            ...(seasonNumber
              ? {
                  seasoned: 'true',
                  seasonNumber,
                  withOriginalversion: version === 'OV' ? 'true' : 'false',
                  withAudiodescription: version === 'AD' ? 'true' : 'false',
                }
              : {}),
          },
        },
      );
    };

    const page0 = await callApi(0);
    const entries: VideoInfo[] = [];
    const teasers = (page0.teasers as Record<string, unknown>[]) || [];
    for (const item of teasers) {
      const itemId = str_or_none(
        traverse_obj(item, ['links', 'target', 'urlId']) || traverse_obj(item, ['links', 'target', 'id']) || item.id,
      );
      if (!itemId || itemId === playlistId) continue;
      const itemMode = item.type === 'compilation' ? 'sammlung' : 'video';
      entries.push(
        this.url_result(
          `https://www.ardmediathek.de/${itemMode}/${itemId}`,
          itemMode === 'sammlung' ? 'ARDMediathekCollection' : 'ARDBetaMediathek',
          str_or_none(item.id) || itemId,
          str_or_none(item.longTitle) || itemId,
        ),
      );
    }

    const fullId = [playlistId, seasonNumber, version].filter(Boolean).join('_');
    return this.playlist_result(
      entries,
      fullId,
      str_or_none(page0.title) || fullId,
      str_or_none(page0.synopsis),
    );
  }
}

abstract class ARDAudiothekBaseIE extends InfoExtractor {
  protected async graphqlQuery(urn: string, query: string): Promise<Record<string, unknown>> {
    const data = await this._download_json<{ data?: Record<string, unknown> }>(
      'https://api.ardaudiothek.de/graphql',
      urn,
      undefined,
      {
        method: 'POST',
        data: JSON.stringify({ query, variables: { id: urn } }),
        headers: { 'Content-Type': 'application/json' },
      },
    );
    return data.data || {};
  }
}

export class ARDAudiothekIE extends ARDAudiothekBaseIE {
  static IE_NAME = 'ardaudiothek';
  static _VALID_URL =
    /https:?\/\/(?:www\.)?ard(?:audiothek|sounds)\.de\/episode\/(?<id>urn:ard:(?:episode|section|extra):[a-f0-9]{16})/i;

  private static QUERY = `query($id: ID!) {
    item(id: $id) {
      audioList { href distributionType audioBitrate audioCodec }
      show { title }
      image { url1X1 }
      programSet { publicationService { organizationName } }
      description title duration startDate episodeNumber
    }
  }`;

  async _real_extract(url: string): Promise<VideoInfo> {
    const urn = this._match_id(url);
    const item = (await this.graphqlQuery(urn, ARDAudiothekIE.QUERY)).item as Record<string, unknown>;
    const formats: Format[] = [];
    for (const audio of (item.audioList as Record<string, unknown>[]) || []) {
      const href = url_or_none(audio.href);
      if (!href) continue;
      formats.push({
        url: href,
        format_id: str_or_none(audio.distributionType) || 'http',
        abr: int_or_none(audio.audioBitrate) ?? undefined,
        acodec: str_or_none(audio.audioCodec) || undefined,
        vcodec: 'none',
      });
    }
    return {
      id: urn,
      formats,
      channel: str_or_none(traverse_obj(item, ['programSet', 'publicationService', 'organizationName'])) || undefined,
      description: str_or_none(item.description) || null,
      duration: int_or_none(item.duration) ?? undefined,
      series: str_or_none(traverse_obj(item, ['show', 'title'])) || undefined,
      episode_number: int_or_none(item.episodeNumber) ?? undefined,
      thumbnail: url_or_none(traverse_obj(item, ['image', 'url1X1'])) || undefined,
      timestamp: parseIso8601(item.startDate) ?? undefined,
      title: str_or_none(item.title) || urn,
      webpage_url: url,
      original_url: url,
      extractor: 'ardaudiothek',
      extractor_key: 'ARDAudiothek',
    };
  }
}

export class ARDAudiothekPlaylistIE extends ARDAudiothekBaseIE {
  static IE_NAME = 'ardaudiothekplaylist';
  static _VALID_URL =
    /https:?\/\/(?:www\.)?ard(?:audiothek|sounds)\.de\/sendung\/(?<playlist>[\w-]+)\/(?<id>urn:ard:show:[a-f0-9]{16})/i;

  private static QUERY = `query($id: ID!) {
    show(id: $id) {
      title description
      items(filter: { isPublished: { equalTo: true } }) { nodes { url } }
    }
  }`;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const urn = m.groups?.id ?? m[2] ?? '';
    const playlist = m.groups?.playlist ?? m[1] ?? '';
    void playlist;
    const show = (await this.graphqlQuery(urn, ARDAudiothekPlaylistIE.QUERY)).show as Record<string, unknown>;
    const nodes = traverse_obj(show, ['items', 'nodes']) as Record<string, unknown>[] | undefined;
    const entries = (nodes || [])
      .map((n) => url_or_none(n.url))
      .filter(Boolean)
      .map((u) => this.url_result(u!, 'ARDAudiothek'));
    return this.playlist_result(entries, urn, str_or_none(show.title) || urn, str_or_none(show.description));
  }
}
