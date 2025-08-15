function toDashboardUrl(item) {
  const raw = item.url;
  const u = new URL(raw);
  // ใช้โดเมน .net เสมอ
  u.hostname = 'www.viabtc.net';

  const access_key = u.searchParams.get('access_key');
  // coin จาก watchers.json (ถ้าใน URL ไม่มี)
  const coin = (item.coin || u.searchParams.get('coin') || 'LTC').toUpperCase();

  // บังคับ path เป็นหน้า dashboard ภาษาอังกฤษ
  return `https://www.viabtc.net/en/observer/dashboard?access_key=${access_key}&coin=${coin}`;
}
