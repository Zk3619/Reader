/**
 * 应用内文本输入：在 ui/text-field 原语之上提供布局变体与无 Label 便捷用法。
 *
 * - form：标准表单（Label + Input + Description/Error，Root 使用 gap-1）
 * - bare：无 Label 单行/多行，自动包 TextField Root（工具栏、设置行、Hub 筛选）
 * - compact：bare 的紧凑高度（h-8 / text-xs）
 */

import type { ValidComponent } from 'solid-js';
import { mergeProps, splitProps } from 'solid-js';
import type { PolymorphicProps } from '@kobalte/core';
import { cva, type VariantProps } from 'class-variance-authority';
import {
  TextField,
  TextFieldInput,
  TextFieldTextArea,
  TextFieldLabel,
  TextFieldDescription,
  TextFieldErrorMessage,
} from '@/components/ui/text-field';
import { cn } from '@/lib/utils';

export {
  TextFieldLabel as AppTextFieldLabel,
  TextFieldDescription as AppTextFieldDescription,
  TextFieldErrorMessage as AppTextFieldErrorMessage,
};

const appTextFieldRootVariants = cva('', {
  variants: {
    layout: {
      form: 'flex flex-col gap-1',
      bare: 'flex min-w-0 flex-col gap-0',
      compact: 'flex min-w-0 flex-col gap-0',
    },
  },
  defaultVariants: { layout: 'form' },
});

const appTextFieldInputVariants = cva('', {
  variants: {
    layout: {
      form: '',
      bare: '',
      compact: 'h-8 py-1 text-xs',
    },
  },
  defaultVariants: { layout: 'form' },
});

const appTextFieldTextAreaVariants = cva('', {
  variants: {
    layout: {
      form: '',
      bare: '',
      compact: 'min-h-[4.5rem] py-1.5 text-xs',
    },
  },
  defaultVariants: { layout: 'form' },
});

export type AppTextFieldLayout = NonNullable<
  VariantProps<typeof appTextFieldRootVariants>['layout']
>;

type TextFieldRootProps = Parameters<typeof TextField>[0];

type AppTextFieldProps<T extends ValidComponent = 'div'> = PolymorphicProps<
  T,
  TextFieldRootProps
> & {
  layout?: AppTextFieldLayout;
};

/** 带布局变体的 TextField Root */
export function AppTextField<T extends ValidComponent = 'div'>(props: AppTextFieldProps<T>) {
  const [local, others] = splitProps(props as AppTextFieldProps, ['layout', 'class']);
  const layout = () => local.layout ?? 'form';
  return (
    <TextField
      class={cn(appTextFieldRootVariants({ layout: layout() }), local.class)}
      {...others}
    />
  );
}

type TextFieldInputProps = Parameters<typeof TextFieldInput>[0];

type AppTextFieldInputProps<T extends ValidComponent = 'input'> = PolymorphicProps<
  T,
  TextFieldInputProps
> & {
  /** 与 AppTextField layout 一致；form 时仅渲染 Input（需外层 AppTextField） */
  layout?: AppTextFieldLayout;
};

/** 单行输入；layout 为 bare/compact 时自动包 Root（须内联嵌套，否则 Solid 下拿不到 FormControl 上下文） */
export function AppTextFieldInput<T extends ValidComponent = 'input'>(
  rawProps: AppTextFieldInputProps<T>,
) {
  const props = mergeProps({ type: 'text' as const }, rawProps);
  const [local, others] = splitProps(props as AppTextFieldInputProps, ['type', 'class', 'layout']);
  const layout = () => local.layout ?? 'form';
  if (layout() === 'form') {
    return (
      <TextFieldInput
        type={local.type}
        class={cn(appTextFieldInputVariants({ layout: layout() }), local.class)}
        {...others}
      />
    );
  }
  return (
    <AppTextField layout={layout()}>
      <TextFieldInput
        type={local.type}
        class={cn(appTextFieldInputVariants({ layout: layout() }), local.class)}
        {...others}
      />
    </AppTextField>
  );
}

type TextFieldTextAreaProps = Parameters<typeof TextFieldTextArea>[0];

type AppTextFieldTextAreaProps<T extends ValidComponent = 'textarea'> = PolymorphicProps<
  T,
  TextFieldTextAreaProps
> & {
  layout?: AppTextFieldLayout;
};

/** 多行输入；layout 为 bare/compact 时自动包 Root（须内联嵌套，否则 Solid 下拿不到 FormControl 上下文） */
export function AppTextFieldTextArea<T extends ValidComponent = 'textarea'>(
  rawProps: AppTextFieldTextAreaProps<T>,
) {
  const [local, others] = splitProps(rawProps as AppTextFieldTextAreaProps, ['class', 'layout']);
  const layout = () => local.layout ?? 'form';
  if (layout() === 'form') {
    return (
      <TextFieldTextArea
        class={cn(appTextFieldTextAreaVariants({ layout: layout() }), local.class)}
        {...others}
      />
    );
  }
  return (
    <AppTextField layout={layout()}>
      <TextFieldTextArea
        class={cn(appTextFieldTextAreaVariants({ layout: layout() }), local.class)}
        {...others}
      />
    </AppTextField>
  );
}

/** bare 布局单行输入（fieldClass 作用于 Root，便于 flex 行内占位） */
export type AppTextFieldBareInputProps<T extends ValidComponent = 'input'> =
  AppTextFieldInputProps<T> & { fieldClass?: string | undefined };

export function AppTextFieldBareInput<T extends ValidComponent = 'input'>(
  rawProps: AppTextFieldBareInputProps<T>,
) {
  const props = mergeProps({ type: 'text' as const, layout: 'bare' as const }, rawProps);
  const [local, others] = splitProps(props as AppTextFieldBareInputProps, [
    'type',
    'class',
    'fieldClass',
    'layout',
  ]);
  const layout = () => (local.layout === 'compact' ? 'compact' : 'bare');
  return (
    <AppTextField layout={layout()} class={local.fieldClass}>
      <TextFieldInput
        type={local.type}
        class={cn(appTextFieldInputVariants({ layout: layout() }), local.class)}
        {...others}
      />
    </AppTextField>
  );
}

export type AppTextFieldBareTextAreaProps<T extends ValidComponent = 'textarea'> =
  AppTextFieldTextAreaProps<T> & { fieldClass?: string | undefined };

export function AppTextFieldBareTextArea<T extends ValidComponent = 'textarea'>(
  rawProps: AppTextFieldBareTextAreaProps<T>,
) {
  const props = mergeProps({ layout: 'bare' as const }, rawProps);
  const [local, others] = splitProps(props as AppTextFieldBareTextAreaProps, [
    'class',
    'fieldClass',
    'layout',
  ]);
  const layout = () => (local.layout === 'compact' ? 'compact' : 'bare');
  return (
    <AppTextField layout={layout()} class={local.fieldClass}>
      <TextFieldTextArea
        class={cn(appTextFieldTextAreaVariants({ layout: layout() }), local.class)}
        {...others}
      />
    </AppTextField>
  );
}
