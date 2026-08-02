/**
 * BBC family — ported from yt-dlp bbc.py
 *
 * Notes on pragmatic simplifications vs. upstream:
 * - `_perform_login` (BBC account sign-in) is not portable to this runtime and is omitted.
 * - The mediaselector API sometimes returns an error payload with a non-2xx HTTP status
 *   (upstream passes `expected_status=(403, 404)` to read the body anyway). This runtime's
 *   HTTP layer surfaces non-2xx as a rejected promise, so those responses are treated the
 *   same as an empty/erroring response rather than being inspected for an error `result`.
 * - HDS (f4m) manifests are not supported and are skipped with a warning, matching the
 *   pattern used elsewhere in this port (see hand-a/amp.ts, hand-a/abcnews.ts).
 * - `BBCIE._real_extract` implements the high-value paths (playlist.sxml embeds,
 *   data-playable JSON, single-video vpid patterns, data-media-meta / vxp-playlist-data
 *   listings) faithfully, and folds the many BBC page-redesign-specific JSON blobs
 *   (window.__INITIAL_DATA__/__PWA_PRELOADED_STATE__/SIMORGH_DATA/bbcthreeConfig/__NEXT_DATA__)
 *   into one generic "deep search for a vpid-shaped id" fallback instead of replicating
 *   each bespoke branch, reporting a warning when that fallback path is used.
 * - No XML DOM parser is available in this runtime; a lightweight regex-based scanner is
 *   used for the legacy (non-JSON) BBC playlist XML feed, mirroring hand-b/br.ts.
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, Thumbnail, VideoInfo } from '../../types';
import {
  dict_get,
  float_or_none,
  int_or_none,
  js_to_json,
  parse_duration,
  parse_qs,
  unescapeHTML,
  url_or_none,
} from '../../utils';
import { mergeSubtitles, parseIso8601, searchNextjsData } from './_helpers';

const ID_REGEX_SRC = '(?:[pbml][\\da-z]{7}|w[\\da-z]{7,14})';

function xmlBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?/>|<${tag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tag}>`, 'gi');
  return xml.match(re) || [];
}

function xmlBlock(xml: string, tag: string): string | null {
  return xmlBlocks(xml, tag)[0] || null;
}

function xmlOpenTagAttrs(block: string): string {
  const m = block.match(/^<[a-zA-Z0-9]+((?:\s+[^>]*)?)\/?>/);
  return m ? m[1] || '' : '';
}

function xmlAttr(block: string, attr: string): string | null {
  const attrs = xmlOpenTagAttrs(block);
  const m = attrs.match(new RegExp(`\\b${attr}="([^"]*)"`, 'i'));
  return m ? m[1]! : null;
}

function xmlTagText(xml: string, tag: string): string | null {
  const block = xmlBlock(xml, tag);
  if (!block) return null;
  const m = block.match(/>([\s\S]*)<\/[a-zA-Z0-9]+>$/);
  const text = m ? unescapeHTML(m[1]!.trim()) : '';
  return text || null;
}

/** Best-effort recursive search for a BBC-shaped vpid/versionId inside an arbitrary JSON blob. */
function deepFindVpid(
  obj: unknown,
  keys: string[],
  depth = 0,
): { id: string; node: Record<string, unknown> } | null {
  if (depth > 6 || obj == null || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = deepFindVpid(item, keys, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const rec = obj as Record<string, unknown>;
  for (const key of keys) {
    const v = rec[key];
    if (typeof v === 'string' && new RegExp(`^${ID_REGEX_SRC}$`, 'i').test(v)) {
      return { id: v, node: rec };
    }
  }
  for (const v of Object.values(rec)) {
    const found = deepFindVpid(v, keys, depth + 1);
    if (found) return found;
  }
  return null;
}

function extractAllJson(
  ie: InfoExtractor,
  pattern: RegExp,
  webpage: string,
  videoId: string,
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const m of webpage.matchAll(pattern)) {
    const parsed = ie._parse_json<Record<string, unknown>>(m[1]!, videoId, undefined, false);
    if (parsed) out.push(parsed);
  }
  return out;
}

interface LegacyPlaylistResult {
  programmeId: string;
  title: string | null;
  description: string | null;
  duration: number | null;
  formats: Format[];
  subtitles: Record<string, Subtitle[]>;
}

export class BBCCoUkIE extends InfoExtractor {
  static IE_NAME = 'bbc.co.uk';
  static IE_DESC = 'BBC iPlayer';
  static _NETRC_MACHINE = 'bbc';
  static _MEDIA_SETS: string[] = ['iptv-all', 'pc'];
  static _VALID_URL = new RegExp(
    '^https?://' +
      '(?:www\\.)?bbc\\.co\\.uk/' +
      '(?:' +
      'programmes/(?!articles/)|' +
      'iplayer(?:/[^/]+)?/(?:episode/|playlist/)|' +
      'music/(?:clips|audiovideo/popular)[/#]|' +
      'radio/player/|' +
      'events/[^/]+/play/[^/]+/' +
      ')' +
      `(?<id>${ID_REGEX_SRC})(?!/(?:episodes|broadcasts|clips))`,
  );

  protected async _extractAsxPlaylist(href: string, programmeId: string): Promise<string[]> {
    const asx = await this._download_webpage(href, programmeId, 'Downloading ASX playlist');
    const refs: string[] = [];
    for (const m of asx.matchAll(/<ref\b[^>]*\bhref=["']([^"']+)["']/gi)) refs.push(m[1]!);
    return refs;
  }

  protected async _getSubtitles(
    media: Record<string, unknown>,
    programmeId: string,
  ): Promise<Record<string, Subtitle[]>> {
    const subtitles: Record<string, Subtitle[]> = {};
    for (const connection of (media.connection as Record<string, unknown>[]) || []) {
      const ccUrl = url_or_none(connection.href);
      if (!ccUrl) continue;
      const captions = await this._download_webpage(ccUrl, programmeId, 'Downloading captions', {
        fatal: false,
      });
      if (!captions) continue;
      subtitles.en = [{ url: ccUrl, ext: 'ttml' }];
      break;
    }
    return subtitles;
  }

  protected async _processMediaSelector(
    mediaSelection: Record<string, unknown>,
    programmeId: string,
  ): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    const seenUrls = new Set<string>();

    for (const media of (mediaSelection.media as Record<string, unknown>[]) || []) {
      const kind = media.kind as string | undefined;
      if (kind === 'video' || kind === 'audio') {
        const bitrate = int_or_none(media.bitrate);
        const encoding = media.encoding as string | undefined;
        const width = int_or_none(media.width);
        const height = int_or_none(media.height);
        const fileSize = int_or_none(media.media_file_size);

        for (const connection of (media.connection as Record<string, unknown>[]) || []) {
          const href = connection.href as string | undefined;
          if (href) {
            if (seenUrls.has(href)) continue;
            seenUrls.add(href);
          }
          const connKind = connection.kind as string | undefined;
          const protocol = connection.protocol as string | undefined;
          const supplier = connection.supplier as string | undefined;
          const transferFormat = connection.transferFormat as string | undefined;
          let formatId = supplier || connKind || protocol || 'fmt';

          if (supplier === 'asx' && href) {
            const refs = await this._extractAsxPlaylist(href, programmeId);
            refs.forEach((ref, i) => formats.push({ format_id: `ref${i}_${formatId}`, url: ref }));
          } else if (transferFormat === 'dash' && href) {
            formats.push(...(await this._extract_mpd_formats(href, programmeId, formatId, undefined, false)));
          } else if (transferFormat === 'hls' && href) {
            formats.push(
              ...(await this._extract_m3u8_formats(
                href,
                programmeId,
                'mp4',
                'm3u8_native',
                undefined,
                undefined,
                formatId,
                undefined,
                false,
              )),
            );
          } else if (transferFormat === 'hds') {
            this.report_warning('HDS (f4m) formats are not supported');
          } else if (href) {
            if (!supplier && bitrate) formatId += `-${bitrate}`;
            const fmt: Format = { format_id: formatId, url: href, filesize: fileSize };
            if (kind === 'video') {
              fmt.width = width;
              fmt.height = height;
              fmt.tbr = bitrate;
              fmt.vcodec = encoding;
            } else {
              fmt.abr = bitrate;
              fmt.acodec = encoding;
              fmt.vcodec = 'none';
            }
            if (protocol === 'http' || protocol === 'https') {
              fmt.url = href;
            } else if (protocol === 'rtmp') {
              const application = (connection.application as string) || 'ondemand';
              const authString = (connection.authString as string) || '';
              const identifier = connection.identifier as string | undefined;
              const server = connection.server as string | undefined;
              fmt.url = `rtmp://${server}/${application}?${authString}`;
              fmt.play_path = identifier;
              fmt.app = `${application}?${authString}`;
              fmt.page_url = 'http://www.bbc.co.uk';
              fmt.player_url =
                'http://www.bbc.co.uk/emp/releases/iplayer/revisions/617463_618125_4/617463_618125_4_emp.swf';
              fmt.rtmp_live = false;
              fmt.ext = 'flv';
            } else {
              continue;
            }
            formats.push(fmt);
          }
        }
      } else if (kind === 'captions') {
        subtitles = mergeSubtitles(subtitles, await this._getSubtitles(media, programmeId));
      }
    }

    return { formats, subtitles };
  }

  protected async _downloadMediaSelector(
    programmeId: string,
  ): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
    const mediaSets = (this.constructor as typeof BBCCoUkIE)._MEDIA_SETS;
    let lastErrorId: string | null = null;
    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};

    for (const mediaSet of mediaSets) {
      const url = `https://open.live.bbc.co.uk/mediaselector/6/select/version/2.0/mediaset/${mediaSet}/vpid/${programmeId}`;
      const mediaSelection = await this._download_json<Record<string, unknown>>(
        url,
        programmeId,
        'Downloading media selection JSON',
        { fatal: false },
      );
      if (!mediaSelection || !Object.keys(mediaSelection).length) continue;

      const errorId = mediaSelection.result as string | undefined;
      if (errorId) {
        if (errorId === 'notukerror' || errorId === 'geolocation' || errorId === 'selectionunavailable') {
          lastErrorId = errorId;
          continue;
        }
        throw new ExtractorError(`${this.IE_NAME} returned error: ${errorId}`, { expected: true });
      }

      const { formats: fmts, subtitles: subs } = await this._processMediaSelector(mediaSelection, programmeId);
      formats.push(...fmts);
      subtitles = mergeSubtitles(subtitles, subs);
    }

    if (lastErrorId) {
      if (formats.length || Object.keys(subtitles).length) {
        this.report_warning(`${this.IE_NAME} returned error: ${lastErrorId}`);
      } else {
        throw new ExtractorError(`${this.IE_NAME} returned error: ${lastErrorId}`, { expected: true });
      }
    }

    return { formats, subtitles };
  }

  protected async _extractFromLegacyPlaylist(playlistXml: string, playlistId: string): Promise<LegacyPlaylistResult> {
    const noItemsBlock = xmlBlock(playlistXml, 'noItems');
    if (noItemsBlock) {
      const reason = xmlAttr(noItemsBlock, 'reason');
      let msg: string;
      if (reason === 'preAvailability') msg = `Episode ${playlistId} is not yet available`;
      else if (reason === 'postAvailability') msg = `Episode ${playlistId} is no longer available`;
      else if (reason === 'noMedia') msg = `Episode ${playlistId} is not currently available`;
      else msg = `Episode ${playlistId} is not available: ${reason}`;
      throw new ExtractorError(msg, { expected: true });
    }

    const title = xmlTagText(playlistXml, 'title');
    const description = xmlTagText(playlistXml, 'summary');

    let programmeId = playlistId;
    let duration: number | null = null;
    let formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};

    const getFromAttrs = (block: string): string | null => {
      for (const attr of ['identifier', 'group']) {
        const v = xmlAttr(block, attr);
        if (v && /^[pb][\da-z]{7}$/.test(v)) return v;
      }
      return null;
    };

    for (const itemBlock of xmlBlocks(playlistXml, 'item')) {
      const kind = xmlAttr(itemBlock, 'kind');
      if (kind !== 'programme' && kind !== 'radioProgramme') continue;

      let itemProgrammeId = getFromAttrs(itemBlock);
      if (!itemProgrammeId) {
        const mediatorBlock = xmlBlock(itemBlock, 'mediator');
        if (mediatorBlock) itemProgrammeId = getFromAttrs(mediatorBlock);
      }

      duration = int_or_none(xmlAttr(itemBlock, 'duration'));

      if (itemProgrammeId) {
        programmeId = itemProgrammeId;
        ({ formats, subtitles } = await this._downloadMediaSelector(itemProgrammeId));
      } else {
        programmeId = playlistId;
        formats = [];
        subtitles = {};
      }
    }

    return { programmeId, title, description, duration, formats, subtitles };
  }

  protected async _downloadLegacyPlaylistUrl(url: string, displayId?: string): Promise<string> {
    return this._download_webpage(url, displayId, 'Downloading legacy playlist XML');
  }

  protected async _processLegacyPlaylistUrl(url: string, displayId: string): Promise<LegacyPlaylistResult> {
    const playlist = await this._downloadLegacyPlaylistUrl(url, displayId);
    return this._extractFromLegacyPlaylist(playlist, displayId);
  }

  protected async _processLegacyPlaylist(playlistId: string): Promise<LegacyPlaylistResult> {
    return this._processLegacyPlaylistUrl(`http://www.bbc.co.uk/iplayer/playlist/${playlistId}`, playlistId);
  }

  protected async _downloadPlaylist(playlistId: string): Promise<LegacyPlaylistResult> {
    const modern = await this._download_json<Record<string, unknown>>(
      `http://www.bbc.co.uk/programmes/${playlistId}/playlist.json`,
      playlistId,
      'Downloading playlist JSON',
      { fatal: false },
    );
    const versions = (modern?.allAvailableVersions as Record<string, unknown>[]) || [];
    if (versions.length) {
      let programmeId = playlistId;
      let title: string | null = null;
      let description: string | null = null;
      let duration: number | null = null;
      const formats: Format[] = [];
      let subtitles: Record<string, Subtitle[]> = {};

      for (const version of versions) {
        const smpConfig = (version.smpConfig as Record<string, unknown>) || {};
        title = (smpConfig.title as string) ?? title;
        description = (smpConfig.summary as string) ?? description;
        const items = (smpConfig.items as Record<string, unknown>[]) || [];
        for (const item of items) {
          const kind = item.kind as string | undefined;
          if (kind !== 'programme' && kind !== 'radioProgramme') continue;
          const itemProgrammeId = item.vpid as string | undefined;
          if (!itemProgrammeId) continue;
          programmeId = itemProgrammeId;
          duration = int_or_none(item.duration);
          const { formats: versionFormats, subtitles: versionSubtitles } =
            await this._downloadMediaSelector(itemProgrammeId);
          const types = (version.types as string[]) || [];
          for (const f of versionFormats) {
            f.format_note = types.join(', ');
            if (types.some((t) => t.includes('AudioDescribed'))) f.language_preference = -10;
          }
          formats.push(...versionFormats);
          subtitles = mergeSubtitles(subtitles, versionSubtitles);
        }
      }
      return { programmeId, title, description, duration, formats, subtitles };
    }

    return this._processLegacyPlaylist(playlistId);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const groupId = this._match_id(url);
    const webpage = await this._download_webpage(url, groupId, 'Downloading video page');

    const error = this._search_regex(
      /<div\b[^>]+\bclass=["'](?:smp|playout)__message delta["'][^>]*>\s*([^<]+?)\s*</,
      webpage,
      'error',
      null,
      false,
    );
    if (error) throw new ExtractorError(error, { expected: true });

    let programmeId: string | null = null;
    let duration: number | null = null;

    const tviplayer = this._search_regex(
      /mediator\.bind\((\{[\s\S]+?\})\s*,\s*document\.getElementById/,
      webpage,
      'player',
      null,
      false,
    );
    if (tviplayer) {
      const player =
        (this._parse_json<{ player?: Record<string, unknown> }>(tviplayer, groupId, undefined, false)?.player) || {};
      duration = int_or_none(player.duration);
      programmeId = (player.vpid as string) || null;
    }

    if (!programmeId) {
      programmeId = this._search_regex(
        new RegExp(`"vpid"\\s*:\\s*"(${ID_REGEX_SRC})"`),
        webpage,
        'vpid',
        null,
        false,
      );
    }

    let title: string | null | undefined;
    let description: string | null | undefined;
    let formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};

    if (programmeId) {
      ({ formats, subtitles } = await this._downloadMediaSelector(programmeId));
      title =
        this._og_search_title(webpage) ||
        this._html_search_regex(
          [/<h2[^>]+id="parent-title"[^>]*>(.+?)<\/h2>/, /<div[^>]+class="info"[^>]*>\s*<h1>(.+?)<\/h1>/],
          webpage,
          'title',
        );
      description = this._search_regex(
        [/<p class="[^"]*medium-description[^"]*">([^<]+)<\/p>/, /<div[^>]+class="info_+synopsis"[^>]*>([^<]+)<\/div>/],
        webpage,
        'description',
        null,
        false,
      );
      if (!description) description = this._html_search_meta('description', webpage);
    } else {
      const playlist = await this._downloadPlaylist(groupId);
      programmeId = playlist.programmeId;
      title = playlist.title;
      description = playlist.description;
      duration = playlist.duration;
      formats = playlist.formats;
      subtitles = playlist.subtitles;
    }

    return {
      id: programmeId,
      title: title ?? undefined,
      description: description ?? undefined,
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
      duration: duration ?? undefined,
      formats,
      subtitles,
    };
  }
}

// XXX: BBCIE subclasses a concrete IE (mirrors an upstream quirk noted with the same
// warning in yt-dlp's bbc.py), reusing BBCCoUkIE's mediaselector/legacy-playlist helpers.
export class BBCIE extends BBCCoUkIE {
  static IE_NAME = 'bbc';
  static IE_DESC = 'BBC';
  static _MEDIA_SETS: string[] = ['pc', 'mobile-tablet-main'];
  static _VALID_URL =
    /^https?:\/\/(?:www\.)?(?:bbc\.(?:com|co\.uk)|bbcnewsd73hkzno2ini43t4gblxvycyac5aw4gnv7t2rccijh7745uqd\.onion|bbcweb3hytmzhn5d532owbu6oqadra5z3ar726vq5kgwwn6aucdccrad\.onion)\/(?:[^/]+\/)+(?<id>[^/#?]+)/;

  static suitable(url: string): boolean {
    const EXCLUDE_IE = [BBCCoUkIE, BBCCoUkArticleIE, BBCCoUkIPlayerEpisodesIE, BBCCoUkIPlayerGroupIE, BBCCoUkPlaylistIE];
    if (EXCLUDE_IE.some((ie) => ie.suitable(url))) return false;
    return super.suitable(url);
  }

  protected async _extractFromMediaMeta(
    mediaMeta: Record<string, unknown>,
    videoId: string,
  ): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
    const sourceFiles = mediaMeta.sourceFiles as Record<string, Record<string, unknown>> | undefined;
    if (sourceFiles && Object.keys(sourceFiles).length) {
      const formats: Format[] = [];
      for (const [formatId, f] of Object.entries(sourceFiles)) {
        if (!f.url) continue;
        formats.push({
          format_id: formatId,
          url: String(f.url),
          ext: (f.encoding as string) || undefined,
          tbr: float_or_none(f.bitrate, 1000),
          filesize: int_or_none(f.filesize),
        });
      }
      return { formats, subtitles: {} };
    }

    const programmeId = mediaMeta.externalId as string | undefined;
    if (programmeId) return this._downloadMediaSelector(programmeId);

    const href = mediaMeta.href as string | undefined;
    if (href) {
      const playlistXml = await this._downloadLegacyPlaylistUrl(href);
      const { formats, subtitles } = await this._extractFromLegacyPlaylist(playlistXml, videoId);
      return { formats, subtitles };
    }

    return { formats: [], subtitles: {} };
  }

  protected async _extractFromPlaylistSxml(
    url: string,
    playlistId: string,
    timestamp: number | null,
  ): Promise<VideoInfo> {
    const { programmeId, title, description, duration, formats, subtitles } = await this._processLegacyPlaylistUrl(
      url,
      playlistId,
    );
    return {
      id: programmeId,
      title: title ?? undefined,
      description: description ?? undefined,
      duration: duration ?? undefined,
      timestamp: timestamp ?? undefined,
      formats,
      subtitles,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);

    const jsonLd = this._search_json_ld(webpage, playlistId, { fatal: false });
    let timestamp = parseIso8601(jsonLd.datePublished as string | undefined);

    let playlistTitle = (jsonLd.name as string) || (jsonLd.headline as string) || null;
    if (!playlistTitle) {
      const generic = this._html_search_regex(/<title[^>]*>([\s\S]*?)<\/title>/, webpage, 'title', '');
      playlistTitle = (generic || '').replace(/(.+)\s*-\s*BBC.*?$/, '$1').trim() || null;
    }
    let playlistDescription = (jsonLd.description as string) || this._og_search_description(webpage);

    if (!timestamp) {
      timestamp = parseIso8601(
        this._search_regex(
          [
            /<meta[^>]+property="article:published_time"[^>]+content="([^"]+)"/,
            /itemprop="datePublished"[^>]+datetime="([^"]+)"/,
            /"datePublished":\s*"([^"]+)/,
          ],
          webpage,
          'date',
          null,
          false,
        ),
      );
    }

    let entries: VideoInfo[] = [];

    const sxmlUrls = [
      ...[...webpage.matchAll(/<param[^>]+name="playlist"[^>]+value="([^"]+)"/g)].map((m) => m[1]!),
      ...[...webpage.matchAll(/data-media-id="([^"]+\/playlist\.sxml)"/g)].map((m) => m[1]!),
    ];
    if (sxmlUrls.length) {
      for (const sxmlUrl of sxmlUrls) {
        entries.push(await this._extractFromPlaylistSxml(sxmlUrl, playlistId, timestamp));
      }
    }

    const dataPlayables = [...webpage.matchAll(/data-playable=(["'])(\{.+?\})\1/gs)];
    for (const match of dataPlayables) {
      const dataPlayable = this._parse_json<Record<string, unknown>>(
        unescapeHTML(match[2]!),
        playlistId,
        undefined,
        false,
      );
      if (!dataPlayable) continue;
      const settings = (dataPlayable.settings as Record<string, unknown>) || {};
      if (Object.keys(settings).length) {
        const playlistObject = (settings.playlistObject as Record<string, unknown>) || {};
        if (Object.keys(playlistObject).length) {
          const items = playlistObject.items as Record<string, unknown>[] | undefined;
          if (Array.isArray(items) && items.length) {
            const itemProgrammeId = items[0]!.vpid as string | undefined;
            if (itemProgrammeId) {
              const { formats, subtitles } = await this._downloadMediaSelector(itemProgrammeId);
              entries.push({
                id: itemProgrammeId,
                title: playlistObject.title as string | undefined,
                description: playlistObject.summary as string | undefined,
                timestamp: timestamp ?? undefined,
                duration: int_or_none(items[0]!.duration),
                formats,
                subtitles,
              });
            }
          }
        } else {
          const playlist = ((dataPlayable.otherSettings as Record<string, unknown>)?.playlist as
            | Record<string, unknown>
            | undefined) || {};
          if (Object.keys(playlist).length) {
            let entry: VideoInfo | null = null;
            for (const key of ['streaming', 'progressiveDownload']) {
              const playlistUrl = playlist[`${key}Url`] as string | undefined;
              if (!playlistUrl) continue;
              try {
                const info = await this._extractFromPlaylistSxml(playlistUrl, playlistId, timestamp);
                if (!entry) entry = info;
                else {
                  entry.title = info.title;
                  entry.formats = [...((entry.formats as Format[]) || []), ...((info.formats as Format[]) || [])];
                }
              } catch {
                // one of the streaming/progressiveDownload URLs may 500; the other may work
                continue;
              }
            }
            if (entry) entries.push(entry);
          }
        }
      }
    }

    if (entries.length) {
      return this.playlist_result(entries, playlistId, playlistTitle ?? undefined, playlistDescription ?? undefined);
    }

    const groupId = this._search_regex(
      new RegExp(`<div[^>]+\\bclass=["']video["'][^>]+\\bdata-pid=["'](${ID_REGEX_SRC})`),
      webpage,
      'group id',
      null,
      false,
    );
    if (groupId) {
      return this.url_result(`https://www.bbc.co.uk/programmes/${groupId}`, 'BBCCoUk');
    }

    const programmeId = this._search_regex(
      [
        new RegExp(`data-(?:video-player|media)-vpid="(${ID_REGEX_SRC})"`),
        new RegExp(`<param[^>]+name="externalIdentifier"[^>]+value="(${ID_REGEX_SRC})"`),
        new RegExp(`videoId\\s*:\\s*["'](${ID_REGEX_SRC})["']`),
      ],
      webpage,
      'vpid',
      null,
      false,
    );

    if (programmeId) {
      const { formats, subtitles } = await this._downloadMediaSelector(programmeId);
      const digitalDataRaw = this._search_regex(
        /var\s+digitalData\s*=\s*(\{[\s\S]+?\});?\n/,
        webpage,
        'digital data',
        '{}',
        false,
      );
      const digitalData =
        this._parse_json<Record<string, unknown>>(digitalDataRaw || '{}', programmeId, undefined, false) || {};
      const pageInfo = ((digitalData.page as Record<string, unknown>)?.pageInfo as Record<string, unknown>) || {};
      return {
        id: programmeId,
        title: (pageInfo.pageName as string) || this._og_search_title(webpage) || undefined,
        description: (pageInfo.description as string) || this._og_search_description(webpage) || undefined,
        timestamp: parseIso8601(pageInfo.publicationDate as string | undefined) ?? timestamp ?? undefined,
        formats,
        subtitles,
      };
    }

    // Simplified fallback covering the various BBC page-redesign JSON hydration blobs
    // (BBC Reel, Morph-based embeds, PRELOADED_STATE, SIMORGH_DATA, bbcthree, Next.js) —
    // scan each known blob for a nested vpid/versionId rather than replicating every branch.
    const jsonBlobCandidates: Array<{ name: string; blob: Record<string, unknown> | null }> = [
      {
        name: 'preload state',
        blob: this._search_json<Record<string, unknown>>(
          /window\.__(?:PWA_)?PRELOADED_STATE__\s*=\s*/,
          webpage,
          'preload state',
          playlistId,
          { fatal: false, default: null, transform_source: js_to_json },
        ),
      },
      {
        name: 'initial data',
        blob: this._search_json<Record<string, unknown>>(/window\.__INITIAL_DATA__\s*=\s*/, webpage, 'initial data', playlistId, {
          fatal: false,
          default: null,
          transform_source: js_to_json,
        }),
      },
      {
        name: 'simorgh data',
        blob: this._search_json<Record<string, unknown>>(
          /window\s*\.\s*SIMORGH_DATA\s*=\s*/,
          webpage,
          'simorgh data',
          playlistId,
          { fatal: false, default: null },
        ),
      },
      {
        name: 'bbcthree config',
        blob: this._search_json<Record<string, unknown>>(/bbcthreeConfig\s*=\s*/, webpage, 'bbcthree config', playlistId, {
          fatal: false,
          default: null,
          transform_source: js_to_json,
        }),
      },
    ];

    try {
      const nextData = searchNextjsData(this, webpage, playlistId);
      if (nextData && Object.keys(nextData).length) {
        jsonBlobCandidates.push({ name: 'next.js data', blob: nextData });
      }
    } catch {
      // no __NEXT_DATA__ script on this page
    }

    for (const { name, blob } of jsonBlobCandidates) {
      if (!blob) continue;
      const found = deepFindVpid(blob, ['vpid', 'versionId', 'versionID', 'playablePid']);
      if (found?.id) {
        this.report_warning(`Using simplified ${name} extraction path for this BBC page`);
        const { formats, subtitles } = await this._downloadMediaSelector(found.id);
        const nodeTitle = (found.node.title as string) || (found.node.caption as string) || undefined;
        return {
          id: found.id,
          title: nodeTitle || playlistTitle || this._og_search_title(webpage) || undefined,
          description: playlistDescription || this._og_search_description(webpage) || undefined,
          timestamp: timestamp ?? undefined,
          duration: int_or_none(found.node.duration) ?? undefined,
          thumbnail: this._og_search_thumbnail(webpage) || undefined,
          formats,
          subtitles,
        };
      }
    }

    let medias = extractAllJson(this, /data-media-meta='(\{[^']+\})'/g, webpage, playlistId);

    if (!medias.length) {
      const mediaAsset = this._search_regex(/mediaAssetPage\.init\(\s*(\{[\s\S]+?\}), "\//, webpage, 'media asset', null, false);
      if (mediaAsset) {
        const mediaAssetPage = this._parse_json<Record<string, unknown>>(mediaAsset, playlistId, undefined, false) || {};
        medias = [];
        for (const video of Object.values(
          (mediaAssetPage.videos as Record<string, Record<string, unknown>>) || {},
        )) {
          medias.push(...(Object.values(video || {}) as Record<string, unknown>[]));
        }
      }
    }

    if (!medias.length) {
      const vxpPlaylistRaw = this._search_regex(
        /<script[^>]+class="vxp-playlist-data"[^>]+type="application\/json"[^>]*>([^<]+)<\/script>/,
        webpage,
        'playlist data',
        null,
        false,
      );
      if (vxpPlaylistRaw) {
        const vxpPlaylist =
          this._parse_json<Record<string, unknown>[]>(vxpPlaylistRaw, playlistId, undefined, false) || [];
        const playlistMedias: Record<string, unknown>[] = [];
        for (const item of vxpPlaylist) {
          const media = item.media as Record<string, unknown> | undefined;
          if (!media) continue;
          playlistMedias.push(media);
          const advertAssetId = (item.advert as Record<string, unknown>)?.assetId as string | undefined;
          if (advertAssetId === playlistId) {
            medias = [media];
            break;
          }
        }
        if (!medias.length) medias = playlistMedias;
      }
    }

    entries = [];
    let num = 0;
    for (const mediaMeta of medias) {
      num += 1;
      const { formats, subtitles } = await this._extractFromMediaMeta(mediaMeta, playlistId);
      if (!formats.length) continue;

      let videoId = mediaMeta.externalId as string | undefined;
      if (!videoId) videoId = medias.length === 1 ? playlistId : `${playlistId}-${num}`;

      let entryTitle = mediaMeta.caption as string | undefined;
      if (!entryTitle) {
        entryTitle = medias.length === 1 ? playlistTitle ?? undefined : `${playlistTitle} - Video ${num}`;
      }

      const duration = int_or_none(mediaMeta.durationInSeconds) ?? parse_duration(mediaMeta.duration);

      const images: Record<string, unknown>[] = [];
      for (const image of Object.values((mediaMeta.images as Record<string, Record<string, unknown>>) || {})) {
        images.push(...(Object.values(image || {}) as Record<string, unknown>[]));
      }
      if (mediaMeta.image) images.push(mediaMeta.image as Record<string, unknown>);

      const thumbnails: Thumbnail[] = images
        .filter((image) => image?.href)
        .map((image) => ({
          url: image.href as string,
          width: int_or_none(image.width),
          height: int_or_none(image.height),
        }));

      entries.push({
        id: videoId,
        title: entryTitle,
        thumbnails,
        duration: duration ?? undefined,
        timestamp: timestamp ?? undefined,
        formats,
        subtitles,
      });
    }

    return this.playlist_result(entries, playlistId, playlistTitle ?? undefined, playlistDescription ?? undefined);
  }
}

export class BBCCoUkArticleIE extends InfoExtractor {
  static IE_NAME = 'bbc.co.uk:article';
  static IE_DESC = 'BBC articles';
  static _VALID_URL = /^https?:\/\/(?:www\.)?bbc\.co\.uk\/programmes\/articles\/(?<id>[a-zA-Z0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);

    const title = this._og_search_title(webpage) || undefined;
    const description = (this._og_search_description(webpage) || '').trim() || undefined;

    const entries: VideoInfo[] = [];
    for (const m of webpage.matchAll(/<div[^>]+typeof="Clip"[^>]+resource="([^"]+)"/g)) {
      entries.push(this.url_result(m[1]!, 'BBCCoUk'));
    }

    return this.playlist_result(entries, playlistId, title, description);
  }
}

/**
 * No standalone URL upstream (`BBCCoUkPlaylistBaseIE`), but its `_real_extract`/`_entries`
 * logic is inherited unchanged by `BBCCoUkPlaylistIE` below — mirrors the
 * BrainPOPLegacyBaseIE pattern used in hand-b/brainpop.ts.
 */
export class BBCCoUkPlaylistBaseIE extends InfoExtractor {
  static IE_NAME = 'bbccoukplaylistbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  protected static _URL_TEMPLATE = '';
  protected static _VIDEO_ID_TEMPLATE = '';

  protected _extractTitleAndDescription(_webpage: string): [string | null, string | undefined] {
    throw new ExtractorError('BBCCoUkPlaylistBaseIE._extractTitleAndDescription is not implemented', {
      expected: true,
    });
  }

  protected async _entries(webpage: string, url: string, playlistId: string): Promise<VideoInfo[]> {
    const Ctor = this.constructor as typeof BBCCoUkPlaylistBaseIE;
    const singlePage = Boolean(parse_qs(url).page?.length);
    const videoIdRe = new RegExp(Ctor._VIDEO_ID_TEMPLATE.replace('%s', ID_REGEX_SRC), 'g');
    const entries: VideoInfo[] = [];
    let currentPage = webpage;

    for (let pageNum = 2; ; pageNum++) {
      for (const m of currentPage.matchAll(videoIdRe)) {
        const videoId = m[1]!;
        entries.push(this.url_result(Ctor._URL_TEMPLATE.replace('%s', videoId), 'BBCCoUk'));
      }
      if (singlePage) break;
      const nextPage = this._search_regex(
        /<li[^>]+class=(["'])pagination_+next\1[^>]*><a[^>]+href=(["'])((?:(?!\2).)+)\2/,
        currentPage,
        'next page url',
        null,
        false,
        3,
      );
      if (!nextPage) break;
      currentPage = await this._download_webpage(
        new URL(nextPage, url).toString(),
        playlistId,
        `Downloading page ${pageNum}`,
      );
    }

    return entries;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    const [title, description] = this._extractTitleAndDescription(webpage);
    const entries = await this._entries(webpage, url, playlistId);
    return this.playlist_result(entries, playlistId, title ?? undefined, description);
  }
}

/**
 * No standalone URL upstream (`BBCCoUkIPlayerPlaylistBaseIE`); its paging/`_real_extract`
 * logic is inherited by `BBCCoUkIPlayerEpisodesIE` / `BBCCoUkIPlayerGroupIE` below, each of
 * which overrides the per-source hooks (`_callApi`, `_getElements`, ...).
 */
export class BBCCoUkIPlayerPlaylistBaseIE extends InfoExtractor {
  static IE_NAME = 'bbccoukiplayerplaylistbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _PAGE_SIZE = 100;
  static _DESCRIPTION_KEY = 'synopsis';

  protected _getDefault(obj: Record<string, unknown> | undefined, key: string, defaultKey = 'default'): unknown {
    const inner = obj?.[key] as Record<string, unknown> | undefined;
    return inner ? inner[defaultKey] : undefined;
  }

  protected _getDescription(data: Record<string, unknown> | undefined): string | undefined {
    const Ctor = this.constructor as typeof BBCCoUkIPlayerPlaylistBaseIE;
    const synopsis = (data?.[Ctor._DESCRIPTION_KEY] as Record<string, unknown>) || {};
    return dict_get(synopsis, ['large', 'medium', 'small']) as string | undefined;
  }

  protected _getEpisodeImage(_episode: Record<string, unknown>): string | undefined {
    throw new ExtractorError('not implemented', { expected: true });
  }

  protected _getEpisodeField(_episode: Record<string, unknown>, _field: string): unknown {
    throw new ExtractorError('not implemented', { expected: true });
  }

  protected _getElements(_data: Record<string, unknown>): Record<string, unknown>[] {
    throw new ExtractorError('not implemented', { expected: true });
  }

  protected _getEpisode(element: Record<string, unknown>): Record<string, unknown> {
    return element;
  }

  protected async _callApi(
    _pid: string,
    _perPage: number,
    _page = 1,
    _seriesId?: string | null,
  ): Promise<Record<string, unknown>> {
    throw new ExtractorError('not implemented', { expected: true });
  }

  protected _getPlaylistData(data: Record<string, unknown>): Record<string, unknown> {
    return data;
  }

  protected _getPlaylistTitle(_data: Record<string, unknown>): string | undefined {
    throw new ExtractorError('not implemented', { expected: true });
  }

  protected async _fetchPage(
    programmeId: string,
    perPage: number,
    seriesId: string | null | undefined,
    page: number,
  ): Promise<VideoInfo[]> {
    const data = await this._callApi(programmeId, perPage, page + 1, seriesId);
    const elements = this._getElements(data);
    const entries: VideoInfo[] = [];
    for (const element of elements) {
      const episode = this._getEpisode(element);
      const episodeId = episode.id as string | undefined;
      if (!episodeId) continue;
      const image = this._getEpisodeImage(episode);
      const category = this._getDefault(episode, 'labels', 'category') as string | undefined;
      entries.push({
        ...this.url_result(
          `https://www.bbc.co.uk/iplayer/episode/${episodeId}`,
          'BBCCoUk',
          episodeId,
          this._getEpisodeField(episode, 'subtitle') as string | undefined,
        ),
        thumbnail: image ? image.replace('{recipe}', 'raw') : undefined,
        description: this._getDescription(episode),
        categories: category ? [category] : undefined,
        series: this._getEpisodeField(episode, 'title') as string | undefined,
      });
    }
    return entries;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const pid = this._match_id(url);
    const qs = parse_qs(url);
    const seriesId = qs.seriesId?.[0] ?? null;
    const pageStr = qs.page?.[0];
    const Ctor = this.constructor as typeof BBCCoUkIPlayerPlaylistBaseIE;
    const perPage = pageStr ? 36 : Ctor._PAGE_SIZE;

    const entries: VideoInfo[] = [];
    if (pageStr) {
      entries.push(...(await this._fetchPage(pid, perPage, seriesId, Number(pageStr) - 1)));
    } else {
      for (let page = 0; page < 1000; page++) {
        const pageEntries = await this._fetchPage(pid, perPage, seriesId, page);
        if (!pageEntries.length) break;
        entries.push(...pageEntries);
        if (pageEntries.length < perPage) break;
      }
    }

    const playlistData = this._getPlaylistData(await this._callApi(pid, 1));
    return this.playlist_result(
      entries,
      pid,
      this._getPlaylistTitle(playlistData),
      this._getDescription(playlistData),
    );
  }
}

export class BBCCoUkIPlayerEpisodesIE extends BBCCoUkIPlayerPlaylistBaseIE {
  static IE_NAME = 'bbc.co.uk:iplayer:episodes';
  static _VALID_URL = new RegExp(`^https?://(?:www\\.)?bbc\\.co\\.uk/iplayer/episodes/(?<id>${ID_REGEX_SRC})`);
  static _PAGE_SIZE = 100;
  static _DESCRIPTION_KEY = 'synopsis';

  protected _getEpisodeImage(episode: Record<string, unknown>): string | undefined {
    return this._getDefault(episode, 'image') as string | undefined;
  }

  protected _getEpisodeField(episode: Record<string, unknown>, field: string): unknown {
    return this._getDefault(episode, field);
  }

  protected _getElements(data: Record<string, unknown>): Record<string, unknown>[] {
    return ((data.entities as Record<string, unknown>)?.results as Record<string, unknown>[]) || [];
  }

  protected _getEpisode(element: Record<string, unknown>): Record<string, unknown> {
    return (element.episode as Record<string, unknown>) || {};
  }

  protected async _callApi(
    pid: string,
    perPage: number,
    page = 1,
    seriesId?: string | null,
  ): Promise<Record<string, unknown>> {
    const variables: Record<string, unknown> = { id: pid, page, perPage };
    if (seriesId) variables.sliceId = seriesId;
    const resp = await this._download_json<{ data?: { programme?: Record<string, unknown> } }>(
      'https://graph.ibl.api.bbc.co.uk/',
      pid,
      undefined,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ id: '5692d93d5aac8d796a0305e895e61551', variables }),
      },
    );
    return resp.data?.programme || {};
  }

  protected _getPlaylistTitle(data: Record<string, unknown>): string | undefined {
    return this._getDefault(data, 'title') as string | undefined;
  }
}

export class BBCCoUkIPlayerGroupIE extends BBCCoUkIPlayerPlaylistBaseIE {
  static IE_NAME = 'bbc.co.uk:iplayer:group';
  static _VALID_URL = new RegExp(`^https?://(?:www\\.)?bbc\\.co\\.uk/iplayer/group/(?<id>${ID_REGEX_SRC})`);
  static _PAGE_SIZE = 200;
  static _DESCRIPTION_KEY = 'synopses';

  protected _getEpisodeImage(episode: Record<string, unknown>): string | undefined {
    return this._getDefault(episode, 'images', 'standard') as string | undefined;
  }

  protected _getEpisodeField(episode: Record<string, unknown>, field: string): unknown {
    return episode[field];
  }

  protected _getElements(data: Record<string, unknown>): Record<string, unknown>[] {
    return (data.elements as Record<string, unknown>[]) || [];
  }

  protected async _callApi(pid: string, perPage: number, page = 1): Promise<Record<string, unknown>> {
    const resp = await this._download_json<{ group_episodes?: Record<string, unknown> }>(
      `http://ibl.api.bbc.co.uk/ibl/v1/groups/${pid}/episodes`,
      pid,
      undefined,
      { query: { page: String(page), per_page: String(perPage) } },
    );
    return resp.group_episodes || {};
  }

  protected _getPlaylistData(data: Record<string, unknown>): Record<string, unknown> {
    return (data.group as Record<string, unknown>) || {};
  }

  protected _getPlaylistTitle(data: Record<string, unknown>): string | undefined {
    return data.title as string | undefined;
  }
}

export class BBCCoUkPlaylistIE extends BBCCoUkPlaylistBaseIE {
  static IE_NAME = 'bbc.co.uk:playlist';
  static _VALID_URL = new RegExp(
    `^https?://(?:www\\.)?bbc\\.co\\.uk/programmes/(?<id>${ID_REGEX_SRC})/(?:episodes|broadcasts|clips)`,
  );
  protected static _URL_TEMPLATE = 'http://www.bbc.co.uk/programmes/%s';
  protected static _VIDEO_ID_TEMPLATE = 'data-pid=["\'](%s)';

  protected _extractTitleAndDescription(webpage: string): [string | null, string | undefined] {
    const title = this._og_search_title(webpage, false);
    const description = this._og_search_description(webpage) || undefined;
    return [title, description];
  }
}
