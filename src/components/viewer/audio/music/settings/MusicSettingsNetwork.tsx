import type { Component } from 'solid-js';

export const MusicSettingsNetwork: Component = () => (
  <div class="space-y-2 p-4 text-sm text-muted-foreground">
    <p>网络代理复用 Reader 全局 HTTP 代理配置（设置 → 网络）。</p>
    <p>Web 端音乐请求经内置代理转发，无需单独配置。</p>
  </div>
);
