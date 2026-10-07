// render_spread: okuma görünümünü (ya da ızgaralı editör görünümünü) başsız
// Chromium'da açar, ekran görüntüsünü ve ölçülen yükseklikleri döner.
//
// - Kendi Vite sunucusunu açar (boş bir port, loglar kapalı: stdout protokole ait).
// - Sayfanın data/<ad>.json isteği bellekteki veriyle yanıtlanır; dosyaya
//   yazılmamış bir durum da çizilebilir. Editörün kayıt istekleri engellenir.
// - Tarayıcı ve sunucu ilk çizimde açılır, sunucu kapanınca kapanır.
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { CELL, COLS, FRAME } from '../src/config.ts';
import { toFileForm } from '../src/stacks.ts';
import type { Issue, Rect } from '../src/types.ts';

export type View = 'read' | 'editor';

export interface RenderRequest {
  name: string;
  data: Issue;
  spreadId: string;
  view: View;
  /** Hücre cinsinden bölge; yoksa bütün spread. */
  region: Rect;
  /** Çıktı genişliği (px). */
  width: number;
}

export interface RenderResult {
  png: Buffer;
  /** Görüntüde bir hücrenin piksel boyu. */
  pxPerCell: number;
  /** Ölçümden sonraki veri (yükseklikler yazılmış, yığınlar dizilmiş). */
  data: Issue;
  heights: Record<string, number>;
}

/** Çıktı ölçeğinin üst sınırı (cihaz piksel oranı); küçük bölgeler bununla sınırlı büyür. */
const MAX_DPR = 6;
const VIEWPORT = {
  // Okuma görünümünde frame bu boyutta 1:1 sığar (fitFrame, 32 px pay).
  read: { width: FRAME.width + 64, height: FRAME.height + 64 },
  editor: { width: 2400, height: 1400 },
};

export class Renderer {
  private root: string;
  private vite: ViteDevServer | null = null;
  private base = '';
  private browser: Browser | null = null;
  private contexts = new Map<string, BrowserContext>();
  private starting: Promise<void> | null = null;

  constructor(root: string) {
    this.root = root;
  }

  private start(): Promise<void> {
    this.starting ??= (async () => {
      this.vite = await createServer({
        root: this.root,
        configFile: join(this.root, 'vite.config.ts'),
        logLevel: 'silent',
        clearScreen: false,
        server: { port: 5190, strictPort: false, hmr: false },
      });
      await this.vite.listen();
      const url = this.vite.resolvedUrls?.local[0];
      if (!url) throw new Error('Vite sunucusu adres vermedi');
      this.base = url;
      try {
        this.browser = await chromium.launch();
      } catch (err) {
        throw new Error(
          `Chromium could not start (${(err as Error).message.split('\n')[0]}). Install it once with: npx playwright install chromium`,
        );
      }
    })();
    // Başlatma başarısızsa bir sonraki çağrı yeniden dener.
    this.starting.catch(() => this.close());
    return this.starting;
  }

  private async context(view: View, dpr: number): Promise<BrowserContext> {
    const key = `${view}@${dpr}`;
    let ctx = this.contexts.get(key);
    if (!ctx) {
      // Her ölçek ayrı bağlam; en eski kapanır.
      if (this.contexts.size >= 4) {
        const [oldest, old] = this.contexts.entries().next().value!;
        this.contexts.delete(oldest);
        await old.close();
      }
      ctx = await this.browser!.newContext({ viewport: VIEWPORT[view], deviceScaleFactor: dpr });
      this.contexts.set(key, ctx);
    }
    return ctx;
  }

  /** Sayfayı açar; veri bellekten, kayıt istekleri engelli. */
  private async open(ctx: BrowserContext, req: RenderRequest): Promise<Page> {
    const page = await ctx.newPage();
    const body = JSON.stringify(toFileForm(req.data));
    await page.route(`**/data/${req.name}.json*`, (r) => r.fulfill({ contentType: 'application/json', body }));
    await page.route('**/api/**', (r) => {
      const url = r.request().url();
      if (url.includes('/api/templates') && r.request().method() === 'GET') return r.fallback();
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ revision: req.data.revision ?? 0 }) });
    });
    const file = req.view === 'editor' ? 'editor.html' : 'index.html';
    await page.goto(`${this.base}${file}?issue=${req.name}&spread=${req.spreadId}`);
    await page.waitForSelector('body[data-ready]', { timeout: 30_000 });
    await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    return page;
  }

  async render(req: RenderRequest): Promise<RenderResult> {
    await this.start();
    // Frame'in CSS ölçeği görünüme göre sabit: okumada 1, editörde bir kez ölçülür.
    const scale = req.view === 'read' ? 1 : await this.editorScale(req);
    const regionCss = req.region.w * CELL * scale;
    const dpr = Math.min(MAX_DPR, Math.max(0.25, req.width / regionCss));
    const page = await this.open(await this.context(req.view, dpr), req);
    try {
      const frame = (await page.locator('.frame').first().boundingBox())!;
      const s = frame.width / (COLS * CELL);
      const clip = {
        x: frame.x + req.region.x * CELL * s,
        y: frame.y + req.region.y * CELL * s,
        width: req.region.w * CELL * s,
        height: req.region.h * CELL * s,
      };
      const png = await page.screenshot({ clip, type: 'png' });
      const measured =
        req.view === 'read'
          ? await page.evaluate(() => {
              const x = (window as unknown as { __xform: { data: unknown; heights: Record<string, number> } }).__xform;
              return { data: JSON.parse(JSON.stringify(x.data)), heights: x.heights };
            })
          : await page.evaluate(() => {
              const x = (window as unknown as { __xform: { state: { data: unknown } } }).__xform;
              return { data: JSON.parse(JSON.stringify(x.state.data)), heights: {} };
            });
      return { png, pxPerCell: CELL * s * dpr, data: measured.data as Issue, heights: measured.heights };
    } finally {
      await page.close();
    }
  }

  private editorScaleValue: number | null = null;
  private async editorScale(req: RenderRequest): Promise<number> {
    if (this.editorScaleValue == null) {
      const page = await this.open(await this.context('editor', 1), req);
      const frame = (await page.locator('.frame').first().boundingBox())!;
      this.editorScaleValue = frame.width / (COLS * CELL);
      await page.close();
    }
    return this.editorScaleValue;
  }

  async close(): Promise<void> {
    await this.browser?.close().catch(() => {});
    await this.vite?.close().catch(() => {});
    this.browser = null;
    this.vite = null;
    this.starting = null;
    this.contexts.clear();
  }
}
