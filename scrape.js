
/**
 * GitHub Actions Watcher Scraper
 * - Reads watchers.json (array of {name, coin, url})
 * - Uses Playwright (Chromium) to open each Watcher URL
 * - Extracts visible 24H hashrate + workers
 * - Writes data.json
 *
 * Run locally:
 *   npm install
 *   npx playwright install --with-deps chromium
 *   node scrape.js
 */
import fs from 'fs';
import { chromium } from 'playwright';

function parseWatcher(url) {
  try {
    const u = new URL(url);
    const access_key = u.searchParams.get('access_key') || null;
    const coin = u.searchParams.get('coin') || null;
    return { access_key, coin };
  } catch {
    return { access_key: null, coin: null };
  }
}

async function extractSnapshot(page) {
  // Try to find a label for 24H hashrate and read nearby text
  const candidates = [
    'text=/24\\s*H(our)?\\s*(Avg\\.?|Average)?\\s*Hashrate/i',
    'text=/24H\\s*Hashrate/i',
    'text=/Average\\s*Hashrate/i',
    'text=/24H/i'
  ];
  let hashrateText = null;

  for (const sel of candidates) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.count() > 0) {
        // try sibling first
        const sib = loc.locator('xpath=following-sibling::*[1]');
        if (await sib.count() > 0) {
          hashrateText = (await sib.innerText()).trim();
          if (hashrateText) break;
        }
        // try parent then find number-ish text
        const parent = loc.locator('xpath=..');
        const near = parent.locator('xpath=.//*[contains(text(),"/s") or contains(text(),"H/s") or contains(text(),"h/s")]').first();
        if (await near.count() > 0) {
          hashrateText = (await near.innerText()).trim();
          if (hashrateText) break;
        }
      }
    } catch {}
  }

  if (!hashrateText) {
    const body = await page.textContent('body');
    const m = body && body.match(/([\d.,]+\s*(?:H|KH|MH|GH|TH|PH|EH)\/s)/i);
    if (m) hashrateText = m[1];
  }

  // Workers
  let workersText = null;
  try {
    const w = page.locator('text=/Workers?/i').first();
    if (await w.count() > 0) {
      const sib = w.locator('xpath=following-sibling::*[1]');
      if (await sib.count() > 0) {
        workersText = (await sib.innerText()).trim();
      }
    }
  } catch {}

  return { hashrateText, workersText };
}

async function run() {
  const raw = fs.readFileSync('watchers.json', 'utf-8');
  const list = JSON.parse(raw).filter(x => x && x.url);

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext();
  const out = [];
  const ts = new Date().toISOString();
  for (const item of list) {
    const { name, coin, url } = item;
    const meta = parseWatcher(url);
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(2000);
      const { hashrateText, workersText } = await extractSnapshot(page);
      out.push({
        date: new Date().toISOString().slice(0,10),
        name: name || '',
        coin: coin || meta.coin || '',
        hashrate_24h: hashrateText || '',
        workers: workersText || '',
        access_key: meta.access_key,
        url,
        ts,
        ok: true
      });
      console.log(`[OK] ${name || url} => ${hashrateText || 'N/A'}`);
    } catch (e) {
      out.push({ name: name || '', coin: coin || meta.coin || '', url, ts, ok: false, error: e.message });
      console.log(`[ERR] ${name || url} => ${e.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  fs.writeFileSync('data.json', JSON.stringify(out, null, 2), 'utf-8');
}

run().catch(e => { console.error(e); process.exit(1); });
