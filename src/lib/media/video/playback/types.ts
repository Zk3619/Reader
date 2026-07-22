/**
 * 影视 PlaybackEngine 协议（E0 冻结）
 * @see docs/VIDEO_PLAYBACK_KERNEL.md
 */

export type PlaybackEngineId = 'artplayer' | 'libmpv' | 'media3' | 'external';

export type Anime4KMode = 'off' | 'A' | 'B' | 'C' | 'AA' | 'BB' | 'CA';
export type Anime4KQuality = 'fast' | 'balanced' | 'high';

export type PlaybackLoadOptions = {
  url: string;
  title?: string;
  headers?: Record<string, string>;
  startSec?: number;
  subtitle?: string;
  audioTrack?: string | number;
  anime4k?: { mode: Anime4KMode; quality?: Anime4KQuality };
};

export type PlaybackTrackInfo = { id: string; label: string };

export interface PlaybackEngine {
  readonly id: PlaybackEngineId;
  load(opts: PlaybackLoadOptions): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(sec: number): Promise<void>;
  getPosition(): Promise<number>;
  getDuration(): Promise<number>;
  listAudioTracks(): Promise<PlaybackTrackInfo[]>;
  listSubtitleTracks(): Promise<PlaybackTrackInfo[]>;
  setAudioTrack(id: string): Promise<void>;
  setSubtitleTrack(id: string | 'no'): Promise<void>;
  destroy(): Promise<void>;
}

export type PlaybackRouteInput = {
  url: string;
  /** file / webdav / hub_stream / sniff / bangumi */
  sourceKind?: 'file' | 'webdav' | 'hub_stream' | 'sniff' | 'bangumi' | 'remote';
  forceEngine?: PlaybackEngineId;
};
