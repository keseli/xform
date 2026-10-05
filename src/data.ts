import { validate } from './model.ts';
import { layoutStacks, toFileForm } from './stacks.ts';
import { validateTemplate } from './templates.ts';
import type { Issue, Template } from './types.ts';

export async function loadIssue(name: string): Promise<Issue> {
  const res = await fetch(`data/${name}.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`data/${name}.json yüklenemedi (${res.status})`);
  const data = (await res.json()) as Issue;
  for (const p of validate(data)) console.warn('[xform]', p);
  // Yığın çocuklarının konumu dosyada yok; yığından hesapla (yükseklikler
  // ölçüldükten sonra görünümler bunu tekrar yapar).
  layoutStacks(data);
  return data;
}

export class ConflictError extends Error {
  revision: number;
  constructor(revision: number) {
    super(`dosya dışarıda değişti (revision ${revision})`);
    this.revision = revision;
  }
}

/**
 * Dev sunucusundaki yazma ucuna kaydeder (scripts/api.mjs). Dosyadaki
 * revision gönderilenle aynı değilse ConflictError fırlatır. Yeni revision'ı döner.
 */
export async function saveIssue(name: string, data: Issue, revision: number): Promise<number> {
  const res = await fetch(`api/data/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision, ...toFileForm(data) }),
  });
  if (res.status === 409) throw new ConflictError((await res.json()).revision);
  if (!res.ok) throw new Error(`kaydedilemedi (${res.status})`);
  return (await res.json()).revision;
}

export async function fetchRevision(name: string): Promise<number> {
  const res = await fetch(`api/revision/${name}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`revision okunamadı (${res.status})`);
  return (await res.json()).revision;
}

/** data/templates/ altındaki şablonlar, ada göre sıralı (scripts/api.mjs). */
export async function fetchTemplates(): Promise<{ key: string; template: Template }[]> {
  const res = await fetch('api/templates', { cache: 'no-store' });
  if (!res.ok) throw new Error(`şablonlar okunamadı (${res.status})`);
  const list = (await res.json()) as { key: string; template: Template }[];
  for (const { key, template } of list) {
    for (const p of validateTemplate(template)) console.warn(`[xform] şablon ${key}:`, p);
  }
  return list;
}

/** Şablonu data/templates/<key>.json olarak yazar (varsa üzerine). */
export async function saveTemplate(key: string, template: Template): Promise<void> {
  const res = await fetch(`api/templates/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(template),
  });
  if (!res.ok) throw new Error(`şablon kaydedilemedi (${res.status})`);
}
