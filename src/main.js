import { FRAME, CELL } from './config.js';
import { validate } from './model.js';
import { renderSpread } from './render/spread.js';
import { settleHeights } from './render/blocks.js';

const params = new URLSearchParams(location.search);
const ISSUE_URL = `data/${params.get('issue') ?? 'issue-001'}.json`;

const stage = document.getElementById('stage');
const root = document.documentElement;
root.style.setProperty('--cell', `${CELL}px`);
root.style.setProperty('--frame-w', `${FRAME.width}px`);
root.style.setProperty('--frame-h', `${FRAME.height}px`);

let data;
let spreadIndex = 0;
let guides = params.has('guides');

async function boot() {
  data = await (await fetch(ISSUE_URL)).json();
  for (const p of validate(data)) console.warn('[xform]', p);

  const wanted = params.get('spread');
  spreadIndex = Math.max(0, data.spreads.findIndex((s) => s.id === wanted));

  checkLineHeights();
  await document.fonts.ready;
  await draw();
  addEventListener('resize', fit);
  addEventListener('keydown', onKey);
}

async function draw() {
  const frame = renderSpread(data, data.spreads[spreadIndex].id, { guides });
  frame.classList.toggle('frame--guides', guides);
  const holder = document.createElement('div');
  holder.className = 'frame-holder';
  holder.append(frame);
  stage.replaceChildren(holder);

  // Satır içi em/sup gibi ek font kesitleri de yüklenmiş olsun.
  await document.fonts.ready;
  const heights = settleHeights(frame);
  for (const b of data.blocks) if (b.id in heights) b.h = heights[b.id];
  window.__xform = { data, heights };
  fit();
  document.body.dataset.ready = '';
}

/** Satır yükseklikleri (--lh-* token'ları) hücrenin tam katı olmalı. */
function checkLineHeights() {
  const style = getComputedStyle(root);
  for (const name of ['title', 'deck', 'body', 'quote', 'subhead', 'small']) {
    const value = parseFloat(style.getPropertyValue(`--lh-${name}`));
    if (!(value > 0) || value % CELL) {
      console.warn(`[xform] --lh-${name} (${value}) hücrenin (${CELL}) tam katı değil`);
    }
  }
}

/** Spread'i bütün olarak ekrana sığdır. Reflow yok. */
function fit() {
  const holder = stage.querySelector('.frame-holder');
  if (!holder) return;
  const pad = 32;
  const s = Math.min(
    (stage.clientWidth - pad * 2) / FRAME.width,
    (stage.clientHeight - pad * 2) / FRAME.height,
  );
  holder.style.width = `${FRAME.width * s}px`;
  holder.style.height = `${FRAME.height * s}px`;
  holder.firstChild.style.transform = `scale(${s})`;
}

function onKey(e) {
  if (e.key === 'g') {
    guides = !guides;
    draw();
  } else if (e.key === 'ArrowRight' && spreadIndex < data.spreads.length - 1) {
    spreadIndex++;
    draw();
  } else if (e.key === 'ArrowLeft' && spreadIndex > 0) {
    spreadIndex--;
    draw();
  }
}

boot().catch((err) => {
  stage.textContent = `Yüklenemedi: ${err.message}`;
  console.error(err);
});
