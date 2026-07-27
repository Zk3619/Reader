/**
 * 底栏右侧：画质选择 + 字幕 / 字幕设置
 * 弹层样式对齐 Artplayer 原生 settings / selector
 */

import type Artplayer from 'artplayer';
import type { Sub } from '@/lib/media/tv/types';
import type { PlayQuality } from '@/lib/media/tv/play/parse-play-qualities';
import {
  getSubtitleStylePrefs,
  resetSubtitleStylePrefs,
  setSubtitleStylePrefs,
  subtitleStyleToCss,
  SUBTITLE_COLOR_OPTIONS,
  SUBTITLE_POSITION_OPTIONS,
  SUBTITLE_SIZE_OPTIONS,
  SUBTITLE_STROKE_OPTIONS,
  type SubtitleStylePrefs,
} from '@/lib/media/video/artplayer/subtitle-style-prefs';
import { getArtplayerIdleChrome } from '@/lib/media/video/artplayer/attach-idle-chrome';
import { lucideIconHtml } from '@/lib/media/video/artplayer/lucide-icons';

const QUALITY_NAME = 'reader-quality';
const SUBTITLE_NAME = 'reader-subtitle';
const POPUP_CLASS = 'reader-art-bar-popup';

const ICON_CHECK = lucideIconHtml('check', { size: 15 });
const ICON_SWITCH_ON = lucideIconHtml('toggle-right', { size: 22 });
const ICON_SWITCH_OFF = lucideIconHtml('toggle-left', { size: 22 });
const ICON_CHEVRON_RIGHT = lucideIconHtml('chevron-right', { size: 18 });
const ICON_CHEVRON_LEFT = lucideIconHtml('chevron-left', { size: 18 });

function mkCheckIcon(): HTMLElement {
  const i = document.createElement('i');
  i.className = 'art-icon art-icon-check';
  i.innerHTML = ICON_CHECK;
  return i;
}

function mkSwitch(on: boolean): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'reader-art-switch';
  wrap.dataset.on = String(on);
  wrap.innerHTML = on ? ICON_SWITCH_ON : ICON_SWITCH_OFF;
  return wrap;
}

function setSwitchState(el: HTMLElement, on: boolean): void {
  el.dataset.on = String(on);
  el.innerHTML = on ? ICON_SWITCH_ON : ICON_SWITCH_OFF;
}

function mkSelectableItem(
  label: string,
  active: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'reader-art-bar-popup-item';
  btn.dataset.active = String(active);
  if (active) btn.classList.add('art-current');
  const text = document.createElement('span');
  text.textContent = label;
  btn.append(text, mkCheckIcon());
  btn.addEventListener('click', onClick);
  return btn;
}

export type QualitySubtitleHandlers = {
  getQualities: () => PlayQuality[];
  getQualityIndex: () => number;
  onSelectQuality: (index: number) => void | Promise<void>;
  getSubtitles: () => Sub[];
  getActiveSubtitleUrl: () => string;
  onSelectSubtitle: (url: string | null) => void | Promise<void>;
};

function closeAllPopups(root?: HTMLElement | null): void {
  const scope = root ?? document;
  scope.querySelectorAll(`.${POPUP_CLASS}`).forEach((el) => el.remove());
  getArtplayerIdleChrome()?.unpin();
}

function playerRoot(art: Artplayer): HTMLElement | null {
  return (art.template as { $player?: HTMLElement } | undefined)?.$player ?? null;
}

function applySubtitleStyle(art: Artplayer, prefs = getSubtitleStylePrefs()): void {
  try {
    const css = subtitleStyleToCss(prefs);
    art.subtitle.style(css);
    const $sub = (art.template as { $subtitle?: HTMLElement }).$subtitle;
    if ($sub) {
      $sub.classList.toggle('reader-sub-top', prefs.position === 'top');
      $sub.classList.toggle('reader-sub-fade', prefs.fade);
      $sub.dataset.scale = prefs.scaleWithPlayer ? '1' : '0';
    }
  } catch {
    /* */
  }
}

function openPopupNear(
  art: Artplayer,
  anchor: HTMLElement,
  build: (popup: HTMLElement, close: () => void) => void,
): void {
  const root = playerRoot(art);
  if (!root) return;
  closeAllPopups(root);
  getArtplayerIdleChrome()?.pin();

  const popup = document.createElement('div');
  popup.className = POPUP_CLASS;
  popup.addEventListener('click', (e) => e.stopPropagation());
  popup.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  const close = () => {
    popup.remove();
    getArtplayerIdleChrome()?.unpin();
  };

  build(popup, close);
  root.appendChild(popup);

  // 定位到按钮上方
  const a = anchor.getBoundingClientRect();
  const r = root.getBoundingClientRect();
  const pw = popup.offsetWidth || 200;
  let left = a.left - r.left + a.width / 2 - pw / 2;
  left = Math.max(8, Math.min(left, r.width - pw - 8));
  popup.style.left = `${left}px`;
  popup.style.bottom = `${r.bottom - a.top + 8}px`;

  const onDoc = (e: MouseEvent) => {
    if (e.target instanceof Node && (popup.contains(e.target) || anchor.contains(e.target))) {
      return;
    }
    close();
    document.removeEventListener('mousedown', onDoc, true);
  };
  window.setTimeout(() => document.addEventListener('mousedown', onDoc, true), 0);
}

function buildQualityPopup(
  art: Artplayer,
  handlers: QualitySubtitleHandlers,
  anchor: HTMLElement,
  labelEl: HTMLElement,
): void {
  openPopupNear(art, anchor, (popup, close) => {
    popup.classList.add('reader-art-bar-popup--quality');
    const list = handlers.getQualities();
    const cur = handlers.getQualityIndex();
    for (let i = 0; i < list.length; i++) {
      const q = list[i]!;
      popup.append(
        mkSelectableItem(q.name, i === cur, () => {
          void Promise.resolve(handlers.onSelectQuality(i)).then(() => {
            labelEl.textContent =
              handlers.getQualities()[handlers.getQualityIndex()]?.name ?? q.name;
            close();
          });
        }),
      );
    }
  });
}

function subLabel(s: Sub, index: number): string {
  return (s.name || s.lang || `字幕${index + 1}`).trim() || `字幕${index + 1}`;
}

function detectSubType(url: string): 'vtt' | 'srt' | 'ass' {
  const lower = url.toLowerCase();
  if (lower.endsWith('.ass') || lower.endsWith('.ssa')) return 'ass';
  if (lower.endsWith('.srt')) return 'srt';
  return 'vtt';
}

function buildSubtitleSettingsView(
  art: Artplayer,
  body: HTMLElement,
  back: () => void,
): void {
  body.replaceChildren();
  const head = document.createElement('button');
  head.type = 'button';
  head.className = 'reader-art-bar-popup-back';
  const backIcon = document.createElement('span');
  backIcon.className = 'reader-art-bar-back-icon';
  backIcon.innerHTML = ICON_CHEVRON_LEFT;
  const backText = document.createElement('span');
  backText.textContent = '字幕设置';
  head.append(backIcon, backText);
  head.addEventListener('click', back);
  body.append(head);

  const grid = document.createElement('div');
  grid.className = 'reader-art-sub-settings-grid';

  const addSelect = (
    label: string,
    options: Array<{ value: string; label: string }>,
    current: string,
    onChange: (v: string) => void,
  ) => {
    const cell = document.createElement('label');
    cell.className = 'reader-art-sub-settings-cell';
    const title = document.createElement('span');
    title.textContent = label;
    const sel = document.createElement('select');
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      if (o.value === current) opt.selected = true;
      sel.append(opt);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    cell.append(title, sel);
    grid.append(cell);
  };

  let prefs = getSubtitleStylePrefs();
  const sync = (patch: Partial<SubtitleStylePrefs>) => {
    prefs = setSubtitleStylePrefs(patch);
    applySubtitleStyle(art, prefs);
  };

  addSelect(
    '字幕大小',
    SUBTITLE_SIZE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    prefs.size,
    (v) => sync({ size: v as SubtitleStylePrefs['size'] }),
  );
  addSelect(
    '字幕颜色',
    SUBTITLE_COLOR_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    prefs.color,
    (v) => sync({ color: v as SubtitleStylePrefs['color'] }),
  );
  addSelect(
    '描边方式',
    SUBTITLE_STROKE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    prefs.stroke,
    (v) => sync({ stroke: v as SubtitleStylePrefs['stroke'] }),
  );
  addSelect(
    '默认位置',
    SUBTITLE_POSITION_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    prefs.position,
    (v) => sync({ position: v as SubtitleStylePrefs['position'] }),
  );
  body.append(grid);

  const opacityRow = document.createElement('label');
  opacityRow.className = 'reader-art-sub-opacity';
  const opMeta = document.createElement('div');
  opMeta.className = 'reader-art-sub-opacity-meta';
  const opLabel = document.createElement('span');
  opLabel.textContent = '背景不透明度';
  const opVal = document.createElement('span');
  opVal.textContent = `${Math.round(prefs.bgOpacity * 100)}%`;
  opMeta.append(opLabel, opVal);
  const range = document.createElement('input');
  range.type = 'range';
  range.min = '0';
  range.max = '100';
  range.value = String(Math.round(prefs.bgOpacity * 100));
  range.addEventListener('input', () => {
    const n = Number(range.value) / 100;
    opVal.textContent = `${Math.round(n * 100)}%`;
    sync({ bgOpacity: n });
  });
  opacityRow.append(opMeta, range);
  body.append(opacityRow);

  const other = document.createElement('div');
  other.className = 'reader-art-sub-other';
  const otherTitle = document.createElement('div');
  otherTitle.className = 'reader-art-sub-other-title';
  otherTitle.textContent = '其它设置';
  other.append(otherTitle);

  const addCheck = (label: string, key: 'scaleWithPlayer' | 'fade') => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'reader-art-sub-check';
    const span = document.createElement('span');
    span.textContent = label;
    const sw = mkSwitch(prefs[key]);
    row.append(span, sw);
    row.addEventListener('click', () => {
      const next = !prefs[key];
      setSwitchState(sw, next);
      sync({ [key]: next });
    });
    other.append(row);
  };
  addCheck('等比缩放', 'scaleWithPlayer');
  addCheck('淡入淡出', 'fade');
  body.append(other);

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'reader-art-sub-reset';
  reset.textContent = '恢复默认设置';
  reset.addEventListener('click', () => {
    prefs = resetSubtitleStylePrefs();
    applySubtitleStyle(art, prefs);
    buildSubtitleSettingsView(art, body, back);
  });
  body.append(reset);
}

function buildSubtitlePopup(
  art: Artplayer,
  handlers: QualitySubtitleHandlers,
  anchor: HTMLElement,
): void {
  openPopupNear(art, anchor, (popup, close) => {
    popup.classList.add('reader-art-bar-popup--subtitle');
    const body = document.createElement('div');
    body.className = 'reader-art-bar-popup-body';
    popup.append(body);

    const renderMain = () => {
      body.replaceChildren();
      const head = document.createElement('div');
      head.className = 'reader-art-bar-popup-section-title';
      head.textContent = '字幕';
      body.append(head);

      const tracks = handlers.getSubtitles();
      const active = handlers.getActiveSubtitleUrl().trim();

      const addTrack = (label: string, url: string | null) => {
        const isOn = url == null ? !active : active === url;
        body.append(
          mkSelectableItem(label, isOn, () => {
            void Promise.resolve(handlers.onSelectSubtitle(url)).then(() => {
              close();
            });
          }),
        );
      };

      addTrack('关闭', null);
      tracks.forEach((s, i) => {
        const url = s.url?.trim();
        if (!url) return;
        addTrack(subLabel(s, i), url);
      });
      // 若仅有 playSubtitleUrl 不在列表中，补一项
      if (active && !tracks.some((t) => t.url?.trim() === active)) {
        addTrack('当前字幕', active);
      }

      const sep1 = document.createElement('div');
      sep1.className = 'reader-art-bar-popup-sep';
      body.append(sep1);

      const bilingual = document.createElement('button');
      bilingual.type = 'button';
      bilingual.className = 'reader-art-bar-popup-toggle';
      const biText = document.createElement('span');
      biText.textContent = '双语字幕';
      let biOn = getSubtitleStylePrefs().bilingual;
      const biSw = mkSwitch(biOn);
      bilingual.append(biText, biSw);
      bilingual.addEventListener('click', () => {
        biOn = !biOn;
        setSwitchState(biSw, biOn);
        setSubtitleStylePrefs({ bilingual: biOn });
      });
      body.append(bilingual);

      const sep2 = document.createElement('div');
      sep2.className = 'reader-art-bar-popup-sep';
      body.append(sep2);

      const settings = document.createElement('button');
      settings.type = 'button';
      settings.className = 'reader-art-bar-popup-item reader-art-bar-popup-item--nav';
      const settingsLabel = document.createElement('span');
      settingsLabel.textContent = '字幕设置';
      const chevron = document.createElement('span');
      chevron.className = 'reader-art-bar-chevron';
      chevron.innerHTML = ICON_CHEVRON_RIGHT;
      settings.append(settingsLabel, chevron);
      settings.addEventListener('click', () => {
        buildSubtitleSettingsView(art, body, renderMain);
      });
      body.append(settings);
    };

    renderMain();
  });
}

export function attachQualitySubtitleControls(
  art: Artplayer,
  handlers: QualitySubtitleHandlers,
): () => void {
  const names: string[] = [];
  let qualityHost: HTMLElement | null = null;
  let subtitleHost: HTMLElement | null = null;

  const qList = () => handlers.getQualities().filter((q) => !!q.url?.trim());
  if (qList().length > 1) {
    const cur = Math.min(Math.max(handlers.getQualityIndex(), 0), qList().length - 1);
    const label = qList()[cur]?.name || '画质';
    art.controls.add({
      name: QUALITY_NAME,
      position: 'right',
      index: 8,
      html: `<span class="reader-art-bar-text">${label}</span>`,
      mounted: ($el) => {
        qualityHost = $el;
      },
      click: () => {
        if (!qualityHost) return;
        const labelEl =
          (qualityHost.querySelector('.reader-art-bar-text') as HTMLElement | null) ??
          qualityHost;
        buildQualityPopup(art, handlers, qualityHost, labelEl);
      },
    });
    names.push(QUALITY_NAME);
  }

  art.controls.add({
    name: SUBTITLE_NAME,
    position: 'right',
    index: 9,
    html: '<span class="reader-art-bar-text">字幕</span>',
    mounted: ($el) => {
      subtitleHost = $el;
    },
    click: () => {
      if (!subtitleHost) return;
      buildSubtitlePopup(art, handlers, subtitleHost);
    },
  });
  names.push(SUBTITLE_NAME);

  applySubtitleStyle(art);
  const activeUrl = handlers.getActiveSubtitleUrl().trim();
  if (activeUrl) {
    void art.subtitle
      .switch(activeUrl, {
        type: detectSubType(activeUrl),
        style: subtitleStyleToCss(),
      })
      .catch(() => undefined);
  }

  return () => {
    closeAllPopups(playerRoot(art));
    for (const name of names) {
      try {
        art.controls.remove(name);
      } catch {
        /* */
      }
    }
  };
}

export { applySubtitleStyle, detectSubType };
