/* @refresh reload */
import { render } from "solid-js/web";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "@/app/App.css";
import App from "@/app/App";
import MigrationSplash from "@/migration/MigrationSplash";
import { isTauri } from "@/lib/platform/detect";
import { settingsStore } from "@/stores/settings";
import {
  applyThemeToDocument,
  syncThemeBootstrapSnapshotFromAppSettings,
} from "@/lib/theme";

async function bootstrap() {
  const root = document.getElementById("root") as HTMLElement;
  if (isTauri()) {
    try {
      const win = getCurrentWindow();
      if (win.label === "migration_splash") {
        render(() => <MigrationSplash />, root);
        return;
      }
    } catch {
      // 非 Tauri 桌面环境，继续加载主应用
    }
  }
  await settingsStore.loadSettings().catch((e) => {
    console.warn("加载应用设置失败:", e);
  });
  applyThemeToDocument(settingsStore.state.app.theme);
  syncThemeBootstrapSnapshotFromAppSettings(settingsStore.state.app);
  // 阅读器 UI 等 critical 域由统一管线 hydrate（reader.ui）
  const { runPersistenceHydrateCritical } = await import("@/lib/persistence");
  await runPersistenceHydrateCritical().catch((e) => {
    console.warn("[persistence] hydrateCritical failed", e);
  });
  render(() => <App />, root);
}

void bootstrap();
