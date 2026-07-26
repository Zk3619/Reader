/** Browser stub for Node `process` used by vendored danmu_api. */

const env = {};

function cwd() {
  return '/';
}

function memoryUsage() {
  return { heapUsed: 0, heapTotal: 0, rss: 0, external: 0 };
}

const processShim = {
  env,
  cwd,
  memoryUsage,
  platform: 'browser',
  version: '',
  versions: {},
  argv: [],
  exit() {},
  nextTick(cb, ...args) {
    queueMicrotask(() => cb(...args));
  },
};

export default processShim;
export { cwd, env, memoryUsage };
