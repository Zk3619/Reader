/** Side-effect: install process shim before other vendor modules evaluate. */
import processShim from './process.js';

const g = globalThis;
if (!g.process) {
  g.process = processShim;
} else {
  const p = g.process;
  if (typeof p.cwd !== 'function') p.cwd = processShim.cwd;
  if (typeof p.memoryUsage !== 'function') p.memoryUsage = processShim.memoryUsage;
  if (!p.env) p.env = processShim.env;
}
