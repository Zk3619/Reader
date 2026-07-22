/**
 * 在父级剩余宽高内保持比例缩放的盒子。
 *
 * 适用：封面、预览图等「宽高都受限、要等比缩放」的场景。
 * 实现：父级 `container-type: size` + 子级 `width: min(100cqi, ratio×100cqb, …max)`。
 * 上限用 inline style，避免动态 Tailwind 任意值进不了包。
 */

import type { JSX, ParentComponent } from 'solid-js';
import { splitProps } from 'solid-js';
import { cn } from '@/lib/utils';

export type AspectFitBoxProps = {
  /** 宽 / 高，默认 1（正方形） */
  ratio?: number;
  /**
   * 最大边长（正方形）或最大宽度上限，CSS 长度。
   * 可传多个，一并参与 `min()`。
   */
  max?: string | string[];
  class?: string;
  contentClass?: string;
  style?: JSX.CSSProperties;
  children?: JSX.Element;
};

export const AspectFitBox: ParentComponent<AspectFitBoxProps> = (props) => {
  const [local, others] = splitProps(props, [
    'ratio',
    'max',
    'class',
    'contentClass',
    'style',
    'children',
  ]);

  const ratio = () => {
    const r = local.ratio ?? 1;
    return Number.isFinite(r) && r > 0 ? r : 1;
  };

  const widthExpr = () => {
    const r = ratio();
    const caps = Array.isArray(local.max)
      ? local.max.filter(Boolean)
      : local.max
        ? [local.max]
        : [];
    const parts = ['100cqi', `calc(${r} * 100cqb)`, ...caps];
    return `min(${parts.join(', ')})`;
  };

  return (
    <div
      class={cn(
        'flex min-h-0 w-full flex-1 items-center justify-center',
        local.class,
      )}
      style={{
        'container-type': 'size',
        ...local.style,
      }}
      {...others}
    >
      <div
        class={cn('max-h-full max-w-full shrink-0', local.contentClass)}
        style={{
          width: widthExpr(),
          'aspect-ratio': String(ratio()),
        }}
      >
        {local.children}
      </div>
    </div>
  );
};
