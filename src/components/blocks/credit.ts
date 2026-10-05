import { escapeHtml } from '../../inline.ts';

/** Caption ya da notun sonuna eklenen küçük, soluk künye. */
export const creditHtml = (credits: string[] | undefined) =>
  credits?.length ? ` <span class="credit">${credits.map(escapeHtml).join(' · ')}</span>` : '';
