import { describe, expect, it } from 'vitest';
import hub from '@/components/media/viewer/video/tv/hub/TvHubContent.tsx?raw';
import manifest from '../../../../src-tauri/android/tv-spider/src/main/AndroidManifest.xml?raw';
import fence from '../../../../src-tauri/android/tv-spider/src/main/java/com/zkingz/reader/tv/TvJarCrashFence.kt?raw';
import host from '../../../../src-tauri/android/tv-spider/src/main/java/com/zkingz/reader/tv/TvSpiderHost.kt?raw';
import plugin from '../../../../src-tauri/android/tv-spider/src/main/java/com/zkingz/reader/tv/TvSpiderPlugin.kt?raw';

describe('tv hub android crash guards', () => {
  it('does not apply backdrop-filter on the hub shell (WebView GPU crash)', () => {
    expect(hub).not.toMatch(/backdrop-blur/);
  });

  it('loads Guard JAR in the main process like FongMi, not :tvspider', () => {
    expect(manifest).not.toMatch(/android:process=":tvspider"/);
    expect(manifest).not.toMatch(/TvSpiderHostService/);
    expect(plugin).toMatch(/TvSpiderHost\(activity\.application\)/);
    expect(plugin).not.toMatch(/TvSpiderClient/);
  });

  it('writes a crash-fence sentinel before DexClassLoader', () => {
    expect(fence).toMatch(/sentinel\.v1/);
    expect(fence).toMatch(/影视 JAR 上次加载导致应用崩溃/);
    expect(host).toMatch(/TvJarCrashFence/);
    expect(host).toMatch(/fence\.begin/);
    expect(plugin).toMatch(/crashFenceBoot/);
  });
});
