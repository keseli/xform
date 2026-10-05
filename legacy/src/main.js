// Okuma görünümü: ızgara, rozet, uyarı ve tutamaç yok.
import { FRAME, CELL } from './config.js';
import { loadIssue } from './data.js';
import { renderSpread } from './render/spread.js';
import { placeElement, settleHeights } from './render/blocks.js';
import { layoutStacks } from './stacks.js';
import { fitFrame } from './render/fit.js';
import { checkLineHeights, loadFonts, onFontsChanged } from './render/type.js';

const params = new URLSearchParams(location.search);
const ISSUE = params.get('issue') ?? 'issue-001';

const stage = document.getElementById('stage');
const root = document.documentElement;
root.style.setProperty('--cell', `${CELL}px`);
root.style.setProperty('--frame-w', `${FRAME.width}px`);
root.style.setProperty('--frame-h', `${FRAME.height}px`);

let data;
let spreadIndex = 0;

async function boot() {
  data = await loadIssue(ISSUE);

  const wanted = params.get('spread');
  spreadIndex = Math.max(0, data.spreads.findIndex((s) => s.id === wanted));

  checkLineHeights();
  await loadFonts();
  await draw();
  // Bir font sonradan gelirse (yavaş ağ) yükseklikler ve yığınlar yeniden.
  onFontsChanged(measure);
  addEventListener('resize', fit);
  addEventListener('keydown', onKey);
}

async function draw() {
  const frame = renderSpread(data, data.spreads[spreadIndex].id);
  const holder = document.createElement('div');
  holder.className = 'frame-holder';
  holder.append(frame);
  stage.replaceChildren(holder);

  // Satır içi em/sup gibi ek font kesitleri de yüklenmiş olsun.
  await document.fonts.ready;
  measure();
  fit();
  document.body.dataset.ready = '';
}

/** Yükseklikleri ölç, yığınları bu yüksekliklerle diz. */
function measure() {
  const frame = stage.querySelector('.frame');
  if (!frame) return;
  const heights = settleHeights(frame);
  for (const b of data.blocks) if (b.id in heights) b.h = heights[b.id];
  layoutStacks(data);
  for (const b of data.blocks) {
    const el = b.stack_id != null && frame.querySelector(`.block[data-id="${CSS.escape(b.id)}"]`);
    if (el) placeElement(el, b);
  }
  window.__xform = { data, heights };
}

function fit() {
  const holder = stage.querySelector('.frame-holder');
  if (holder) fitFrame(holder, stage, 32);
}

function onKey(e) {
  if (e.key === 'ArrowRight' && spreadIndex < data.spreads.length - 1) {
    spreadIndex++;
    draw();
  } else if (e.key === 'ArrowLeft' && spreadIndex > 0) {
    spreadIndex--;
    draw();
  } else if (e.key === 'e') {
    location.href = `legacy/editor.html?issue=${ISSUE}&spread=${data.spreads[spreadIndex].id}`;
  }
}

boot().catch((err) => {
  stage.textContent = `Yüklenemedi: ${err.message}`;
  console.error(err);
});
