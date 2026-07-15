import { describe, expect, it } from 'vitest';
import { buildThemePackScopedCss } from '@/lib/theme/theme-runtime';
import { createDefaultThemePack } from '@/lib/theme/schema/theme-pack-v1';

describe('theme target runtime CSS isolation', () => {
  it('scopes target custom CSS to the pack and target host', () => {
    const pack = createDefaultThemePack();
    pack.advanced = {
      customCss: [
        {
          scope: 'music.playDetail',
          css: 'color: rgb(1 2 3);',
        },
      ],
    };

    expect(buildThemePackScopedCss(pack)).toContain(
      `[data-theme-pack-id="${pack.id}"][data-theme-scope="music.playDetail"]`,
    );
  });
});
