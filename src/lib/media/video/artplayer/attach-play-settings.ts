/**
 * 播放设置：挂到 Artplayer 原生 setting
 * 全局偏好经 play-settings-prefs 持久化；影视 / 阅读器共用同一套面板
 */

import Artplayer from 'artplayer';
import type { Setting } from 'artplayer';
import { lucideIconHtml } from '@/lib/media/video/artplayer/lucide-icons';
import {
  ARTPLAYER_PLAYBACK_RATES,
  flipAxesTooltip,
  getArtplayerPlaySettings,
  setArtplayerPlaySettings,
  type ArtplayerAspectRatio,
  type ArtplayerPlayMode,
  type ArtplayerPlaySettings,
} from '@/lib/media/video/artplayer/play-settings-prefs';

const TOP_NAMES = [
  'reader-flip',
  'reader-loop',
  'reader-autoplay',
  'reader-playback-rate',
  'reader-more',
] as const;

const ICON_FLIP = lucideIconHtml('flip-horizontal-2');
const ICON_LOOP = lucideIconHtml('repeat-1');
const ICON_AUTOPLAY = lucideIconHtml('circle-play');
const ICON_RATE = lucideIconHtml('gauge');
const ICON_MORE = lucideIconHtml('ellipsis');
const ICON_PLAY_MODE = lucideIconHtml('list-video');
const ICON_ASPECT = lucideIconHtml('ratio');
const ICON_CROP = lucideIconHtml('crop');

function onOffLabel(on: boolean): string {
  return on ? '开' : '关';
}

function playModeLabel(mode: ArtplayerPlayMode): string {
  return mode === 'autoNext' ? '自动续播' : '播完暂停';
}

function aspectLabel(ratio: ArtplayerAspectRatio): string {
  if (ratio === 'default') return '自动';
  return ratio;
}

function rateLabel(rate: number): string {
  return rate === 1 ? '正常' : `${rate}`;
}

function nearestMenuRate(rate: number): number {
  let best: number = ARTPLAYER_PLAYBACK_RATES[2];
  let bestDist = Infinity;
  for (const r of ARTPLAYER_PLAYBACK_RATES) {
    const d = Math.abs(r - rate);
    if (d < bestDist) {
      bestDist = d;
      best = r;
    }
  }
  return best;
}

function applyFlipAxes(
  art: Artplayer,
  prefs: Pick<ArtplayerPlaySettings, 'flipHorizontal' | 'flipVertical'>,
): void {
  const $player = art.template?.$player as HTMLElement | undefined;
  if (!$player) return;
  delete $player.dataset.flip;
  $player.classList.toggle('reader-flip-h', prefs.flipHorizontal);
  $player.classList.toggle('reader-flip-v', prefs.flipVertical);
}

/** 将偏好应用到当前 Artplayer 实例 */
export function applyArtplayerPlaySettings(
  art: Artplayer,
  prefs: ArtplayerPlaySettings,
): void {
  try {
    art.option.loop = prefs.loop;
  } catch {
    /* */
  }
  try {
    art.aspectRatio = prefs.aspectRatio;
  } catch {
    /* */
  }
  applyFlipAxes(art, prefs);
  try {
    art.notice.show = false;
  } catch {
    /* */
  }
  const $player = art.template?.$player as HTMLElement | undefined;
  if ($player) {
    $player.classList.toggle('reader-art-hide-black-bars', prefs.hideBlackBars);
  }
}

/**
 * 在已启用原生 setting 的 Artplayer 上注入全局选项。
 */
export function attachBilibiliPlaySettings(art: Artplayer): () => void {
  let prefs = getArtplayerPlaySettings();
  applyArtplayerPlaySettings(art, prefs);

  if (!art.option.setting) {
    return () => undefined;
  }

  const patch = (partial: Partial<ArtplayerPlaySettings>) => {
    prefs = setArtplayerPlaySettings(partial);
    applyArtplayerPlaySettings(art, prefs);
    return prefs;
  };

  const moreWidth =
    (Artplayer as typeof Artplayer & { SETTING_ITEM_WIDTH?: number }).SETTING_ITEM_WIDTH ??
    (art.constructor as typeof Artplayer & { SETTING_ITEM_WIDTH?: number })
      .SETTING_ITEM_WIDTH ??
    200;

  const menuRate = nearestMenuRate(prefs.playbackRate);

  const items: Setting[] = [
    {
      name: 'reader-flip',
      html: '画面翻转',
      icon: ICON_FLIP,
      tooltip: flipAxesTooltip(prefs),
      width: moreWidth,
      selector: [
        {
          name: 'reader-flip-h',
          html: '水平',
          switch: prefs.flipHorizontal,
          onSwitch(item) {
            const next = !item.switch;
            const p = patch({ flipHorizontal: next });
            const parent = art.setting.find('reader-flip');
            if (parent) parent.tooltip = flipAxesTooltip(p);
            return next;
          },
        },
        {
          name: 'reader-flip-v',
          html: '垂直',
          switch: prefs.flipVertical,
          onSwitch(item) {
            const next = !item.switch;
            const p = patch({ flipVertical: next });
            const parent = art.setting.find('reader-flip');
            if (parent) parent.tooltip = flipAxesTooltip(p);
            return next;
          },
        },
      ],
    },
    {
      name: 'reader-loop',
      html: '单集循环',
      icon: ICON_LOOP,
      tooltip: onOffLabel(prefs.loop),
      switch: prefs.loop,
      onSwitch(item) {
        const next = !item.switch;
        patch({ loop: next });
        item.tooltip = onOffLabel(next);
        return next;
      },
    },
    {
      name: 'reader-autoplay',
      html: '自动开播',
      icon: ICON_AUTOPLAY,
      tooltip: onOffLabel(prefs.autoplay),
      switch: prefs.autoplay,
      onSwitch(item) {
        const next = !item.switch;
        patch({ autoplay: next });
        item.tooltip = onOffLabel(next);
        return next;
      },
    },
    {
      name: 'reader-playback-rate',
      html: '播放速度',
      icon: ICON_RATE,
      tooltip: rateLabel(menuRate),
      width: moreWidth,
      selector: ARTPLAYER_PLAYBACK_RATES.map((rate) => ({
        name: `reader-playback-rate-${rate}`,
        html: rateLabel(rate),
        value: rate,
        default: rate === menuRate,
      })),
      onSelect(item) {
        const value = typeof item.value === 'number' ? item.value : Number(item.value) || 1;
        try {
          art.playbackRate = value;
          art.notice.show = false;
        } catch {
          /* */
        }
        patch({ playbackRate: value });
        return rateLabel(value);
      },
    },
    {
      name: 'reader-more',
      html: '更多播放设置',
      icon: ICON_MORE,
      tooltip: '',
      width: Math.max(260, moreWidth),
      selector: [
        {
          name: 'reader-play-mode',
          html: '播放方式',
          icon: ICON_PLAY_MODE,
          width: moreWidth,
          tooltip: playModeLabel(prefs.playMode),
          selector: [
            {
              name: 'reader-play-mode-autoNext',
              html: '自动续播',
              value: 'autoNext',
              default: prefs.playMode === 'autoNext',
            },
            {
              name: 'reader-play-mode-pause',
              html: '播完暂停',
              value: 'pause',
              default: prefs.playMode === 'pause',
            },
          ],
          onSelect(item) {
            const value = (item.value as ArtplayerPlayMode) || 'autoNext';
            patch({ playMode: value });
            return playModeLabel(value);
          },
        },
        {
          name: 'reader-aspect-ratio',
          html: '视频比例',
          icon: ICON_ASPECT,
          width: moreWidth,
          tooltip: aspectLabel(prefs.aspectRatio),
          selector: [
            {
              name: 'reader-aspect-default',
              html: '自动',
              value: 'default',
              default: prefs.aspectRatio === 'default',
            },
            {
              name: 'reader-aspect-4-3',
              html: '4:3',
              value: '4:3',
              default: prefs.aspectRatio === '4:3',
            },
            {
              name: 'reader-aspect-16-9',
              html: '16:9',
              value: '16:9',
              default: prefs.aspectRatio === '16:9',
            },
          ],
          onSelect(item) {
            const value = (item.value as ArtplayerAspectRatio) || 'default';
            patch({ aspectRatio: value });
            return aspectLabel(value);
          },
        },
        {
          name: 'reader-hide-black-bars',
          html: '隐藏黑边',
          icon: ICON_CROP,
          tooltip: onOffLabel(prefs.hideBlackBars),
          switch: prefs.hideBlackBars,
          onSwitch(item) {
            const next = !item.switch;
            patch({ hideBlackBars: next });
            item.tooltip = onOffLabel(next);
            return next;
          },
        },
      ],
    },
  ];

  for (const item of items) {
    try {
      art.setting.add(item);
    } catch {
      /* duplicate / destroyed */
    }
  }

  return () => {
    for (const name of TOP_NAMES) {
      try {
        art.setting.remove(name);
      } catch {
        /* already destroyed */
      }
    }
  };
}
