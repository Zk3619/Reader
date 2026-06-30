/**
 * 应用内开关：固定占位、内嵌 focus ring、切换后 blur，
 * 避免 ring-offset / 焦点残留导致弹窗、抽屉等父容器布局塌缩。
 * 底层仍使用 @/components/ui/switch 的 Root / Label（Kobalte Switch 原语）。
 */

import type { JSX, ParentProps, ValidComponent } from 'solid-js';
import { splitProps } from 'solid-js';
import type { PolymorphicProps } from '@kobalte/core/polymorphic';
import type { SwitchRootProps } from '@kobalte/core/switch';
import * as SwitchPrimitive from '@kobalte/core/switch';

import {
  Switch,
  SwitchLabel,
  SwitchDescription,
  SwitchErrorMessage,
} from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { withBlurAfter } from '@/utils/accessibility';

/** 固定开关轨道占位，防止父级 flex 行高抖动 */
const APP_SWITCH_SLOT_CLASS =
  'relative inline-flex h-6 w-11 shrink-0 items-center justify-center contain-layout';

const APP_SWITCH_ROOT_CLASS = 'inline-flex shrink-0 items-center';

const APP_SWITCH_CONTROL_TRACK_CLASS =
  'inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-input transition-[color,background-color,box-shadow] data-disabled:cursor-not-allowed data-checked:bg-primary data-disabled:opacity-50';

/** 内嵌 ring，避免 ring-offset 撑开 scroll-gutter 导致布局塌缩 */
const APP_SWITCH_INPUT_FOCUS_CLASS =
  '[&:focus-visible+div]:outline-none [&:focus-visible+div]:ring-2 [&:focus-visible+div]:ring-ring [&:focus-visible+div]:ring-inset';

const APP_SWITCH_THUMB_CLASS =
  'pointer-events-none block size-5 translate-x-0 rounded-full bg-background shadow-lg ring-0 transition-transform data-checked:translate-x-5';

type AppSwitchSplitProps = SwitchRootProps & {
  class?: string;
  children?: JSX.Element;
};

export type AppSwitchProps = ParentProps<AppSwitchSplitProps>;

export function AppSwitch(props: AppSwitchProps) {
  const [local, rest] = splitProps(props as AppSwitchSplitProps, ['onChange', 'class', 'children']);

  const handleChange = (checked: boolean) => {
    if (!local.onChange) return;
    withBlurAfter(local.onChange)(checked);
  };

  return (
    <Switch class={cn(APP_SWITCH_ROOT_CLASS, local.class)} {...rest} onChange={handleChange}>
      {local.children}
    </Switch>
  );
}

type AppSwitchControlProps = SwitchPrimitive.SwitchControlProps & {
  class?: string | undefined;
  children?: JSX.Element;
};

export const AppSwitchControl = <T extends ValidComponent = 'input'>(
  props: PolymorphicProps<T, AppSwitchControlProps>,
) => {
  const [local, others] = splitProps(props as AppSwitchControlProps, ['class', 'children']);
  return (
    <div class={APP_SWITCH_SLOT_CLASS}>
      <SwitchPrimitive.Input class={APP_SWITCH_INPUT_FOCUS_CLASS} />
      <SwitchPrimitive.Control
        class={cn(APP_SWITCH_CONTROL_TRACK_CLASS, local.class)}
        {...others}
      >
        {local.children}
      </SwitchPrimitive.Control>
    </div>
  );
};

type AppSwitchThumbProps = SwitchPrimitive.SwitchThumbProps & { class?: string | undefined };

export const AppSwitchThumb = <T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, AppSwitchThumbProps>,
) => {
  const [local, others] = splitProps(props as AppSwitchThumbProps, ['class']);
  return (
    <SwitchPrimitive.Thumb class={cn(APP_SWITCH_THUMB_CLASS, local.class)} {...others} />
  );
};

export {
  SwitchLabel as AppSwitchLabel,
  SwitchDescription as AppSwitchDescription,
  SwitchErrorMessage as AppSwitchErrorMessage,
};
