/**
 * v3 主题目标宿主：在尽量不引入布局盒的前提下，把目标主题限制到 DOM 子树。
 */
import {
  createContext,
  createEffect,
  onCleanup,
  splitProps,
  useContext,
  type JSX,
} from 'solid-js';
import type { ThemeTargetId } from '@/lib/theme/theme-targets';
import {
  applyThemeTargetToElement,
  clearThemeTargetFromElement,
} from '@/lib/theme/theme-runtime';
import { useThemePackRuntime } from '@/components/theme/ThemePackRuntimeProvider';
import { cn } from '@/lib/utils';

const ThemeTargetContext = createContext<() => ThemeTargetId>();

export function useThemeTarget(): ThemeTargetId | undefined {
  return useContext(ThemeTargetContext)?.();
}

export interface ThemeTargetHostProps
  extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'children'> {
  target: ThemeTargetId;
  children: JSX.Element;
  /** 默认 display: contents；传入其它类可让宿主成为实际布局根。 */
  class?: string;
}

export function ThemeTargetHost(props: ThemeTargetHostProps) {
  const [local, rest] = splitProps(props, ['target', 'children', 'class']);
  const runtime = useThemePackRuntime();
  let host!: HTMLDivElement;

  createEffect(() => {
    const target = local.target;
    const pack = runtime.targetPack(target);
    clearThemeTargetFromElement(host);
    host.setAttribute('data-theme-target', target);
    if (pack) applyThemeTargetToElement(host, pack, target);
  });

  onCleanup(() => clearThemeTargetFromElement(host));

  return (
    <ThemeTargetContext.Provider value={() => local.target}>
      <div
        {...rest}
        ref={host}
        class={cn('contents', local.class)}
        data-theme-target={local.target}
      >
        {local.children}
      </div>
    </ThemeTargetContext.Provider>
  );
}
