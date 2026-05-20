/**
 * 内嵌 Tauri 子 WebView（data: HTML）中点击 yuedu:// 时，
 * 使用 withGlobalTauri 暴露的 __TAURI__.core.invoke 通知宿主执行网络书源导入。
 * 与 iframe 场景下 postMessage 宿主逻辑等价。
 */

export function appendYueduTauriPanelBridgeToHtml(html: string): string {
  // Tauri 子 WebView 里由 Rust on_navigation 拦截 yuedu:// / legado://，
  // 不在 data: 页内使用 invoke，避免 Origin=null 导致 ipc 500。
  return html;
}
