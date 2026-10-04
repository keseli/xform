import { validate } from './model.js';

export async function loadIssue(name) {
  const res = await fetch(`data/${name}.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`data/${name}.json yüklenemedi (${res.status})`);
  const data = await res.json();
  for (const p of validate(data)) console.warn('[xform]', p);
  return data;
}

/** Dev sunucusundaki yazma ucuna kaydeder (scripts/serve.mjs). */
export async function saveIssue(name, data) {
  const res = await fetch(`api/data/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`kaydedilemedi (${res.status})`);
}
