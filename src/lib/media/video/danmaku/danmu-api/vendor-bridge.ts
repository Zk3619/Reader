/** Must stay first: installs `process` before vendored modules evaluate. */
import './shims/inject-process.js';

// @ts-expect-error vendored JS without types
import { Globals as G } from './vendor/configs/globals.js';
// @ts-expect-error vendored JS without types
import { matchAnime as match, getComment as comment } from './vendor/apis/dandan-api.js';

export const Globals = G as {
  init: (env: Record<string, string>) => void;
  deployPlatform: string;
  envs: Record<string, unknown> & {
    sourceOrderArr?: string[];
    blockedWords?: unknown;
  };
};

export const matchAnime = match as (
  url: URL,
  request: Request,
  clientIp: string,
) => Promise<Response>;

export const getComment = comment as (
  path: string,
  format: string,
  withRelated: boolean,
  clientIp: string,
  chConvert: boolean | number,
) => Promise<Response>;
