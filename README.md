
# ViaBTC Watcher → GitHub Actions → Google Sheets (ฟรี)

แนวทางฟรี: ใช้ GitHub Actions รัน Playwright เปิด Watcher links หลายลิงก์ แล้วปล่อยผลลัพธ์เป็น `data.json` บน `gh-pages` เพื่อให้ Google Sheets (Apps Script) ดึงไปอัปเดตตาราง

## ใช้ยังไง (อย่างย่อ)
1) สร้าง Repo ใหม่บน GitHub แล้วอัปโหลดไฟล์ในโฟลเดอร์นี้ทั้งหมด:
   - `watchers.json` — ใส่ลิสต์ลิงก์ watcher (แก้ YOUR_KEY_* เป็นของจริง)
   - `scrape.js` — สคริปต์ Playwright ที่ดึงค่า
   - `package.json` — พึ่งพา Playwright
   - `.github/workflows/scrape.yml` — ตั้งเวลาและเผยแพร่ `data.json`

2) แก้ไฟล์ `watchers.json` ให้เป็น 30 ลิงก์จริงของคุณ

3) เปิดแท็บ Actions ใน GitHub → กด **Enable** ถ้าถูกถาม → กด **Run workflow** (หรือรอเวลา cron)

4) เมื่อรันสำเร็จ จะได้ไฟล์ `data.json` อยู่ใน branch `gh-pages` ของ repo นี้
   - URL แบบ RAW: `https://raw.githubusercontent.com/<OWNER>/<REPO>/gh-pages/data.json`

5) ใน Google Sheets:
   - สร้าง Apps Script ด้วยโค้ดตัวอย่างด้านล่าง (ใส่ RAW_URL ให้ตรงกับ repo ของคุณ)
   - ตั้ง Trigger ให้รันวันละครั้งหลังเที่ยงคืนตามเวลาที่ต้องการ

## Apps Script (คัดลอกไปวางได้เลย)
```javascript
const RAW_URL = 'https://raw.githubusercontent.com/<OWNER>/<REPO>/gh-pages/data.json'; // เปลี่ยนให้ตรง repo คุณ

function ensureSheet_(name, header) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.appendRow(header);
  return sh;
}

function upsertByKey_(sheet, rows, keyCols = 2) {
  if (!rows.length) return;
  const lr = sheet.getLastRow();
  const existing = lr > 1 ? sheet.getRange(2,1,lr-1,keyCols).getValues().map(r => r.join('|')) : [];
  const add = rows.filter(r => !existing.includes(r.slice(0,keyCols).join('|')));
  if (add.length) sheet.getRange(sheet.getLastRow()+1,1,add.length,add[0].length).setValues(add);
}

function importWatcherDaily() {
  const resp = UrlFetchApp.fetch(RAW_URL, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) throw new Error('Cannot fetch data.json ('+resp.getResponseCode()+')');
  const arr = JSON.parse(resp.getContentText());

  const sh = ensureSheet_('Watcher_Daily', ['date','name','coin','hashrate_24h','workers','access_key','url','ts']);
  const rows = arr.filter(x => x.ok).map(x => [x.date, x.name || '', x.coin || '', x.hashrate_24h || '', x.workers || '', x.access_key || '', x.url, x.ts ]);
  upsertByKey_(sh, rows, 2); // key = date + name
}
```

## หมายเหตุ
- Playwright ใช้พอสมควร — GitHub Actions ให้รันฟรีได้ตามโควต้าทั่วไปของบัญชีฟรี (พอสำหรับรายวัน)
- ถ้า UI Watcher เปลี่ยนใหญ่ ๆ ให้ปรับตัวหา element ใน `scrape.js` (บล็อก `extractSnapshot`)
- ถ้าอยาก disallow public access ให้ตั้ง repo private แล้วให้ Apps Script ใช้ URL ที่มี token (ต้องเสริมขั้นตอน auth เพิ่ม)

ขอให้ใช้งานราบรื่นครับ 🚀
