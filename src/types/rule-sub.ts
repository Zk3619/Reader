/** 规则订阅，对应 legado RuleSub.kt */
export interface RuleSub {
  id?: number;
  name: string;
  url: string;
  type: number;
  customOrder: number;
  autoUpdate: boolean;
  update: boolean;
  updateInterval: number;
  silentUpdate: boolean;
  js?: string;
  showRule?: string;
  sourceUrl?: string;
}
