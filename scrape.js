/**
 * Robust GitHub Actions Watcher Scraper
 * - อ่าน watchers.json (array of {name, coin, url})
 * - แปลง URL worker → dashboard อัตโนมัติ (ต้องมี coin)
 * - เปิดหน้า, รอโหลด, ดึง 24H hashrate + workers
 * - สร้าง data.json เสมอ (แม้บางรายการ fail)
 */
import fs from 'fs';
import { chromium } from 'playwright';

function readWatchers() {
  try {
    const raw = fs.readFileSync('watchers.json', 'utf-8');
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) throw new Error('watchers.json must be an array');
    return arr.filter(x => x && x.url);
  } catch (e) {
    console.error('READ watchers.json FAILED:', e.message);
    return []; // คืนอาเรย์ว่าง แล้วให้ไปสร้าง data.json ว่างแทน
  }
}

function toDashboardUrl(item) {
  const u = new URL(item.url);
  const access_key = u.searchParams.get('access_key');
  const coin = (item.coin || u.searchParams.get('coin') || 'LTC').toUpperCase();
  // บังคับไปหน้า dashboard (ภาษาอังกฤษ) ให้ชัวร์
  return `https://www.viabtc.com/en/observer/dashboard?access_key=${access_key}&coin=${coin}`;
}

async function extractSnapshot(page) {
  // พยายามหาเลขที่ลงท้ายด้วย /s ใกล้คำว่า 24H/Hashrate
  const labels = [
    'text=/24\\s*H(our)?/i',
    'text=/24H\\s*Hashrate/i',
    'text=/Average\\s*Hashrate/i'
  ];
  let hashrateText = null;
  for (const sel of labels) {
    try {
      const el = page.locator(sel).first();
      if (await el.count() > 0) {
        const near = el.locator(
          'xpath=..//*[matches(text(),"[0-9][\\d.,]*\\s*(H|KH|MH|GH|TH|PH|EH)/s","i")]'
        ).first();
        if (await near.count() > 0) {
          hashrateText = (await near.textContent() || '').trim();
          if (hashrateText) break;
        }
        const sib = el.locator('xpath=following-sibling::*[1]');
        if (await sib.count() > 0 && !hashrateText) {
          const t = (await sib.textContent() || '').trim();
          if (/[0-9][\d.,]*\s*(H|KH|MH|GH|TH|PH|EH)\/s/i.test(t)) {
            hashrateText = t; break;
          }
        }
      }
    } catch {}
  }
  if (!hashrateText) {
    const body = await page.textContent('body');
    const m = body && body.match(/([\d.,]+\s*(?:H|KH|MH|GH|TH|PH|EH)\/s)/i);
    if (m) hashrateText = m[1];
  }

  let workersText = null;
  try {
    const w = page.locator('text=/Workers?/i').first();
    if (await w.count() > 0) {
      const v = w.locator('xpath=..//following-sibling::*[1]');
      if (await v.count() > 0) workersText = (await v.textContent() || '').trim();
    }
  } catch {}
  return { hashrateText, workersText };
}

async function run() {
  const list = readWatchers();
  const out = [];
  const ts = new Date().toISOString();

  // ถ้าไม่มี watcher เลย ให้สร้างไฟล์ว่างแล้วออกด้วย code 0
  if (list.length === 0) {
    fs.writeFileSync('data.json', JSON.stringify([], null, 2), 'utf-8');
    console.warn('No watchers in watchers.json -> wrote empty data.json');
    return;
  }

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext();

  for (const item of list) {
    const dashUrl = toDashboardUrl(item);
    const page = await ctx.newPage();
    try {
      await page.goto(dashUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 });
      await page.waitForTimeout(2500);

      const { hashrateText, workersText } = await extractSnapshot(page);
      out.push({
        date: new Date().toISOString().slice(0,10),
        name: item.name || '',
        coin: (item.coin || 'LTC').toUpperCase(),
        hashrate_24h: hashrateText || '',
        workers: workersText || '',
        access_key: new URL(dashUrl).searchParams.get('access_key'),
        url: dashUrl,
        ts,
        ok: true
      });
      console.log(`[OK] ${item.name || dashUrl} => ${hashrateText || 'N/A'}`);
    } catch (e) {
      out.push({
        name: item.name || '',
        coin: (item.coin || '').toUpperCase(),
        url: dashUrl, ts, ok: false, error: e.message
      });
      console.log(`[ERR] ${item.name || dashUrl} => ${e.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  fs.writeFileSync('data.json', JSON.stringify(out, null, 2), 'utf-8');
}

run()
  .then(() => { console.log('DONE, data.json written'); })
  .catch(e => {
    console.error('FATAL:', e.message);
    // สุดท้ายก็ยังเขียนไฟล์ว่างกันไว้ เพื่อไม่ให้ step ต่อไปพัง
    try { fs.writeFileSync('data.json', JSON.stringify([], null, 2), 'utf-8'); } catch {}
    process.exit(0);
  });
