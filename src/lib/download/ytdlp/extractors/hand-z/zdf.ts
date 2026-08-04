// @ts-nocheck
/** ZDF extractors â€?ported from yt-dlp zdf.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  determine_ext,
  filter_dict,
  float_or_none,
  int_or_none,
  join_nonempty,
  parse_codecs,
  parse_iso8601,
  parse_qs,
  smuggle_url,
  unified_timestamp,
  unsmuggle_url,
  url_or_none,
  urljoin,
} from '../../utils';

export class ZDFBaseIE extends InfoExtractor {
  static IE_NAME = 'zdfbase';
  static _VALID_URL = false;
  static _GEO_COUNTRIES = ['DE'];
  static _TOKEN_CACHE: { token?: string; type?: string; expires?: number } = {};

  protected async _get_api_token(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (!ZDFBaseIE._TOKEN_CACHE.token || (ZDFBaseIE._TOKEN_CACHE.expires || 0) < now) {
      const token = await this._download_json<Record<string, any>>(
        'https://zdf-prod-futura.zdf.de/mediathekV2/token',
        undefined,
        'Downloading API token',
      );
      ZDFBaseIE._TOKEN_CACHE = {
        token: String(token.token || ''),
        type: String(token.type || 'Bearer'),
        expires: int_or_none(token.expires) || now + 300,
      };
    }
    return `${ZDFBaseIE._TOKEN_CACHE.type || 'Bearer'} ${ZDFBaseIE._TOKEN_CACHE.token || ''}`;
  }

  protected async _call_api(
    url: string,
    videoId: string,
    item: string,
    apiToken?: string | null,
  ): Promise<Record<string, any>> {
    return this._download_json<Record<string, any>>(url, videoId, `Downloading ${item}`, {
      headers: filter_dict({ 'Api-Auth': apiToken || undefined }) as Record<string, string>,
    });
  }

  protected _parse_aspect_ratio(aspectRatio: unknown): number | null {
    if (typeof aspectRatio !== 'string') return null;
    const m = aspectRatio.match(/(?<w>\d+):(?<h>\d+)/);
    if (!m?.groups?.w || !m.groups.h) return null;
    const w = Number(m.groups.w);
    const h = Number(m.groups.h);
    return h ? w / h : null;
  }

  protected _extract_chapters(src: unknown): VideoInfo['chapters'] | undefined {
    if (!Array.isArray(src)) return undefined;
    const chapters = src
      .map((node) => {
        const n = node as Record<string, any>;
        const start = float_or_none(n.anchorOffset);
        if (start == null) return null;
        return { start_time: start, title: String(n.anchorLabel || '') || undefined };
      })
      .filter(Boolean);
    return chapters.length ? (chapters as VideoInfo['chapters']) : undefined;
  }

  protected _extract_subtitles(src: unknown): Record<string, Subtitle[]> {
    const out: Record<string, Subtitle[]> = {};
    const seen = new Set<string>();
    for (const caption of Array.isArray(src) ? src : []) {
      const c = caption as Record<string, any>;
      const subtitleUrl = url_or_none(c.uri);
      if (!subtitleUrl || seen.has(subtitleUrl)) continue;
      seen.add(subtitleUrl);
      const lang = String(c.language || 'deu');
      out[lang] ||= [];
      out[lang]!.push({ url: subtitleUrl });
    }
    return out;
  }

  protected _expand_ptmd_template(apiBaseUrl: string, template: string): string {
    return urljoin(apiBaseUrl, template.replace('{playerId}', 'android_native_6'));
  }

  protected async _extract_ptmd(
    ptmdUrls: string | string[],
    videoId: string,
    apiToken?: string | null,
    aspectRatio?: number | null,
  ): Promise<{ id: string; duration?: number; formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
    const allUrls = Array.isArray(ptmdUrls) ? ptmdUrls : [ptmdUrls];
    let contentId: string | null = null;
    let duration: number | undefined;
    const formats: Format[] = [];
    const srcCaptions: Record<string, any>[] = [];
    const seenUrls = new Set<string>();

    for (let ptmdUrl of allUrls) {
      const [rawUrl, smuggled] = unsmuggle_url(ptmdUrl, {});
      ptmdUrl = rawUrl;
      const isDgs = smuggled.vod_media_type === 'DGS';
      const ptmd = await this._call_api(ptmdUrl, videoId, 'PTMD data', apiToken);
      const basename =
        String(ptmd.basename || '') ||
        this._search_regex(/\/vod\/ptmd\/[^/?#]+\/(\w+)/, ptmdUrl, 'content ID', null, false);
      if (!contentId && basename && !isDgs) contentId = basename;
      if (!duration) {
        duration = float_or_none(ptmd?.attributes?.duration?.value, 1000) ?? undefined;
      }
      srcCaptions.push(...((ptmd.captions || []) as Record<string, any>[]));

      for (const stream of (ptmd.priorityList || []) as Record<string, any>[]) {
        for (const formatGroup of (stream.formitaeten || []) as Record<string, any>[]) {
          for (const quality of (formatGroup.qualities || []) as Record<string, any>[]) {
            const tracks = (quality.audio?.tracks || []) as Record<string, any>[];
            for (const variant of tracks) {
              const formatUrl = url_or_none(variant.uri);
              if (!formatUrl || seenUrls.has(formatUrl)) continue;
              seenUrls.add(formatUrl);
              const ext = determine_ext(formatUrl);
              let fmts: Format[] = [];
              if (ext === 'm3u8') {
                fmts = await this._extract_m3u8_formats(
                  formatUrl,
                  videoId,
                  'mp4',
                  'm3u8_native',
                  undefined,
                  undefined,
                  'hls',
                  undefined,
                  false,
                );
              } else if (ext === 'mp4' || ext === 'webm') {
                const height = int_or_none(quality.highestVerticalResolution);
                const width =
                  aspectRatio && height != null ? Math.round(aspectRatio * height) : undefined;
                fmts = [
                  {
                    url: formatUrl,
                    ...parse_codecs(String(quality.mimeCodec || '')),
                    height: height ?? undefined,
                    width,
                    filesize: int_or_none(variant.filesize) ?? undefined,
                    format_id: join_nonempty('http', String(stream.type || '')) || 'http',
                    tbr:
                      int_or_none(
                        this._search_regex(/_(\d+)k_/, formatUrl, 'tbr', null, false) || null,
                      ) ?? undefined,
                  },
                ];
              } else {
                continue;
              }

              const cls = String(variant.class || '');
              for (const f of fmts) {
                const isAudioOnly = f.vcodec === 'none';
                formats.push({
                  ...f,
                  format_id: join_nonempty(f.format_id || 'fmt', isDgs ? 'dgs' : ''),
                  format_note: join_nonempty(
                    !isAudioOnly && cls ? cls : '',
                    isDgs ? 'German Sign Language' : '',
                    String(f.format_note || ''),
                    ', ',
                  ),
                  preference: isDgs ? -2 : -1,
                });
              }
            }
          }
        }
      }
    }

    return {
      id: contentId || videoId,
      duration,
      formats,
      subtitles: this._extract_subtitles(srcCaptions),
    };
  }

  protected async _download_graphql(
    itemId: string,
    dataDesc: string,
    query?: Record<string, string>,
    body?: Record<string, unknown>,
  ): Promise<Record<string, any>> {
    return this._download_json<Record<string, any>>(
      'https://api.zdf.de/graphql',
      itemId,
      `Downloading ${dataDesc}`,
      {
        query,
        method: body ? 'POST' : undefined,
        data: body ? JSON.stringify(body) : undefined,
        headers: filter_dict({
          'Api-Auth': await this._get_api_token(),
          'Apollo-Require-Preflight': 'true',
          'Content-Type': body ? 'application/json' : undefined,
        }) as Record<string, string>,
      },
    );
  }

  protected _extract_thumbnails(source: unknown): VideoInfo['thumbnails'] | undefined {
    if (!source || typeof source !== 'object') return undefined;
    const out: NonNullable<VideoInfo['thumbnails']> = [];
    for (const [formatId, url] of Object.entries(source as Record<string, unknown>)) {
      const u = url_or_none(url);
      if (!u) continue;
      const m = String(formatId).match(/(?<w>\d+|auto)[Xx](?<h>\d+|auto)/);
      out.push({
        id: String(formatId),
        url: u,
        preference: formatId === 'original' ? 1 : 0,
        width: m?.groups?.w && m.groups.w !== 'auto' ? Number(m.groups.w) : undefined,
        height: m?.groups?.h && m.groups.h !== 'auto' ? Number(m.groups.h) : undefined,
      });
    }
    return out.length ? out : undefined;
  }
}

export class ZDFIE extends ZDFBaseIE {
  static IE_NAME = 'zdf';
  static _VALID_URL = [
    /https?:\/\/(?:www\.)?zdf\.de\/(?:video|play)\/(?:[^/?#]+\/)*(?<id>[^/?#]+)/,
    /https?:\/\/(?:www\.)?zdf\.de\/(?:[^/?#]+\/)*(?<id>[^/?#]+)\.html/,
    /https?:\/\/(?:www\.)?(?:zdfheute|logo)\.de\/(?:[^/?#]+\/)*(?<id>[^/?#]+)\.html/,
  ];
  static _GRAPHQL_QUERY = `
query VideoByCanonical($canonical: String!) {
  videoByCanonical(canonical: $canonical) {
    canonical
    title
    leadParagraph
    editorialDate
    teaser { description image { list } }
    episodeInfo { episodeNumber seasonNumber }
    smartCollection { canonical title }
    currentMedia {
      nodes {
        ptmdTemplate
        ... on VodMedia {
          duration
          aspectRatio
          streamAnchorTags { nodes { anchorOffset anchorLabel } }
          vodMediaType
          label
        }
        ... on LiveMedia {
          start
          stop
          encryption
          liveMediaType
          label
        }
        id
      }
    }
  }
}`;

  protected async _extract_fallback(documentId: string): Promise<VideoInfo> {
    const video = await this._download_json<Record<string, any>>(
      `https://zdf-prod-futura.zdf.de/mediathekV2/document/${documentId}`,
      documentId,
      'Downloading fallback metadata',
    );
    const document = (video.document || {}) as Record<string, any>;
    const ptmdUrl = url_or_none(document.streamApiUrlAndroid || document.streams?.[0]?.streamApiUrlAndroid);
    if (!ptmdUrl) throw new ExtractorError('Unable to extract PTMD URL');

    const thumbnails: NonNullable<VideoInfo['thumbnails']> = [];
    const teaserBild = (document.teaserBild || {}) as Record<string, any>;
    for (const [key, thumb] of Object.entries(teaserBild)) {
      const t = thumb as Record<string, any>;
      const tu = url_or_none(t.url);
      if (!tu) continue;
      thumbnails.push({
        id: key,
        url: tu,
        width: int_or_none(t.width) ?? undefined,
        height: int_or_none(t.height) ?? undefined,
      });
    }

    const ptmd = await this._extract_ptmd(ptmdUrl, documentId, await this._get_api_token());
    return {
      id: documentId,
      title: String(document.titel || documentId),
      description: String(document.beschreibung || '') || undefined,
      timestamp: unified_timestamp(document.date || video.meta?.editorialDate) ?? undefined,
      thumbnails,
      subtitles: this._extract_subtitles(document.captions || []),
      ...ptmd,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const gql = await this._download_graphql(videoId, 'video metadata', undefined, {
      operationName: 'VideoByCanonical',
      query: ZDFIE._GRAPHQL_QUERY,
      variables: { canonical: videoId },
    });
    const videoData = gql?.data?.videoByCanonical;
    if (!videoData) return this._extract_fallback(videoId);

    const nodes = (videoData.currentMedia?.nodes || []) as Record<string, any>[];
    const ptmdUrls: string[] = [];
    let aspectRatio: number | null = null;
    let isLive = false;
    for (const node of nodes) {
      if (!node.ptmdTemplate) continue;
      let ptmdUrl = this._expand_ptmd_template('https://api.zdf.de', String(node.ptmdTemplate));
      if (node.vodMediaType) ptmdUrl = smuggle_url(ptmdUrl, { vod_media_type: node.vodMediaType });
      ptmdUrls.push(ptmdUrl);
      if (node.liveMediaType) isLive = true;
      if (!aspectRatio) aspectRatio = this._parse_aspect_ratio(node.aspectRatio);
    }

    const ptmdData = await this._extract_ptmd(ptmdUrls, videoId, await this._get_api_token(), aspectRatio);
    return {
      id: videoId,
      title: String(videoData.title || videoId),
      description: String(videoData.leadParagraph || videoData.teaser?.description || '') || undefined,
      timestamp: parse_iso8601(videoData.editorialDate) ?? undefined,
      thumbnails: this._extract_thumbnails(videoData.teaser?.image?.list),
      episode_number: int_or_none(videoData.episodeInfo?.episodeNumber) ?? undefined,
      season_number: int_or_none(videoData.episodeInfo?.seasonNumber) ?? undefined,
      series: String(videoData.smartCollection?.title || '') || undefined,
      series_id: String(videoData.smartCollection?.canonical || '') || undefined,
      chapters: this._extract_chapters(nodes[0]?.streamAnchorTags?.nodes),
      is_live: isLive,
      ...ptmdData,
    };
  }
}

export class ZDFChannelIE extends ZDFBaseIE {
  static IE_NAME = 'zdf:channel';
  static _VALID_URL = /https?:\/\/www\.zdf\.de\/(?:[^/?#]+\/)*(?<id>[^/?#]+)/;
  static _PAGE_SIZE = 24;

  static suitable(url: string): boolean {
    return !ZDFIE.suitable(url) && super.suitable(url);
  }

  protected async _fetch_page(
    playlistId: string,
    canonicalId: string,
    seasonIdx: number,
    seasonNumber: number,
    pageNumber: number,
    cursor?: string,
  ): Promise<Record<string, any>> {
    const query: Record<string, string> = {
      operationName: 'seasonByCanonical',
      variables: JSON.stringify(
        filter_dict({
          seasonIndex: seasonIdx,
          canonical: canonicalId,
          episodesPageSize: ZDFChannelIE._PAGE_SIZE,
          episodesAfter: cursor || undefined,
        }),
      ),
      extensions: JSON.stringify({
        persistedQuery: {
          version: 1,
          sha256Hash: '9412a0f4ac55dc37d46975d461ec64bfd14380d815df843a1492348f77b5c99a',
        },
      }),
    };
    return this._download_graphql(playlistId, `season ${seasonNumber} page ${pageNumber} JSON`, query);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const canonicalId = this._match_id(url);
    const seasonNumber = int_or_none(parse_qs(url).staffel?.[0]) ?? null;
    const playlistId = join_nonempty(canonicalId, seasonNumber != null ? `s${seasonNumber}` : '');

    const collection = await this._download_graphql(canonicalId, 'smart collection data', {
      operationName: 'GetSmartCollectionByCanonical',
      variables: JSON.stringify({ canonical: canonicalId, videoPageSize: 100 }),
      extensions: JSON.stringify({
        persistedQuery: {
          version: 1,
          sha256Hash: 'cb49420e133bd668ad895a8cea0e65cba6aa11ac1cacb02341ff5cf32a17cd02',
        },
      }),
    });
    const collectionData = collection?.data?.smartCollectionByCanonical || {};
    const videoData = collectionData.video || {};
    const seasonNumbers = ((collectionData.seasons?.seasons || []) as Array<Record<string, any>>)
      .map((x) => int_or_none(x.number))
      .filter((x): x is number => x != null);

    if (videoData.sharingUrl && videoData.canonical && seasonNumber == null) {
      return this.url_result(String(videoData.sharingUrl), ZDFIE.IE_NAME, String(videoData.canonical));
    }
    if (seasonNumber != null && !seasonNumbers.includes(seasonNumber)) {
      throw new ExtractorError(`Season ${seasonNumber} was not found in the collection data`);
    }

    const entries: VideoInfo[] = [];
    for (let seasonIdx = 0; seasonIdx < seasonNumbers.length; seasonIdx++) {
      const sNum = seasonNumbers[seasonIdx]!;
      if (seasonNumber != null && seasonNumber !== sNum) continue;
      let cursor: string | undefined;
      for (let page = 1; ; page++) {
        const pageData = await this._fetch_page(playlistId || canonicalId, canonicalId, seasonIdx, sNum, page, cursor);
        const nodes = (pageData?.data?.smartCollectionByCanonical?.seasons?.nodes || []) as Array<Record<string, any>>;
        for (const seasonNode of nodes) {
          for (const ep of (seasonNode.episodes?.nodes || []) as Array<Record<string, any>>) {
            const sharingUrl = url_or_none(ep.sharingUrl);
            if (!sharingUrl) continue;
            entries.push(
              this.url_result(
                sharingUrl,
                ZDFIE.IE_NAME,
                String(ep.canonical || ''),
                String(ep.teaser?.title || ep.canonical || ''),
              ),
            );
          }
        }
        const pageInfo = nodes[nodes.length - 1]?.episodes?.pageInfo || {};
        if (!pageInfo.hasNextPage || !pageInfo.endCursor) break;
        cursor = String(pageInfo.endCursor);
      }
    }

    return this.playlist_result(
      entries,
      playlistId || canonicalId,
      join_nonempty(String(collectionData.title || ''), seasonNumber != null ? `Season ${seasonNumber}` : '', ' - '),
      String(collectionData.infoText || '') || undefined,
    );
  }
}
