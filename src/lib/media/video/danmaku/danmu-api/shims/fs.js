/** Browser stub for Node fs used by vendored bangumi-data-util */
export default {};
export const promises = {};
export function createWriteStream() {
  return { on() {}, end() {}, write() { return true; } };
}
export function existsSync() {
  return false;
}
export function mkdirSync() {}
export function readFileSync() {
  return '';
}
export function writeFileSync() {}
export function unlinkSync() {}
export function createReadStream() {
  return { pipe() { return this; }, on() { return this; } };
}
