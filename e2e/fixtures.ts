// Senaryoların ortak parçaları.
import { test as base, expect, type Page } from '@playwright/test';
import { copyFileSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export { expect };
export const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Senaryo örnek sayının kendine ait bir kopyasıyla çalışır (data/<issue>.json),
 * böylece data/issue-001.json'a dokunmaz; kopya sonunda silinir.
 */
export function issueCopy(issue: string) {
  const path = `${ROOT}data/${issue}.json`;
  return {
    name: issue,
    path,
    create: () => copyFileSync(`${ROOT}data/issue-001.json`, path),
    read: () => JSON.parse(readFileSync(path, 'utf8')),
    remove: () => rmSync(path, { force: true }),
  };
}

/**
 * Yumuşak kontrol: başarısız olsa da senaryo sürer (sonraki adımların sonucu da
 * görünür); sonunda test başarısız sayılır.
 */
export const check = (name: string, cond: unknown, extra = '') =>
  expect.soft(cond, extra ? `${name} (${extra})` : name).toBeTruthy();

export const test = base.extend<{ errors: string[] }>({
  /** Sayfadaki konsol hata/uyarıları ve yakalanmamış hatalar; senaryo sonunda boş olmalı. */
  errors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await use(errors);
  },
});

/** Editördeki durum (window.__xform, src/editor/session.ts). */
export const editorState = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__xform.state;
    return JSON.parse(JSON.stringify({ ...s, selectedId: s.selectedId }));
  });

export async function openEditor(page: Page, issue: string, spread?: string) {
  await page.goto(`editor.html?issue=${issue}${spread ? `&spread=${spread}` : ''}`);
  await page.waitForSelector('body[data-ready]');
  await page.waitForTimeout(300);
}
