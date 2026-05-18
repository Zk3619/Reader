/** 脚本内 java.ajax() 需同步返回响应体（Legado 行为），用挂起/恢复实现：抛出此错误后由 runner 等待请求完成并重跑脚本 */
export class SuspendScript extends Error {
  constructor(
    public promise: Promise<string>,
    public writeIndex: number,
    public resolvedUrl: string,
    /** 发起 ajax 的时刻（ms），用于真实网络耗时 */
    public requestStart: number
  ) {
    super('SuspendScript');
    this.name = 'SuspendScript';
  }
}
