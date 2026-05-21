import {
  createContext,
  createMemo,
  useContext,
  type Accessor,
  type ParentProps,
} from 'solid-js';
import { resolveShellLayout, type ShellLayoutResolved } from '@/lib/shell/layout';
import { isMobile } from '@/lib/platform/detect';
import { settingsState } from '@/stores/settings';

export type ShellLayoutStore = ShellLayoutResolved & {
  windowWidth: number;
};

const ShellLayoutContext = createContext<Accessor<ShellLayoutStore>>();

export function ShellLayoutProvider(props: ParentProps<{ windowWidth: Accessor<number> }>) {
  const layout = createMemo<ShellLayoutStore>(() => {
    const preference = settingsState.app.shellLayout ?? 'auto';
    const resolved = resolveShellLayout({
      windowWidth: props.windowWidth(),
      preference,
      isMobileDevice: isMobile(),
    });
    return {
      windowWidth: props.windowWidth(),
      ...resolved,
    };
  });

  return (
    <ShellLayoutContext.Provider value={layout}>
      {props.children}
    </ShellLayoutContext.Provider>
  );
}

export function useShellLayout() {
  const ctx = useContext(ShellLayoutContext);
  if (!ctx) {
    throw new Error('useShellLayout must be used within ShellLayoutProvider');
  }
  return ctx;
}
