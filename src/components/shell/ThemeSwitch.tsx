import { MultiSwitch, type MultiSwitchOption } from "@/components/ui/multi-switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeLightIcon, ThemeDarkIcon, ThemeAutoIcon } from "@/components/shared/icons";
import { settingsStore } from "@/stores/settings";
import { applyThemeToDocument, type ThemeMode } from "@/lib/theme";

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
}

export function ThemeSwitch(props: ThemeSwitchProps) {
  const theme = () => settingsStore.state.app.theme;

  async function handleChange(value: ThemeMode) {
    await settingsStore.setTheme(value);
    applyThemeToDocument(value);
  }

  const label = () => {
    const t = theme();
    if (t === "light") return "浅色模式";
    if (t === "dark") return "深色模式";
    return "系统";
  };

  const content = (
    <MultiSwitch<ThemeMode>
      options={THEME_OPTIONS}
      value={theme}
      onChange={handleChange}
      class={props.class}
      sizeClass={props.sizeClass ?? "h-9 w-9"}
    />
  );

  if (props.withTooltip !== false) {
    return (
      <Tooltip>
        <TooltipTrigger as="div">{content}</TooltipTrigger>
        <TooltipContent>
          {label()}（左键循环切换，右键或长按打开菜单选择）
        </TooltipContent>
      </Tooltip>
    );
  }
  return content;
}
