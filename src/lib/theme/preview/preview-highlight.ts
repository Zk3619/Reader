import type { ThemeComponentId } from '@/lib/theme/schema/theme-pack-v1';

/** 组件预览模式：仅高亮当前选中的组件，不向子级扩散 */
export function themePreviewHighlight(
  id: ThemeComponentId,
  selected?: ThemeComponentId,
  previewMode?: 'full' | 'component',
): string | undefined {
  if (previewMode !== 'component' || !selected || selected !== id) return undefined;
  return 'ring-2 ring-primary ring-offset-2 ring-offset-background';
}
