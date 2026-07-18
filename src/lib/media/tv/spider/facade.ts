/**
 * Spider 统一门面
 */

import type { Site } from '../types';
import { httpEngine } from './http-engine';
import { jsEngine } from './js-engine';
import { jarEngine, jarUnavailableEngine, getJarEngineKind } from './jar-engine';
import { pyEngine } from './py-engine';
import type { SpiderEngine } from './types';

let jarReady: SpiderEngine = jarUnavailableEngine;

export async function initJarBackend(): Promise<void> {
  const kind = await getJarEngineKind();
  jarReady = kind === 'unavailable' ? jarUnavailableEngine : jarEngine;
}

export function pickEngine(site: Site): SpiderEngine {
  // csp_* 必须优先走 JAR，避免 api/路径误匹配 .js/.py
  if (jarEngine.supports(site)) return jarReady;
  if (httpEngine.supports(site)) return httpEngine;
  if (jsEngine.supports(site)) return jsEngine;
  if (pyEngine.supports(site)) return pyEngine;
  return httpEngine;
}

export function listEngines(): SpiderEngine[] {
  return [httpEngine, jsEngine, jarReady, pyEngine];
}
