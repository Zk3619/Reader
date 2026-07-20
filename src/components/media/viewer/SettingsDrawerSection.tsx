import type { ParentProps } from 'solid-js';

/** 阅读器设置/界面抽屉内分组容器（与 ReaderBehaviorSettingsDrawer 一致） */
export function SettingsDrawerSection(props: ParentProps<{ title: string }>) {
  return (
    <div class="mx-1 mb-2 space-y-0.5 rounded-lg border border-border/50 bg-muted/20 px-1 py-1">
      <p class="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">{props.title}</p>
      {props.children}
    </div>
  );
}
