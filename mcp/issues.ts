// Sayı ve şablon dosyalarına erişim (MCP sunucusu). Kök klasör parametre:
// testler geçici bir klasörle çalışır.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutStacks } from '../src/stacks.ts';
import type { Issue, Template } from '../src/types.ts';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Aracın açık bir mesajla reddettiği istek; sunucu isError olarak döner. */
export class ToolError extends Error {}

const NAME = /^[a-z0-9-]+$/;

export const issueFile = (root: string, name: string) => join(root, 'data', `${name}.json`);

/** data/ altındaki sayılar (taslaklar dahil), ada göre. */
export function listIssues(root: string): string[] {
  return readdirSync(join(root, 'data'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
    .filter((n) => NAME.test(n))
    .sort();
}

/** Sayıyı okur; yığın çocuklarının konumu yığından hesaplanır. */
export function readIssue(root: string, name: string): Issue {
  if (typeof name !== 'string' || !NAME.test(name)) {
    throw new ToolError(`Invalid issue name "${name}": use lowercase letters, digits and "-". Known: ${listIssues(root).join(', ')}.`);
  }
  const file = issueFile(root, name);
  if (!existsSync(file)) {
    throw new ToolError(`Issue "${name}" not found (data/${name}.json). Known: ${listIssues(root).join(', ')}.`);
  }
  const data = JSON.parse(readFileSync(file, 'utf8')) as Issue;
  layoutStacks(data);
  return data;
}

/** data/templates/*.json, ada göre (scripts/api.mjs ile aynı sıra). */
export function readTemplates(root: string): { key: string; template: Template }[] {
  const dir = join(root, 'data', 'templates');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ key: f.slice(0, -5), template: JSON.parse(readFileSync(join(dir, f), 'utf8')) as Template }))
    .sort((a, b) => String(a.template.name).localeCompare(String(b.template.name), 'tr'));
}
