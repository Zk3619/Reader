/**
 * 应用内选项 Tab：统一阅读设置抽屉 / 设置页等场景的 Tab 样式与布局。
 * 底层仍使用 @/components/ui/tabs（Kobalte Tabs 原语）。
 */

import { For, Show, splitProps } from 'solid-js';
import type { JSX } from 'solid-js';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  readerDrawerInlineOptionTabsListClass,
  readerDrawerInlineOptionTabsTriggerClass,
  readerDrawerOptionTabsListClass,
  readerDrawerOptionTabsTriggerClass,
  settingsOptionTabsEqualWidthListClass,
  settingsOptionTabsEqualWidthTriggerClass,
  settingsOptionTabsEqualWidthWrapListClass,
  settingsOptionTabsEqualWidthWrapTriggerClass,
  settingsOptionTabsListClass,
  settingsOptionTabsTriggerClass,
} from '@/lib/settings/settings-tab-styles';

export type AppTabsVariant =
  | 'drawer'
  | 'drawer-inline'
  | 'settings'
  | 'settings-equal'
  | 'settings-equal-wrap';

export type AppTabsLayout = 'stacked' | 'inline';

export type AppTabsItem<T extends string = string> = {
  value: T;
  label: string;
  title?: string;
};

const VARIANT_LIST_CLASS: Record<AppTabsVariant, string> = {
  drawer: readerDrawerOptionTabsListClass,
  'drawer-inline': readerDrawerInlineOptionTabsListClass,
  settings: settingsOptionTabsListClass,
  'settings-equal': settingsOptionTabsEqualWidthListClass,
  'settings-equal-wrap': settingsOptionTabsEqualWidthWrapListClass,
};

const VARIANT_TRIGGER_CLASS: Record<AppTabsVariant, string> = {
  drawer: readerDrawerOptionTabsTriggerClass,
  'drawer-inline': readerDrawerInlineOptionTabsTriggerClass,
  settings: settingsOptionTabsTriggerClass,
  'settings-equal': settingsOptionTabsEqualWidthTriggerClass,
  'settings-equal-wrap': settingsOptionTabsEqualWidthWrapTriggerClass,
};

type AppTabsOptionsProps<T extends string> = {
  options: readonly T[];
  labels: Record<T, string> | Record<string, string>;
  items?: never;
};

type AppTabsItemsProps<T extends string> = {
  items: readonly AppTabsItem<T>[];
  options?: never;
  labels?: never;
};

export type AppTabsProps<T extends string = string> = {
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  variant?: AppTabsVariant;
  layout?: AppTabsLayout;
  label?: string;
  description?: string;
  hint?: string;
  class?: string;
  tabsClass?: string;
  listClass?: string;
  triggerClass?: string;
  rowClass?: string;
  labelClass?: string;
  disabled?: boolean;
} & (AppTabsOptionsProps<T> | AppTabsItemsProps<T>);

function resolveTabItems<T extends string>(props: AppTabsProps<T>): readonly AppTabsItem<T>[] {
  if ('items' in props && props.items) {
    return props.items;
  }
  return props.options.map((value) => ({
    value,
    label: props.labels[value as T] ?? value,
  }));
}

export function AppTabs<T extends string>(props: AppTabsProps<T>) {
  const [local] = splitProps(props, [
    'value',
    'onChange',
    'ariaLabel',
    'variant',
    'layout',
    'label',
    'description',
    'hint',
    'class',
    'tabsClass',
    'listClass',
    'triggerClass',
    'rowClass',
    'labelClass',
    'disabled',
    'options',
    'labels',
    'items',
  ]);

  const variant = () => local.variant ?? 'drawer';
  const layout = () => local.layout ?? 'stacked';
  const tabItems = () => resolveTabItems(props);

  const listClass = () => cn(VARIANT_LIST_CLASS[variant()], local.listClass);
  const triggerClass = () => cn(VARIANT_TRIGGER_CLASS[variant()], local.triggerClass);

  const tabsControl = () => (
    <Tabs
      value={local.value}
      onChange={(value) => local.onChange(value as T)}
      disabled={local.disabled}
      class={cn(layout() === 'inline' ? 'shrink-0' : 'w-full', local.tabsClass)}
    >
      <TabsList class={listClass()} aria-label={local.ariaLabel}>
        <For each={tabItems()}>
          {(item) => (
            <TabsTrigger
              value={item.value}
              class={triggerClass()}
              title={item.title}
            >
              {item.label}
            </TabsTrigger>
          )}
        </For>
      </TabsList>
    </Tabs>
  );

  const textHeader = (): JSX.Element => (
    <Show when={local.label || local.description}>
      <div class="min-w-0 shrink">
        <Show when={local.label}>
          <Label class={cn('text-sm', local.labelClass)}>{local.label}</Label>
        </Show>
        <Show when={local.description}>
          <p class="text-xs text-muted-foreground">{local.description}</p>
        </Show>
      </div>
    </Show>
  );

  if (layout() === 'inline') {
    return (
      <div
        class={cn('flex items-center justify-between gap-3', local.rowClass, local.class)}
      >
        {textHeader()}
        {tabsControl()}
      </div>
    );
  }

  return (
    <div class={cn('space-y-2', local.class)}>
      <Show when={local.label}>
        <Label class={cn('text-sm', local.labelClass)}>{local.label}</Label>
      </Show>
      <Show when={local.description}>
        <p class="text-xs text-muted-foreground">{local.description}</p>
      </Show>
      {tabsControl()}
      <Show when={local.hint}>
        <p class="text-xs text-muted-foreground">{local.hint}</p>
      </Show>
    </div>
  );
}
