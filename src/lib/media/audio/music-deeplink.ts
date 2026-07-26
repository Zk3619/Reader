/**
 * 音乐 Deeplink（对齐 LX Desktop/Mobile：`lxmusic://type/action/...`）
 * 兼容 `reader-music://` 与旧式 `lxmusic://search?keyword=` / `lxmusic://songlist?url=`。
 */

import {
  audioShellIsPlaying,
  audioShellSkipNext,
  audioShellSkipPrev,
  audioShellPlay,
  audioShellPause,
  audioShellTogglePlay,
  hasAudioShellHandlers,
} from '@/lib/media/audio/audio-shell-controls';
import { dislikeTrack } from '@/lib/media/audio/music-context-actions';
import { findMusic } from '@/lib/media/audio/music-sdk/find-music';
import type { MusicSdkSource } from '@/lib/media/audio/music-sdk';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';
import {
  buildTrackId,
  type AudioTrack,
  type AudioTrackSource,
} from '@/lib/media/audio/track-types';
import {
  addTrackToLove,
  removeTrackFromLove,
} from '@/lib/database/audio-library';
import { showAppToast } from '@/components/shared/AppToasts';
import { openListFromUrlInput } from '@/stores/music-hub/songList';
import { navigateToMusicHub } from '@/stores/shell-tabs';
import {
  playAsTemp,
  playNextTrack,
  playPrevTrack,
  playTracksLater,
  setMusicSection,
} from '@/stores/viewer/media/audio';
import { viewerStore } from '@/stores/viewer';

export type MusicDeepLinkPlayerAction =
  | 'play'
  | 'pause'
  | 'skipNext'
  | 'skipPrev'
  | 'togglePlay'
  | 'collect'
  | 'uncollect'
  | 'dislike';

export type ParsedMusicDeepLink = {
  type: string;
  action: string;
  paths: string[];
  params: Record<string, unknown>;
};

const ONLINE_SOURCES = new Set(['kw', 'kg', 'tx', 'wy', 'mg']);

export function isMusicDeepLink(uri: string): boolean {
  const t = uri.trim().toLowerCase();
  return (
    t.startsWith('lxmusic://') ||
    t.startsWith('reader-music://') ||
    t.startsWith('musicfree://')
  );
}

/** 本地音频 / 歌单 / UserApi 脚本（对齐 LX Mobile file:// · content://） */
export function isMusicFileUri(uri: string): boolean {
  const t = uri.trim().toLowerCase();
  return t.startsWith('file://') || t.startsWith('content://');
}

export function isMusicOpenUri(uri: string): boolean {
  return isMusicDeepLink(uri) || isMusicFileUri(uri);
}

function fileExtFromUri(uri: string, displayName?: string): string {
  const name = (displayName || uri.split(/[/?#]/).pop() || '').toLowerCase();
  const m = name.match(/\.([a-z0-9]+)$/i);
  return m?.[1] ?? '';
}

function fileUriToPath(uri: string): string {
  const raw = uri.trim();
  if (raw.toLowerCase().startsWith('file://')) {
    try {
      const u = new URL(raw);
      // Windows: file:///C:/... → /C:/... → C:/...
      let path = decodeURIComponent(u.pathname);
      if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
      return path;
    } catch {
      return decodeURIComponent(raw.replace(/^file:\/\//i, ''));
    }
  }
  return raw;
}

async function resolveUriDisplayName(uri: string): Promise<string> {
  if (uri.toLowerCase().startsWith('content://')) {
    try {
      const { androidUriDisplayName } = await import('@/lib/platform/fs/android-bridge');
      const name = await androidUriDisplayName(uri);
      if (name?.trim()) return name.trim();
    } catch {
      /* ignore */
    }
  }
  return uri.split(/[/?#]/).pop() || 'file';
}

async function readUriBytes(uri: string): Promise<Uint8Array> {
  const { parseStorageRef } = await import('@/lib/platform/fs/storage-ref');
  const { readBytes } = await import('@/lib/platform/fs/read-write');
  const pathOrUri = uri.toLowerCase().startsWith('file://')
    ? fileUriToPath(uri)
    : uri;
  const buf = await readBytes(parseStorageRef(pathOrUri));
  return new Uint8Array(buf);
}

async function handleMusicAudioFileUri(uri: string): Promise<void> {
  const { importLocalFilesToLibrary } = await import(
    '@/lib/media/audio/library/playlist-store'
  );
  const pathOrUri = uri.toLowerCase().startsWith('file://')
    ? fileUriToPath(uri)
    : uri;
  const tracks = await importLocalFilesToLibrary([pathOrUri]);
  if (tracks.length === 0) throw new Error('未能导入音频文件');
  navigateToMusicHub({ section: 'nowPlaying' });
  await playTrackNow(tracks[0]!);
  showAppToast({ title: `已导入并播放：${tracks[0]!.name}`, variant: 'success' });
}

async function handleMusicLxmcFileUri(uri: string): Promise<void> {
  const displayName = await resolveUriDisplayName(uri);
  if (
    !window.confirm(
      `要从「${displayName}」导入歌单吗？将写入「我的列表」。`,
    )
  ) {
    return;
  }
  const bytes = await readUriBytes(uri);
  const { tryParseLxmcOrPlaylistJson } = await import(
    '@/lib/media/audio/list/playlist-lxmc'
  );
  const { importPlaylistSharePayload } = await import(
    '@/lib/media/audio/list/playlist-share'
  );
  const payload = tryParseLxmcOrPlaylistJson(bytes);
  const result = await importPlaylistSharePayload(payload);
  navigateToMusicHub({ section: 'list' });
  showAppToast({
    title: '已导入歌单',
    description: `${payload.name}（${result.count} 首）`,
    variant: 'success',
  });
}

async function handleMusicUserApiFileUri(uri: string): Promise<void> {
  const displayName = await resolveUriDisplayName(uri);
  const bytes = await readUriBytes(uri);
  const script = new TextDecoder().decode(bytes);

  const { looksLikeMfPluginsJsonText } = await import(
    '@/lib/media/audio/online/mf-plugin/plugins-json'
  );
  if (looksLikeMfPluginsJsonText(script)) {
    if (
      !window.confirm(
        `要从「${displayName}」导入 MusicFree 插件订阅（JSON）吗？`,
      )
    ) {
      return;
    }
    const { importMfPluginsFromJsonText } = await import(
      '@/lib/media/audio/online/mf-plugin'
    );
    const result = await importMfPluginsFromJsonText(script);
    navigateToMusicHub({ section: 'settings' });
    showAppToast({
      title: result.ok ? '已导入 MusicFree 订阅' : '导入失败',
      description: result.error || result.name,
      variant: result.ok ? 'success' : 'warning',
    });
    return;
  }

  const { looksLikeMfPluginScript } = await import(
    '@/lib/media/audio/online/mf-plugin/runtime'
  );
  if (looksLikeMfPluginScript(script)) {
    if (
      !window.confirm(
        `要从「${displayName}」导入 MusicFree 插件吗？`,
      )
    ) {
      return;
    }
    const { importMfPlugin } = await import('@/lib/media/audio/online/mf-plugin');
    const result = await importMfPlugin({
      script,
      fileName: displayName,
    });
    navigateToMusicHub({ section: 'settings' });
    showAppToast({
      title: result.skipped ? '插件已存在' : '已导入 MusicFree 插件',
      description: result.error || result.name,
      variant: result.ok ? 'success' : 'warning',
    });
    return;
  }

  if (
    !window.confirm(
      `要从「${displayName}」导入自定义音源脚本吗？`,
    )
  ) {
    return;
  }
  const { importUserApiScript } = await import(
    '@/lib/media/audio/online/user-api-engine'
  );
  const result = await importUserApiScript({
    script,
    fileName: displayName,
  });
  navigateToMusicHub({ section: 'settings' });
  showAppToast({
    title: result.skipped ? '音源已存在' : '已导入音源脚本',
    description: result.error || result.name,
    variant: result.ok ? 'success' : 'warning',
  });
}

/** 处理 file:// / content://（音频、lxmc/json、UserApi .js、MF plugins.json） */
export async function handleMusicFileUri(uri: string): Promise<boolean> {
  if (!isMusicFileUri(uri)) return false;
  try {
    const displayName = await resolveUriDisplayName(uri);
    const ext = fileExtFromUri(uri, displayName);
    if (ext === 'json') {
      const bytes = await readUriBytes(uri);
      const text = new TextDecoder().decode(bytes);
      const { looksLikeMfPluginsJsonText } = await import(
        '@/lib/media/audio/online/mf-plugin/plugins-json'
      );
      if (looksLikeMfPluginsJsonText(text)) {
        await handleMusicUserApiFileUri(uri);
        return true;
      }
      await handleMusicLxmcFileUri(uri);
      return true;
    }
    if (ext === 'lxmc') {
      await handleMusicLxmcFileUri(uri);
      return true;
    }
    if (ext === 'js') {
      await handleMusicUserApiFileUri(uri);
      return true;
    }
    if (
      ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'ape', 'wma'].includes(ext) ||
      !ext
    ) {
      // 无扩展名时仍尝试按音频导入（部分 content://）
      await handleMusicAudioFileUri(uri);
      return true;
    }
    throw new Error(`不支持的文件类型：.${ext}`);
  } catch (err) {
    showAppToast({
      title: '打开音乐文件失败',
      description: toUserFacingMusicError(err, '打开音乐文件失败'),
      variant: 'destructive',
    });
    return true;
  }
}

/** 统一入口：lxmusic 协议 + 本地 file/content */
export async function handleMusicOpenUri(uri: string): Promise<boolean> {
  if (isMusicDeepLink(uri)) return handleMusicDeepLink(uri);
  if (isMusicFileUri(uri)) return handleMusicFileUri(uri);
  return false;
}

/** 对齐 LX：`lxmusic://type/action/path...?k=v&data=...` */
export function parseMusicDeepLink(uri: string): ParsedMusicDeepLink {
  const normalized = uri.trim().replace(/^reader-music:/i, 'lxmusic:');
  const withoutScheme = normalized.replace(/^lxmusic:\/\//i, '');
  const qIndex = withoutScheme.indexOf('?');
  const pathPart = qIndex >= 0 ? withoutScheme.slice(0, qIndex) : withoutScheme;
  const search = qIndex >= 0 ? withoutScheme.slice(qIndex + 1) : '';
  const segments = pathPart.split('/').filter(Boolean);
  const type = segments[0] ?? '';
  const action = segments[1] ?? '';
  const paths = segments.slice(2).map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
  const params: Record<string, unknown> = {};
  if (search) {
    for (const param of search.split('&')) {
      if (!param) continue;
      const eq = param.indexOf('=');
      const rawKey = eq >= 0 ? param.slice(0, eq) : param;
      const rawVal = eq >= 0 ? param.slice(eq + 1) : '';
      if (!rawKey) continue;
      let key = rawKey;
      let value = rawVal;
      try {
        key = decodeURIComponent(rawKey);
        value = decodeURIComponent(rawVal);
      } catch {
        /* keep raw */
      }
      params[key] = value;
    }
    if (typeof params.data === 'string' && params.data) {
      try {
        params.data = JSON.parse(params.data);
      } catch {
        /* keep string */
      }
    }
  }
  return { type, action, paths, params };
}

function currentTrack(): AudioTrack | null {
  const queue = viewerStore.state.trackQueue;
  const index = viewerStore.state.trackIndex;
  return queue[index] ?? null;
}

function lxMusicInfoToTrack(info: Record<string, unknown>): AudioTrack {
  const source = String(info.source ?? '') as AudioTrackSource;
  if (!ONLINE_SOURCES.has(source)) {
    throw new Error(`Unknown source: ${source || '(empty)'}`);
  }
  const songmid = info.songmid != null ? String(info.songmid) : undefined;
  const songId = String(info.songId ?? songmid ?? '');
  const hash = info.hash != null ? String(info.hash) : undefined;
  const copyrightId =
    info.copyrightId != null ? String(info.copyrightId) : undefined;
  const idKey =
    source === 'kg' && hash
      ? `${songId}_${hash}`
      : copyrightId ?? songId;
  if (!idKey) throw new Error('song id missing');
  const types = Array.isArray(info.types) ? info.types : [];
  const qualitys = types
    .map((t) =>
      t && typeof t === 'object' && 'type' in t
        ? String((t as { type: unknown }).type)
        : '',
    )
    .filter(Boolean);
  return {
    id: buildTrackId(source, idKey),
    name: String(info.name ?? '').trim() || '未知歌曲',
    artist: String(info.singer ?? info.artist ?? '').trim(),
    source,
    duration: String(info.interval ?? info.duration ?? '00:00'),
    meta: {
      songId,
      songmid: songmid ?? songId,
      hash,
      hash_320: info.hash_320 != null ? String(info.hash_320) : undefined,
      hash_flac: info.hash_flac != null ? String(info.hash_flac) : undefined,
      hash_high: info.hash_high != null ? String(info.hash_high) : undefined,
      mediaMid:
        info.mediaMid != null
          ? String(info.mediaMid)
          : info.strMediaMid != null
            ? String(info.strMediaMid)
            : undefined,
      strMediaMid:
        info.strMediaMid != null
          ? String(info.strMediaMid)
          : info.mediaMid != null
            ? String(info.mediaMid)
            : undefined,
      albumMid: info.albumMid != null ? String(info.albumMid) : undefined,
      albumId: info.albumId != null ? String(info.albumId) : undefined,
      copyrightId,
      albumName: info.albumName != null ? String(info.albumName) : undefined,
      coverUrl: info.img != null ? String(info.img) : undefined,
      qualitys: qualitys.length ? qualitys : undefined,
      _types: info._types,
      types,
    },
  };
}

async function playTrackNow(track: AudioTrack): Promise<void> {
  const playing = hasAudioShellHandlers()
    ? audioShellIsPlaying()
    : viewerStore.state.trackQueue.length > 0;
  if (!playing && viewerStore.state.trackQueue.length === 0) {
    await playAsTemp([track], 0, {
      listName: '稍后播放',
      listKind: 'temporary',
    });
    return;
  }
  playTracksLater([track]);
  if (playing || viewerStore.state.trackQueue.length > 0) {
    await playNextTrack({ manual: true });
  }
}

async function handlePlayerAction(action: string): Promise<void> {
  const normalized = action as MusicDeepLinkPlayerAction;
  switch (normalized) {
    case 'play':
      if (hasAudioShellHandlers()) {
        audioShellPlay();
      } else {
        const track = currentTrack();
        if (track) await playAsTemp([track], viewerStore.state.trackIndex, {
          listName: viewerStore.state.playerListName ?? '播放队列',
          listKind: 'temporary',
        });
      }
      return;
    case 'pause':
      if (hasAudioShellHandlers()) {
        audioShellPause();
      }
      return;
    case 'togglePlay':
      if (hasAudioShellHandlers()) audioShellTogglePlay();
      return;
    case 'skipNext':
      if (hasAudioShellHandlers()) audioShellSkipNext();
      else await playNextTrack({ manual: true });
      return;
    case 'skipPrev':
      if (hasAudioShellHandlers()) audioShellSkipPrev();
      else await playPrevTrack({ manual: true });
      return;
    case 'collect': {
      const track = currentTrack();
      if (!track) return;
      await addTrackToLove(track.id);
      showAppToast({ title: '已收藏', variant: 'success' });
      return;
    }
    case 'uncollect': {
      const track = currentTrack();
      if (!track) return;
      await removeTrackFromLove(track.id);
      showAppToast({ title: '已取消收藏', variant: 'success' });
      return;
    }
    case 'dislike': {
      const track = currentTrack();
      if (!track) return;
      await dislikeTrack(track);
      return;
    }
    default:
      throw new Error(`Unknown player action: ${action || '(empty)'}`);
  }
}

async function handleMusicPlay(params: Record<string, unknown>): Promise<void> {
  const data = params.data;
  if (!data || typeof data !== 'object') throw new Error('music data missing');
  const track = lxMusicInfoToTrack(data as Record<string, unknown>);
  await playTrackNow(track);
}

async function handleMusicSearchPlay(
  paths: string[],
  params: Record<string, unknown>,
): Promise<void> {
  let name = '';
  let singer = '';
  let albumName = '';
  let interval = '';
  let playLater = false;

  if (paths.length > 0) {
    const raw = paths[0]!.trim();
    if (raw.includes('-')) {
      const [n, s] = raw.split('-').map((v) => v.trim());
      name = n ?? '';
      singer = s ?? '';
    } else {
      name = raw;
    }
  } else if (params.data && typeof params.data === 'object') {
    const data = params.data as Record<string, unknown>;
    name = String(data.name ?? '').trim();
    singer = String(data.singer ?? data.artist ?? '').trim();
    albumName = String(data.albumName ?? '').trim();
    interval = String(data.interval ?? '').trim();
    playLater = data.playLater === true;
  } else {
    name = String(params.name ?? params.keyword ?? '').trim();
    singer = String(params.singer ?? '').trim();
  }

  if (!name) throw new Error('Keyword missing');

  const seed: AudioTrack = {
    id: buildTrackId('local', `sp_${name}_${singer}`),
    name,
    artist: singer,
    source: 'local',
    duration: interval || '00:00',
    meta: { albumName: albumName || undefined },
  };
  const matches = await findMusic(seed);
  if (matches.length === 0) {
    showAppToast({ title: '未找到匹配歌曲', variant: 'warning' });
    return;
  }
  const track = matches[0]!;
  if (playLater) {
    playTracksLater([track]);
    showAppToast({ title: '已添加到下一首播放', variant: 'success' });
    return;
  }
  await playTrackNow(track);
}

async function handleSonglistPlay(
  paths: string[],
  params: Record<string, unknown>,
): Promise<void> {
  let source = (params.source as string | undefined) ?? paths[0];
  let idOrUrl =
    (params.id as string | undefined) ??
    (params.url as string | undefined) ??
    paths[1];
  let index =
    typeof params.index === 'number'
      ? params.index
      : params.index != null
        ? Number(params.index)
        : paths[2] != null
          ? Number(paths[2])
          : 0;

  if (params.data && typeof params.data === 'object') {
    const data = params.data as Record<string, unknown>;
    source = String(data.source ?? source ?? '');
    idOrUrl = String(data.id ?? data.url ?? idOrUrl ?? '');
    if (data.index != null) index = Number(data.index);
  }

  if (!idOrUrl) throw new Error('id or url missing');
  if (source && !ONLINE_SOURCES.has(source)) {
    throw new Error(`Unknown source: ${source}`);
  }

  navigateToMusicHub({ section: 'songlist' });
  setMusicSection('songlist');
  const ok = await openListFromUrlInput(
    String(idOrUrl),
    source && ONLINE_SOURCES.has(source) ? (source as MusicSdkSource) : undefined,
  );
  if (!ok) throw new Error('打开歌单失败');

  const { getSongListState } = await import('@/stores/music-hub/songList');
  const detail = getSongListState().detail;
  if (!detail || detail.tracks.length === 0) {
    showAppToast({ title: '歌单暂无歌曲', variant: 'warning' });
    return;
  }
  const start = Number.isFinite(index)
    ? Math.max(0, Math.min(Math.floor(index), detail.tracks.length - 1))
    : 0;
  await playAsTemp(detail.tracks, start, {
    listName: detail.info.name ?? '在线歌单',
    listKind: 'online-playlist',
  });
}

async function handleLegacySearch(params: Record<string, unknown>): Promise<void> {
  const keyword = String(
    params.keyword ?? params.key ?? params.text ?? '',
  ).trim();
  if (!keyword) throw new Error('Keyword missing');
  navigateToMusicHub({ section: 'search' });
  setMusicSection('search');
  const { setSearchKeyword, runSearch } = await import('@/stores/music-hub/search');
  setSearchKeyword(keyword);
  await runSearch();
}

async function handleLegacySonglistOpen(
  params: Record<string, unknown>,
): Promise<void> {
  const url = String(params.url ?? params.id ?? '').trim();
  const source = params.source as MusicSdkSource | undefined;
  if (!url) throw new Error('id or url missing');
  navigateToMusicHub({ section: 'songlist' });
  setMusicSection('songlist');
  const ok = await openListFromUrlInput(url, source);
  if (!ok) throw new Error('打开歌单失败');
}

export async function handleMusicDeepLink(uri: string): Promise<boolean> {
  const trimmed = uri.trim();
  if (/^musicfree:\/\//i.test(trimmed)) {
    return handleMusicFreeDeepLink(trimmed);
  }
  if (!isMusicDeepLink(uri)) return false;
  try {
    const parsed = parseMusicDeepLink(uri);
    const { type, action, paths, params } = parsed;

    switch (type) {
      case 'player':
        navigateToMusicHub({ section: 'nowPlaying' });
        await handlePlayerAction(action);
        return true;
      case 'music':
        navigateToMusicHub({ section: 'nowPlaying' });
        if (action === 'play') {
          await handleMusicPlay(params);
          return true;
        }
        if (action === 'searchPlay') {
          await handleMusicSearchPlay(paths, params);
          return true;
        }
        throw new Error(`Unknown music action: ${action || '(empty)'}`);
      case 'songlist':
      case 'playlist':
        if (action === 'play') {
          await handleSonglistPlay(paths, params);
          return true;
        }
        // 旧式：lxmusic://songlist?url=
        await handleLegacySonglistOpen(params);
        return true;
      case 'search':
        await handleLegacySearch(params);
        return true;
      default:
        // 兼容 pathname 风格误解析：hostname 为空时 type 可能为空
        if (!type && params.keyword) {
          await handleLegacySearch(params);
          return true;
        }
        throw new Error(`Unknown type: ${type || '(empty)'}`);
    }
  } catch (err) {
    showAppToast({
      title: '音乐链接解析失败',
      description: toUserFacingMusicError(err, '音乐链接解析失败'),
      variant: 'destructive',
    });
    return true;
  }
}

/** `musicfree://install/<url[,url...]>` 批量安装插件 */
async function handleMusicFreeDeepLink(uri: string): Promise<boolean> {
  try {
    const withoutScheme = uri.replace(/^musicfree:\/\//i, '');
    const [head, ...rest] = withoutScheme.split('/').filter(Boolean);
    const action = (head ?? '').toLowerCase();
    if (action !== 'install' && action !== 'app') {
      throw new Error(`未知 musicfree 动作: ${action || '(empty)'}`);
    }
    if (action === 'app') {
      navigateToMusicHub({ section: 'settings' });
      return true;
    }
    const raw = rest.join('/');
    const qIndex = raw.indexOf('?');
    const pathPart = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
    let decoded = pathPart;
    try {
      decoded = decodeURIComponent(pathPart);
    } catch {
      /* keep */
    }
    const urls = decoded
      .split(',')
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\//i.test(u));
    if (urls.length === 0) throw new Error('install 链接缺少插件 URL');
    if (
      !window.confirm(
        `要安装 ${urls.length} 个 MusicFree 插件吗？`,
      )
    ) {
      return true;
    }
    const { importMfPluginFromUrl } = await import('@/lib/media/audio/online/mf-plugin');
    let ok = 0;
    for (const url of urls) {
      const result = await importMfPluginFromUrl(url);
      if (result.ok) ok += 1;
    }
    navigateToMusicHub({ section: 'settings' });
    showAppToast({
      title: `MusicFree 插件安装完成`,
      description: `成功 ${ok} / ${urls.length}`,
      variant: ok > 0 ? 'success' : 'warning',
    });
    return true;
  } catch (err) {
    showAppToast({
      title: 'MusicFree 链接解析失败',
      description: toUserFacingMusicError(err),
      variant: 'destructive',
    });
    return true;
  }
}
