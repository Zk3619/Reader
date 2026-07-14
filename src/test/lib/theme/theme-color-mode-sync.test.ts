import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyThemeToDocument } from '@/lib/theme/runtime';
import {
  applyActiveThemePackToDocument,
  getActiveDocumentThemePack,
} from '@/lib/theme/theme-runtime';
import { cloneThemePack, createDefaultThemePack } from '@/lib/theme/schema/theme-pack-v1';

/** Node 测试无 DOM：为 theme runtime 提供最小 document.documentElement */
function installMinimalDocument() {
  const props = new Map<string, string>();
  const classes = new Set<string>();
  const attrs = new Map<string, string>();

  const documentElement = {
    classList: {
      contains: (c: string) => classes.has(c),
      toggle: (c: string, force?: boolean) => {
        const on = force === undefined ? !classes.has(c) : force;
        if (on) classes.add(c);
        else classes.delete(c);
        return on;
      },
      remove: (...cs: string[]) => {
        for (const c of cs) classes.delete(c);
      },
      add: (...cs: string[]) => {
        for (const c of cs) classes.add(c);
      },
    },
    style: {
      setProperty: (name: string, value: string) => {
        props.set(name, value);
      },
      getPropertyValue: (name: string) => props.get(name) ?? '',
      removeProperty: (name: string) => {
        props.delete(name);
      },
    },
    setAttribute: (k: string, v: string) => {
      attrs.set(k, v);
    },
    removeAttribute: (k: string) => {
      attrs.delete(k);
    },
    querySelector: () => null,
    appendChild: <T>(node: T) => node,
  };

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: {
      documentElement,
      createElement: (tag: string) => ({
        tagName: tag.toUpperCase(),
        textContent: '',
        setAttribute: () => undefined,
      }),
    },
  });

  return { props, classes };
}

describe('theme color mode sync', () => {
  let props: Map<string, string>;
  let classes: Set<string>;

  beforeEach(() => {
    ({ props, classes } = installMinimalDocument());
  });

  afterEach(() => {
    applyActiveThemePackToDocument(null);
    Reflect.deleteProperty(globalThis, 'document');
  });

  it('ThemeSwitch 切换明暗时按 pack 的 light/dark 语义色重写 CSS 变量', () => {
    const pack = cloneThemePack(createDefaultThemePack({ name: 'music-theme-sync' }));
    pack.app!.tokens.light = {
      ...pack.app!.tokens.light,
      primary: '12 90% 55%',
    };
    pack.app!.tokens.dark = {
      ...pack.app!.tokens.dark,
      primary: '210 80% 60%',
    };

    applyActiveThemePackToDocument(pack, { colorMode: 'light' });
    expect(getActiveDocumentThemePack()?.id).toBe(pack.id);
    expect(props.get('--primary')).toBe('12 90% 55%');
    expect(classes.has('dark')).toBe(false);

    applyThemeToDocument('dark');
    expect(classes.has('dark')).toBe(true);
    expect(props.get('--primary')).toBe('210 80% 60%');

    applyThemeToDocument('light');
    expect(classes.has('dark')).toBe(false);
    expect(props.get('--primary')).toBe('12 90% 55%');
  });
});
