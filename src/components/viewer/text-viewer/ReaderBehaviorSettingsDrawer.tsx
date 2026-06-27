/**
 * 文本阅读器「设置」抽屉（对齐 Legado MoreConfigDialog）
 */

import { createSignal, For, Show, type ParentProps } from 'solid-js';
import { textViewerStore } from '@/stores/viewer';
import { ChapterBodyPrefetchControls } from '@/components/viewer/ChapterBodyPrefetchControls';
import { Label } from '@/components/ui/label';
import { Switch, SwitchControl, SwitchLabel, SwitchThumb } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { AppTabs } from '@/components/shared/AppTabs';
import {
  ViewerAppDrawer,
  ViewerAppDrawerBody,
  ViewerAppDrawerContent,
  ViewerAppDrawerHeader,
} from '@/components/viewer/viewer-app-overlay';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/viewer/viewer-app-overlay';
import { AppDialogScrollBody } from '@/components/shared/AppDialog';
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from '@/components/ui/radio-group';
import { hDrawerPanel } from '@/lib/ui/viewport-classes';
import { dialogScrollFrameFlex } from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';
import { isAndroid, isMobile } from '@/lib/platform/detect';
import {
  TEXT_VIEWER_BRIGHTNESS_VIEW_POSITION_LABELS,
  TEXT_VIEWER_BRIGHTNESS_VIEW_POSITIONS,
  TEXT_VIEWER_AUTO_PAGE_PROGRESS_EDGE_LABELS,
  TEXT_VIEWER_AUTO_PAGE_PROGRESS_EDGES,
  TEXT_VIEWER_AUTO_PAGE_STYLE_LABELS,
  TEXT_VIEWER_AUTO_PAGE_STYLES,
  TEXT_VIEWER_CLICK_IMG_WAY_LABELS,
  TEXT_VIEWER_KEEP_SCREEN_ON_LABELS,
  TEXT_VIEWER_PROGRESS_BAR_BEHAVIOR_LABELS,
  TEXT_VIEWER_PROGRESS_BAR_BEHAVIORS,
  TEXT_VIEWER_SCREEN_ORIENTATION_LABELS,
  type TextViewerClickImgWay,
  type TextViewerKeepScreenOn,
  type TextViewerScreenOrientation,
  type TextViewerUiConfig,
  normalizeBrightnessViewPosition,
  normalizeAutoPageStyle,
  normalizeAutoPageProgressEdge,
  type TextViewerBrightnessViewPosition,
} from '@/lib/media/text/reader-ui-config';
import { ReaderCustomPageKeyDialog } from './ReaderCustomPageKeyDialog';
import { ReaderTextMenuConfigDialog } from './ReaderTextMenuConfigDialog';

function SettingsSwitchRow(props: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div class="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5">
      <div class="min-w-0">
        <Label class={cn('text-sm', props.disabled && 'text-muted-foreground')}>{props.label}</Label>
        <Show when={props.description}>
          <p class="text-xs text-muted-foreground">{props.description}</p>
        </Show>
      </div>
      <Switch
        checked={props.checked}
        disabled={props.disabled}
        onChange={props.onChange}
      >
        <SwitchControl>
          <SwitchThumb />
        </SwitchControl>
        <SwitchLabel class="sr-only">{props.label}</SwitchLabel>
      </Switch>
    </div>
  );
}

function SettingsSection(props: ParentProps<{ title: string }>) {
  return (
    <div class="mx-1 mb-2 space-y-0.5 rounded-lg border border-border/50 bg-muted/20 px-1 py-1">
      <p class="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">{props.title}</p>
      {props.children}
    </div>
  );
}

function SettingsPickerRow(props: {
  label: string;
  valueLabel: string;
  onClick: () => void;
}) {
  return (
    <div class="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5">
      <span class="text-sm text-foreground">{props.label}</span>
      <button
        type="button"
        class="rounded-lg bg-muted px-3 py-1.5 text-sm text-foreground hover:bg-muted/80"
        onClick={props.onClick}
      >
        {props.valueLabel}
      </button>
    </div>
  );
}

const optionRowClass =
  'flex cursor-pointer items-center rounded-md px-2 py-1.5 hover:bg-muted/50 has-[[data-checked]]:bg-accent has-[[data-checked]]:text-accent-foreground';

function triggerOptionRadio(el: HTMLElement) {
  el.querySelector<HTMLInputElement>('input[type="radio"]')?.click();
}

export interface ReaderBehaviorSettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blockOutsideDismiss?: boolean;
  autoPageActive: boolean;
  onAutoPageToggle: (enabled: boolean) => void;
}

export function ReaderBehaviorSettingsDrawer(props: ReaderBehaviorSettingsDrawerProps) {
  const [customPageKeyOpen, setCustomPageKeyOpen] = createSignal(false);
  const [textMenuConfigOpen, setTextMenuConfigOpen] = createSignal(false);
  const [clickImgWayPickerOpen, setClickImgWayPickerOpen] = createSignal(false);
  const [orientationPickerOpen, setOrientationPickerOpen] = createSignal(false);
  const [keepScreenPickerOpen, setKeepScreenPickerOpen] = createSignal(false);

  const config = () => textViewerStore.state.config;

  const setConfig = (patch: Partial<TextViewerUiConfig>) => {
    textViewerStore.setConfig(patch);
  };

  const blockDismiss = () =>
    props.blockOutsideDismiss ||
    customPageKeyOpen() ||
    textMenuConfigOpen() ||
    clickImgWayPickerOpen() ||
    orientationPickerOpen() ||
    keepScreenPickerOpen();

  return (
    <>
      <ViewerAppDrawer
        open={props.open}
        onOpenChange={props.onOpenChange}
        snapPoints={[0, 1]}
        defaultSnapPoint={1}
        closeOnOutsideFocus={!blockDismiss()}
        closeOnOutsidePointer={!blockDismiss()}
      >
        <ViewerAppDrawerContent
          class={cn('flex flex-col', hDrawerPanel, 'max-h-[75dvh]')}
          showNativeDragHandle={false}
        >
          <ViewerAppDrawerHeader title="设置" />
          <ViewerAppDrawerBody class="mb-4 gap-1 overflow-y-auto scroll-gutter-stable-both px-2 pb-2">
            <div class="mx-1 mb-2 space-y-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-3">
              <ChapterBodyPrefetchControls viewer="text" />
              <p class="text-xs text-muted-foreground">
                与全局设置「阅读体验 → 章节正文预下载」同步；容量与清理见「存储与缓存 → 阅读缓存」。
              </p>
            </div>

            <SettingsSection title="显示与布局">
              <Show when={isMobile()}>
                <SettingsSwitchRow
                  label="填充刘海区域"
                  description="内容延伸至状态栏区域，移除顶部安全间距"
                  checked={config().paddingDisplayCutouts === true}
                  onChange={(v) => setConfig({ paddingDisplayCutouts: v })}
                />
              </Show>
              <SettingsSwitchRow
                label="展示顶栏附加区域"
                description="章节名与书源链接栏"
                checked={config().showReadTitleAddition !== false}
                onChange={(v) => setConfig({ showReadTitleAddition: v })}
              />
              <SettingsSwitchRow
                label="顶栏样式跟随页面"
                checked={config().readTopBarStyleFollowPage === true}
                onChange={(v) => setConfig({ readTopBarStyleFollowPage: v })}
              />
              <SettingsSwitchRow
                label="底栏样式跟随页面"
                checked={config().readBottomBarStyleFollowPage === true}
                onChange={(v) => setConfig({ readBottomBarStyleFollowPage: v })}
              />
              <SettingsSwitchRow
                label="朗读播放器样式跟随页面"
                description="浮动朗读条使用当前阅读主题配色"
                checked={config().readAloudBarStyleFollowPage === true}
                onChange={(v) => setConfig({ readAloudBarStyleFollowPage: v })}
              />
              <SettingsSwitchRow
                label="显示亮度调节控件"
                checked={config().showBrightnessView !== false}
                onChange={(v) => setConfig({ showBrightnessView: v })}
              />
              <Show when={config().showBrightnessView !== false}>
                <SettingsSwitchRow
                  label="亮度胶囊样式跟随页面"
                  description="关闭后使用应用主题配色"
                  checked={config().brightnessViewStyleFollowPage !== false}
                  onChange={(v) => setConfig({ brightnessViewStyleFollowPage: v })}
                />
                <AppTabs
                  layout="stacked"
                  variant="drawer"
                  class="px-3 py-2"
                  label="亮度控件位置"
                  description="位于顶部或底部时，显示在顶栏下方或底栏上方。"
                  value={normalizeBrightnessViewPosition(config().brightnessViewPosition)}
                  options={TEXT_VIEWER_BRIGHTNESS_VIEW_POSITIONS}
                  labels={TEXT_VIEWER_BRIGHTNESS_VIEW_POSITION_LABELS}
                  ariaLabel="亮度控件位置"
                  onChange={(pos) =>
                    setConfig({ brightnessViewPosition: pos as TextViewerBrightnessViewPosition })
                  }
                />
              </Show>
            </SettingsSection>

            <SettingsSection title="阅读排版">
              <SettingsSwitchRow
                label="使用自定义中文分行"
                checked={config().useZhLayout === true}
                onChange={(v) => setConfig({ useZhLayout: v })}
              />
              <SettingsSwitchRow
                label="文字两端对齐"
                checked={config().textFullJustify !== false}
                onChange={(v) => setConfig({ textFullJustify: v })}
              />
              <SettingsSwitchRow
                label="文字底部对齐"
                checked={config().textBottomJustify !== false}
                onChange={(v) => setConfig({ textBottomJustify: v })}
              />
              <SettingsSwitchRow
                label="适配特殊样式"
                description="替换净化前保护 usehtml 块"
                checked={config().adaptSpecialStyle !== false}
                onChange={(v) => {
                  setConfig({ adaptSpecialStyle: v });
                  void textViewerStore.reprocessDisplayedChapter().catch(() => undefined);
                }}
              />
            </SettingsSection>

            <SettingsSection title="进度与导航">
              <AppTabs
                layout="inline"
                variant="drawer-inline"
                rowClass="rounded-lg px-3 py-2.5"
                label="进度条行为"
                description="底栏进度条拖动范围"
                value={config().progressBarBehavior ?? 'page'}
                options={TEXT_VIEWER_PROGRESS_BAR_BEHAVIORS}
                labels={TEXT_VIEWER_PROGRESS_BAR_BEHAVIOR_LABELS}
                ariaLabel="进度条行为"
                onChange={(mode) => setConfig({ progressBarBehavior: mode })}
              />
              <SettingsSwitchRow
                label="禁用返回键"
                description="菜单隐藏时拦截返回，不退出阅读"
                checked={config().disableReturnKey === true}
                onChange={(v) => setConfig({ disableReturnKey: v })}
              />
            </SettingsSection>

            <SettingsSection title="翻页与输入">
              <SettingsSwitchRow
                label="自动翻页"
                checked={props.autoPageActive}
                onChange={props.onAutoPageToggle}
              />
              <AppTabs
                layout="inline"
                variant="drawer-inline"
                rowClass="rounded-lg px-3 py-2.5"
                label="自动翻页方式"
                description="仅按页模式生效"
                value={normalizeAutoPageStyle(config().autoPageStyle)}
                options={TEXT_VIEWER_AUTO_PAGE_STYLES}
                labels={TEXT_VIEWER_AUTO_PAGE_STYLE_LABELS}
                ariaLabel="自动翻页方式"
                onChange={(style) => setConfig({ autoPageStyle: style })}
              />
              <Show when={normalizeAutoPageStyle(config().autoPageStyle) === 'progressBar'}>
                <AppTabs
                  layout="inline"
                  variant="drawer-inline"
                  rowClass="rounded-lg px-3 py-2.5"
                  label="进度条位置"
                  value={normalizeAutoPageProgressEdge(config().autoPageProgressEdge)}
                  options={TEXT_VIEWER_AUTO_PAGE_PROGRESS_EDGES}
                  labels={TEXT_VIEWER_AUTO_PAGE_PROGRESS_EDGE_LABELS}
                  ariaLabel="自动翻页进度条位置"
                  onChange={(edge) => setConfig({ autoPageProgressEdge: edge })}
                />
              </Show>
              <SettingsSwitchRow
                label="鼠标滚轮翻页"
                description="滚动模式滚内容，按页模式翻页"
                checked={config().mouseWheelPage !== false}
                onChange={(v) => setConfig({ mouseWheelPage: v })}
              />
              <SettingsSwitchRow
                label="音量键翻页"
                checked={config().volumeKeyTurnPage !== false}
                onChange={(v) => setConfig({ volumeKeyTurnPage: v })}
              />
              <Show when={isMobile()}>
                <SettingsSwitchRow
                  label="朗读时音量键翻页"
                  checked={config().volumeKeyTurnPageOnAloud === true}
                  onChange={(v) => {
                    setConfig({
                      volumeKeyTurnPageOnAloud: v,
                      volumeKeyControlAloud: !v,
                    });
                  }}
                />
              </Show>
              <Button
                variant="ghost"
                class="w-full justify-start"
                onClick={() => setCustomPageKeyOpen(true)}
              >
                自定义翻页按键
              </Button>
              <SettingsSwitchRow
                label="长按翻页"
                description="开启后按键长按连续翻页"
                checked={config().keyPageOnLongPress === true}
                onChange={(v) => setConfig({ keyPageOnLongPress: v })}
              />
              <SettingsSwitchRow
                label="禁用滚动点击动画"
                description="滚动模式下禁用九宫格点击，仅切换顶底栏"
                checked={config().disableScrollClickAnimation === true}
                onChange={(v) => setConfig({ disableScrollClickAnimation: v })}
              />
            </SettingsSection>

            <SettingsSection title="文本与图片">
              <SettingsSwitchRow
                label="长按选择文本"
                checked={config().selectText !== false}
                onChange={(v) => setConfig({ selectText: v })}
              />
              <SettingsSwitchRow
                label="展开文本选择菜单"
                checked={config().expandTextMenu === true}
                onChange={(v) => setConfig({ expandTextMenu: v })}
              />
              <Button
                variant="ghost"
                class="w-full justify-start"
                onClick={() => setTextMenuConfigOpen(true)}
              >
                展开文本菜单配置
              </Button>
              <SettingsPickerRow
                label="点击图片方式"
                valueLabel={
                  TEXT_VIEWER_CLICK_IMG_WAY_LABELS[config().clickImgWay ?? 0]
                }
                onClick={() => setClickImgWayPickerOpen(true)}
              />
            </SettingsSection>

            <SettingsSection title="其他">
              <SettingsSwitchRow
                label="自动换源"
                description="章节加载失败时尝试自动换源"
                checked={config().autoChangeSource !== false}
                onChange={(v) => setConfig({ autoChangeSource: v })}
              />
            </SettingsSection>

            <Show when={isMobile()}>
              <SettingsSection title="移动端">
                <SettingsPickerRow
                  label="屏幕方向"
                  valueLabel={
                    TEXT_VIEWER_SCREEN_ORIENTATION_LABELS[
                      config().screenOrientation ?? 0
                    ]
                  }
                  onClick={() => setOrientationPickerOpen(true)}
                />
                <SettingsPickerRow
                  label="屏幕超时"
                  valueLabel={
                    TEXT_VIEWER_KEEP_SCREEN_ON_LABELS[
                      String(config().keepScreenOn ?? 0)
                    ]
                  }
                  onClick={() => setKeepScreenPickerOpen(true)}
                />
              </SettingsSection>
            </Show>
          </ViewerAppDrawerBody>
        </ViewerAppDrawerContent>
      </ViewerAppDrawer>

      <ReaderCustomPageKeyDialog
        open={customPageKeyOpen()}
        onOpenChange={setCustomPageKeyOpen}
      />
      <ReaderTextMenuConfigDialog
        open={textMenuConfigOpen()}
        onOpenChange={setTextMenuConfigOpen}
      />

      <ViewerAppDialog open={clickImgWayPickerOpen()} onOpenChange={setClickImgWayPickerOpen} modal={false}>
        <ViewerAppDialogContent class={cn('w-[calc(100dvw-2rem)] max-w-[20rem]')}>
          <ViewerAppDialogHeader>
            <ViewerAppDialogTitle>点击图片方式</ViewerAppDialogTitle>
          </ViewerAppDialogHeader>
          <AppDialogScrollBody frameClass={dialogScrollFrameFlex}>
            <RadioGroup
              value={String(config().clickImgWay ?? 0)}
              onChange={(value) => {
                setConfig({ clickImgWay: Number(value) as TextViewerClickImgWay });
                setClickImgWayPickerOpen(false);
              }}
              class="flex flex-col gap-2"
            >
              <For each={([0, 1, 2, 3, 4] as TextViewerClickImgWay[])}>
                {(way) => (
                  <div
                    class={optionRowClass}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => triggerOptionRadio(e.currentTarget)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        triggerOptionRadio(e.currentTarget);
                      }
                    }}
                  >
                    <RadioGroupItem value={String(way)} class="w-full">
                      <RadioGroupItemLabel>{TEXT_VIEWER_CLICK_IMG_WAY_LABELS[way]}</RadioGroupItemLabel>
                    </RadioGroupItem>
                  </div>
                )}
              </For>
            </RadioGroup>
          </AppDialogScrollBody>
        </ViewerAppDialogContent>
      </ViewerAppDialog>

      <Show when={isAndroid()}>
        <ViewerAppDialog open={orientationPickerOpen()} onOpenChange={setOrientationPickerOpen} modal={false}>
          <ViewerAppDialogContent class={cn('w-[calc(100dvw-2rem)] max-w-[20rem]')}>
            <ViewerAppDialogHeader>
              <ViewerAppDialogTitle>屏幕方向</ViewerAppDialogTitle>
            </ViewerAppDialogHeader>
            <AppDialogScrollBody frameClass={dialogScrollFrameFlex}>
              <RadioGroup
                value={String(config().screenOrientation ?? 0)}
                onChange={(value) => {
                  setConfig({ screenOrientation: Number(value) as TextViewerScreenOrientation });
                  setOrientationPickerOpen(false);
                }}
                class="flex flex-col gap-2"
              >
                <For each={([0, 1, 2, 3, 4, 5] as TextViewerScreenOrientation[])}>
                  {(mode) => (
                    <div
                      class={optionRowClass}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => triggerOptionRadio(e.currentTarget)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          triggerOptionRadio(e.currentTarget);
                        }
                      }}
                    >
                      <RadioGroupItem value={String(mode)} class="w-full">
                        <RadioGroupItemLabel>
                          {TEXT_VIEWER_SCREEN_ORIENTATION_LABELS[mode]}
                        </RadioGroupItemLabel>
                      </RadioGroupItem>
                    </div>
                  )}
                </For>
              </RadioGroup>
            </AppDialogScrollBody>
          </ViewerAppDialogContent>
        </ViewerAppDialog>

        <ViewerAppDialog open={keepScreenPickerOpen()} onOpenChange={setKeepScreenPickerOpen} modal={false}>
          <ViewerAppDialogContent class={cn('w-[calc(100dvw-2rem)] max-w-[20rem]')}>
            <ViewerAppDialogHeader>
              <ViewerAppDialogTitle>屏幕超时</ViewerAppDialogTitle>
            </ViewerAppDialogHeader>
            <AppDialogScrollBody frameClass={dialogScrollFrameFlex}>
              <RadioGroup
                value={String(config().keepScreenOn ?? 0)}
                onChange={(value) => {
                  setConfig({ keepScreenOn: Number(value) as TextViewerKeepScreenOn });
                  setKeepScreenPickerOpen(false);
                }}
                class="flex flex-col gap-2"
              >
                <For each={([0, 60, 300, 600, -1] as TextViewerKeepScreenOn[])}>
                  {(seconds) => (
                    <div
                      class={optionRowClass}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => triggerOptionRadio(e.currentTarget)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          triggerOptionRadio(e.currentTarget);
                        }
                      }}
                    >
                      <RadioGroupItem value={String(seconds)} class="w-full">
                        <RadioGroupItemLabel>
                          {TEXT_VIEWER_KEEP_SCREEN_ON_LABELS[String(seconds)]}
                        </RadioGroupItemLabel>
                      </RadioGroupItem>
                    </div>
                  )}
                </For>
              </RadioGroup>
            </AppDialogScrollBody>
          </ViewerAppDialogContent>
        </ViewerAppDialog>
      </Show>
    </>
  );
}
