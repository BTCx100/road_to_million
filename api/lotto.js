// api/lotto.js — Vercel Serverless Function
// ทำหน้าที่ "คนกลาง" เรียก API สำนักงานสลากฯ (GLO) จากฝั่ง server เพื่อเลี่ยงปัญหา CORS
// เว็บ (index.html) จะเรียกมาที่ /api/lotto ของตัวเอง (same-origin ไม่ติด CORS)
//
// รองรับ 3 โหมดผ่าน query parameter ?action=
//   /api/lotto?action=latest                          -> งวดล่าสุด
//   /api/lotto?action=byDate&date=01&month=06&year=2026 -> ผลตามวันที่
//   /api/lotto?action=check  (POST body: {numbers:[...], period_date:"2026-06-01"}) -> ตรวจเลข

const GLO = {
  latest: 'https://www.glo.or.th/api/lottery/getLatestLottery',
  byDate: 'https://www.glo.or.th/api/checking/getLotteryResult',
  check:  'https://www.glo.or.th/api/checking/getcheckLotteryResult',
};

export default async function handler(req, res) {
  // เปิด CORS ให้ทุก origin (เผื่อเรียกจากที่อื่น) — ปลอดภัยเพราะเป็น proxy อ่านอย่างเดียว
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const action = (req.query && req.query.action) || 'latest';

  try {
    let glUrl, glBody;

    if (action === 'latest') {
      glUrl = GLO.latest;
      glBody = undefined; // getLatestLottery ไม่ต้องส่ง body
    } else if (action === 'byDate') {
      const { date, month, year } = req.query;
      if (!date || !month || !year) {
        res.status(400).json({ ok: false, error: 'ต้องระบุ date, month, year' });
        return;
      }
      glUrl = GLO.byDate;
      glBody = JSON.stringify({ date, month, year });
    } else if (action === 'check') {
      // body มาจาก POST: {numbers:["123456",...], period_date:"2026-06-01"}
      const body = req.body || {};
      const nums = (body.numbers || []).slice(0, 10).map(n => ({ lottery_num: String(n) }));
      if (!nums.length || !body.period_date) {
        res.status(400).json({ ok: false, error: 'ต้องระบุ numbers[] และ period_date' });
        return;
      }
      glUrl = GLO.check;
      glBody = JSON.stringify({ number: nums, period_date: body.period_date });
    } else {
      res.status(400).json({ ok: false, error: 'action ไม่ถูกต้อง' });
      return;
    }

    const r = await fetch(glUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: glBody,
    });

    if (!r.ok) {
      res.status(502).json({ ok: false, error: 'GLO API ตอบกลับผิดพลาด', status: r.status });
      return;
    }

    const data = await r.json();
    // โหมด debug: ?action=latest&raw=1 -> แสดง JSON สวยอ่านง่าย (ไว้ส่งให้ดูโครงสร้าง)
    if (req.query && req.query.raw) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(200).send(JSON.stringify(data, null, 2));
      return;
    }
    res.status(200).json({ ok: true, data });

  } catch (e) {
    res.status(500).json({ ok: false, error: 'เรียก GLO API ไม่สำเร็จ: ' + e.message });
  }
}
