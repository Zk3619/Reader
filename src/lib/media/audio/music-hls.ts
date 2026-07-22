/**
 * 音乐 HLS (m3u8) 播放 — 对齐 MusicFree Desktop hls.js
 */

import Hls from 'hls.js';

const hlsByAudio = new WeakMap<HTMLAudioElement, Hls>();

export function isHlsUrl(url: string): boolean {
  const u = url.split('?')[0]?.toLowerCase() ?? '';
  return u.endsWith('.m3u8') || u.includes('.m3u8');
}

export function attachHlsToAudio(audio: HTMLAudioElement, url: string): () => void {
  detachHlsFromAudio(audio);
  if (Hls.isSupported()) {
    const hls = new Hls({ enableWorker: true });
    hls.loadSource(url);
    hls.attachMedia(audio);
    hlsByAudio.set(audio, hls);
    return () => {
      hls.destroy();
      hlsByAudio.delete(audio);
    };
  }
  if (audio.canPlayType('application/vnd.apple.mpegurl')) {
    audio.src = url;
    return () => {
      if (audio.src === url) audio.removeAttribute('src');
    };
  }
  audio.src = url;
  return () => {
    if (audio.src === url) audio.removeAttribute('src');
  };
}

export function detachHlsFromAudio(audio: HTMLAudioElement): void {
  const hls = hlsByAudio.get(audio);
  if (hls) {
    hls.destroy();
    hlsByAudio.delete(audio);
  }
}
