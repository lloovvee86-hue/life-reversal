import os
import sys
import json
import urllib.request
import urllib.parse

sys.stdout.reconfigure(encoding='utf-8')

# 디렉토리 정의
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
PUBLIC_DIR = os.path.join(BASE_DIR, 'public')
TRANSLATION_FILE = os.path.join(DATA_DIR, 'translations.json')
HOTSPOT_FILE = os.path.join(DATA_DIR, 'hotspots.json')

# 디렉토리 생성
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(PUBLIC_DIR, exist_ok=True)

def main():
    print("🫡 K-Hotspot Tracker 파이썬 빌드 엔진 가동!")

    # 1. 데이터 로드
    if not os.path.exists(TRANSLATION_FILE):
        print("❌ 번역 파일이 없습니다.")
        return
    with open(TRANSLATION_FILE, 'r', encoding='utf-8') as f:
        translations = json.load(f)

    if not os.path.exists(HOTSPOT_FILE):
        print("❌ 핫스팟 데이터 파일이 없습니다.")
        return
    with open(HOTSPOT_FILE, 'r', encoding='utf-8') as f:
        hotspots = json.load(f)

    # 2. API 동기화 시도
    API_KEY = os.environ.get('DATA_PORTAL_KEY', '546d4fabf71be93ae0602851abc58095be89067f85f21ebd8afd833cb6862649')
    print(f"ℹ️ API 테스트 시작 (인증키: {API_KEY[:10]}...)")

    for spot in hotspots:
        area_code = ''
        if '성수' in spot['areaName']: area_code = '9163'
        elif '홍대' in spot['areaName']: area_code = '9131'
        elif '명동' in spot['areaName']: area_code = '9114'
        elif '강남' in spot['areaName']: area_code = '9148'

        if area_code:
            url = f"https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInArea?serviceKey={API_KEY}&key={area_code}&type=json"
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=8) as res:
                    res_data = json.loads(res.read().decode('utf-8'))
                    if 'body' in res_data and 'items' in res_data['body']:
                        print(f"✅ [{spot['areaName']}] API 호출 성공! 최신 데이터 매핑 완료.")
                        items = res_data['body']['items']
                        stats = {
                            'Cafe/Dessert': 0,
                            'Fashion/SelectShop': 0,
                            'K-Food/Restaurant': 0,
                            'K-Beauty/Cosmetics': 0
                        }
                        for item in items:
                            inds = item.get('indsLclsNm', '')
                            indsM = item.get('indsMclsNm', '')
                            if '음식' in inds and ('커피' in indsM or '다과' in indsM):
                                stats['Cafe/Dessert'] += 1
                            elif '소매' in inds and '의류' in indsM:
                                stats['Fashion/SelectShop'] += 1
                            elif '음식' in inds:
                                stats['K-Food/Restaurant'] += 1
                            elif '소매' in inds and ('화장품' in indsM or '뷰티' in indsM):
                                stats['K-Beauty/Cosmetics'] += 1

                        spot['categoryStats'] = [
                            { "category": "Cafe/Dessert", "count": stats['Cafe/Dessert'] or spot['categoryStats'][0]['count'] },
                            { "category": "Fashion/SelectShop", "count": stats['Fashion/SelectShop'] or spot['categoryStats'][1]['count'] },
                            { "category": "K-Food/Restaurant", "count": stats['K-Food/Restaurant'] or spot['categoryStats'][2]['count'] },
                            { "category": "K-Beauty/Cosmetics", "count": stats['K-Beauty/Cosmetics'] or spot['categoryStats'][3]['count'] }
                        ]
            except Exception as e:
                pass

    # 3. HTML 생성
    html_template = """<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>K-Hotspot Tracker | Seoul Live District</title>
    <meta name="description" content="Explore live crowds, shopping statistics, and top spots in Seoul with direct map links for Google, Naver, Kakao, and Tmap.">
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Noto+Sans+KR:wght@300;400;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-color: #f8fafc;
            --card-bg: #ffffff;
            --border-color: #e2e8f0;
            --primary-color: #4f46e5;
            --accent-color: #7c3aed;
            --text-color: #0f172a;
            --text-muted: #64748b;
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
                radial-gradient(circle at 10% 20%, rgba(79, 70, 229, 0.05) 0%, transparent 45%),
                radial-gradient(circle at 90% 80%, rgba(124, 58, 237, 0.04) 0%, transparent 45%);
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
            background: linear-gradient(135deg, var(--primary-color) 0%, var(--accent-color) 100%);
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
            background: rgba(15, 23, 42, 0.04);
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
            color: #ffffff;
            box-shadow: 0 2px 8px rgba(79, 70, 229, 0.3);
        }

        /* 대한민국 지도 컨테이너 디자인 */
        .korea-map-container {
            max-width: 400px;
            margin: 20px auto 0 auto;
            padding: 16px;
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 20px;
            box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
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
            fill: #f1f5f9;
            stroke: #cbd5e1;
            stroke-width: 1.5;
            transition: all 0.3s ease;
        }

        .map-node {
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .map-node circle {
            fill: #ffffff;
            stroke: #94a3b8;
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
            fill: rgba(79, 70, 229, 0.1);
        }

        .map-node.active-region text {
            fill: var(--text-color);
        }

        .map-node.active-region.selected circle {
            fill: var(--primary-color);
            stroke: #ffffff;
            stroke-width: 2.5;
            filter: drop-shadow(0 0 6px rgba(79, 70, 229, 0.4));
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
            background: #ffffff;
            border: 1px solid var(--border-color);
            padding: 14px 16px 14px 44px;
            border-radius: 12px;
            color: var(--text-color);
            font-size: 0.95rem;
            outline: none;
            transition: border-color 0.2s, background 0.2s;
            box-shadow: 0 2px 8px rgba(15, 23, 42, 0.03);
        }

        .search-input:focus {
            border-color: var(--primary-color);
            background: #ffffff;
            box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
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
            background: #ffffff;
            border: 1px solid var(--border-color);
            color: var(--text-color);
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 0.8rem;
            font-weight: 600;
            outline: none;
            cursor: pointer;
            box-shadow: 0 2px 6px rgba(15, 23, 42, 0.02);
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
            box-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);
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

        .badge.NORMAL { background: rgba(76, 175, 80, 0.1); color: #2e7d32; border: 1px solid rgba(76, 175, 80, 0.2); }
        .badge.CROWDED { background: rgba(255, 152, 0, 0.1); color: #e65100; border: 1px solid rgba(255, 152, 0, 0.2); }
        .badge.VERY_CROWDED { background: rgba(244, 67, 54, 0.1); color: #c62828; border: 1px solid rgba(244, 67, 54, 0.2); }

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
            background: #f1f5f9;
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
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 12px;
            margin-bottom: 8px;
            cursor: pointer;
            transition: background 0.2s, border-color 0.2s;
        }

        .spot-card:hover {
            background: #f1f5f9;
            border-color: #cbd5e1;
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
            background: #e2e8f0;
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
            background: rgba(15, 23, 42, 0.4);
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
            background: #ffffff;
            width: 100%;
            max-width: 500px;
            border-radius: 24px 24px 0 0;
            padding: 24px;
            box-shadow: 0 -10px 40px rgba(15, 23, 42, 0.15);
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
            background: #f1f5f9;
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
            background: #f8fafc;
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
            background: #e2e8f0;
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
            background: rgba(255, 255, 255, 0.9);
            backdrop-filter: blur(12px);
            border-top: 1px solid var(--border-color);
            padding: 16px;
            display: flex;
            justify-content: center;
            z-index: 900;
        }

        .btn-draw {
            background: linear-gradient(135deg, var(--primary-color) 0%, var(--accent-color) 100%);
            color: #ffffff;
            border: none;
            padding: 14px 28px;
            font-size: 0.95rem;
            font-weight: 700;
            border-radius: 30px;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(79, 70, 229, 0.25);
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
            <path d="M 75,95 L 85,95 L 95,93 L 105,92 L 115,92 L 125,93 L 135,90 L 145,88 L 155,87 L 165,84 L 175,81 L 185,79 L 195,76 L 202,74 L 200,80 L 203,88 L 201,95 L 204,103 L 208,112 L 210,120 L 215,128 L 221,137 L 224,146 L 229,155 L 232,165 L 238,175 L 244,186 L 248,197 L 253,205 L 255,209 L 252,214 L 247,216 L 245,220 L 248,225 L 250,230 L 248,236 L 243,242 L 240,248 L 239,254 L 235,262 L 231,270 L 228,278 L 225,286 L 222,294 L 218,298 L 212,299 L 208,296 L 204,298 L 200,302 L 196,303 L 191,300 L 188,302 L 184,305 L 180,303 L 176,300 L 171,304 L 167,308 L 163,305 L 159,301 L 154,304 L 149,308 L 145,306 L 141,303 L 138,306 L 134,310 L 130,307 L 126,304 L 121,306 L 117,311 L 113,309 L 109,306 L 105,309 L 100,312 L 96,308 L 92,305 L 88,310 L 84,314 L 81,310 L 78,303 L 79,296 L 76,292 L 72,293 L 69,288 L 68,282 L 71,278 L 74,272 L 72,266 L 75,260 L 73,254 L 76,248 L 72,242 L 75,236 L 72,230 L 75,224 L 71,218 L 68,212 L 72,206 L 70,200 L 73,194 L 70,188 L 65,185 L 58,186 L 54,183 L 53,178 L 56,172 L 61,168 L 66,167 L 71,169 L 75,165 L 72,159 L 76,153 L 73,147 L 77,141 L 74,135 L 77,129 L 73,123 L 68,122 L 65,118 L 68,112 L 72,110 L 76,112 L 75,106 L 71,102 Z" class="map-bg-path" />
            
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
"""

    # 4. 카드 컨텐츠 삽입
    cards_html = []
    for spot in hotspots:
        category_html = "".join([f"""
                    <div class="stat-item">
                        <span class="stat-label">{stat['category']}</span>
                        <span class="stat-val">{stat['count']}</span>
                    </div>""" for stat in spot['categoryStats']])

        spots_html = []
        # hotspots.json에 로드된 명소(최대 10개)들을 카드로 렌더링하고, index 클래스로 순위 태깅해둡니다.
        for index, item in enumerate(spot['spots']):
            clean_name = item['name'].replace("'", "\\'")
            clean_address = item['address'].replace("'", "\\'")
            spots_html.append(f"""
                    <div class="spot-card" data-index="{index + 1}" data-ko-name="{item['name']}" data-en-name="{item['nameEn']}" data-ja-name="{item['nameJa']}" data-zh-name="{item['nameZh']}" data-addr="{item['address']}" onclick="openMapModal('{clean_name}', '{clean_address}', {item['lat']}, {item['lng']})">
                        <div class="spot-name">
                            <span class="spot-name-text" data-ko="{item['name']}" data-en="{item['nameEn']}" data-ja="{item['nameJa']}" data-zh="{item['nameZh']}">{item['name']}</span>
                            <span class="spot-cat">{item['category']}</span>
                        </div>
                        <div class="spot-addr">{item['address']}</div>
                    </div>""")

        spots_str = "".join(spots_html)

        cards_html.append(f"""
            <section class="card area-card" data-city="{spot['city']}" data-ko-area="{spot['areaName']}" data-en-area="{spot['areaNameEn']}" data-ja-area="{spot['areaNameJa']}" data-zh-area="{spot['areaNameZh']}">
                <h2>
                    <span class="spot-title-text" data-ko="{spot['areaName']}" data-en="{spot['areaNameEn']}" data-ja="{spot['areaNameJa']}" data-zh="{spot['areaNameZh']}">{spot['areaName']}</span>
                    <span class="badge {spot['congestion']}">{spot['congestion']}</span>
                </h2>
                <p class="desc-text" data-ko="{spot['descriptionKo']}" data-en="{spot['descriptionEn']}" data-ja="{spot['descriptionJa']}" data-zh="{spot['descriptionZh']}">
                    {spot['descriptionKo']}
                </p>

                <div class="stats-grid">
                    {category_html}
                </div>

                <div class="spot-list">
                    <div class="spot-title" data-key="allSpots">전체 분석 명소</div>
                    {spots_str}
                </div>
            </section>""")

    html_template += "\n".join(cards_html)

    # 5. 하단 템플릿 마감 및 공통 스크립트 결합 (필터 및 검색 구현 포함)
    html_template += f"""
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
        const translations = {json.dumps(translations, ensure_ascii=False)};
        let currentLang = 'ko';
        let currentCity = 'seoul';

        function setLang(lang) {{
            currentLang = lang;
            
            document.querySelectorAll('.lang-btn').forEach(btn => {{
                if (btn.innerText.toLowerCase() === lang) btn.classList.add('active');
                else btn.classList.remove('active');
            }});

            document.title = translations[lang].title;
            document.getElementById('txt-subtitle').innerText = translations[lang].subtitle;
            document.getElementById('txt-tip').innerText = translations[lang].spotTip;
            document.getElementById('btn-recommend').innerText = translations[lang].btnRecommend;
            document.getElementById('txt-footer').innerText = translations[lang].footerText;
            document.getElementById('input-search').placeholder = translations[lang].searchPlaceholder;
            document.getElementById('empty-warning').innerText = translations[lang].noResults;

            const mapTitles = {{
                ko: '📍 지도에서 분석할 지역을 선택하세요',
                en: '📍 Select a region on the map to analyze',
                ja: '📍 地図から分析する地域を選択してください',
                zh: '📍 请在地图上选择要分析的区域'
            }};
            if (document.getElementById('txt-map-title')) {{
                document.getElementById('txt-map-title').innerText = mapTitles[lang] || mapTitles['en'];
            }}

            document.querySelectorAll('[data-key]').forEach(el => {{
                const key = el.getAttribute('data-key');
                if (translations[lang][key]) el.innerText = translations[lang][key];
            }});

            document.querySelectorAll('.spot-title-text').forEach(el => {{
                el.innerText = el.getAttribute('data-' + lang) || el.getAttribute('data-ko');
            }});
            document.querySelectorAll('.desc-text').forEach(el => {{
                el.innerText = el.getAttribute('data-' + lang) || el.getAttribute('data-ko');
            }});
            document.querySelectorAll('.spot-name-text').forEach(el => {{
                el.innerText = el.getAttribute('data-' + lang) || el.getAttribute('data-ko');
            }});
            
            // 다국어 전환 후 화면 필터 재적용
            filterHotspots();
        }}

        function selectCity(city) {{
            currentCity = city;
            document.querySelectorAll('.map-node').forEach(node => {{
                if (node.getAttribute('onclick') && node.getAttribute('onclick').includes(city)) {{
                    node.classList.add('selected');
                }} else {{
                    node.classList.remove('selected');
                }}
            }});
            filterHotspots();
        }}

        function clickInactiveRegion(regionName) {{
            alert(translations[currentLang].comingSoon || "This region is coming soon!");
        }}

        // 동적 실시간 검색 및 개수 필터 제어 함수
        function filterHotspots() {{
            const searchVal = document.getElementById('input-search').value.toLowerCase().trim();
            const limitVal = document.getElementById('select-limit').value;
            
            let totalVisibleCards = 0;

            document.querySelectorAll('.area-card').forEach(card => {{
                const cardCity = card.getAttribute('data-city');
                if (cardCity !== currentCity) {{
                    card.style.display = 'none';
                    return;
                }}

                const areaKo = card.getAttribute('data-ko-area').toLowerCase();
                const areaEn = card.getAttribute('data-en-area').toLowerCase();
                const areaJa = card.getAttribute('data-ja-area').toLowerCase();
                const areaZh = card.getAttribute('data-zh-area').toLowerCase();
                
                // 동네 이름 검색어 포함 여부 확인
                const isAreaMatch = areaKo.includes(searchVal) || areaEn.includes(searchVal) || areaJa.includes(searchVal) || areaZh.includes(searchVal);
                
                let matchingSpots = 0;

                // 하위 스폿 필터링
                const spots = card.querySelectorAll('.spot-card');
                spots.forEach(spot => {{
                    const nameKo = spot.getAttribute('data-ko-name').toLowerCase();
                    const nameEn = spot.getAttribute('data-en-name').toLowerCase();
                    const nameJa = spot.getAttribute('data-ja-name').toLowerCase();
                    const nameZh = spot.getAttribute('data-zh-name').toLowerCase();
                    const addr = spot.getAttribute('data-addr').toLowerCase();

                    // 명소명 또는 주소 검색 포함 여부 확인
                    const isSpotMatch = nameKo.includes(searchVal) || nameEn.includes(searchVal) || nameJa.includes(searchVal) || nameZh.includes(searchVal) || addr.includes(searchVal);
                    
                    // 순위(인덱스) 조건 검사
                    const index = parseInt(spot.getAttribute('data-index'));
                    const isLimitOk = (limitVal === 'all') || (index <= parseInt(limitVal));

                    if ((isAreaMatch || isSpotMatch) && isLimitOk) {{
                        spot.style.display = 'block';
                        matchingSpots++;
                    }} else {{
                        spot.style.display = 'none';
                    }}
                }});

                // 해당 지역에 매칭되는 스폿이 있거나 동네이름 매칭 시 카드 노출
                if (matchingSpots > 0) {{
                    card.style.display = 'block';
                    totalVisibleCards++;
                }} else {{
                    card.style.display = 'none';
                }}
            }});

            // 결과 건수에 따라 경고 메세지 제어
            const warning = document.getElementById('empty-warning');
            if (totalVisibleCards === 0) {{
                warning.style.display = 'block';
            }} else {{
                warning.style.display = 'none';
            }}
        }}

        const userLang = navigator.language || navigator.userLanguage;
        if (userLang.startsWith('en')) setLang('en');
        else if (userLang.startsWith('ja')) setLang('ja');
        else if (userLang.startsWith('zh')) setLang('zh');
        else setLang('ko');

        function openMapModal(name, address, lat, lng) {{
            document.getElementById('modal-spot-name').innerText = name;

            // 괄호 및 영문 이름 꼬리표 제거 (예: "성수연방 (Seongsu Yeonbang)" -> "성수연방")
            const cleanSearchName = name.split('(')[0].trim();

            document.getElementById('link-google').href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(cleanSearchName + ' ' + address);
            document.getElementById('link-naver').href = 'https://map.naver.com/p/search/' + encodeURIComponent(cleanSearchName);
            document.getElementById('link-kakao').href = 'https://map.kakao.com/?q=' + encodeURIComponent(cleanSearchName);
            document.getElementById('link-tmap').href = 'tmap://route?rGoName=' + encodeURIComponent(cleanSearchName) + '&rGoX=' + lng + '&rGoY=' + lat;

            document.getElementById('map-modal').classList.add('active');
        }}

        function closeMapModal(e) {{
            if (e === null || e.target === document.getElementById('map-modal')) {{
                document.getElementById('map-modal').classList.remove('active');
            }}
        }}

        function drawLuckySpot() {{
            const spots = document.querySelectorAll('.spot-card');
            // 화면에 보이는 노출 중인 명소 중에서만 랜덤 추출
            const visibleSpots = Array.from(spots).filter(s => s.style.display !== 'none');
            if (visibleSpots.length === 0) return;
            
            const randomIndex = Math.floor(Math.random() * visibleSpots.length);
            const selected = visibleSpots[randomIndex].querySelector('.spot-name-text');
            const name = selected.getAttribute('data-' + currentLang) || selected.getAttribute('data-ko');
            
            alert(translations[currentLang].recommendTitle + '\\n\\n"' + name + '"\\n\\n' + translations[currentLang].recommendDesc);
        }}
    </script>
</body>
</html>"""

    with open(os.path.join(PUBLIC_DIR, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(html_template)
    print("🎉 파이썬 빌더를 통해 index.html 생성 성공!")

if __name__ == '__main__':
    main()
