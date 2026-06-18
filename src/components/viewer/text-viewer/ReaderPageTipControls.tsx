import { For, Show, createSignal } from 'solid-js';
import { ChromePicker } from 'solid-color';
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
import { Slider, SliderTrack, SliderFill, SliderThumb } from '@/components/ui/slider';
import { Switch, SwitchControl, SwitchLabel, SwitchThumb } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { TextViewerPageTipsConfig } from '@/lib/media/text/reader-ui-config';
import {
  READER_PAGE_TIP_FOOTER_MODE_LABELS,
  READER_PAGE_TIP_HEADER_MODE_LABELS,
  normalizeTextViewerPageTipFooterMode,
  READER_PAGE_TIP_TYPE_LABELS,
  READER_PAGE_TIP_TYPE_OPTIONS,
  type ReaderPageTipType,
} from '@/lib/media/text/reader-page-tip';
import {
  readerDrawerOptionTabsListClass,
  readerDrawerOptionTabsTriggerClass,
} from '@/lib/settings/settings-tab-styles';
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
  const edge = (key: keyof TextViewerPageTipsConfig['headerInset'], label: string) => (
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <Label class="text-sm font-normal">{label}</Label>
        <span class="text-sm text-muted-foreground">{formatRemFromPx(props.inset[key])}</span>
      </div>
      <Slider
        value={[pxToRem(props.inset[key])]}
        minValue={0}
        maxValue={6}
        step={0.125}
        onChange={(values: number[]) =>
          props.onChange({ [key]: remToPx(values[0] ?? pxToRem(props.inset[key])) })
        }
      >
        <SliderTrack>
          <SliderFill />
          <SliderThumb />
        </SliderTrack>
      </Slider>
    </div>
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

      <div class="space-y-3">
        <Label>页眉显示</Label>
        <Tabs
          value={props.tips().headerMode}
          onChange={(v) => setTips({ headerMode: v as TextViewerPageTipsConfig['headerMode'] })}
          class="w-full"
        >
          <TabsList class={readerDrawerOptionTabsListClass} aria-label="页眉显示">
            <For each={(['follow', 'always', 'never'] as const)}>
              {(mode) => (
                <TabsTrigger value={mode} class={readerDrawerOptionTabsTriggerClass}>
                  {READER_PAGE_TIP_HEADER_MODE_LABELS[mode]}
                </TabsTrigger>
              )}
            </For>
          </TabsList>
        </Tabs>
      </div>

      <div class="space-y-3">
        <Label>页脚显示</Label>
        <Tabs
          value={props.tips().footerMode}
          onChange={(v) => setTips({ footerMode: v as TextViewerPageTipsConfig['footerMode'] })}
          class="w-full"
        >
          <TabsList class={readerDrawerOptionTabsListClass} aria-label="页脚显示">
            <For each={(['follow', 'always', 'never'] as const)}>
              {(mode) => (
                <TabsTrigger value={mode} class={readerDrawerOptionTabsTriggerClass}>
                  {READER_PAGE_TIP_FOOTER_MODE_LABELS[mode]}
                </TabsTrigger>
              )}
            </For>
          </TabsList>
        </Tabs>
      </div>

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

      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <Label>页眉字号</Label>
          <span class="text-sm text-muted-foreground">
            {formatRemFromPx(props.tips().headerFontSize)}
          </span>
        </div>
        <Slider
          value={[pxToRem(props.tips().headerFontSize)]}
          minValue={0.5}
          maxValue={1.5}
          step={0.0625}
          onChange={(values: number[]) =>
            setTips({ headerFontSize: remToPx(values[0] ?? pxToRem(props.tips().headerFontSize)) })
          }
        >
          <SliderTrack>
            <SliderFill />
            <SliderThumb />
          </SliderTrack>
        </Slider>
      </div>

      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <Label>页脚字号</Label>
          <span class="text-sm text-muted-foreground">
            {formatRemFromPx(props.tips().footerFontSize)}
          </span>
        </div>
        <Slider
          value={[pxToRem(props.tips().footerFontSize)]}
          minValue={0.5}
          maxValue={1.5}
          step={0.0625}
          onChange={(values: number[]) =>
            setTips({ footerFontSize: remToPx(values[0] ?? pxToRem(props.tips().footerFontSize)) })
          }
        >
          <SliderTrack>
            <SliderFill />
            <SliderThumb />
          </SliderTrack>
        </Slider>
      </div>

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
        <Switch
          checked={props.tips().showHeaderLine}
          onChange={(checked) => setTips({ showHeaderLine: checked })}
        >
          <SwitchControl>
            <SwitchThumb />
          </SwitchControl>
          <SwitchLabel class="sr-only">页眉分隔线</SwitchLabel>
        </Switch>
      </div>

      <div class="flex items-center justify-between gap-4">
        <Label>页脚分隔线</Label>
        <Switch
          checked={props.tips().showFooterLine}
          onChange={(checked) => setTips({ showFooterLine: checked })}
        >
          <SwitchControl>
            <SwitchThumb />
          </SwitchControl>
          <SwitchLabel class="sr-only">页脚分隔线</SwitchLabel>
        </Switch>
      </div>

      <div class="flex items-center justify-between gap-4">
        <div>
          <Label>信息条颜色跟随正文</Label>
        </div>
        <Switch
          checked={props.tips().tipFollowContentColor}
          onChange={(checked) => setTips({ tipFollowContentColor: checked })}
        >
          <SwitchControl>
            <SwitchThumb />
          </SwitchControl>
          <SwitchLabel class="sr-only">信息条颜色跟随正文</SwitchLabel>
        </Switch>
      </div>

      <Show when={!props.tips().tipFollowContentColor}>
        <div class="space-y-2">
          <Label class="text-sm font-normal">自定义颜色</Label>
          <div class="overflow-hidden rounded-lg border border-border/50">
            <ChromePicker
              color={props.tips().customTipColor || '#666666'}
              disableAlpha
              width="100%"
              onChange={(color) => setTips({ customTipColor: color.hex })}
            />
          </div>
        </div>
      </Show>
    </div>
  );
}

export function mergePageTipsConfig(
  saved?: Partial<TextViewerPageTipsConfig> | null,
): TextViewerPageTipsConfig {
  const base = { ...defaultTextViewerPageTipsConfigFromUi() };
  if (!saved) return base;
  return {
    ...base,
    ...saved,
    headerMode: saved.headerMode ?? base.headerMode,
    footerMode: normalizeTextViewerPageTipFooterMode(saved.footerMode ?? base.footerMode),
    headerInset: { ...base.headerInset, ...saved.headerInset },
    footerInset: { ...base.footerInset, ...saved.footerInset },
  };
}

function defaultTextViewerPageTipsConfigFromUi(): TextViewerPageTipsConfig {
  return {
    headerMode: 'follow',
    footerMode: 'never',
    headerLeft: 'time',
    headerMiddle: 'none',
    headerRight: 'battery',
    footerLeft: 'chapterTitle',
    footerMiddle: 'none',
    footerRight: 'pageAndTotal',
    headerFontSize: 12,
    footerFontSize: 12,
    headerInset: { top: 0, bottom: 0, left: 16, right: 16 },
    footerInset: { top: 0, bottom: 0, left: 16, right: 16 },
    showHeaderLine: false,
    showFooterLine: true,
    tipFollowContentColor: true,
    customTipColor: '',
  };
}
