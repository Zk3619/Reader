/** 规则订阅，对应 legado RuleSub.kt */
export interface RuleSub {
  id?: number;
  name: string;
  url: string;
  type: number;
  customOrder: number;
  autoUpdate: boolean;
  /** 上次更新时间戳 */
  update: number;
  updateInterval: number;
  silentUpdate: boolean;
  js?: string;
  showRule?: string;
  sourceUrl?: string;
}
