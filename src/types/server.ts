/** 服务器配置，对应 legado Server.kt */
export interface Server {
  id: number;
  name: string;
  type: string;
  config?: string;
  sortNumber: number;
}
