// Vercel Serverless Function - 서울(ICN) 리전에서 동행복권 API를 대신 호출하는 프록시
// 엔드포인트: /api/lotto?drwNo=1228 또는 /api/lotto?from=1130&to=1230
const https = require('https');

function fetchLotto(drwNo) {
  return new Promise((resolve, reject) => {
    const url = `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${drwNo}`;
    https.get(url, { timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          resolve({ returnValue: 'fail', error: 'JSON parse failed', raw: data.substring(0, 200) });
        }
      });
    }).on('error', (err) => {
      resolve({ returnValue: 'fail', error: err.message });
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = async function handler(req, res) {
  // CORS 허용 (GitHub Actions에서 호출 가능하도록)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { drwNo, from, to } = req.query;

  // 단일 회차 조회
  if (drwNo) {
    const data = await fetchLotto(parseInt(drwNo));
    return res.status(200).json(data);
  }

  // 범위 조회 (from ~ to)
  if (from && to) {
    const start = parseInt(from);
    const end = parseInt(to);
    
    if (end - start > 150) {
      return res.status(400).json({ error: 'Range too large. Max 150 draws at once.' });
    }

    const results = [];
    let consecutiveFailures = 0;

    for (let i = start; i <= end && consecutiveFailures < 5; i++) {
      const data = await fetchLotto(i);
      if (data && data.returnValue === 'success') {
        results.push(data);
        consecutiveFailures = 0;
      } else {
        consecutiveFailures++;
      }
      await sleep(150); // 매너 딜레이
    }

    return res.status(200).json({ count: results.length, data: results });
  }

  // 사용법 안내
  return res.status(200).json({
    message: 'Life Reversal Lotto Proxy API (Seoul Region)',
    usage: {
      single: '/api/lotto?drwNo=1228',
      range: '/api/lotto?from=1130&to=1230'
    }
  });
};
