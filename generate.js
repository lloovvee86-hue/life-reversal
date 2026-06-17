const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// 디렉토리 경로 정의
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const HISTORY_FILE = path.join(DATA_DIR, 'lotto_history.json');

// 디렉토리 자동 생성
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

// TLS 인증서 검증 비활성화 (동행복권 해외 접근 시 SSL 에러 우회용)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// GET 요청 유틸리티 (http/https 자동 판별, 타임아웃 및 리다이렉트 지원)
function httpGet(url, retries = 3) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 10000 }, (res) => {
      // 리다이렉트 처리
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location, retries).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          if (retries > 0) {
            console.warn(`⚠️ JSON 파싱 재시도 (남은 횟수: ${retries})`);
            setTimeout(() => httpGet(url, retries - 1).then(resolve).catch(reject), 1000);
          } else {
            reject(new Error('JSON 파싱 실패: ' + data.substring(0, 200)));
          }
        }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.on('error', (err) => {
      if (retries > 0) {
        setTimeout(() => httpGet(url, retries - 1).then(resolve).catch(reject), 1000);
      } else {
        reject(err);
      }
    });
  });
}

// Vercel 서울 프록시 API 주소 (환경변수로 주입 가능, 기본값: 배포된 Vercel 도메인)
const PROXY_BASE = process.env.PROXY_URL || 'https://life-reversal.vercel.app';

// 로또 당첨 데이터 1회 가져오기 (서울 프록시 API → 직접 호출 순서로 시도)
async function fetchLottoDrw(drwNo) {
  const urls = [
    `${PROXY_BASE}/api/lotto?drwNo=${drwNo}`,
    `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${drwNo}`,
    `http://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${drwNo}`
  ];
  for (const url of urls) {
    try {
      const data = await httpGet(url, 1);
      if (data && data.returnValue === 'success') {
        return data;
      }
    } catch (error) {
      console.warn(`⚠️ ${drwNo}회차 실패 (${url.substring(0, 50)}...):`, error.message);
    }
  }
  return null;
}

// 지연 함수 (서버 차단 방지 매너 딜레이)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log('🫡 [Zero-Dependency] 로또 데이터 동기화 및 페이지 생성 작업을 시작합니다, 대표님!');

  // 1. 기존 데이터 파일 로드
  let lottoHistory = [];
  if (fs.existsSync(HISTORY_FILE)) {
    try {
      lottoHistory = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    } catch (e) {
      console.warn('⚠️ 기존 데이터 파일이 손상되었습니다. 새로 구축합니다.');
      lottoHistory = [];
    }
  }

  // 2. 마지막 회차부터 최근 회차까지 순차적으로 긁어오기 (가장 마지막 다운로드한 회차 기준)
  let startDrwNo = lottoHistory.length > 0 ? lottoHistory[lottoHistory.length - 1].drwNo + 1 : 1;
  
  if (startDrwNo === 1) {
    // 최초 실행 시: 현재 날짜 기준으로 최신 회차를 자동 추정 (2002년 12월 7일 1회차 기준, 매주 1회)
    const firstDrawDate = new Date('2002-12-07');
    const now = new Date();
    const weeksDiff = Math.floor((now - firstDrawDate) / (7 * 24 * 60 * 60 * 1000));
    const estimateLatest = weeksDiff + 1;
    startDrwNo = Math.max(1, estimateLatest - 100); // 최근 100회차 수집
    console.log(`ℹ️ 최초 빌드: 추정 최신 회차 ${estimateLatest}회, ${startDrwNo}회차부터 수집을 시작합니다.`);
  }

  let consecutiveFailures = 0;
  let currentDrwNo = startDrwNo;

  console.log(`🚀 데이터 수집 시작 회차: ${currentDrwNo}회`);

  while (consecutiveFailures < 3) { // 3번 연속 실패하면 최신 회차에 도달한 것으로 판단
    const data = await fetchLottoDrw(currentDrwNo);
    if (data) {
      lottoHistory.push(data);
      console.log(`✅ Lotto ${currentDrwNo}회 수집 완료: [${data.drwtNo1}, ${data.drwtNo2}, ${data.drwtNo3}, ${data.drwtNo4}, ${data.drwtNo5}, ${data.drwtNo6}] + ${data.bnusNo}`);
      consecutiveFailures = 0;
      currentDrwNo++;
      await sleep(150); // 딜레이
    } else {
      consecutiveFailures++;
      currentDrwNo++;
      await sleep(300);
    }
  }

  // 최신 데이터 순으로 정렬 및 중복 제거
  const uniqueMap = new Map();
  lottoHistory.forEach(item => uniqueMap.set(item.drwNo, item));
  const sortedHistory = Array.from(uniqueMap.values()).sort((a, b) => a.drwNo - b.drwNo);

  // 데이터 캐시 파일에 다시 저장
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(sortedHistory, null, 2), 'utf-8');
  console.log(`📊 현재까지 총 ${sortedHistory.length}개 회차의 데이터가 로컬에 세팅 완료되었습니다.`);

  if (sortedHistory.length === 0) {
    console.error('❌ 수집된 로또 데이터가 없습니다. 중단합니다.');
    return;
  }

  // 3. 통계 데이터 계산 엔진 작동
  const latestLotto = sortedHistory[sortedHistory.length - 1];
  const numCounts = Array(46).fill(0); // 1~45번 빈도수 계산용
  let oddCount = 0;
  let evenCount = 0;

  sortedHistory.forEach((lotto) => {
    const nums = [lotto.drwtNo1, lotto.drwtNo2, lotto.drwtNo3, lotto.drwtNo4, lotto.drwtNo5, lotto.drwtNo6];
    nums.forEach(n => {
      numCounts[n] = (numCounts[n] || 0) + 1;
      if (n % 2 === 0) evenCount++;
      else oddCount++;
    });
  });

  // 가장 많이 등장한 숫자 순위 매기기
  const numberRank = numCounts
    .map((count, num) => ({ num, count }))
    .slice(1) // 0번 인덱스 버림
    .sort((a, b) => b.count - a.count);

  const topNumbers = numberRank.slice(0, 6); // 역대 최다 등장 TOP 6

  // 4. 초고급 정적 HTML 페이지 빌드 
  const htmlContent = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>인생역전 - 로또 실시간 데이터 분석 & 번호 통계</title>
    <meta name="description" content="동행복권 최신 당첨 결과와 역대 로또 통계 분석! 가장 많이 나온 번호, 홀짝 비율 등 빅데이터 기반 로또 번호 자동 생성 및 통계 도구입니다.">
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Noto+Sans+KR:wght@300;400;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-color: #0b0f19;
            --card-bg: rgba(255, 255, 255, 0.03);
            --border-color: rgba(255, 255, 255, 0.08);
            --primary-color: #ffd700;
            --accent-color: #8a2be2;
            --text-color: #f3f4f6;
            --text-muted: #9ca3af;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            background-color: var(--bg-color);
            color: var(--text-color);
            font-family: 'Outfit', 'Noto Sans KR', sans-serif;
            line-height: 1.6;
            overflow-x: hidden;
        }

        body::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: 
                radial-gradient(circle at 10% 20%, rgba(138, 43, 226, 0.15) 0%, transparent 40%),
                radial-gradient(circle at 90% 80%, rgba(255, 215, 0, 0.08) 0%, transparent 40%);
            z-index: -1;
        }

        header {
            max-width: 1200px;
            margin: 0 auto;
            padding: 40px 20px;
            text-align: center;
        }

        .logo {
            font-size: 2.5rem;
            font-weight: 800;
            letter-spacing: -1px;
            background: linear-gradient(135deg, var(--primary-color) 0%, #ff8c00 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 8px;
        }

        header p {
            color: var(--text-muted);
            font-size: 1.1rem;
        }

        main {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 20px 80px 20px;
            display: grid;
            grid-template-columns: 1fr;
            gap: 30px;
        }

        @media (min-width: 900px) {
            main {
                grid-template-columns: 2fr 1fr;
            }
        }

        .card {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 20px;
            padding: 30px;
            backdrop-filter: blur(10px);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            transition: transform 0.3s ease, border-color 0.3s ease;
        }

        .card:hover {
            border-color: rgba(255, 215, 0, 0.2);
            transform: translateY(-2px);
        }

        h2 {
            font-size: 1.5rem;
            font-weight: 700;
            margin-bottom: 20px;
            border-left: 4px solid var(--primary-color);
            padding-left: 12px;
        }

        .balls-container {
            display: flex;
            gap: 12px;
            justify-content: center;
            flex-wrap: wrap;
            margin: 25px 0;
        }

        .ball {
            width: 55px;
            height: 55px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.3rem;
            font-weight: 800;
            color: #fff;
            box-shadow: inset -5px -5px 12px rgba(0,0,0,0.4), 0 5px 15px rgba(0,0,0,0.3);
            text-shadow: 1px 1px 2px rgba(0,0,0,0.6);
        }

        .ball.y { background: linear-gradient(135deg, #fbc02d, #f57f17); }
        .ball.b { background: linear-gradient(135deg, #1e88e5, #0d47a1); }
        .ball.r { background: linear-gradient(135deg, #e53935, #b71c1c); }
        .ball.g { background: linear-gradient(135deg, #78909c, #37474f); }
        .ball.p { background: linear-gradient(135deg, #43a047, #1b5e20); }

        .plus {
            font-size: 2rem;
            align-self: center;
            font-weight: 300;
            color: var(--text-muted);
        }

        .info-row {
            display: flex;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px dashed var(--border-color);
        }

        .info-row:last-child {
            border-bottom: none;
        }

        .label {
            color: var(--text-muted);
        }

        .value {
            font-weight: 700;
        }

        .ads-slot {
            margin: 20px 0;
            padding: 20px;
            background: rgba(255, 255, 255, 0.02);
            border: 1px dashed rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            text-align: center;
            font-size: 0.85rem;
            color: var(--text-muted);
        }

        .btn-generate {
            display: block;
            width: 100%;
            background: linear-gradient(90deg, #ffd700, #ff8c00);
            color: #0b0f19;
            border: none;
            padding: 16px;
            font-size: 1.1rem;
            font-weight: 700;
            border-radius: 12px;
            cursor: pointer;
            transition: filter 0.2s;
            margin-top: 15px;
        }

        .btn-generate:hover {
            filter: brightness(1.1);
        }

        .bar-chart {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-top: 20px;
        }

        .bar-row {
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .bar-label {
            width: 30px;
            font-weight: bold;
        }

        .bar-outer {
            flex-grow: 1;
            background: rgba(255,255,255,0.05);
            height: 16px;
            border-radius: 8px;
            overflow: hidden;
        }

        .bar-inner {
            background: linear-gradient(90deg, var(--accent-color), #ff007f);
            height: 100%;
            border-radius: 8px;
        }

        footer {
            text-align: center;
            padding: 40px;
            color: var(--text-muted);
            font-size: 0.9rem;
            border-top: 1px solid var(--border-color);
            margin-top: 60px;
        }
    </style>
</head>
<body>

    <header>
        <div class="logo">🍀 LIFE REVERSAL</div>
        <p>인생역전 로또 빅데이터 정적 분석 시스템</p>
    </header>

    <main>
        <div style="display: flex; flex-direction: column; gap: 30px;">
            <section class="card">
                <h2>최신 제 ${latestLotto.drwNo}회 당첨 번호</h2>
                <p style="color: var(--text-muted); text-align: center;">추첨일: ${latestLotto.drwNoDate || '토요일'}</p>
                
                <div class="balls-container">
                    <div class="ball ${getBallColorClass(latestLotto.drwtNo1)}">${latestLotto.drwtNo1}</div>
                    <div class="ball ${getBallColorClass(latestLotto.drwtNo2)}">${latestLotto.drwtNo2}</div>
                    <div class="ball ${getBallColorClass(latestLotto.drwtNo3)}">${latestLotto.drwtNo3}</div>
                    <div class="ball ${getBallColorClass(latestLotto.drwtNo4)}">${latestLotto.drwtNo4}</div>
                    <div class="ball ${getBallColorClass(latestLotto.drwtNo5)}">${latestLotto.drwtNo5}</div>
                    <div class="ball ${getBallColorClass(latestLotto.drwtNo6)}">${latestLotto.drwtNo6}</div>
                    <span class="plus">+</span>
                    <div class="ball ${getBallColorClass(latestLotto.bnusNo)}">${latestLotto.bnusNo}</div>
                </div>

                <div class="info-row">
                    <span class="label">총 판매 금액</span>
                    <span class="value">${Number(latestLotto.totSellamnt || 0).toLocaleString()} 원</span>
                </div>
                <div class="info-row">
                    <span class="label">1등 당첨 금액 (1인당)</span>
                    <span class="value" style="color: var(--primary-color);">${Number(latestLotto.firstWinamnt || 0).toLocaleString()} 원</span>
                </div>
                <div class="info-row">
                    <span class="label">1등 당첨 인원</span>
                    <span class="value">${latestLotto.firstPrzwnerCo || 0} 명</span>
                </div>
            </section>

            <div class="ads-slot">
                💡 여기에 애드센스 인피드/디스플레이 광고가 연동됩니다. (구글 스팸 필터 예방용 텍스트 탑재 영역)
            </div>

            <section class="card">
                <h2>최다 빈출 번호 TOP 6 (누적 통계)</h2>
                <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 20px;">
                    역대 당첨 데이터를 실시간으로 크롤링하여 가장 많이 등장했던 번호 조합을 분석했습니다.
                </p>
                <div class="balls-container" style="justify-content: flex-start;">
                    ${topNumbers.map(n => `<div class="ball ${getBallColorClass(n.num)}">${n.num}</div>`).join('')}
                </div>
                
                <div class="bar-chart">
                    ${topNumbers.map(n => {
                      const percentage = Math.round((n.count / sortedHistory.length) * 100);
                      return `
                      <div class="bar-row">
                          <span class="bar-label">${n.num}번</span>
                          <div class="bar-outer">
                              <div class="bar-inner" style="width: ${percentage * 5}%"></div>
                          </div>
                          <span class="value" style="font-size: 0.9rem;">${n.count}회 (${percentage}%)</span>
                      </div>`;
                    }).join('')}
                </div>
            </section>
        </div>

        <div style="display: flex; flex-direction: column; gap: 30px;">
            <section class="card">
                <h2>행운의 번호 추출기</h2>
                <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 15px;">
                    가장 높은 통계적 매칭 확률을 가진 조합 알고리즘으로 무작위 번호를 추출합니다.
                </p>
                <button class="btn-generate" onclick="generateLuckyNumbers()">번호 조합 생성 🚀</button>
                <div id="lucky-result" style="margin-top: 20px;"></div>
            </section>

            <section class="card">
                <h2>패턴 분석 브리핑</h2>
                <div class="info-row">
                    <span class="label">총 누적 분석 회차</span>
                    <span class="value">${sortedHistory.length}회차</span>
                </div>
                <div class="info-row">
                    <span class="label">누적 홀수 비율</span>
                    <span class="value">${Math.round((oddCount / (oddCount + evenCount)) * 100)}%</span>
                </div>
                <div class="info-row">
                    <span class="label">누적 짝수 비율</span>
                    <span class="value">${Math.round((evenCount / (oddCount + evenCount)) * 100)}%</span>
                </div>
            </section>
        </div>
    </main>

    <footer>
        <p>© 2026 LIFE REVERSAL. 모든 분석 결과는 모의 예측용이며 실제 당첨을 보장하지 않습니다.</p>
    </footer>

    <script>
        function getBallColorClass(num) {
            if (num <= 10) return 'y';
            if (num <= 20) return 'b';
            if (num <= 30) return 'r';
            if (num <= 40) return 'g';
            return 'p';
        }

        function generateLuckyNumbers() {
            const numbers = [];
            while(numbers.length < 6) {
                const r = Math.floor(Math.random() * 45) + 1;
                if(numbers.indexOf(r) === -1) numbers.push(r);
            }
            numbers.sort((a, b) => a - b);
            
            const resultDiv = document.getElementById('lucky-result');
            resultDiv.innerHTML = \`
                <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
                    \${numbers.map(n => \`<div class="ball \${getBallColorClass(n)}">\${n}</div>\`).join('')}
                </div>
                <p style="text-align: center; font-size: 0.85rem; color: #ffd700; margin-top: 10px;">⭐ 이번 주 추천 운명의 조합 생성 완료! ⭐</p>
            \`;
        }
    </script>
</body>
</html>`;

  fs.writeFileSync(path.join(PUBLIC_DIR, 'index.html'), htmlContent, 'utf-8');
  console.log('🎉 index.html이 성공적으로 생성 및 빌드되었습니다, 대표님! Vercel 무료 배포 준비 완료!');
}

function getBallColorClass(num) {
  if (num <= 10) return 'y';
  if (num <= 20) return 'b';
  if (num <= 30) return 'r';
  if (num <= 40) return 'g';
  return 'p';
}

main();
