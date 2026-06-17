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

          spot.categoryStats = [
            { "category": "Cafe/Dessert", "count": stats['Cafe/Dessert'] || spot.categoryStats[0].count },
            { "category": "Fashion/SelectShop", "count": stats['Fashion/SelectShop'] || spot.categoryStats[1].count },
            { "category": "K-Food/Restaurant", "count": stats['K-Food/Restaurant'] || spot.categoryStats[2].count },
            { "category": "K-Beauty/Cosmetics", "count": stats['K-Beauty/Cosmetics'] || spot.categoryStats[3].count }
          ];
        }
      } catch (e) {
        // API 연동이 안 된 경우 캐시(hotspots.json) 기본값 유지
      }
    }
  }

  // 4. 모바일 및 다국어 최적화 HTML 템플릿 생성
  let htmlContent = `<!DOCTYPE html>
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
            padding-bottom: 80px;
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

        /* 대한민국 지도 컨테이너 디자인 */
        .korea-map-container {
            max-width: 400px;
            margin: 20px auto 0 auto;
            padding: 16px;
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid var(--border-color);
            border-radius: 20px;
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            text-align: center;
        }

        .korea-map-title {
            font-size: 0.9rem;
            font-weight: 700;
            color: var(--primary-color);
            margin-bottom: 12px;
            letter-spacing: -0.2px;
        }

        .korea-map-svg {
            width: 100%;
            height: auto;
            max-height: 320px;
        }

        .map-bg-path {
            fill: rgba(255, 255, 255, 0.01);
            stroke: rgba(255, 255, 255, 0.1);
            stroke-width: 1.5;
            stroke-dasharray: 4 4;
            transition: all 0.3s ease;
        }

        .map-node {
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .map-node circle {
            fill: #111827;
            stroke: var(--text-muted);
            stroke-width: 1.5;
            transition: all 0.2s ease;
        }

        .map-node text {
            fill: var(--text-muted);
            font-size: 10px;
            font-weight: 600;
            text-anchor: middle;
            pointer-events: none;
            user-select: none;
            transition: all 0.2s ease;
        }

        /* 활성화 상태 (데이터 제공 지역: 서울, 부산) */
        .map-node.active-region circle {
            stroke: var(--primary-color);
            fill: rgba(255, 215, 0, 0.15);
        }

        .map-node.active-region text {
            fill: var(--text-color);
        }

        .map-node.active-region.selected circle {
            fill: var(--primary-color);
            stroke: #0b0f19;
            stroke-width: 2.5;
            filter: drop-shadow(0 0 8px var(--primary-color));
        }

        .map-node.active-region.selected text {
            fill: var(--primary-color);
            font-weight: 800;
        }

        @keyframes mapPulse {
            0% { r: 6; opacity: 1; }
            100% { r: 15; opacity: 0; }
        }

        .pulse-circle {
            fill: none;
            stroke: var(--primary-color);
            stroke-width: 1.5;
            pointer-events: none;
            transform-origin: center;
            animation: mapPulse 2s infinite;
        }

        /* 검색 바 디자인 */
        .search-container {
            max-width: 800px;
            margin: 16px auto 0 auto;
            padding: 0 16px;
        }

        .search-wrapper {
            position: relative;
            display: flex;
            align-items: center;
        }

        .search-input {
            width: 100%;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid var(--border-color);
            padding: 14px 16px 14px 44px;
            border-radius: 12px;
            color: var(--text-color);
            font-size: 0.95rem;
            outline: none;
            transition: border-color 0.2s, background 0.2s;
        }

        .search-input:focus {
            border-color: var(--primary-color);
            background: rgba(255, 255, 255, 0.07);
        }

        .search-icon {
            position: absolute;
            left: 16px;
            color: var(--text-muted);
            font-size: 1.1rem;
            pointer-events: none;
        }

        /* 필터 도구 바 */
        .filter-bar {
            max-width: 800px;
            margin: 12px auto 0 auto;
            padding: 0 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
        }

        .filter-label {
            font-size: 0.8rem;
            color: var(--text-muted);
            font-weight: 600;
        }

        .filter-selector {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--border-color);
            color: var(--text-color);
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 0.8rem;
            font-weight: 600;
            outline: none;
            cursor: pointer;
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

        /* 빈 결과창 */
        .empty-results {
            display: none;
            text-align: center;
            padding: 40px 20px;
            color: var(--text-muted);
            font-size: 0.95rem;
        }

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

        .map-icon {
            width: 20px; height: 20px;
            border-radius: 50%;
            display: inline-block;
        }
        .icon-google { background: #ea4335; }
        .icon-naver { background: #03c75a; }
        .icon-kakao { background: #fee500; }
        .icon-tmap { background: #ff5000; }

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

    <!-- 대한민국 지도 선택 영역 -->
    <div class="korea-map-container">
        <div class="korea-map-title" id="txt-map-title">📍 지도에서 분석할 지역을 선택하세요</div>
        <svg viewBox="0 0 300 400" class="korea-map-svg">
            <!-- 한반도 남한 지리적 해안선 Silhouette -->
            <path d="M 70,100 L 130,80 L 200,60 L 210,80 L 220,110 L 235,150 L 255,200 L 250,220 L 248,250 L 235,295 L 210,310 L 180,315 L 150,320 L 125,325 L 90,320 L 75,300 L 70,270 L 75,230 L 60,180 L 80,160 L 70,120 Z" class="map-bg-path" />
            
            <!-- 제주도 (Jeju Island) -->
            <path d="M 80,370 A 25,12 0 1,0 130,370 A 25,12 0 1,0 80,370 Z" class="map-bg-path" />
            
            <!-- 울릉도 & 독도 (Ulleungdo & Dokdo) -->
            <path d="M 275,120 A 4,3 0 1,0 283,120 A 4,3 0 1,0 275,120 Z" class="map-bg-path" />
            <path d="M 295,130 A 2,1.5 0 1,0 299,130 A 2,1.5 0 1,0 295,130 Z" class="map-bg-path" />

            <line x1="115" y1="95" x2="225" y2="285" stroke="rgba(255,255,255,0.04)" stroke-dasharray="2 2" />
            <line x1="115" y1="95" x2="185" y2="80" stroke="rgba(255,255,255,0.04)" stroke-dasharray="2 2" />
            <line x1="115" y1="95" x2="135" y2="180" stroke="rgba(255,255,255,0.04)" stroke-dasharray="2 2" />
            <line x1="135" y1="180" x2="195" y2="235" stroke="rgba(255,255,255,0.04)" stroke-dasharray="2 2" />
            <line x1="195" y1="235" x2="225" y2="285" stroke="rgba(255,255,255,0.04)" stroke-dasharray="2 2" />
            <line x1="135" y1="180" x2="115" y2="280" stroke="rgba(255,255,255,0.04)" stroke-dasharray="2 2" />
            <line x1="115" y1="280" x2="225" y2="285" stroke="rgba(255,255,255,0.04)" stroke-dasharray="2 2" />

            <g class="map-node active-region selected" id="map-node-seoul" onclick="selectCity('seoul')">
                <circle cx="115" cy="95" r="14" class="pulse-circle" />
                <circle cx="115" cy="95" r="7" />
                <text x="115" y="118">Seoul</text>
            </g>
            <g class="map-node active-region" id="map-node-busan" onclick="selectCity('busan')">
                <circle cx="225" cy="285" r="14" class="pulse-circle" style="animation-delay: 1s;" />
                <circle cx="225" cy="285" r="7" />
                <text x="225" y="308">Busan</text>
            </g>
            <g class="map-node" onclick="clickInactiveRegion('Jeju')">
                <circle cx="105" cy="370" r="6" />
                <text x="105" y="355">Jeju</text>
            </g>
            <g class="map-node" onclick="clickInactiveRegion('Incheon')">
                <circle cx="78" cy="115" r="6" />
                <text x="78" y="132">Incheon</text>
            </g>
            <g class="map-node" onclick="clickInactiveRegion('Gangwon')">
                <circle cx="185" cy="80" r="6" />
                <text x="185" y="97">Gangwon</text>
            </g>
            <g class="map-node" onclick="clickInactiveRegion('Daejeon')">
                <circle cx="135" cy="180" r="6" />
                <text x="135" y="197">Daejeon</text>
            </g>
            <g class="map-node" onclick="clickInactiveRegion('Daegu')">
                <circle cx="195" cy="235" r="6" />
                <text x="195" y="252">Daegu</text>
            </g>
            <g class="map-node" onclick="clickInactiveRegion('Gwangju')">
                <circle cx="115" cy="280" r="6" />
                <text x="115" y="297">Gwangju</text>
            </g>
        </svg>
    </div>

    <!-- 검색창 바 영역 -->
    <div class="search-container">
        <div class="search-wrapper">
            <span class="search-icon">🔍</span>
            <input type="text" class="search-input" id="input-search" oninput="filterHotspots()" placeholder="동네 이름 또는 명소를 검색하세요 (예: 성수, 홍대, 강남)...">
        </div>
    </div>

    <!-- 필터링 셀렉터 바 영역 -->
    <div class="filter-bar">
        <span class="filter-label" id="txt-filter-label" data-key="viewLimitLabel">표시 명소 개수</span>
        <select class="filter-selector" id="select-limit" onchange="filterHotspots()">
            <option value="all" data-key="selectAll">전체 보기</option>
            <option value="5" data-key="select5">Top 5 보기</option>
            <option value="10" data-key="select10">Top 10 보기</option>
        </select>
    </div>

    <main>
        <div class="tip-box" id="txt-tip">
            상세 지도를 연결하려면 목록의 매장 카드를 누르고 원하는 지도 아이콘을 선택하세요.
        </div>

        <!-- 검색 결과가 없을 때의 경고 박스 -->
        <div class="empty-results" id="empty-warning" data-key="noResults">
            검색 결과가 없습니다. 다른 키워드로 검색해 보세요.
        </div>

        <div id="hotspot-list">
`;

  // 4. 카드 컨텐츠 삽입
  const cardsHtml = [];
  hotspots.forEach(spot => {
    const categoryHtml = spot.categoryStats.map(stat => `
                    <div class="stat-item">
                        <span class="stat-label">${stat.category}</span>
                        <span class="stat-val">${stat.count}</span>
                    </div>`).join('');

    const spotsHtml = [];
    spot.spots.forEach((item, index) => {
      const cleanName = item.name.replace(/'/g, "\\'");
      const cleanAddress = item.address.replace(/'/g, "\\'");
      spotsHtml.push(`
                    <div class="spot-card" data-index="${index + 1}" data-ko-name="${item.name}" data-en-name="${item.nameEn}" data-ja-name="${item.nameJa}" data-zh-name="${item.nameZh}" data-addr="${item.address}" onclick="openMapModal('${cleanName}', '${cleanAddress}', ${item.lat}, ${item.lng})">
                        <div class="spot-name">
                            <span class="spot-name-text" data-ko="${item.name}" data-en="${item.nameEn}" data-ja="${item.nameJa}" data-zh="${item.nameZh}">${item.name}</span>
                            <span class="spot-cat">${item.category}</span>
                        </div>
                        <div class="spot-addr">${item.address}</div>
                    </div>`);
    });

    cardsHtml.push(`
            <section class="card area-card" data-city="${spot.city}" data-ko-area="${spot.areaName}" data-en-area="${spot.areaNameEn}" data-ja-area="${spot.areaNameJa}" data-zh-area="${spot.areaNameZh}">
                <h2>
                    <span class="spot-title-text" data-ko="${spot.areaName}" data-en="${spot.areaNameEn}" data-ja="${spot.areaNameJa}" data-zh="${spot.areaNameZh}">${spot.areaName}</span>
                    <span class="badge ${spot.congestion}">${spot.congestion}</span>
                </h2>
                <p class="desc-text" data-ko="${spot.descriptionKo}" data-en="${spot.descriptionEn}" data-ja="${spot.descriptionJa}" data-zh="${spot.descriptionZh}">
                    ${spot.descriptionKo}
                </p>

                <div class="stats-grid">
                    ${category_html}
                </div>

                <div class="spot-list">
                    <div class="spot-title" data-key="allSpots">전체 분석 명소</div>
                    ${spotsHtml.join('')}
                </div>
            </section>`);
  });

  htmlContent += cardsHtml.join('\n');

  // 5. 하단 마감 스크립트
  htmlContent += `
        </div>
    </main>

    <div class="bottom-nav">
        <button class="btn-draw" onclick="drawLuckySpot()" id="btn-recommend">오늘의 추천 코스 뽑기 🎲</button>
    </div>

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
        let currentCity = 'seoul';

        function setLang(lang) {
            currentLang = lang;
            
            document.querySelectorAll('.lang-btn').forEach(btn => {
                if (btn.innerText.toLowerCase() === lang) btn.classList.add('active');
                else btn.classList.remove('active');
            });

            document.title = translations[lang].title;
            document.getElementById('txt-subtitle').innerText = translations[lang].subtitle;
            document.getElementById('txt-tip').innerText = translations[lang].spotTip;
            document.getElementById('btn-recommend').innerText = translations[lang].btnRecommend;
            document.getElementById('txt-footer').innerText = translations[lang].footerText;
            document.getElementById('input-search').placeholder = translations[lang].searchPlaceholder;
            document.getElementById('empty-warning').innerText = translations[lang].noResults;

            const mapTitles = {
                ko: '📍 지도에서 분석할 지역을 선택하세요',
                en: '📍 Select a region on the map to analyze',
                ja: '📍 地図から分析する地域を選択してください',
                zh: '📍 请在地图上选择要分析的区域'
            };
            if (document.getElementById('txt-map-title')) {
                document.getElementById('txt-map-title').innerText = mapTitles[lang] || mapTitles['en'];
            }

            document.querySelectorAll('[data-key]').forEach(el => {
                const key = el.getAttribute('data-key');
                if (translations[lang][key]) el.innerText = translations[lang][key];
            });

            document.querySelectorAll('.spot-title-text').forEach(el => {
                el.innerText = el.getAttribute('data-' + lang) || el.getAttribute('data-ko');
            });
            document.querySelectorAll('.desc-text').forEach(el => {
                el.innerText = el.getAttribute('data-' + lang) || el.getAttribute('data-ko');
            });
            document.querySelectorAll('.spot-name-text').forEach(el => {
                el.innerText = el.getAttribute('data-' + lang) || el.getAttribute('data-ko');
            });

            filterHotspots();
        }

        function selectCity(city) {
            currentCity = city;
            document.querySelectorAll('.map-node').forEach(node => {
                if (node.getAttribute('onclick') && node.getAttribute('onclick').includes(city)) {
                    node.classList.add('selected');
                } else {
                    node.classList.remove('selected');
                }
            });
            filterHotspots();
        }

        function clickInactiveRegion(regionName) {
            alert(translations[currentLang].comingSoon || "This region is coming soon!");
        }

        function filterHotspots() {
            const searchVal = document.getElementById('input-search').value.toLowerCase().trim();
            const limitVal = document.getElementById('select-limit').value;
            
            let totalVisibleCards = 0;

            document.querySelectorAll('.area-card').forEach(card => {
                const cardCity = card.getAttribute('data-city');
                if (cardCity !== currentCity) {
                    card.style.display = 'none';
                    return;
                }

                const areaKo = card.getAttribute('data-ko-area').toLowerCase();
                const areaEn = card.getAttribute('data-en-area').toLowerCase();
                const areaJa = card.getAttribute('data-ja-area').toLowerCase();
                const areaZh = card.getAttribute('data-zh-area').toLowerCase();
                
                const isAreaMatch = areaKo.includes(searchVal) || areaEn.includes(searchVal) || areaJa.includes(searchVal) || areaZh.includes(searchVal);
                
                let matchingSpots = 0;

                const spots = card.querySelectorAll('.spot-card');
                spots.forEach(spot => {
                    const nameKo = spot.getAttribute('data-ko-name').toLowerCase();
                    const nameEn = spot.getAttribute('data-en-name').toLowerCase();
                    const nameJa = spot.getAttribute('data-ja-name').toLowerCase();
                    const nameZh = spot.getAttribute('data-zh-name').toLowerCase();
                    const addr = spot.getAttribute('data-addr').toLowerCase();

                    const isSpotMatch = nameKo.includes(searchVal) || nameEn.includes(searchVal) || nameJa.includes(searchVal) || nameZh.includes(searchVal) || addr.includes(searchVal);
                    
                    const index = parseInt(spot.getAttribute('data-index'));
                    const isLimitOk = (limitVal === 'all') || (index <= parseInt(limitVal));

                    if ((isAreaMatch || isSpotMatch) && isLimitOk) {
                        spot.style.display = 'block';
                        matchingSpots++;
                    } else {
                        spot.style.display = 'none';
                    }
                });

                if (matchingSpots > 0) {
                    card.style.display = 'block';
                    totalVisibleCards++;
                } else {
                    card.style.display = 'none';
                }
            });

            const warning = document.getElementById('empty-warning');
            if (totalVisibleCards === 0) {
                warning.style.display = 'block';
            } else {
                warning.style.display = 'none';
            }
        }

        const userLang = navigator.language || navigator.userLanguage;
        if (userLang.startsWith('en')) setLang('en');
        else if (userLang.startsWith('ja')) setLang('ja');
        else if (userLang.startsWith('zh')) setLang('zh');
        else setLang('ko');

        function openMapModal(name, address, lat, lng) {
            document.getElementById('modal-spot-name').innerText = name;

            const cleanSearchName = name.split('(')[0].trim();

            document.getElementById('link-google').href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(cleanSearchName + ' ' + address);
            document.getElementById('link-naver').href = 'https://map.naver.com/p/search/' + encodeURIComponent(cleanSearchName);
            document.getElementById('link-kakao').href = 'https://map.kakao.com/?q=' + encodeURIComponent(cleanSearchName);
            document.getElementById('link-tmap').href = 'tmap://route?rGoName=' + encodeURIComponent(cleanSearchName) + '&rGoX=' + lng + '&rGoY=' + lat;

            document.getElementById('map-modal').classList.add('active');
        }

        function closeMapModal(e) {
            if (e === null || e.target === document.getElementById('map-modal')) {
                document.getElementById('map-modal').classList.remove('active');
            }
        }

        function drawLuckySpot() {
            const spots = document.querySelectorAll('.spot-card');
            const visibleSpots = Array.from(spots).filter(s => s.style.display !== 'none');
            if (visibleSpots.length === 0) return;
            
            const randomIndex = Math.floor(Math.random() * visibleSpots.length);
            const selected = visibleSpots[randomIndex].querySelector('.spot-name-text');
            const name = selected.getAttribute('data-' + currentLang) || selected.getAttribute('data-ko');
            
            alert(translations[currentLang].recommendTitle + '\\n\\n"' + name + '"\\n\\n' + translations[currentLang].recommendDesc);
        }
    </script>
</body>
</html>`;

  fs.writeFileSync(path.join(PUBLIC_DIR, 'index.html'), htmlContent, 'utf-8');
  console.log('🎉 index.html이 완벽하게 생성되었습니다, 대표님! 다국어 및 지도 4종 연동 탑재 완료!');
}

main();
