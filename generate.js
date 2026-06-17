const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// 디렉토리 경로 정의
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const TRANSLATION_FILE = path.join(DATA_DIR, 'translations.json');
const HOTSPOT_FILE = path.join(DATA_DIR, 'hotspots.json');

// 디렉토리 자동 생성
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

// GET 요청 유틸리티
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', (err) => reject(err));
  });
}

async function main() {
  console.log('🫡 K-Hotspot Tracker 글로벌 모바일 대시보드 빌드를 시작합니다, 대표님!');

  // 1. 번역 파일 로드
  let translations = {};
  if (fs.existsSync(TRANSLATION_FILE)) {
    translations = JSON.parse(fs.readFileSync(TRANSLATION_FILE, 'utf-8'));
  } else {
    console.error('❌ 번역 파일(translations.json)이 없습니다.');
    return;
  }

  // 2. 핫플레이스 기본 데이터 로드
  let hotspots = [];
  if (fs.existsSync(HOTSPOT_FILE)) {
    hotspots = JSON.parse(fs.readFileSync(HOTSPOT_FILE, 'utf-8'));
  } else {
    console.error('❌ 핫플레이스 정보(hotspots.json)가 없습니다.');
    return;
  }

  // 3. API 실시간 동기화 시도 (승인 완료 대비)
  const API_KEY = process.env.DATA_PORTAL_KEY || '546d4fabf71be93ae0602851abc58095be89067f85f21ebd8afd833cb6862649';
  console.log(`ℹ️ 공공데이터포털 API 연동 테스트 시작 (Key: ${API_KEY.substring(0, 10)}...)`);

  for (let i = 0; i < hotspots.length; i++) {
    const spot = hotspots[i];
    // 강남역=9131, 성수=9163 등 대표 상권 코드 매핑 테스트
    let areaCode = '';
    if (spot.areaName.includes('성수')) areaCode = '9163';
    else if (spot.areaName.includes('홍대')) areaCode = '9131';
    else if (spot.areaName.includes('명동')) areaCode = '9114';
    else if (spot.areaName.includes('강남')) areaCode = '9148';

    if (areaCode) {
      const url = `https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInArea?serviceKey=${API_KEY}&key=${areaCode}&type=json`;
      try {
        const resData = await httpGet(url);
        if (resData && resData.body && resData.body.items) {
          console.log(`✅ API 연동 성공! [${spot.areaName}] 실시간 공공데이터가 실시간 반영됩니다.`);
          // 카테고리 통계 재계산
          const items = resData.body.items;
          const stats = {
            'Cafe/Dessert': 0,
            'Fashion/SelectShop': 0,
            'K-Food/Restaurant': 0,
            'K-Beauty/Cosmetics': 0
          };
          items.forEach(item => {
            const inds = item.indsLclsNm || '';
            const indsM = item.indsMclsNm || '';
            if (inds.includes('음식') && (indsM.includes('커피') || indsM.includes('다과'))) stats['Cafe/Dessert']++;
            else if (inds.includes('소매') && indsM.includes('의류')) stats['Fashion/SelectShop']++;
            else if (inds.includes('음식')) stats['K-Food/Restaurant']++;
            else if (inds.includes('소매') && (indsM.includes('화장품') || indsM.includes('뷰티'))) stats['K-Beauty/Cosmetics']++;
          });

          // 데이터 업데이트
          spot.categoryStats = [
            { "category": "Cafe/Dessert", "count": stats['Cafe/Dessert'] || spot.categoryStats[0].count },
            { "category": "Fashion/SelectShop", "count": stats['Fashion/SelectShop'] || spot.categoryStats[1].count },
            { "category": "K-Food/Restaurant", "count": stats['K-Food/Restaurant'] || spot.categoryStats[2].count },
            { "category": "K-Beauty/Cosmetics", "count": stats['K-Beauty/Cosmetics'] || spot.categoryStats[3].count }
          ];
        }
      } catch (e) {
        // 아직 미승인 시 기존 캐시(hotspots.json) 보존 후 경고
        console.warn(`⚠️ [${spot.areaName}] API 호출 제한/미승인 상태로 오프라인 캐시를 활용합니다.`);
      }
    }
  }

  // 4. 모바일 및 다국어 최적화 HTML 템플릿 생성
  const htmlContent = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>K-Hotspot Tracker | Seoul Live District</title>
    <meta name="description" content="Explore live crowds, shopping statistics, and top spots in Seoul with direct map links for Google, Naver, Kakao, and Tmap.">
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
            -webkit-tap-highlight-color: transparent;
        }

        body {
            background-color: var(--bg-color);
            color: var(--text-color);
            font-family: 'Outfit', 'Noto Sans KR', sans-serif;
            line-height: 1.6;
            overflow-x: hidden;
            padding-bottom: 80px; /* 하단 내비게이션 바 공간 */
        }

        body::before {
            content: '';
            position: fixed;
            top: 0; left: 0;
            width: 100vw; height: 100vh;
            background: 
                radial-gradient(circle at 10% 20%, rgba(138, 43, 226, 0.12) 0%, transparent 45%),
                radial-gradient(circle at 90% 80%, rgba(255, 215, 0, 0.06) 0%, transparent 45%);
            z-index: -1;
        }

        header {
            max-width: 800px;
            margin: 0 auto;
            padding: 24px 16px 16px 16px;
            text-align: center;
            border-bottom: 1px solid var(--border-color);
        }

        .logo {
            font-size: 1.8rem;
            font-weight: 800;
            letter-spacing: -0.5px;
            background: linear-gradient(135deg, var(--primary-color) 0%, #ff8c00 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 4px;
        }

        header p {
            color: var(--text-muted);
            font-size: 0.9rem;
            margin-bottom: 8px;
        }

        .lang-selector {
            display: inline-flex;
            gap: 8px;
            background: rgba(255, 255, 255, 0.05);
            padding: 4px;
            border-radius: 30px;
            border: 1px solid var(--border-color);
        }

        .lang-btn {
            background: none;
            border: none;
            color: var(--text-muted);
            padding: 6px 12px;
            font-size: 0.8rem;
            font-weight: 600;
            border-radius: 20px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .lang-btn.active {
            background: var(--primary-color);
            color: #0b0f19;
            box-shadow: 0 2px 8px rgba(255, 215, 0, 0.3);
        }

        main {
            max-width: 800px;
            margin: 0 auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        .card {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 20px;
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
            transition: transform 0.2s, border-color 0.2s;
        }

        .card:active {
            transform: scale(0.98);
        }

        h2 {
            font-size: 1.2rem;
            font-weight: 700;
            margin-bottom: 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .badge {
            font-size: 0.75rem;
            padding: 4px 8px;
            border-radius: 20px;
            font-weight: 700;
            text-transform: uppercase;
        }

        .badge.NORMAL { background: rgba(76, 175, 80, 0.15); color: #4caf50; border: 1px solid rgba(76, 175, 80, 0.3); }
        .badge.CROWDED { background: rgba(255, 152, 0, 0.15); color: #ff9800; border: 1px solid rgba(255, 152, 0, 0.3); }
        .badge.VERY_CROWDED { background: rgba(244, 67, 54, 0.15); color: #f44336; border: 1px solid rgba(244, 67, 54, 0.3); }

        .desc-text {
            font-size: 0.85rem;
            color: var(--text-muted);
            margin-bottom: 16px;
            line-height: 1.5;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            margin-bottom: 16px;
        }

        .stat-item {
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 10px;
            display: flex;
            flex-direction: column;
        }

        .stat-label {
            font-size: 0.75rem;
            color: var(--text-muted);
        }

        .stat-val {
            font-size: 1.1rem;
            font-weight: 700;
            color: var(--primary-color);
            margin-top: 2px;
        }

        .spot-list {
            border-top: 1px dashed var(--border-color);
            padding-top: 12px;
        }

        .spot-title {
            font-size: 0.9rem;
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--text-color);
        }

        .spot-card {
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            padding: 12px;
            margin-bottom: 8px;
            cursor: pointer;
            transition: background 0.2s;
        }

        .spot-card:hover {
            background: rgba(255, 255, 255, 0.07);
        }

        .spot-name {
            font-size: 0.85rem;
            font-weight: 700;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .spot-cat {
            font-size: 0.7rem;
            color: var(--text-muted);
            background: rgba(255, 255, 255, 0.08);
            padding: 2px 6px;
            border-radius: 4px;
        }

        .spot-addr {
            font-size: 0.75rem;
            color: var(--text-muted);
            margin-top: 4px;
            word-break: keep-all;
        }

        /* 모바일 모달 팝업 */
        .modal-overlay {
            position: fixed;
            top: 0; left: 0;
            width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(8px);
            z-index: 1000;
            display: flex;
            align-items: flex-end;
            justify-content: center;
            visibility: hidden;
            opacity: 0;
            transition: opacity 0.3s, visibility 0.3s;
        }

        .modal-overlay.active {
            visibility: visible;
            opacity: 1;
        }

        .modal-content {
            background: #111827;
            width: 100%;
            max-width: 500px;
            border-radius: 24px 24px 0 0;
            padding: 24px;
            box-shadow: 0 -10px 40px rgba(0,0,0,0.5);
            border-top: 1px solid var(--border-color);
            transform: translateY(100%);
            transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .modal-overlay.active .modal-content {
            transform: translateY(0);
        }

        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }

        .modal-title {
            font-size: 1.1rem;
            font-weight: 700;
        }

        .modal-close {
            background: rgba(255,255,255,0.05);
            border: none;
            color: var(--text-color);
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 600;
            cursor: pointer;
        }

        .map-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
        }

        .map-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            background: rgba(255,255,255,0.04);
            border: 1px solid var(--border-color);
            color: var(--text-color);
            padding: 14px;
            border-radius: 16px;
            text-decoration: none;
            font-size: 0.85rem;
            font-weight: 700;
            transition: background 0.2s;
        }

        .map-btn:active {
            background: rgba(255,255,255,0.1);
        }

        /* 지도 플랫폼 전용 아이콘 서클 */
        .map-icon {
            width: 20px; height: 20px;
            border-radius: 50%;
            display: inline-block;
        }
        .icon-google { background: #ea4335; }
        .icon-naver { background: #03c75a; }
        .icon-kakao { background: #fee500; }
        .icon-tmap { background: #ff5000; }

        /* 하단 내비게이션 바 */
        .bottom-nav {
            position: fixed;
            bottom: 0; left: 0;
            width: 100vw;
            background: rgba(17, 24, 39, 0.95);
            backdrop-filter: blur(12px);
            border-top: 1px solid var(--border-color);
            padding: 16px;
            display: flex;
            justify-content: center;
            z-index: 900;
        }

        .btn-draw {
            background: linear-gradient(90deg, #ffd700, #ff8c00);
            color: #0b0f19;
            border: none;
            padding: 14px 28px;
            font-size: 0.95rem;
            font-weight: 700;
            border-radius: 30px;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(255, 215, 0, 0.25);
            display: flex;
            align-items: center;
            gap: 6px;
            width: 100%;
            max-width: 320px;
            justify-content: center;
        }

        .btn-draw:active {
            transform: scale(0.97);
        }

        /* 안내 팁 박스 */
        .tip-box {
            background: rgba(138, 43, 226, 0.05);
            border: 1px dashed rgba(138, 43, 226, 0.3);
            border-radius: 12px;
            padding: 12px;
            font-size: 0.75rem;
            color: var(--text-muted);
            text-align: center;
            margin-bottom: 8px;
        }

        footer {
            text-align: center;
            padding: 24px 16px;
            color: var(--text-muted);
            font-size: 0.75rem;
            border-top: 1px solid var(--border-color);
            margin-top: 40px;
        }
    </style>
</head>
<body>

    <header>
        <div class="logo">🍀 K-HOTSPOT TRACKER</div>
        <p id="txt-subtitle">외국인 친구들과 함께 보는 실시간 서울 상권 & 명소 가이드</p>
        
        <div class="lang-selector">
            <button class="lang-btn active" onclick="setLang('ko')">KO</button>
            <button class="lang-btn" onclick="setLang('en')">EN</button>
            <button class="lang-btn" onclick="setLang('ja')">JA</button>
            <button class="lang-btn" onclick="setLang('zh')">ZH</button>
        </div>
    </header>

    <main>
        <div class="tip-box" id="txt-tip">
            상세 지도를 연결하려면 목록의 매장 카드를 누르고 원하는 지도 아이콘을 선택하세요.
        </div>

        <!-- 카드 목록 영역 -->
        <div id="hotspot-list">
            \${hotspots.map((spot, idx) => `
            <section class="card">
                <h2>
                    <span class="spot-title-text" data-ko="\${spot.areaName}" data-en="\${spot.areaNameEn}" data-ja="\${spot.areaNameJa}" data-zh="\${spot.areaNameZh}">\${spot.areaName}</span>
                    <span class="badge \${spot.congestion}">\${spot.congestion}</span>
                </h2>
                <p class="desc-text" data-ko="\${spot.descriptionKo}" data-en="\${spot.descriptionEn}" data-ja="\${spot.descriptionJa}" data-zh="\${spot.descriptionZh}">
                    \${spot.descriptionKo}
                </p>

                <div class="stats-grid">
                    \${spot.categoryStats.map(stat => `
                    <div class="stat-item">
                        <span class="stat-label">\${stat.category}</span>
                        <span class="stat-val">\${stat.count}</span>
                    </div>
                    `).join('')}
                </div>

                <div class="spot-list">
                    <div class="spot-title" data-key="allSpots">전체 분석 명소</div>
                    \${spot.spots.map(item => `
                    <div class="spot-card" onclick="openMapModal('\${item.name.replace(/'/g, "\\\\'")}', '\${item.address.replace(/'/g, "\\\\'")}', \${item.lat}, \${item.lng})">
                        <div class="spot-name">
                            <span class="spot-name-text" data-ko="\${item.name}" data-en="\${item.nameEn}" data-ja="\${item.nameJa}" data-zh="\${item.nameZh}">\${item.name}</span>
                            <span class="spot-cat">\${item.category}</span>
                        </div>
                        <div class="spot-addr">\${item.address}</div>
                    </div>
                    `).join('')}
                </div>
            </section>
            `).join('')}
        </div>
    </main>

    <!-- 하단 내비게이션 바 -->
    <div class="bottom-nav">
        <button class="btn-draw" onclick="drawLuckySpot()" id="btn-recommend">오늘의 추천 코스 뽑기 🎲</button>
    </div>

    <!-- 바텀시트 형식 모달 -->
    <div class="modal-overlay" id="map-modal" onclick="closeMapModal(event)">
        <div class="modal-content" onclick="event.stopPropagation()">
            <div class="modal-header">
                <div class="modal-title" id="modal-spot-name">매장명</div>
                <button class="modal-close" onclick="closeMapModal(null)" data-key="close">닫기</button>
            </div>
            
            <div class="map-grid">
                <a href="#" id="link-google" class="map-btn" target="_blank">
                    <span class="map-icon icon-google"></span>
                    <span data-key="routeGoogle">구글 지도</span>
                </a>
                <a href="#" id="link-naver" class="map-btn" target="_blank">
                    <span class="map-icon icon-naver"></span>
                    <span data-key="routeNaver">네이버 지도</span>
                </a>
                <a href="#" id="link-kakao" class="map-btn" target="_blank">
                    <span class="map-icon icon-kakao"></span>
                    <span data-key="routeKakao">카카오맵</span>
                </a>
                <a href="#" id="link-tmap" class="map-btn" target="_blank">
                    <span class="map-icon icon-tmap"></span>
                    <span data-key="routeTmap">티맵</span>
                </a>
            </div>
        </div>
    </div>

    <footer>
        <p id="txt-footer">© 2026 K-HOTSPOT TRACKER. 공공데이터 기반 실시간 시각화 대시보드입니다.</p>
    </footer>

    <script>
        const translations = \${JSON.stringify(translations)};
        let currentLang = 'ko';

        function setLang(lang) {
            currentLang = lang;
            
            // 1. 활성 탭 표시 업데이트
            document.querySelectorAll('.lang-btn').forEach(btn => {
                if (btn.innerText.toLowerCase() === lang) btn.classList.add('active');
                else btn.classList.remove('active');
            });

            // 2. 고정 번역 텍스트 변경
            document.title = translations[lang].title;
            document.getElementById('txt-subtitle').innerText = translations[lang].subtitle;
            document.getElementById('txt-tip').innerText = translations[lang].spotTip;
            document.getElementById('btn-recommend').innerText = translations[lang].btnRecommend;
            document.getElementById('txt-footer').innerText = translations[lang].footerText;

            // 3. 다국어 데이터 바인딩 텍스트 변경
            document.querySelectorAll('[data-key]').forEach(el => {
                const key = el.getAttribute('data-key');
                if (translations[lang][key]) el.innerText = translations[lang][key];
            });

            // 4. 지역명 및 매장 상세 텍스트 로케일 번역
            document.querySelectorAll('.spot-title-text').forEach(el => {
                el.innerText = el.getAttribute('data-' + lang) || el.getAttribute('data-ko');
            });
            document.querySelectorAll('.desc-text').forEach(el => {
                el.innerText = el.getAttribute('data-' + lang) || el.getAttribute('data-ko');
            });
            document.querySelectorAll('.spot-name-text').forEach(el => {
                el.innerText = el.getAttribute('data-' + lang) || el.getAttribute('data-ko');
            });
        }

        // 브라우저 언어 자동 판별
        const userLang = navigator.language || navigator.userLanguage;
        if (userLang.startsWith('en')) setLang('en');
        else if (userLang.startsWith('ja')) setLang('ja');
        else if (userLang.startsWith('zh')) setLang('zh');
        else setLang('ko');

        // 지도 팝업 연동 규격
        function openMapModal(name, address, lat, lng) {
            document.getElementById('modal-spot-name').innerText = name;

            // 괄호 및 영문 이름 꼬리표 제거 (예: "성수연방 (Seongsu Yeonbang)" -> "성수연방")
            const cleanSearchName = name.split('(')[0].trim();

            // 구글맵 연동
            document.getElementById('link-google').href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(cleanSearchName + ' ' + address);
            // 네이버맵 웹 검색 연동 (모바일 브라우저 및 앱 전환 연동)
            document.getElementById('link-naver').href = 'https://map.naver.com/p/search/' + encodeURIComponent(cleanSearchName);
            // 카카오맵 검색어 연동 (모바일 브라우저 대응)
            document.getElementById('link-kakao').href = 'https://map.kakao.com/?q=' + encodeURIComponent(cleanSearchName);
            // 티맵 WGS84 좌표 목적지 안내 스키마 연동 (모바일 디바이스 최적화)
            document.getElementById('link-tmap').href = 'tmap://route?rGoName=' + encodeURIComponent(cleanSearchName) + '&rGoX=' + lng + '&rGoY=' + lat;

            // 모달 열기
            document.getElementById('map-modal').classList.add('active');
        }

        function closeMapModal(e) {
            if (e === null || e.target === document.getElementById('map-modal')) {
                document.getElementById('map-modal').classList.remove('active');
            }
        }

        // 오늘의 행운 코스 추천 뽑기 기능
        function drawLuckySpot() {
            const spots = document.querySelectorAll('.spot-name-text');
            const randomIndex = Math.floor(Math.random() * spots.length);
            const selected = spots[randomIndex];
            const name = selected.getAttribute('data-' + currentLang) || selected.getAttribute('data-ko');
            
            // 모의 다이얼로그
            alert(translations[currentLang].recommendTitle + '\\n\\n"' + name + '"\\n\\n' + translations[currentLang].recommendDesc);
        }
    </script>
</body>
</html>`;

  fs.writeFileSync(path.join(PUBLIC_DIR, 'index.html'), htmlContent, 'utf-8');
  console.log('🎉 index.html이 완벽하게 생성되었습니다, 대표님! 다국어 및 지도 4종 연동 탑재 완료!');
}

main();
