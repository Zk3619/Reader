import { createSignal, onMount } from 'solid-js';
import {
  getShellThemeMode,
  selectShellTheme,
  type ShellThemeMode,
} from '@/lib/shell-theme';

const OPTIONS: { mode: ShellThemeMode; label: string; title: string }[] = [
  { mode: 'light', label: '明', title: '浅色主题' },
  { mode: 'dark', label: '暗', title: '深色主题' },
  { mode: 'system', label: '跟随', title: '跟随系统外观' },
];

const RADIO_NAME = 'reader-web-shell-theme';

export function ThemeToggle(props?: { class?: string; compact?: boolean }) {
  const [mode, setMode] = createSignal<ShellThemeMode>('system');

  onMount(() => setMode(getShellThemeMode()));

  const pick = (next: ShellThemeMode) => {
    setMode(next);
    selectShellTheme(next);
  };

  return (
    <fieldset
      class={`theme-toggle inline-flex shrink-0 rounded-lg border border-border bg-muted/40 p-0.5 ${props?.class ?? ''}`}
    >
      <legend class="sr-only">外观主题</legend>
      {OPTIONS.map((opt) => (
        <label
          class="theme-toggle-btn rounded-md px-2 py-1 text-xs font-medium transition sm:px-2.5 sm:py-1.5 sm:text-sm"
          classList={{ 'is-active': mode() === opt.mode }}
          title={opt.title}
        >
          <input
            type="radio"
            class="sr-only"
            name={RADIO_NAME}
            value={opt.mode}
            checked={mode() === opt.mode}
            onChange={() => pick(opt.mode)}
          />
          {props?.compact ? opt.label.charAt(0) : opt.label}
        </label>
      ))}
    </fieldset>
  );
}
