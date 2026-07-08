import { For, createSignal } from 'solid-js';
import { Label } from '@/components/ui/label';
import {
  AppSelect,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import { ViewerAppSelectContent } from '@/components/viewer/viewer-app-overlay';
import { ReaderRemSliderRow } from '@/components/viewer/text-viewer/ReaderRemSliderRow';
import { AppSwitch, AppSwitchControl, AppSwitchLabel, AppSwitchThumb } from '@/components/shared/AppSwitch';
import { AppTabs } from '@/components/shared/AppTabs';
import type { TextViewerPageTipsConfig } from '@/lib/media/text/reader-ui-config';
import {
  READER_PAGE_TIP_FOOTER_MODE_LABELS,
  READER_PAGE_TIP_HEADER_MODE_LABELS,
  normalizeTextViewerPageTipFooterMode,
  READER_PAGE_TIP_TYPE_LABELS,
  READER_PAGE_TIP_TYPE_OPTIONS,
  type ReaderPageTipType,
} from '@/lib/media/text/reader-page-tip';
import { formatRemFromPx, pxToRem, remToPx } from '@/lib/media/text/reader-rem';

type TipSlotKey =
  | 'headerLeft'
  | 'headerMiddle'
  | 'headerRight'
  | 'footerLeft'
  | 'footerMiddle'
  | 'footerRight';

const TIP_SLOT_LABELS: Record<TipSlotKey, string> = {
  headerLeft: '页眉左',
  headerMiddle: '页眉中',
  headerRight: '页眉右',
  footerLeft: '页脚左',
  footerMiddle: '页脚中',
  footerRight: '页脚右',
};

export interface ReaderPageTipControlsProps {
  tips: () => TextViewerPageTipsConfig;
  onChange: (patch: Partial<TextViewerPageTipsConfig>) => void;
}

function TipSlotSelect(props: {
  label: string;
  value: ReaderPageTipType;
  onChange: (value: ReaderPageTipType) => void;
}) {
  const [open, setOpen] = createSignal(false);
  const selectId = () => `reader-tip-slot-${props.label}`;

  return (
    <div class="flex items-center justify-between gap-3">
      <Label class="shrink-0 text-sm font-normal" for={selectId()}>
        {props.label}
      </Label>
      <div class="min-w-0 flex-1">
        <AppSelect
          value={props.value}
          onChange={(v) => props.onChange((v ?? 'none') as ReaderPageTipType)}
          options={[...READER_PAGE_TIP_TYPE_OPTIONS]}
          placeholder="选择内容"
          open={open()}
          onOpenChange={setOpen}
          itemComponent={(itemProps) => (
            <AppSelectItem item={itemProps.item}>
              {READER_PAGE_TIP_TYPE_LABELS[itemProps.item.rawValue as ReaderPageTipType] ??
                itemProps.item.rawValue}
            </AppSelectItem>
          )}
        >
          <AppSelectTrigger id={selectId()} layout="compact" aria-label={props.label}>
            <AppSelectValue<ReaderPageTipType>>
              {(state) => {
                const v = state.selectedOption();
                return v ? READER_PAGE_TIP_TYPE_LABELS[v] : '选择内容';
              }}
            </AppSelectValue>
            <AppSelectIcon />
          </AppSelectTrigger>
          <ViewerAppSelectContent>
            <AppSelectListbox />
          </ViewerAppSelectContent>
        </AppSelect>
      </div>
    </div>
  );
}

function TipInsetSliders(props: {
  title: string;
  inset: TextViewerPageTipsConfig['headerInset'];
  onChange: (patch: Partial<TextViewerPageTipsConfig['headerInset']>) => void;
}) {
  const pxDialogValue = (px: number, unit: 'px' | 'rem') =>
    unit === 'px' ? px : pxToRem(px);

  const applyPxDialog =
    (key: keyof TextViewerPageTipsConfig['headerInset']) =>
    (value: number, unit: 'px' | 'rem') => {
      props.onChange({ [key]: unit === 'px' ? value : remToPx(value) });
    };

  const edge = (key: keyof TextViewerPageTipsConfig['headerInset'], label: string) => (
    <ReaderRemSliderRow
      label={label}
      valueLabel={formatRemFromPx(props.inset[key])}
      sliderValue={pxToRem(props.inset[key])}
      minValue={0}
      maxValue={6}
      step={0.125}
      onSliderChange={(v) => props.onChange({ [key]: remToPx(v) })}
      getDialogValue={(unit) => pxDialogValue(props.inset[key], unit)}
      onDialogApply={applyPxDialog(key)}
    />
  );

  return (
    <div class="space-y-3 rounded-lg border border-border/40 px-3 py-3">
      <Label>{props.title}边距</Label>
      {edge('top', '上')}
      {edge('bottom', '下')}
      {edge('left', '左')}
      {edge('right', '右')}
    </div>
  );
}

export function ReaderPageTipControls(props: ReaderPageTipControlsProps) {
  const setTips = (patch: Partial<TextViewerPageTipsConfig>) => {
    props.onChange(patch);
  };

  const setSlot = (key: TipSlotKey, value: ReaderPageTipType) => {
    setTips({ [key]: value });
  };

  const setHeaderInset = (patch: Partial<TextViewerPageTipsConfig['headerInset']>) => {
    props.onChange({ headerInset: { ...props.tips().headerInset, ...patch } });
  };

  const setFooterInset = (patch: Partial<TextViewerPageTipsConfig['footerInset']>) => {
    props.onChange({ footerInset: { ...props.tips().footerInset, ...patch } });
  };

  return (
    <div class="space-y-4">
      <div>
        <Label>页眉与页脚</Label>
        <p class="mt-1 text-xs text-muted-foreground">
          阅读页内信息条，对齐 Legado 页眉页脚；按页模式显示在正文区域上下方。
        </p>
      </div>

      <AppTabs
        layout="stacked"
        variant="drawer"
        label="页眉显示"
        value={props.tips().headerMode}
        options={['follow', 'always', 'never'] as const}
        labels={READER_PAGE_TIP_HEADER_MODE_LABELS}
        ariaLabel="页眉显示"
        onChange={(v) => setTips({ headerMode: v as TextViewerPageTipsConfig['headerMode'] })}
      />

      <AppTabs
        layout="stacked"
        variant="drawer"
        label="页脚显示"
        value={props.tips().footerMode}
        options={['follow', 'always', 'never'] as const}
        labels={READER_PAGE_TIP_FOOTER_MODE_LABELS}
        ariaLabel="页脚显示"
        onChange={(v) => setTips({ footerMode: v as TextViewerPageTipsConfig['footerMode'] })}
      />

      <div class="space-y-2">
        <Label>页眉内容</Label>
        <For each={(['headerLeft', 'headerMiddle', 'headerRight'] as TipSlotKey[])}>
          {(key) => (
            <TipSlotSelect
              label={TIP_SLOT_LABELS[key]}
              value={props.tips()[key]}
              onChange={(v) => setSlot(key, v)}
            />
          )}
        </For>
      </div>

      <div class="space-y-2">
        <Label>页脚内容</Label>
        <For each={(['footerLeft', 'footerMiddle', 'footerRight'] as TipSlotKey[])}>
          {(key) => (
            <TipSlotSelect
              label={TIP_SLOT_LABELS[key]}
              value={props.tips()[key]}
              onChange={(v) => setSlot(key, v)}
            />
          )}
        </For>
      </div>

      <ReaderRemSliderRow
        label="页眉字号"
        valueLabel={formatRemFromPx(props.tips().headerFontSize)}
        sliderValue={pxToRem(props.tips().headerFontSize)}
        minValue={0.5}
        maxValue={1.5}
        step={0.0625}
        onSliderChange={(v) => setTips({ headerFontSize: remToPx(v) })}
        getDialogValue={(unit) =>
          unit === 'px' ? props.tips().headerFontSize : pxToRem(props.tips().headerFontSize)
        }
        onDialogApply={(value, unit) =>
          setTips({ headerFontSize: unit === 'px' ? value : remToPx(value) })
        }
      />

      <ReaderRemSliderRow
        label="页脚字号"
        valueLabel={formatRemFromPx(props.tips().footerFontSize)}
        sliderValue={pxToRem(props.tips().footerFontSize)}
        minValue={0.5}
        maxValue={1.5}
        step={0.0625}
        onSliderChange={(v) => setTips({ footerFontSize: remToPx(v) })}
        getDialogValue={(unit) =>
          unit === 'px' ? props.tips().footerFontSize : pxToRem(props.tips().footerFontSize)
        }
        onDialogApply={(value, unit) =>
          setTips({ footerFontSize: unit === 'px' ? value : remToPx(value) })
        }
      />

      <TipInsetSliders
        title="页眉"
        inset={props.tips().headerInset}
        onChange={setHeaderInset}
      />
      <TipInsetSliders
        title="页脚"
        inset={props.tips().footerInset}
        onChange={setFooterInset}
      />

      <div class="flex items-center justify-between gap-4">
        <Label>页眉分隔线</Label>
        <AppSwitch
          checked={props.tips().showHeaderLine}
          onChange={(checked) => setTips({ showHeaderLine: checked })}
        >
          <AppSwitchControl>
            <AppSwitchThumb />
          </AppSwitchControl>
          <AppSwitchLabel class="sr-only">页眉分隔线</AppSwitchLabel>
        </AppSwitch>
      </div>

      <div class="flex items-center justify-between gap-4">
        <Label>页脚分隔线</Label>
        <AppSwitch
          checked={props.tips().showFooterLine}
          onChange={(checked) => setTips({ showFooterLine: checked })}
        >
          <AppSwitchControl>
            <AppSwitchThumb />
          </AppSwitchControl>
          <AppSwitchLabel class="sr-only">页脚分隔线</AppSwitchLabel>
        </AppSwitch>
      </div>

      <div class="space-y-3 rounded-lg border border-border/40 px-3 py-3">
        <Label>页眉页脚样式</Label>
        <p class="text-xs text-muted-foreground">
          关闭跟随后将使用应用默认样式；自定义配色将在商业级主题设置中统一配置。
        </p>

        <div class="flex items-center justify-between gap-4">
          <Label class="font-normal">文本跟随阅读主题</Label>
          <AppSwitch
            checked={props.tips().pageTipTextFollowPage ?? props.tips().tipFollowContentColor}
            onChange={(checked) =>
              setTips({ pageTipTextFollowPage: checked, tipFollowContentColor: checked })
            }
          >
            <AppSwitchControl>
              <AppSwitchThumb />
            </AppSwitchControl>
            <AppSwitchLabel class="sr-only">文本跟随阅读主题</AppSwitchLabel>
          </AppSwitch>
        </div>

        <div class="flex items-center justify-between gap-4">
          <Label class="font-normal">分割线跟随阅读主题</Label>
          <AppSwitch
            checked={props.tips().pageTipDividerFollowPage ?? true}
            onChange={(checked) => setTips({ pageTipDividerFollowPage: checked })}
          >
            <AppSwitchControl>
              <AppSwitchThumb />
            </AppSwitchControl>
            <AppSwitchLabel class="sr-only">分割线跟随阅读主题</AppSwitchLabel>
          </AppSwitch>
        </div>

        <div class="flex items-center justify-between gap-4">
          <Label class="font-normal">背景跟随阅读主题</Label>
          <AppSwitch
            checked={props.tips().pageTipBackgroundFollowPage ?? true}
            onChange={(checked) => setTips({ pageTipBackgroundFollowPage: checked })}
          >
            <AppSwitchControl>
              <AppSwitchThumb />
            </AppSwitchControl>
            <AppSwitchLabel class="sr-only">背景跟随阅读主题</AppSwitchLabel>
          </AppSwitch>
        </div>
      </div>
    </div>
  );
}

export function mergePageTipsConfig(
  saved?: Partial<TextViewerPageTipsConfig> | null,
): TextViewerPageTipsConfig {
  const base = { ...defaultTextViewerPageTipsConfigFromUi() };
  if (!saved) return base;
  const textFollow =
    saved.pageTipTextFollowPage ??
    saved.tipFollowContentColor ??
    base.pageTipTextFollowPage ??
    base.tipFollowContentColor;
  return {
    ...base,
    ...saved,
    headerMode: saved.headerMode ?? base.headerMode,
    footerMode: normalizeTextViewerPageTipFooterMode(saved.footerMode ?? base.footerMode),
    headerInset: { ...base.headerInset, ...saved.headerInset },
    footerInset: { ...base.footerInset, ...saved.footerInset },
    pageTipTextFollowPage: textFollow,
    pageTipDividerFollowPage: saved.pageTipDividerFollowPage ?? base.pageTipDividerFollowPage,
    pageTipBackgroundFollowPage:
      saved.pageTipBackgroundFollowPage ?? base.pageTipBackgroundFollowPage,
    tipFollowContentColor: textFollow,
  };
}

function defaultTextViewerPageTipsConfigFromUi(): TextViewerPageTipsConfig {
  return {
    headerMode: 'follow',
    footerMode: 'follow',
    headerLeft: 'time',
    headerMiddle: 'none',
    headerRight: 'battery',
    footerLeft: 'chapterTitle',
    footerMiddle: 'chapterWordCount',
    footerRight: 'chapterProgressAndBook',
    headerFontSize: 12,
    footerFontSize: 12,
    headerInset: { top: 0, bottom: 0, left: 16, right: 16 },
    footerInset: { top: 0, bottom: 0, left: 16, right: 16 },
    showHeaderLine: false,
    showFooterLine: true,
    tipFollowContentColor: true,
    pageTipTextFollowPage: true,
    pageTipDividerFollowPage: true,
    pageTipBackgroundFollowPage: true,
    customTipColor: '',
    customTipDividerColor: '',
    customTipBackgroundColor: '',
  };
}
