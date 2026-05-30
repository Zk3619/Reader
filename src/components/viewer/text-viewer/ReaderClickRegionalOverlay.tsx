/**
 * 全屏九宫格点击区域配置（对齐 Legado ClickActionConfigDialog）
 * 占满阅读器视口，格子按比例划分，可拖拽分界调整区域大小。
 */

import { createEffect, createSignal, For, Show } from 'solid-js';
import { readerStore } from '@/stores/reader';
import {
  READER_CLICK_ZONES,
  CLICK_ACTION_LABELS,
  CLICK_ACTION_OPTIONS,
  DEFAULT_CLICK_ACTIONS,
  getClickActionForZone,
  type ReaderClickZone,
  type ReaderClickActionId,
  type ReaderClickActions,
} from '@/lib/media/text/reader-click-actions';
import {
  applyDividerDrag,
  clampClickRegion,
  type ClickRegionDivider,
  type ReaderClickRegion,
  getZoneRectRatio,
} from '@/lib/media/text/reader-click-region';
import {
  AppDialog,
  AppDialogContent,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { showAppToast } from '@/components/shared/AppToasts';
import { XIcon } from '@/components/shared/icons';
import { markClickActionHintShown } from '@/lib/media/text/reader-click-hint-storage';

export interface ReaderClickRegionalOverlayProps {
  open: boolean;
  onClose: () => void;
  /** 首次提示关闭时写入已展示标记 */
  markHintSeenOnClose?: boolean;
  onPickerOpenChange?: (open: boolean) => void;
}

function ensureMenuRegion(actions: ReaderClickActions) {
  const hasMenu = Object.values(actions).some((a) => a === 'menu');
  if (!hasMenu) {
    readerStore.setConfig({
      clickActions: { ...actions, mc: 'menu' },
    });
    showAppToast({ title: '已自动将中间区域设为菜单' });
  }
}

function ReaderClickActionPickerDialog(props: {
  zone: ReaderClickZone | null;
  onClose: () => void;
  onSelect: (action: ReaderClickActionId) => void;
}) {
  const current = () =>
    props.zone
      ? getClickActionForZone(readerStore.state.config.clickActions, props.zone)
      : 'menu';

  return (
    <AppDialog
      open={props.zone != null}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <AppDialogContent class="z-60 max-w-sm gap-3">
        <AppDialogHeader>
          <AppDialogTitle>选择动作</AppDialogTitle>
        </AppDialogHeader>
        <div class="grid gap-1.5">
          <For each={CLICK_ACTION_OPTIONS}>
            {(action) => (
              <Button
                type="button"
                variant={current() === action ? 'default' : 'outline'}
                class="justify-start"
                onClick={() => props.onSelect(action)}
              >
                {CLICK_ACTION_LABELS[action]}
              </Button>
            )}
          </For>
        </div>
      </AppDialogContent>
    </AppDialog>
  );
}

function DividerHandle(props: {
  orientation: 'vertical' | 'horizontal';
  positionRatio: number;
  onDragStart: (e: PointerEvent) => void;
}) {
  const isV = () => props.orientation === 'vertical';
  return (
    <div
      class={cn(
        'absolute z-20 touch-none',
        isV()
          ? 'top-0 bottom-0 w-4 -translate-x-1/2 cursor-col-resize'
          : 'left-0 right-0 h-4 -translate-y-1/2 cursor-row-resize',
      )}
      style={
        isV()
          ? { left: `${props.positionRatio * 100}%` }
          : { top: `${props.positionRatio * 100}%` }
      }
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        props.onDragStart(e);
      }}
    >
      <div
        class={cn(
          'absolute bg-foreground/25 shadow-sm',
          isV() ? 'left-1/2 top-0 h-full w-0.5 -translate-x-1/2' : 'top-1/2 h-0.5 w-full -translate-y-1/2',
        )}
      />
    </div>
  );
}

export function ReaderClickRegionalOverlay(props: ReaderClickRegionalOverlayProps) {
  const [region, setRegion] = createSignal<ReaderClickRegion>(
    clampClickRegion(readerStore.state.config.clickRegion),
  );
  const [pickingZone, setPickingZone] = createSignal<ReaderClickZone | null>(null);
  let gridEl: HTMLDivElement | undefined;

  createEffect(() => {
    if (props.open) {
      setRegion(clampClickRegion(readerStore.state.config.clickRegion));
    }
  });

  createEffect(() => {
    props.onPickerOpenChange?.(pickingZone() != null);
  });

  const persistRegion = (next: ReaderClickRegion) => {
    const clamped = clampClickRegion(next);
    setRegion(clamped);
    readerStore.setConfig({ clickRegion: clamped });
  };

  const labelFor = (zone: ReaderClickZone) =>
    CLICK_ACTION_LABELS[getClickActionForZone(readerStore.state.config.clickActions, zone)];

  const setClickAction = (zone: ReaderClickZone, action: ReaderClickActionId) => {
    readerStore.setConfig({
      clickActions: {
        ...readerStore.state.config.clickActions,
        [zone]: action,
      },
    });
  };

  const startDividerDrag = (divider: ClickRegionDivider, e: PointerEvent) => {
    const grid = gridEl;
    if (!grid) return;
    const rect = grid.getBoundingClientRect();

    const move = (ev: PointerEvent) => {
      const ratio =
        divider === 'v1' || divider === 'v2'
          ? (ev.clientX - rect.left) / Math.max(rect.width, 1)
          : (ev.clientY - rect.top) / Math.max(rect.height, 1);
      persistRegion(applyDividerDrag(region(), divider, ratio));
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    move(e);
  };

  const handleClose = () => {
    ensureMenuRegion(readerStore.state.config.clickActions);
    if (props.markHintSeenOnClose) void markClickActionHintShown();
    props.onClose();
  };

  return (
    <>
      <Show when={props.open}>
        <div
          class="fixed inset-0 z-50 bg-background/25"
          role="dialog"
          aria-modal="true"
          aria-label="点击区域设置"
        >
          {/* 九宫格铺满整个阅读器视口（与正文 scrollContainer 的 absolute inset-0 一致） */}
          <div ref={gridEl} class="absolute inset-0 select-none">
            <For each={READER_CLICK_ZONES}>
              {(zone) => {
                const rect = () => getZoneRectRatio(zone, region());
                return (
                  <button
                    type="button"
                    class={cn(
                      'absolute flex items-center justify-center',
                      'border border-border/50 bg-card/45 px-2 text-center text-sm font-medium text-card-foreground',
                      'shadow-sm transition-colors hover:bg-accent/55 hover:text-accent-foreground',
                      'active:bg-accent/70 active:text-accent-foreground',
                      pickingZone() === zone && 'ring-2 ring-ring ring-offset-2 ring-offset-background/25',
                    )}
                    style={{
                      left: `${rect().left * 100}%`,
                      top: `${rect().top * 100}%`,
                      width: `${rect().width * 100}%`,
                      height: `${rect().height * 100}%`,
                    }}
                    onClick={() => setPickingZone(zone)}
                  >
                    {labelFor(zone)}
                  </button>
                );
              }}
            </For>

            <DividerHandle
              orientation="vertical"
              positionRatio={region().xSplits[0]}
              onDragStart={(e) => startDividerDrag('v1', e)}
            />
            <DividerHandle
              orientation="vertical"
              positionRatio={region().xSplits[1]}
              onDragStart={(e) => startDividerDrag('v2', e)}
            />
            <DividerHandle
              orientation="horizontal"
              positionRatio={region().ySplits[0]}
              onDragStart={(e) => startDividerDrag('h1', e)}
            />
            <DividerHandle
              orientation="horizontal"
              positionRatio={region().ySplits[1]}
              onDragStart={(e) => startDividerDrag('h2', e)}
            />
          </div>

          {/* 顶栏浮层（Legado：仅占一条，不挤压九宫格高度） */}
          <div class="pointer-events-none absolute inset-x-0 top-0 z-30 pt-[max(0px,env(safe-area-inset-top))]">
            <div class="pointer-events-auto mx-1.5 mt-1.5 flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-card/70 px-4 py-2 text-card-foreground shadow-sm backdrop-blur-sm">
              <div>
                <div class="text-sm font-semibold text-foreground">点击区域设置</div>
                <div class="text-xs text-muted-foreground">
                  与阅读时正文区域一致；点击格子设动作，拖拽线调大小
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                class="h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                onClick={handleClose}
                aria-label="关闭"
              >
                <XIcon class="size-5" />
              </Button>
            </div>
          </div>

          {/* 底栏浮层 */}
          <div class="pointer-events-none absolute inset-x-0 bottom-0 z-30 pb-[max(0px,env(safe-area-inset-bottom))]">
            <div class="pointer-events-auto mx-1.5 mb-1.5 flex justify-end gap-2 rounded-xl border border-border/50 bg-card/70 px-3 py-2 shadow-sm backdrop-blur-sm">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  readerStore.setConfig({
                    clickActions: { ...DEFAULT_CLICK_ACTIONS },
                    clickRegion: clampClickRegion({
                      xSplits: [1 / 3, 2 / 3],
                      ySplits: [1 / 3, 2 / 3],
                    }),
                  });
                  setRegion(clampClickRegion(readerStore.state.config.clickRegion));
                }}
              >
                恢复默认
              </Button>
              <Button type="button" size="sm" onClick={handleClose}>
                完成
              </Button>
            </div>
          </div>
        </div>
      </Show>

      <ReaderClickActionPickerDialog
        zone={pickingZone()}
        onClose={() => setPickingZone(null)}
        onSelect={(action) => {
          const zone = pickingZone();
          if (zone) setClickAction(zone, action);
          setPickingZone(null);
        }}
      />
    </>
  );
}

export function resetClickRegionalConfig(): void {
  readerStore.setConfig({
    clickActions: { ...DEFAULT_CLICK_ACTIONS },
    clickRegion: clampClickRegion({
      xSplits: [1 / 3, 2 / 3],
      ySplits: [1 / 3, 2 / 3],
    }),
  });
}
