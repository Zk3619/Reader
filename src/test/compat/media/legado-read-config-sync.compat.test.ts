import { describe, expect, it } from 'vitest';
import {
  exportLegadoReadConfigBundle,
  importReaderUiConfigFromBackupEntries,
  legadoPrefsToPatch,
  textViewerUiConfigFromLegadoImport,
} from '@/lib/media/text/legado-read-config-sync';
import { parseLegadoSharedPrefsXml } from '@/lib/media/text/legado-prefs-xml';
import { mergeTextViewerUiConfig } from '@/lib/media/text/merge-text-viewer-ui-config';
import { defaultTextViewerUiConfig } from '@/lib/media/text/reader-ui-config';

describe('legado read config sync', () => {
  it('merges readerUi bundle payload', () => {
    const merged = mergeTextViewerUiConfig(defaultTextViewerUiConfig, {
      selectText: false,
      textSelectDismissScope: 'outsideHandle',
      expandTextMenu: true,
    });
    expect(merged.selectText).toBe(false);
    expect(merged.textSelectDismissScope).toBe('outsideHandle');
    expect(merged.expandTextMenu).toBe(true);
  });

  it('imports Legado prefs including textSelectDismissScope extension', () => {
    const prefs = {
      selectText: false,
      expandTextMenu: true,
      textSelectDismissScope: 'outsideHandle',
      readStyleSelect: 2,
      clickActionMiddleCenter: 0,
      doubleHorizontalPage: '1',
    };
    const patch = legadoPrefsToPatch(prefs);
    const config = mergeTextViewerUiConfig(defaultTextViewerUiConfig, patch);
    expect(config.selectText).toBe(false);
    expect(config.expandTextMenu).toBe(true);
    expect(config.textSelectDismissScope).toBe('outsideHandle');
    expect(config.theme).toBe(2);
    expect(config.dualPage).toBe('always');
    expect(config.clickActions.mc).toBe('menu');
  });

  it('parses Android shared prefs xml', () => {
    const xml = `
      <map>
        <boolean name="selectText" value="false" />
        <int name="readStyleSelect" value="3" />
        <string name="textSelectDismissScope">outsideHandle</string>
      </map>`;
    const prefs = parseLegadoSharedPrefsXml(xml);
    expect(prefs.selectText).toBe(false);
    expect(prefs.readStyleSelect).toBe(3);
    expect(prefs.textSelectDismissScope).toBe('outsideHandle');
  });

  it('imports readConfig.json style with prefs overlay', () => {
    const readConfigJson = JSON.stringify([
      {
        name: '预设0',
        textSize: 22,
        lineSpacingExtra: 11,
        paragraphSpacing: 4,
        pageAnim: 3,
        tipFooterLeft: 1,
      },
    ]);
    const config = textViewerUiConfigFromLegadoImport(
      {
        readConfigJson,
        prefs: { readStyleSelect: 0, selectText: true, textSelectDismissScope: 'outsideHandle' },
      },
      defaultTextViewerUiConfig,
    );
    expect(config.fontSize).toBe(22);
    expect(config.pageAnim).toBe('scroll');
    expect(config.pageTips.footerLeft).toBe('chapterTitle');
    expect(config.textSelectDismissScope).toBe('outsideHandle');
  });

  it('round-trips export bundle with dismiss scope', () => {
    const source = mergeTextViewerUiConfig(defaultTextViewerUiConfig, {
      textSelectDismissScope: 'outsideHandle',
      selectText: false,
      expandTextMenu: true,
    });
    const exported = exportLegadoReadConfigBundle(source);
    const reimported = importReaderUiConfigFromBackupEntries({
      'readerUiConfig.json': exported.readerUiConfigJson,
      'readConfig.json': exported.readConfigJson,
      'readerPrefs.json': exported.readerPrefsJson,
    });
    expect(reimported?.textSelectDismissScope).toBe('outsideHandle');
    expect(reimported?.selectText).toBe(false);
    expect(reimported?.expandTextMenu).toBe(true);
  });

  it('readerUiConfig.json takes precedence over legado prefs on import', () => {
    const readerUi = JSON.stringify({
      textSelectDismissScope: 'outsideHandleAndSelection',
      selectText: true,
    });
    const config = textViewerUiConfigFromLegadoImport(
      {
        readerUiJson: readerUi,
        prefs: {
          selectText: false,
          textSelectDismissScope: 'outsideHandle',
        },
      },
      defaultTextViewerUiConfig,
    );
    expect(config.selectText).toBe(true);
    expect(config.textSelectDismissScope).toBe('outsideHandleAndSelection');
  });
});
