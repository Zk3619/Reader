/**
 * 浏览器环境 path 占位，仅提供最小接口避免引用报错。
 * sql.js 在浏览器下不会实际使用。
 */
function join(...parts: string[]): string {
  return parts.join('/');
}
function dirname(p: string): string {
  return p.split('/').slice(0, -1).join('/') || '.';
}
export default { join, dirname };
export { join, dirname };
