/**
 * 隐藏主壳顶栏时，用 Artplayer layers 叠加播放页顶栏
 *
 * 注意：art.layers 容器默认 display:none，必须 art.layers.show = true
 *（给播放器加上 art-layer-show）后叠层才可见。
 */

import Artplayer from 'artplayer';
import { lucideIconHtml } from '@/lib/media/video/artplayer/lucide-icons';

export interface TvPlayOverlayToolbarHandlers {
  onBack: () => void;
  onRefresh: () => void;
  /** 点击标题/描述进详情（可选） */
  onOpenDetail?: () => void;
  /** 收藏切换（可选；点播） */
  onToggleKeep?: () => void;
  /** 更多菜单动作 */
  onToggleHideHeader?: () => void;
  onToggleAggregated?: () => void;
  onToggleAutoSwitchFlag?: () => void;
  /** 聚合模式下打开播放器弹层 */
  onOpenFlagPanel?: () => void;
  onOpenParsePanel?: () => void;
  onOpenEpisodePanel?: () => void;
  /** 初始状态 */
  kept?: boolean;
  hideHeader?: boolean;
  aggregated?: boolean;
  autoSwitchFlag?: boolean;
  showKeep?: boolean;
  showAggregatedPanels?: boolean;
  showParsePanel?: boolean;
  showFlagPanel?: boolean;
  /** 更多菜单：换源 / 外置 / 增强 */
  showPlayToolsInMore?: boolean;
  enhanceLabel?: '增强' | 'Web增强';
  onSwitchSource?: () => void;
  onOpenExternal?: () => void;
  onOpenEnhance?: () => void;
}

export interface TvPlayOverlayToolbarHandle {
  update: (title: string, description: string) => void;
  setRefreshing: (busy: boolean) => void;
  setKept: (kept: boolean) => void;
  setMenuState: (s: {
    hideHeader?: boolean;
    aggregated?: boolean;
    autoSwitchFlag?: boolean;
    showPlayToolsInMore?: boolean;
    enhanceLabel?: '增强' | 'Web增强';
  }) => void;
  detach: () => void;
}

const LAYER_NAME = 'reader-tv-play-overlay';

/** 顶栏按钮：Artplayer 原生 hint tooltip（非浏览器 title） */
function btn(label: string, className: string): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.style.pointerEvents = 'auto';
  Artplayer.utils.tooltip(el, label, 'bottom');
  return el;
}

function keepTooltipLabel(kept: boolean): string {
  return kept ? '取消收藏' : '收藏';
}

function menuItem(label: string, checked?: boolean): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'reader-tv-play-overlay-menu-item';
  el.style.pointerEvents = 'auto';
  el.textContent = checked == null ? label : `${checked ? '✓ ' : ''}${label}`;
  return el;
}

export function attachTvPlayOverlayToolbar(
  art: Artplayer,
  handlers: TvPlayOverlayToolbarHandlers,
): TvPlayOverlayToolbarHandle {
  try {
    art.layers.remove(LAYER_NAME);
  } catch {
    /* */
  }

  let kept = handlers.kept === true;
  let hideHeader = handlers.hideHeader !== false;
  let aggregated = handlers.aggregated === true;
  let autoSwitchFlag = handlers.autoSwitchFlag !== false;
  let showPlayToolsInMore = handlers.showPlayToolsInMore === true;
  let enhanceLabel: '增强' | 'Web增强' = handlers.enhanceLabel ?? '增强';

  const root = document.createElement('div');
  root.className = 'reader-tv-play-overlay';
  root.setAttribute('data-artplayer-plugin', 'tv-play-overlay');

  const back = btn('返回', 'reader-tv-play-overlay-btn');
  back.innerHTML = lucideIconHtml('arrow-left', { size: 18 });

  const meta = document.createElement('div');
  meta.className = 'reader-tv-play-overlay-meta';
  const titleEl = document.createElement('div');
  titleEl.className = 'reader-tv-play-overlay-title';
  const descEl = document.createElement('div');
  descEl.className = 'reader-tv-play-overlay-desc';
  meta.append(titleEl, descEl);

  const actions = document.createElement('div');
  actions.className = 'reader-tv-play-overlay-actions';

  const keepBtn =
    handlers.showKeep && handlers.onToggleKeep
      ? btn(keepTooltipLabel(kept), 'reader-tv-play-overlay-btn')
      : null;
  if (keepBtn) {
    keepBtn.innerHTML = lucideIconHtml('star', { size: 18, filled: kept });
    keepBtn.classList.toggle('is-active', kept);
  }

  const refresh = btn('刷新', 'reader-tv-play-overlay-btn');
  refresh.innerHTML = lucideIconHtml('refresh-cw', {
    size: 18,
    className: 'reader-tv-play-overlay-refresh-icon',
  });

  const flagBtn =
    handlers.showAggregatedPanels && handlers.showFlagPanel && handlers.onOpenFlagPanel
      ? btn('线路', 'reader-tv-play-overlay-btn reader-tv-play-overlay-text-btn')
      : null;
  if (flagBtn) flagBtn.textContent = '线路';

  const parseBtn =
    handlers.showAggregatedPanels && handlers.showParsePanel && handlers.onOpenParsePanel
      ? btn('解析', 'reader-tv-play-overlay-btn reader-tv-play-overlay-text-btn')
      : null;
  if (parseBtn) parseBtn.textContent = '解析';

  const epBtn =
    handlers.showAggregatedPanels && handlers.onOpenEpisodePanel
      ? btn('选集', 'reader-tv-play-overlay-btn reader-tv-play-overlay-text-btn')
      : null;
  if (epBtn) epBtn.textContent = '选集';

  const more = btn('更多', 'reader-tv-play-overlay-btn');
  more.innerHTML = lucideIconHtml('ellipsis', { size: 18 });

  const menu = document.createElement('div');
  menu.className = 'reader-tv-play-overlay-menu';
  menu.hidden = true;
  menu.style.pointerEvents = 'auto';

  const itemHide = menuItem('隐藏顶栏', hideHeader);
  const itemAgg = menuItem('聚合播放', aggregated);
  const itemAuto = menuItem('失败自动切线路', autoSwitchFlag);

  const toolsSep = document.createElement('div');
  toolsSep.className = 'reader-tv-play-overlay-menu-sep';
  toolsSep.hidden = true;

  const itemSwitch = menuItem('换源');
  const itemExternal = menuItem('外置播放');
  const itemEnhance = menuItem(enhanceLabel);
  itemSwitch.hidden = true;
  itemExternal.hidden = true;
  itemEnhance.hidden = true;

  menu.append(
    itemHide,
    itemAgg,
    itemAuto,
    toolsSep,
    itemSwitch,
    itemExternal,
    itemEnhance,
  );

  const syncPlayToolsMenu = () => {
    const show = showPlayToolsInMore;
    toolsSep.hidden = !show;
    itemSwitch.hidden = !show || !handlers.onSwitchSource;
    itemExternal.hidden = !show || !handlers.onOpenExternal;
    itemEnhance.hidden = !show || !handlers.onOpenEnhance;
    itemEnhance.textContent = enhanceLabel;
  };
  syncPlayToolsMenu();

  // 顺序：线路 / 解析 / 选集 | 刷新 | 收藏 | 更多
  if (flagBtn) actions.append(flagBtn);
  if (parseBtn) actions.append(parseBtn);
  if (epBtn) actions.append(epBtn);
  actions.append(refresh);
  if (keepBtn) actions.append(keepBtn);
  actions.append(more);
  root.append(back, meta, actions, menu);

  const stop = (e: Event) => {
    e.stopPropagation();
  };

  const syncMenuLabels = () => {
    itemHide.textContent = `${hideHeader ? '✓ ' : ''}隐藏顶栏`;
    itemAgg.textContent = `${aggregated ? '✓ ' : ''}聚合播放`;
    itemAuto.textContent = `${autoSwitchFlag ? '✓ ' : ''}失败自动切线路`;
  };

  const onBack = (e: MouseEvent) => {
    stop(e);
    handlers.onBack();
  };
  const onRefresh = (e: MouseEvent) => {
    stop(e);
    handlers.onRefresh();
  };
  const onKeep = (e: MouseEvent) => {
    stop(e);
    handlers.onToggleKeep?.();
  };
  const onMore = (e: MouseEvent) => {
    stop(e);
    menu.hidden = !menu.hidden;
    if (!menu.hidden) {
      void import('@/lib/media/video/artplayer/attach-idle-chrome').then((m) => {
        m.getArtplayerIdleChrome()?.bump();
      });
    }
  };
  const onOpenDetail = (e: MouseEvent) => {
    stop(e);
    handlers.onOpenDetail?.();
  };
  const onItemHide = (e: MouseEvent) => {
    stop(e);
    menu.hidden = true;
    handlers.onToggleHideHeader?.();
  };
  const onItemAgg = (e: MouseEvent) => {
    stop(e);
    menu.hidden = true;
    handlers.onToggleAggregated?.();
  };
  const onItemAuto = (e: MouseEvent) => {
    stop(e);
    menu.hidden = true;
    handlers.onToggleAutoSwitchFlag?.();
  };
  const onItemSwitch = (e: MouseEvent) => {
    stop(e);
    menu.hidden = true;
    handlers.onSwitchSource?.();
  };
  const onItemExternal = (e: MouseEvent) => {
    stop(e);
    menu.hidden = true;
    handlers.onOpenExternal?.();
  };
  const onItemEnhance = (e: MouseEvent) => {
    stop(e);
    menu.hidden = true;
    handlers.onOpenEnhance?.();
  };
  const onFlag = (e: MouseEvent) => {
    stop(e);
    handlers.onOpenFlagPanel?.();
  };
  const onParse = (e: MouseEvent) => {
    stop(e);
    handlers.onOpenParsePanel?.();
  };
  const onEp = (e: MouseEvent) => {
    stop(e);
    handlers.onOpenEpisodePanel?.();
  };

  back.addEventListener('click', onBack);
  refresh.addEventListener('click', onRefresh);
  more.addEventListener('click', onMore);
  itemHide.addEventListener('click', onItemHide);
  itemAgg.addEventListener('click', onItemAgg);
  itemAuto.addEventListener('click', onItemAuto);
  itemSwitch.addEventListener('click', onItemSwitch);
  itemExternal.addEventListener('click', onItemExternal);
  itemEnhance.addEventListener('click', onItemEnhance);
  keepBtn?.addEventListener('click', onKeep);
  flagBtn?.addEventListener('click', onFlag);
  parseBtn?.addEventListener('click', onParse);
  epBtn?.addEventListener('click', onEp);

  if (handlers.onOpenDetail) {
    meta.classList.add('is-clickable');
    meta.setAttribute('role', 'button');
    meta.setAttribute('tabindex', '0');
    meta.style.pointerEvents = 'auto';
    meta.style.cursor = 'pointer';
    Artplayer.utils.tooltip(meta, '查看详情', 'bottom');
    meta.addEventListener('click', onOpenDetail);
    meta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onOpenDetail(e as unknown as MouseEvent);
      }
    });
  }
  root.addEventListener('mousedown', stop);
  root.addEventListener('pointerdown', stop);

  art.layers.add({
    name: LAYER_NAME,
    html: root,
    style: {
      position: 'absolute',
      inset: '0 auto auto 0',
      width: '100%',
      height: 'auto',
      zIndex: '70',
      pointerEvents: 'none',
    },
  });

  art.layers.show = true;

  return {
    update(title, description) {
      titleEl.textContent = title;
      descEl.textContent = description;
      descEl.style.display = description ? '' : 'none';
    },
    setRefreshing(busy) {
      refresh.classList.toggle('is-busy', busy);
      refresh.disabled = busy;
    },
    setKept(next) {
      kept = next;
      if (keepBtn) {
        keepBtn.innerHTML = lucideIconHtml('star', { size: 18, filled: kept });
        keepBtn.classList.toggle('is-active', kept);
        Artplayer.utils.tooltip(keepBtn, keepTooltipLabel(kept), 'bottom');
      }
    },
    setMenuState(s) {
      if (s.hideHeader != null) hideHeader = s.hideHeader;
      if (s.aggregated != null) aggregated = s.aggregated;
      if (s.autoSwitchFlag != null) autoSwitchFlag = s.autoSwitchFlag;
      if (s.showPlayToolsInMore != null) showPlayToolsInMore = s.showPlayToolsInMore;
      if (s.enhanceLabel != null) enhanceLabel = s.enhanceLabel;
      syncMenuLabels();
      syncPlayToolsMenu();
    },
    detach() {
      back.removeEventListener('click', onBack);
      refresh.removeEventListener('click', onRefresh);
      more.removeEventListener('click', onMore);
      itemHide.removeEventListener('click', onItemHide);
      itemAgg.removeEventListener('click', onItemAgg);
      itemAuto.removeEventListener('click', onItemAuto);
      itemSwitch.removeEventListener('click', onItemSwitch);
      itemExternal.removeEventListener('click', onItemExternal);
      itemEnhance.removeEventListener('click', onItemEnhance);
      keepBtn?.removeEventListener('click', onKeep);
      flagBtn?.removeEventListener('click', onFlag);
      parseBtn?.removeEventListener('click', onParse);
      epBtn?.removeEventListener('click', onEp);
      if (handlers.onOpenDetail) {
        meta.removeEventListener('click', onOpenDetail);
      }
      root.removeEventListener('mousedown', stop);
      root.removeEventListener('pointerdown', stop);
      try {
        art.layers.remove(LAYER_NAME);
      } catch {
        root.remove();
      }
    },
  };
}
