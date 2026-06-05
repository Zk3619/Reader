/* @refresh reload */
import { render } from "solid-js/web";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "@/app/App";
import MigrationSplash from "@/migration/MigrationSplash";
import { isTauri } from "@/lib/platform/detect";

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
  render(() => <App />, root);
}

void bootstrap();
