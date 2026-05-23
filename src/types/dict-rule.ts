/** 词典规则，对应 legado DictRule.kt */
export interface DictRule {
  name: string;
  urlRule: string;
  showRule: string;
  enabled: boolean;
  sortNumber: number;
}
