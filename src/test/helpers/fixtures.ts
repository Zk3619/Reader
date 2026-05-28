import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Reader 项目根目录（含 package.json） */
export const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

const FIXTURES_DIR = path.join(PROJECT_ROOT, 'src/test/fixtures');

export function readFixture(...segments: string[]): string {
  return readFileSync(path.join(FIXTURES_DIR, ...segments), 'utf8');
}

export function readProjectFile(...segments: string[]): string {
  return readFileSync(path.join(PROJECT_ROOT, ...segments), 'utf8');
}
