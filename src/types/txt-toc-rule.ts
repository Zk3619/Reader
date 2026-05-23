/** 本地目录规则，对应 legado TxtTocRule.kt */
export interface TxtTocRule {
  id: number;
  name: string;
  rule: string;
  replacement: string;
  example?: string;
  serialNumber: number;
  enable: boolean;
}
