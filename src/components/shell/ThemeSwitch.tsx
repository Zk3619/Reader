import { MultiSwitch, type MultiSwitchOption } from "@/components/ui/multi-switch";
import { Show } from "solid-js";
import { ThemeLightIcon, ThemeDarkIcon, ThemeAutoIcon } from "@/components/shared/icons";
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from "@/components/shared/AppTooltip";
import { settingsStore } from "@/stores/settings";
import { applyThemeToDocument, type ThemeMode } from "@/lib/theme";
import { ViewerAppDropdownMenuContent } from "@/components/viewer/viewer-app-overlay";

const THEME_OPTIONS: MultiSwitchOption<ThemeMode>[] = [
  { value: "light", label: "浅色", icon: ThemeLightIcon },
  { value: "dark", label: "深色", icon: ThemeDarkIcon },
  { value: "auto", label: "系统", icon: ThemeAutoIcon },
];

export interface ThemeSwitchProps {
  class?: string;
  sizeClass?: string;
  /** 是否包裹在 Tooltip 中（导航栏用 true） */
  withTooltip?: boolean;
  /** 阅读器叠层内为 true：下拉/Tooltip 使用正确 z-index */
  inViewerOverlay?: boolean;
}

export function ThemeSwitch(props: ThemeSwitchProps) {
  const theme = () => settingsStore.state.app.theme;
  const inViewer = () => props.inViewerOverlay === true;

  async function handleChange(value: ThemeMode) {
    await settingsStore.setTheme(value);
    applyThemeToDocument(value);
  }

  const label = () => {
    const t = theme();
    if (t === "light") return "浅色模式";
    if (t === "dark") return "深色模式";
    return "跟随系统";
  };

  const tooltipHint = () =>
    `${label()}（左键循环切换，右键或长按打开菜单选择）`;

  const switchControl = (
    <MultiSwitch<ThemeMode>
      options={THEME_OPTIONS}
      value={theme}
      onChange={handleChange}
      class={props.class}
      sizeClass={props.sizeClass ?? "h-9 w-9"}
      DropdownMenuContent={inViewer() ? ViewerAppDropdownMenuContent : undefined}
    />
  );

  if (props.withTooltip === false) {
    return switchControl;
  }

  return (
    <AppTooltip>
      <AppTooltipTrigger as="div">{switchControl}</AppTooltipTrigger>
      <Show when={inViewer()} fallback={<AppTooltipContent>{tooltipHint()}</AppTooltipContent>}>
        <AppTooltipContent layer="viewer">{tooltipHint()}</AppTooltipContent>
      </Show>
    </AppTooltip>
  );
}
