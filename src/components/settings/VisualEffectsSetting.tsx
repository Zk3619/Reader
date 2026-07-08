import { AppSwitch, AppSwitchControl, AppSwitchLabel, AppSwitchThumb } from '@/components/shared/AppSwitch';
import { settingsStore } from '@/stores/settings';

function VisualEffectSwitch(props: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <div class="flex items-center justify-between gap-4">
      <div class="min-w-0 space-y-0.5">
        <p class="text-sm font-medium text-foreground">{props.title}</p>
        <p class="text-sm text-muted-foreground">{props.description}</p>
      </div>
      <AppSwitch checked={props.checked} onChange={(v: boolean) => props.onChange(!!v)}>
        <AppSwitchControl class="data-disabled:cursor-not-allowed">
          <AppSwitchThumb />
        </AppSwitchControl>
        <AppSwitchLabel class="sr-only">{props.label}</AppSwitchLabel>
      </AppSwitch>
    </div>
  );
}

/** 全局阴影 / 透明 / 模糊开关（低端设备性能优化） */
export function VisualEffectsSetting() {
  return (
    <div class="rounded-2xl border border-border/50 bg-card p-6">
      <div class="mb-4 space-y-0.5">
        <h3 class="font-semibold text-foreground">视觉特效</h3>
        <p class="text-sm text-muted-foreground">
          关闭阴影、半透明或背景模糊可减轻 GPU 与合成开销，适合低端设备
        </p>
      </div>
      <div class="space-y-4">
        <VisualEffectSwitch
          title="阴影"
          description="悬浮胶囊光晕、Toast 等 box-shadow 效果"
          label="阴影"
          checked={settingsStore.state.app.enableVisualShadow !== false}
          onChange={(v) => void settingsStore.setEnableVisualShadow(v)}
        />
        <VisualEffectSwitch
          title="半透明背景"
          description="阅读器顶底栏、主题 surface 等的半透明底色"
          label="半透明背景"
          checked={settingsStore.state.app.enableVisualTransparency !== false}
          onChange={(v) => void settingsStore.setEnableVisualTransparency(v)}
        />
        <VisualEffectSwitch
          title="背景模糊"
          description="backdrop-filter 毛玻璃效果（开销较高）"
          label="背景模糊"
          checked={settingsStore.state.app.enableVisualBlur !== false}
          onChange={(v) => void settingsStore.setEnableVisualBlur(v)}
        />
      </div>
    </div>
  );
}
