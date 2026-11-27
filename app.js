'use strict';

/* =========================================================
 * 旅プラン — 候補 → 旅程タイムライン(複数案) → 費用比較
 * ========================================================= */

/* ---------- utils ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const load = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const clone = o => JSON.parse(JSON.stringify(o));

const K = { key: 'tp.key', data: 'tp.data', settings: 'tp.settings', routes: 'tp.routes', ui: 'tp.ui', flights: 'tp.flights' };

const LEGS = {
  flight: { icon: '✈️', label: '飛行機' },
  drive:  { icon: '🚗', label: 'レンタカー・車' },
  train:  { icon: '🚆', label: '鉄道' },
  bus:    { icon: '🚌', label: 'バス' },
  other:  { icon: '📦', label: 'その他' },
};
const MODES = {
  WALK:    { icon: '🚶', label: '徒歩' },
  TRANSIT: { icon: '🚇', label: '電車・バス' },
  DRIVE:   { icon: '🚗', label: '車' },
};
const CTYPES = { stop: { icon: '📍', label: '経由地' }, spot: { icon: '●', label: 'スポット' } };
const CURS = [{ v: 'USD', l: '$ ドル' }, { v: 'JPY', l: '¥ 円' }];
const COL = { accent: '#0f766e', must: '#dc2626', gray: '#71717a', leg: '#7c3aed', stop: '#2563eb', lodge: '#0891b2' };
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

/* 主要空港(IATA, 緯度, 経度) — 経由地から最寄り空港を自動で選ぶのに使う */
const AIRPORTS = [
  ['NRT', 35.772, 140.393], ['HND', 35.549, 139.780], ['KIX', 34.432, 135.230], ['ITM', 34.786, 135.438],
  ['NGO', 34.858, 136.805], ['FUK', 33.586, 130.451], ['CTS', 42.775, 141.692], ['OKA', 26.196, 127.646],
  ['ATL', 33.641, -84.428], ['LAX', 33.942, -118.409], ['BUR', 34.201, -118.359], ['LGB', 33.818, -118.152],
  ['SNA', 33.676, -117.868], ['ONT', 34.056, -117.601], ['ORD', 41.974, -87.907], ['MDW', 41.787, -87.752],
  ['DFW', 32.900, -97.040], ['DAL', 32.847, -96.852], ['DEN', 39.856, -104.674], ['JFK', 40.641, -73.778],
  ['LGA', 40.777, -73.874], ['EWR', 40.690, -74.175], ['SFO', 37.621, -122.379], ['OAK', 37.713, -122.220],
  ['SJC', 37.364, -121.929], ['SEA', 47.450, -122.309], ['LAS', 36.084, -115.154], ['MCO', 28.431, -81.308],
  ['MIA', 25.796, -80.287], ['FLL', 26.074, -80.151], ['CLT', 35.214, -80.947], ['PHX', 33.434, -112.012],
  ['TUS', 32.116, -110.941], ['FLG', 35.139, -111.671], ['IAH', 29.990, -95.337], ['HOU', 29.645, -95.279],
  ['BOS', 42.366, -71.010], ['MSP', 44.885, -93.222], ['DTW', 42.216, -83.355], ['PHL', 39.874, -75.242],
  ['SLC', 40.790, -111.979], ['BWI', 39.177, -76.668], ['IAD', 38.953, -77.457], ['DCA', 38.851, -77.040],
  ['SAN', 32.734, -117.193], ['TPA', 27.976, -82.533], ['PDX', 45.590, -122.595], ['HNL', 21.325, -157.925],
  ['OGG', 20.899, -156.431], ['KOA', 19.739, -156.046], ['ANC', 61.174, -149.996], ['STL', 38.750, -90.375],
  ['BNA', 36.126, -86.677], ['AUS', 30.198, -97.666], ['SAT', 29.534, -98.470], ['MSY', 29.993, -90.258],
  ['ABQ', 35.040, -106.609], ['ELP', 31.807, -106.378], ['SMF', 38.695, -121.591], ['FAT', 36.776, -119.718],
  ['RNO', 39.499, -119.768], ['RDU', 35.880, -78.788], ['PIT', 40.492, -80.233], ['CLE', 41.406, -81.854],
  ['CMH', 39.998, -82.892], ['IND', 39.717, -86.294], ['MCI', 39.298, -94.714], ['OKC', 35.393, -97.601],
  ['MEM', 35.042, -89.977], ['JAX', 30.494, -81.688], ['RSW', 26.536, -81.755], ['SAV', 32.128, -81.202],
  ['CHS', 32.899, -80.041], ['MKE', 42.947, -87.897], ['BOI', 43.564, -116.223], ['JAC', 43.607, -110.738],
  ['BZN', 45.778, -111.153], ['GEG', 47.620, -117.534], ['YVR', 49.197, -123.182], ['YYZ', 43.678, -79.625],
  ['YUL', 45.471, -73.741], ['CUN', 21.037, -86.877], ['MEX', 19.436, -99.072],
];

/* ---------- state ---------- */
let apiKey = load(K.key, '');
const settings = Object.assign(
  { rate: 150, rateDate: '', rateManual: false, gas: 3.6, mpg: 30, dailyDefault: 60, flightProxy: '' },
  load(K.settings, {})
);

function newPlan(name) { return { id: uid(), name, stops: [], daily: { amount: settings.dailyDefault, cur: 'USD' } }; }
function newStop(candId, legMode = 'flight', nights = 1) {
  return {
    id: uid(), candId, nights, lodging: null, spots: [], mode: 'WALK',
    leg: { mode: legMode, date: '', cost: 0, cur: legMode === 'flight' ? 'JPY' : 'USD', note: '', flight: null },
  };
}
function defaultData() { return { v: 2, tripName: 'アメリカ旅行', candidates: [], plans: [newPlan('A案')] }; }
function migrate(d) {
  if (!d || !Array.isArray(d.candidates)) return defaultData();
  d.candidates.forEach(c => { c.type ||= 'spot'; });
  d.plans = (d.plans || []).map(p => (Array.isArray(p.stops) ? p : newPlan(p.name || 'A案')));
  if (!d.plans.length) d.plans = [newPlan('A案')];
  d.v = 2;
  return d;
}

let data = migrate(load(K.data, null));
const ui = Object.assign({ tab: 'plan', planId: null, stop: -1 }, load(K.ui, {}));
if (typeof ui.stop !== 'number') ui.stop = -1;
if (ui.tab !== 'compare') ui.tab = 'plan';

const saveData = () => store(K.data, data);
const saveSettings = () => store(K.settings, settings);
const saveUi = () => store(K.ui, ui);

function curPlan() {
  let p = data.plans.find(x => x.id === ui.planId);
  if (!p) { p = data.plans[0]; ui.planId = p.id; }
  if (ui.stop >= p.stops.length) ui.stop = -1;
  return p;
}
const candById = id => data.candidates.find(c => c.id === id);
const stopPlace = s => candById(s.candId);
const spotsOf = s => s.spots.map(candById).filter(Boolean);

/* ---------- format ---------- */
const toJPY = (amount, cur) => (cur === 'JPY' ? amount : amount * settings.rate);
const fmtJPY = n => '¥' + Math.round(n).toLocaleString('ja-JP');
const fmtUSD = n => '$' + (Math.round(n * 100) / 100).toLocaleString('en-US');
const fmtMoney = (a, cur) => (cur === 'JPY' ? fmtJPY(a) : fmtUSD(a));
const moneyFromApi = m => ({ amount: Number(m.units || 0) + (m.nanos || 0) / 1e9, cur: m.currencyCode || 'USD' });
const fmtMi = m => (m / 1609.344).toFixed(m < 16093 ? 1 : 0) + ' mi';
const fmtDur = s => {
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return h ? `${h}時間${m ? m + '分' : ''}` : `${m}分`;
};
const gasCost = m => (m / 1609.344) / (settings.mpg || 30) * settings.gas;
const PRICE = { PRICE_LEVEL_FREE: '無料', PRICE_LEVEL_INEXPENSIVE: '$', PRICE_LEVEL_MODERATE: '$$', PRICE_LEVEL_EXPENSIVE: '$$$', PRICE_LEVEL_VERY_EXPENSIVE: '$$$$' };
const dayNum = s => (s ? Math.round(Date.parse(s + 'T00:00:00Z') / 86400000) : null);
const fmtDate = s => {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00Z');
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEK[d.getUTCDay()]})`;
};
const hhmm = t => (t || '').slice(11, 16);
function kmBetween(a, b) {
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function nearestAirports(pl) {
  if (!pl) return [];
  const d = AIRPORTS.map(([c, lat, lng]) => [c, kmBetween(pl, { lat, lng })]).sort((a, b) => a[1] - b[1]);
  const best = d[0][1];
  return d.filter(x => x[1] <= Math.max(best + 50, 0) && (x[1] <= 120 || x === d[0])).slice(0, 3).map(x => x[0]);
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg, ms = 3000) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

/* =========================================================
 * Google APIs
 * ========================================================= */
async function searchPlaces(q) {
  // 地図の表示範囲を優先。取れない・広すぎるときはアメリカ本土を優先(指定しないと日本の近所が出る)
  const US = { low: { latitude: 24, longitude: -125 }, high: { latitude: 50, longitude: -66 } };
  let rect = US;
  const b = map?.getBounds();
  if (b) {
    const sw = b.getSouthWest(), ne = b.getNorthEast();
    if (sw.lng() < ne.lng() && ne.lng() - sw.lng() < 60) {
      rect = { low: { latitude: sw.lat(), longitude: sw.lng() }, high: { latitude: ne.lat(), longitude: ne.lng() } };
    }
  }
  const body = { textQuery: q, languageCode: 'ja', regionCode: 'US', maxResultCount: 8, locationBias: { rectangle: rect } };
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    referrerPolicy: 'no-referrer-when-downgrade', // APIキーのウェブサイト制限と照合できるよう、ページのURLを全部送る
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.priceLevel,places.rating,places.types',
    },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error?.message || `HTTP ${res.status}`);
  return (j.places || []).map(p => ({
    pid: p.id,
    name: p.displayName?.text || '(名称なし)',
    addr: p.formattedAddress || '',
    lat: p.location.latitude,
    lng: p.location.longitude,
    price: p.priceLevel || '',
    rating: p.rating || 0,
    types: p.types || [],
  }));
}
const STOP_TYPES = ['locality', 'administrative_area_level_1', 'administrative_area_level_2', 'airport', 'international_airport', 'lodging', 'colloquial_area', 'sublocality', 'postal_town'];
const guessType = r => ((r.types || []).some(t => STOP_TYPES.includes(t)) ? 'stop' : 'spot');

const routeCache = load(K.routes, {});
const routeErr = {};
const routePending = {};
const routeKey = (mode, a, b, tolls) =>
  `${mode}${tolls ? '+T' : ''}|${a.lat.toFixed(5)},${a.lng.toFixed(5)}|${b.lat.toFixed(5)},${b.lng.toFixed(5)}`;

function getRoute(mode, a, b, tolls = false) {
  const k = routeKey(mode, a, b, tolls);
  if (routeCache[k]) return routeCache[k];
  if (routeErr[k]) return routeErr[k];
  if (!routePending[k] && apiKey) {
    routePending[k] = fetchRoute(mode, a, b, tolls)
      .then(r => { routeCache[k] = r; store(K.routes, routeCache); })
      .catch(e => { console.warn('route', e); routeErr[k] = { error: String(e.message || e) }; })
      .finally(() => { delete routePending[k]; scheduleRender(); });
  }
  return undefined;
}

async function fetchRoute(mode, a, b, tolls) {
  const ll = p => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  const body = { origin: ll(a), destination: ll(b), travelMode: mode, languageCode: 'ja', units: 'IMPERIAL' };
  let mask = 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline';
  if (mode === 'DRIVE' && tolls) {
    body.routingPreference = 'TRAFFIC_AWARE';
    body.extraComputations = ['TOLLS'];
    mask += ',routes.travelAdvisory.tollInfo';
  }
  if (mode === 'TRANSIT') mask += ',routes.travelAdvisory.transitFare';
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    referrerPolicy: 'no-referrer-when-downgrade',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': mask },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error?.message || `HTTP ${res.status}`);
  const r = j.routes?.[0];
  if (!r) return { none: true };
  const out = { m: r.distanceMeters || 0, s: parseInt(r.duration, 10) || 0, poly: r.polyline?.encodedPolyline || '' };
  const toll = r.travelAdvisory?.tollInfo?.estimatedPrice?.[0];
  if (toll) out.toll = moneyFromApi(toll);
  const fare = r.travelAdvisory?.transitFare;
  if (fare) out.fare = moneyFromApi(fare);
  return out;
}

function routeText(r) {
  if (!r) return '計算中…';
  if (r.error) return 'ルートを取得できませんでした';
  if (r.none) return 'ルートが見つかりません';
  return `${fmtMi(r.m)} · ${fmtDur(r.s)}`;
}

/* 為替レート(Frankfurter / ECB、キー不要) */
async function refreshRate(force = false) {
  const today = new Date().toISOString().slice(0, 10);
  if (!force && (settings.rateManual || settings.rateDate === today)) return;
  for (const u of ['https://api.frankfurter.dev/v1/latest?base=USD&symbols=JPY', 'https://api.frankfurter.app/latest?from=USD&to=JPY']) {
    try {
      const j = await (await fetch(u)).json();
      if (j.rates?.JPY) {
        Object.assign(settings, { rate: j.rates.JPY, rateDate: j.date || today, rateManual: false });
        saveSettings(); scheduleRender();
        if (force) toast(`1ドル = ${j.rates.JPY.toFixed(2)}円 に更新しました`);
        return;
      }
    } catch {}
  }
  if (force) toast('為替レートを取得できませんでした');
}

/* =========================================================
 * フライト検索(SerpApi Google Flights、Cloudflare Worker経由)
 * ========================================================= */
const CLASSES = { 1: 'エコノミー', 2: 'プレエコ', 3: 'ビジネス', 4: 'ファースト' };
const CLS_SHORT = { 1: 'エコ', 2: 'プレエコ', 3: 'ビジ', 4: 'ファ' };
function clsFromText(t) {
  t = String(t || '').toLowerCase();
  if (!t) return null;
  if (/premium|プレミアム/.test(t)) return 2;
  if (/first|ファースト/.test(t)) return 4;
  if (/business|ビジネス/.test(t)) return 3;
  if (/economy|エコノミー/.test(t)) return 1;
  return null;
}
const normNum = s => String(s || '').replace(/\s/g, '').toUpperCase();

// Google側の結果で、区間によってクラスが違う(例: プレエコで検索したが国内線区間だけエコノミー)
function mixedNote(f) {
  const segs = f.segs || [];
  const cs = segs.map(s => s.cls).filter(Boolean);
  if (segs.length < 2 || new Set(cs).size < 2) return '';
  return 'クラス混在: ' + segs.map(s => `${s.from}→${s.to} ${CLASSES[s.cls] || s.clsText || '?'}`).join(' / ');
}

// 便の行程の詳細(区間・乗り継ぎ・機材など)
function flightDetailHTML(f, { showCls = true } = {}) {
  const segs = f.segs || [];
  if (!segs.length) return '<p class="sub">この便は詳しい行程が保存されていません。もう一度「便を変える」で選び直すと見られます。</p>';
  const day0 = segs[0].dep.slice(0, 10);
  const t = s => `${hhmm(s)}${s.slice(0, 10) !== day0 ? `<small>(${fmtDate(s.slice(0, 10))})</small>` : ''}`;
  const rows = segs.map((s, n) => {
    const cls = f.segCls ? CLASSES[f.segCls[n]] : showCls ? (CLASSES[s.cls] || s.clsText) : '';
    const facts = [s.plane, cls, s.legroom && `足元 ${s.legroom}`].filter(Boolean);
    const lay = f.lay[n];
    return `
      <li class="itin-seg">
        <div class="itin-pt"><b>${t(s.dep)}</b><span>${esc(s.from)}</span><span class="sub">${esc(s.fromName)}</span></div>
        <div class="itin-fly">
          ${s.logo ? `<img src="${esc(s.logo)}" alt="" width="20" height="20" loading="lazy">` : ''}
          <div>
            <div>${esc(`${s.airline} ${s.num}`)} · ${fmtDur(s.mins * 60)}${s.overnight ? ' · 夜行便' : ''}</div>
            ${facts.length ? `<div class="sub">${esc(facts.join(' · '))}</div>` : ''}
            ${s.ext.length ? `<div class="itin-ext">${s.ext.map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
            ${s.delayed ? '<div class="warn-txt">⚠️ 30分以上遅れることが多い便</div>' : ''}
          </div>
        </div>
        <div class="itin-pt"><b>${t(s.arr)}</b><span>${esc(s.to)}</span><span class="sub">${esc(s.toName)}</span></div>
      </li>
      ${n < segs.length - 1 && lay ? `<li class="itin-lay">🔁 ${esc(lay.name || lay.id)} で乗り継ぎ ${fmtDur(lay.mins * 60)}${lay.overnight ? '(夜越し)' : ''}${lay.mins < 60 ? ' ⚠️ 短め' : ''}</li>` : ''}`;
  }).join('');
  const foot = [`所要 ${fmtDur(f.mins * 60)}`, f.co2 ? `CO₂ 約${Math.round(f.co2 / 1000)}kg` : '', ...(f.notes || [])].filter(Boolean);
  return `<ol class="itin">${rows}</ol><p class="sub">${esc(foot.join(' · '))}</p>`;
}
function openFlightDetail(L) {
  const dlg = $('#flightDlg');
  dlg.innerHTML = `<div class="sheet-head"><h3>✈️ 便の行程</h3><button class="icon-btn" data-fl="close" aria-label="閉じる">✕</button></div>
    <p class="sub">${esc(flightSummary(L))}${L.cost ? ' · ' + fmtMoney(num(L.cost), L.cur) : ''}</p>
    ${flightDetailHTML(L.flight)}`;
  dlg.onclick = e => { if (e.target.closest('[data-fl="close"]')) dlg.close(); };
  dlg.showModal();
}
const flightCache = load(K.flights, {});
async function flightApi(params) {
  if (!settings.flightProxy) throw new Error('フライト検索の中継URLが未設定です(メニュー →「設定」)');
  const u = new URL(settings.flightProxy);
  Object.entries({ hl: 'ja', gl: 'jp', currency: 'JPY', adults: 1, ...params }).forEach(([k, v]) => u.searchParams.set(k, v));
  const key = u.search;
  const hit = flightCache[key];
  if (hit && Date.now() - hit.t < 6 * 3600e3) return hit.j; // 6時間は使い回して検索回数を節約
  const res = await fetch(u);
  const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
  for (const k in flightCache) if (Date.now() - flightCache[k].t > 6 * 3600e3) delete flightCache[k];
  flightCache[key] = { t: Date.now(), j };
  store(K.flights, flightCache);
  return j;
}

function parseOption(o) {
  const f = o.flights || [];
  if (!f.length) return null;
  return {
    price: o.price ?? null,
    mins: o.total_duration || 0,
    logo: o.airline_logo || f[0].airline_logo || '',
    airlines: [...new Set(f.map(x => x.airline))],
    numbers: f.map(x => x.flight_number),
    dep: { id: f[0].departure_airport.id, time: f[0].departure_airport.time },
    arr: { id: f[f.length - 1].arrival_airport.id, time: f[f.length - 1].arrival_airport.time },
    lay: (o.layovers || []).map(l => ({ id: l.id, name: l.name || '', mins: l.duration, overnight: !!l.overnight })),
    segs: f.map(x => ({
      from: x.departure_airport.id, to: x.arrival_airport.id, dep: x.departure_airport.time, arr: x.arrival_airport.time,
      fromName: x.departure_airport.name || '', toName: x.arrival_airport.name || '',
      num: x.flight_number, airline: x.airline, logo: x.airline_logo || '', mins: x.duration || 0,
      cls: clsFromText(x.travel_class), clsText: x.travel_class || '',
      plane: x.airplane || '', legroom: x.legroom || '', ext: x.extensions || [],
      overnight: !!x.overnight, delayed: !!x.often_delayed_by_over_30_min,
    })),
    co2: o.carbon_emissions?.this_flight || 0,
    notes: o.extensions || [],
    token: o.departure_token || '',
  };
}
function flightLine(f) {
  const plus = f.arr.time.slice(0, 10) !== f.dep.time.slice(0, 10) ? '+1' : '';
  return `${f.dep.id} ${hhmm(f.dep.time)} → ${f.arr.id} ${hhmm(f.arr.time)}${plus}`;
}
function flightStops(f) {
  return f.lay.length ? '経由 ' + f.lay.map(l => `${l.id}(${fmtDur(l.mins * 60)}${l.overnight ? '・夜越し' : ''})`).join(', ') : '直行';
}
const gfUrl = (from, to, date) =>
  `https://www.google.com/travel/flights?hl=ja&curr=JPY&q=${encodeURIComponent(`Flights from ${from.split(',')[0]} to ${to.split(',')[0]}${date ? ' on ' + date : ''} one way`)}`;

/* =========================================================
 * 日付・費用
 * ========================================================= */
function nightsOf(p, i) {
  if (i === p.stops.length - 1 && i > 0) return { n: 0, auto: false, last: true }; // 旅程の最後(帰着地)は泊まらない
  const a = i > 0 ? dayNum(p.stops[i].leg.date) : null;
  const b = dayNum(p.stops[i + 1]?.leg.date);
  if (a != null && b != null && b >= a) return { n: b - a, auto: true };
  return { n: num(p.stops[i].nights), auto: false };
}
function tripDays(p) {
  const ds = p.stops.slice(1).map(s => dayNum(s.leg.date)).filter(x => x != null);
  if (ds.length >= 2) return Math.max(...ds) - Math.min(...ds) + 1;
  return p.stops.reduce((n, _, i) => n + nightsOf(p, i).n, 0) + 1;
}

const zeroCost = () => ({ flight: 0, ground: 0, lodging: 0, local: 0, sight: 0, daily: 0, driveM: 0, driveS: 0, pending: false });
function addCost(a, b) {
  for (const k in b) if (typeof b[k] === 'number' && k in a) a[k] += b[k];
  a.pending = a.pending || b.pending;
  return a;
}
const costTotal = c => c.flight + c.ground + c.lodging + c.local + c.sight + c.daily;

function legCost(p, i) {
  const c = zeroCost();
  if (i === 0) return c;
  const L = p.stops[i].leg, a = stopPlace(p.stops[i - 1]), b = stopPlace(p.stops[i]);
  const base = toJPY(num(L.cost), L.cur);
  if (L.mode === 'flight') c.flight += base; else c.ground += base;
  if (L.mode === 'drive' && a && b) {
    const r = getRoute('DRIVE', a, b, true);
    if (!r) c.pending = true;
    else if (r.m) {
      c.driveM += r.m; c.driveS += r.s;
      c.ground += toJPY(gasCost(r.m), 'USD');
      if (r.toll) c.ground += toJPY(r.toll.amount, r.toll.cur);
    }
  }
  return c;
}
function stopCost(p, i) {
  const c = zeroCost(), s = p.stops[i];
  if (s.lodging) c.lodging += toJPY(num(s.lodging.cost), s.lodging.cur) * nightsOf(p, i).n;
  const spots = spotsOf(s);
  spots.forEach(x => (c.sight += toJPY(num(x.cost), x.cur || 'USD')));
  for (let j = 1; j < spots.length; j++) {
    const r = getRoute(s.mode, spots[j - 1], spots[j]);
    if (!r) { c.pending = true; continue; }
    if (r.fare) c.local += toJPY(r.fare.amount, r.fare.cur);
    if (s.mode === 'DRIVE' && r.m) c.local += toJPY(gasCost(r.m), 'USD');
  }
  return c;
}
function planCost(p) {
  const c = zeroCost();
  p.stops.forEach((_, i) => { addCost(c, legCost(p, i)); addCost(c, stopCost(p, i)); });
  c.days = p.stops.length ? tripDays(p) : 0;
  c.daily = toJPY(num(p.daily?.amount), p.daily?.cur || 'USD') * c.days;
  c.total = costTotal(c);
  return c;
}

/* =========================================================
 * 画面描画
 * ========================================================= */
let renderQueued = false, renderDeferred = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}

function render(force = false) {
  const view = $('#view');
  const ae = document.activeElement;
  if (!force && view.contains(ae) && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) {
    renderDeferred = true; renderMap(); return;
  }
  renderDeferred = false;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === ui.tab));
  if (document.activeElement !== $('#tripName')) $('#tripName').value = data.tripName;
  view.innerHTML = ui.tab === 'compare' ? viewCompare() : viewPlan();
  setupSortables();
  renderMap();
}

/* ---------- 候補 ---------- */
function usedIn(id) {
  const out = [];
  data.plans.forEach(p => p.stops.forEach((s, i) => {
    if (s.candId === id) out.push(`${p.name} ${i + 1}番目`);
    if (s.spots.includes(id)) out.push(`${p.name} ${stopPlace(s)?.name || ''}`);
  }));
  return out.join(', ');
}

/* このプランでまだ使っていない場所(=トレイ) */
function isPlaced(p, id) { return p.stops.some(s => s.candId === id || s.spots.includes(id)); }
const trayOf = p => data.candidates.filter(c => !isPlaced(p, c.id));

function trayItem(c) {
  const meta = [
    num(c.cost) ? fmtMoney(num(c.cost), c.cur) : '',
    PRICE[c.price] || '',
    c.rating ? '★' + c.rating : '',
    c.memo,
  ].filter(Boolean).join(' · ');
  return `<li class="item" data-cand="${c.id}">
    <span class="pin ${c.must ? 'must' : ''}" data-act="focus" data-id="${c.id}">${c.must ? '★' : '●'}</span>
    <div class="info" data-act="editCand" data-id="${c.id}"><div class="name">${esc(c.name)}</div><div class="meta">${esc(meta || c.addr)}</div></div>
    <button class="place-btn-sm" data-act="place" data-id="${c.id}">入れる</button></li>`;
}

/* ---------- プラン ---------- */
function viewPlan() {
  const p = curPlan();
  const opts = data.plans.map(x => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  return `
    <div class="plan-bar">
      <select data-field="plan" aria-label="プラン">${opts}</select>
      <button class="icon-btn" data-act="planMenu" aria-label="プランのメニュー">⋯</button>
    </div>
    ${ui.stop === -1 ? viewTimeline(p) : viewStop(p, ui.stop)}`;
}

function flightSummary(L) {
  const f = L.flight;
  if (!f) return '';
  const cls = f.segCls ? `【${f.segs.map((s, n) => `${s.from}-${s.to} ${CLS_SHORT[f.segCls[n]]}`).join(' / ')}・別々に購入】`
    : mixedNote(f) ? `【${f.segs.map(s => `${s.from}-${s.to} ${CLS_SHORT[s.cls] || '?'}`).join(' / ')}】`
    : f.cls && f.cls !== 1 ? `【${CLASSES[f.cls]}】` : '';
  return `${cls}${f.airlines.join(' / ')} ${f.numbers.join('→')} · ${flightLine(f)} · ${flightStops(f)}`;
}

function legCard(p, i) {
  const s = p.stops[i], L = s.leg, m = LEGS[L.mode] || LEGS.other;
  const a = stopPlace(p.stops[i - 1]), b = stopPlace(s);
  const meta = [];
  if (L.mode === 'drive' && a && b) {
    const r = getRoute('DRIVE', a, b, true);
    meta.push(routeText(r));
    if (r?.m) meta.push('ガソリン約' + fmtUSD(gasCost(r.m)) + (r.toll ? ' + 通行料' + fmtMoney(r.toll.amount, r.toll.cur) : ''));
  }
  if (L.mode === 'flight') meta.push(L.flight ? flightSummary(L) : '便はまだ選んでいません');
  if (L.bundle) meta.push('🔗 別の区間とまとめ買い');
  if (num(L.cost)) meta.push((L.mode === 'drive' ? '+ ' : '') + fmtMoney(num(L.cost), L.cur));
  if (L.note) meta.push(L.note);
  return `<div class="tl-leg">
    <div class="tl-leg-body" data-act="editLeg" data-i="${i}">
      <span class="kind">${m.icon}</span>
      <div class="info"><div class="name">${L.date ? fmtDate(L.date) : '日付未定'} · ${m.label}</div><div class="meta">${esc(meta.join(' · '))}</div></div>
    </div>
    ${L.mode === 'flight' && L.flight ? `<button class="pick-btn" data-act="flightDetail" data-i="${i}">行程</button>` : ''}
    ${L.mode === 'flight' ? `<button class="pick-btn" data-act="findFlight" data-i="${i}">${L.flight ? '便を変える' : '便を探す'}</button>` : ''}
  </div>`;
}

function stopCard(p, i) {
  const s = p.stops[i], c = stopPlace(s), n = nightsOf(p, i);
  const arr = i > 0 ? s.leg.date : '', dep = p.stops[i + 1]?.leg.date || '';
  const range = arr && dep && arr !== dep ? `${fmtDate(arr)}〜${fmtDate(dep)}` : arr ? fmtDate(arr) : dep ? `〜${fmtDate(dep)}` : '';
  const meta = [range, n.n ? `${n.n}泊` : '', s.lodging ? '🛏 ' + (s.lodging.place?.name || '宿') : n.n ? '宿未定' : '', s.spots.length ? `スポット${s.spots.length}` : ''].filter(Boolean);
  return `<div class="tl-stop" data-act="openStop" data-i="${i}">
    <span class="num stop">${i + 1}</span>
    <div class="info"><div class="name">${esc(c?.name || '(削除された場所)')}</div><div class="meta">${esc(meta.join(' · '))}</div></div>
    <span class="chev">›</span></div>`;
}

function viewTimeline(p) {
  const c = planCost(p);
  const chips = [['✈️', c.flight], ['🚗', c.ground], ['🛏', c.lodging], ['🚇', c.local], ['🎟', c.sight], ['🍔', c.daily]]
    .filter(x => x[1]).map(x => `${x[0]} ${fmtJPY(x[1])}`).join('　');
  const tray = trayOf(p);
  const items = p.stops.map((s, i) => `<li class="tl-item" data-stop="${s.id}">${i > 0 ? legCard(p, i) : ''}${stopCard(p, i)}</li>`).join('');
  return `
    <div class="summary">
      <span>合計 <b>${fmtJPY(c.total)}</b></span>${c.days ? `<span>${c.days}日間</span>` : ''}
      ${c.driveM ? `<span>運転 ${fmtMi(c.driveM)} / ${fmtDur(c.driveS)}</span>` : ''}
      ${chips ? `<div class="chips">${chips}</div>` : ''}
    </div>
    <h3 class="sec">旅程</h3>
    ${p.stops.length ? '<p class="drag-hint">ドラッグで並べ替え・下の「まだ入れていない場所」へドラッグで外せます</p>' : '<p class="empty">行きたい場所を追加して、旅の順番に並べていきます。<br>日本の出発空港・帰着空港も経由地として入れてください。</p>'}
    <ol class="tl">${items}</ol>
    <div class="tray">
      <h3 class="sec">まだ入れていない場所 <span class="count">${tray.length}</span></h3>
      ${tray.length ? '<p class="drag-hint">「入れる」か、上の旅程の好きな位置へドラッグ</p>' : ''}
      <ul class="list">${tray.map(trayItem).join('')}</ul>
      ${tray.length ? '' : '<p class="sub">ここに行きたい場所をストックして、「入れる」で旅程に配置します。</p>'}
      <button class="add-btn" data-act="addCand">＋ 行きたい場所を追加(検索)</button>
      <p class="sub">地図のお店・観光地アイコンや、好きな地点をタップしても追加できます</p>
    </div>
    <h3 class="sec">食費・その他(1日あたり)</h3>
    <div class="money-row">
      <input type="number" inputmode="decimal" step="any" data-field="dailyAmount" value="${esc(p.daily?.amount ?? 0)}" aria-label="金額">
      <select data-field="dailyCur" aria-label="通貨">${CURS.map(x => `<option value="${x.v}" ${p.daily?.cur === x.v ? 'selected' : ''}>${x.l}</option>`).join('')}</select>
    </div>
    <p class="sub">× 旅行日数(${c.days}日)で計算します</p>`;
}

function viewStop(p, i) {
  const s = p.stops[i], place = stopPlace(s), n = nightsOf(p, i);
  const spots = spotsOf(s);
  let list = '';
  spots.forEach((c, j) => {
    list += `<li class="spot-item" data-j="${j}">`;
    if (j > 0) {
      const r = getRoute(s.mode, spots[j - 1], c);
      const fare = r?.fare ? ' · 運賃 ' + fmtMoney(r.fare.amount, r.fare.cur) : '';
      list += `<div class="leg">${MODES[s.mode].icon} ${esc(routeText(r) + fare)}</div>`;
    }
    const meta = [num(c.cost) ? fmtMoney(num(c.cost), c.cur) : '', c.must ? '★必須' : '', PRICE[c.price] || ''].filter(Boolean).join(' · ');
    list += `<div class="spot">
      <span class="num">${j + 1}</span>
      <div class="info" data-act="editCand" data-id="${c.id}"><div class="name">${esc(c.name)}</div>${meta ? `<div class="meta">${esc(meta)}</div>` : ''}</div>
      <div class="ctrl">
        <button data-act="spotUp" data-j="${j}" ${j === 0 ? 'disabled' : ''} aria-label="上へ">↑</button>
        <button data-act="spotDown" data-j="${j}" ${j === spots.length - 1 ? 'disabled' : ''} aria-label="下へ">↓</button>
        <button class="del" data-act="rmSpot" data-j="${j}" aria-label="外す">✕</button>
      </div></div></li>`;
  });
  const prevLodging = p.stops[i - 1]?.lodging;
  const lodging = s.lodging
    ? `<ul class="list"><li class="item" data-act="editLodging"><span class="kind">🛏</span>
        <div class="info"><div class="name">${esc(s.lodging.place?.name || '宿(場所未設定)')}</div>
        <div class="meta">${esc([fmtMoney(num(s.lodging.cost), s.lodging.cur) + ' / 泊 × ' + n.n + '泊', s.lodging.note].filter(Boolean).join(' · '))}</div></div>
        <span class="chev">›</span></li></ul>`
    : `<div class="btn-row"><button class="add-btn" data-act="editLodging">＋ 宿を設定</button>
        ${prevLodging ? '<button class="add-btn ghost" data-act="copyLodging">前の経由地と同じ宿</button>' : ''}</div>`;
  const c = stopCost(p, i);
  const arr = i > 0 ? s.leg.date : '', dep = p.stops[i + 1]?.leg.date || '';

  return `
    <button class="text-btn back" data-act="back">‹ 旅程に戻る</button>
    <div class="stop-head">
      <span class="num stop">${i + 1}</span>
      <h2>${esc(place?.name || '')}</h2>
      <div class="ctrl">
        <button data-act="editCand" data-id="${place?.id || ''}" aria-label="場所を編集">✎</button>
        <button data-act="stopUp" ${i === 0 ? 'disabled' : ''} aria-label="前へ">↑</button>
        <button data-act="stopDown" ${i === p.stops.length - 1 ? 'disabled' : ''} aria-label="後ろへ">↓</button>
      </div>
    </div>
    <h3 class="sec">滞在</h3>
    ${n.last
      ? `<p class="sub">${arr ? fmtDate(arr) + ' 着 · ' : ''}旅程の最後の経由地です(泊数なし)</p>`
      : n.auto
      ? `<p class="sub">${fmtDate(arr)} 着 〜 ${fmtDate(dep)} 発 · <b>${n.n}泊</b>(区間の日付から自動計算)</p>`
      : `<div class="money-row"><input type="number" inputmode="numeric" min="0" step="1" data-field="nights" value="${esc(s.nights)}" aria-label="泊数"><span class="unit">泊</span></div>
         <p class="sub">前後の区間に日付を入れると、自動で計算されます</p>`}
    <h3 class="sec">宿</h3>
    ${lodging}
    <div class="sec-row">
      <h3 class="sec">スポット</h3>
      <select data-field="mode" aria-label="移動手段">${Object.entries(MODES).map(([k, m]) => `<option value="${k}" ${s.mode === k ? 'selected' : ''}>${m.icon} ${m.label}</option>`).join('')}</select>
    </div>
    <ol class="spots">${list}</ol>
    ${spots.length ? '' : '<p class="empty">ここで立ち寄るスポットを追加しましょう</p>'}
    <button class="add-btn" data-act="addSpot">＋ スポットを追加</button>
    <div class="day-foot">
      <span>この経由地の費用 <b>${fmtJPY(costTotal(c))}</b></span>
      <button class="text-btn danger" data-act="rmStop">旅程から外す</button>
    </div>`;
}

/* ---------- 比較 ---------- */
function viewCompare() {
  const rows = [['flight', '✈️ 航空券'], ['ground', '🚗 陸路の移動'], ['lodging', '🛏 宿泊'], ['local', '🚇 現地の交通'], ['sight', '🎟 観光・入場'], ['daily', '🍔 食費・その他']];
  const cs = data.plans.map(p => ({ p, c: planCost(p) }));
  const min = Math.min(...cs.map(x => x.c.total));
  const allIds = data.candidates.map(c => c.id);
  const mustIds = data.candidates.filter(c => c.must).map(c => c.id);
  const covered = (p, ids) => ids.filter(id => isPlaced(p, id)).length;
  const td = f => cs.map(f).map(v => `<td>${v}</td>`).join('');
  return `
    <div class="rate">
      <span>1ドル = ${settings.rate.toFixed(2)}円${settings.rateManual ? '(手入力)' : settings.rateDate ? `(${esc(settings.rateDate)})` : ''}</span>
      <button class="text-btn" data-act="settings">変更</button>
    </div>
    <div class="table-wrap"><table class="cmp">
      <thead><tr><th></th>${cs.map(x => `<th data-act="openPlan" data-id="${x.p.id}">${esc(x.p.name)}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.map(([k, l]) => `<tr><th>${l}</th>${td(x => (x.c[k] ? fmtJPY(x.c[k]) : '—'))}</tr>`).join('')}
        <tr class="total"><th>合計</th>${cs.map(x => `<td class="${cs.length > 1 && x.c.total === min ? 'best' : ''}">${fmtJPY(x.c.total)}</td>`).join('')}</tr>
        <tr class="gap"><th>日数</th>${td(x => x.c.days + '日')}</tr>
        <tr><th>1日あたり</th>${td(x => fmtJPY(x.c.total / Math.max(1, x.c.days)))}</tr>
        <tr><th>運転距離</th>${td(x => (x.c.driveM ? fmtMi(x.c.driveM) : '—'))}</tr>
        <tr><th>運転時間</th>${td(x => (x.c.driveS ? fmtDur(x.c.driveS) : '—'))}</tr>
        ${mustIds.length ? `<tr><th>★必須の場所</th>${td(x => `${covered(x.p, mustIds)} / ${mustIds.length}`)}</tr>` : ''}
        ${allIds.length ? `<tr><th>行きたい場所</th>${td(x => `${covered(x.p, allIds)} / ${allIds.length}`)}</tr>` : ''}
      </tbody>
    </table></div>
    ${cs.some(x => x.c.pending) ? '<p class="sub">ルートを計算中の項目があります…</p>' : ''}
    <p class="sub">ガソリン代は ${settings.mpg} mpg・$${settings.gas}/ガロンで概算。電車・バスの運賃と高速の通行料は、Googleから取れた場合だけ自動で足しています。</p>
    <button class="add-btn" data-act="newPlan">＋ 別の案を作る</button>`;
}

/* =========================================================
 * 地図
 * ========================================================= */
let map, infoWin, overlays = [], lastFit = '';

function loadMaps() {
  return new Promise((resolve, reject) => {
    window.__tpMapsReady = resolve;
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&libraries=marker,geometry&language=ja&callback=__tpMapsReady`;
    s.async = true;
    s.onerror = () => reject(new Error('Maps JS load failed'));
    document.head.append(s);
  });
}
window.gm_authFailure = () => toast('APIキーが無効か、Maps JavaScript API が有効になっていません。メニュー →「設定」で確認してください', 8000);

function initMap() {
  map = new google.maps.Map($('#map'), {
    center: { lat: 39.5, lng: -98.35 }, zoom: 4,
    mapId: 'DEMO_MAP_ID', colorScheme: 'FOLLOW_SYSTEM',
    disableDefaultUI: true, zoomControl: true,
    gestureHandling: 'greedy', clickableIcons: true,
  });
  infoWin = new google.maps.InfoWindow();
  map.addListener('click', onMapClick);
}

/* 地図タップで場所を追加: お店・観光地アイコン → その場所 / 何もない所 → 名前を付けて地点を追加 */
async function fetchPlaceById(id) {
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?languageCode=ja`, {
    referrerPolicy: 'no-referrer-when-downgrade',
    headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,priceLevel,rating' },
  });
  const p = await res.json();
  if (!res.ok) throw new Error(p.error?.message || `HTTP ${res.status}`);
  return { pid: p.id, name: p.displayName?.text || '(名称なし)', addr: p.formattedAddress || '', lat: p.location.latitude, lng: p.location.longitude, price: p.priceLevel || '', rating: p.rating || 0 };
}

function popup(pos, html, onAdd) {
  const div = document.createElement('div');
  div.className = 'map-pop';
  div.innerHTML = html + '<button type="button" class="primary">＋ 行きたい場所に追加</button>';
  div.querySelector('button').onclick = () => { infoWin.close(); onAdd(); };
  infoWin.setContent(div);
  infoWin.setPosition(pos);
  infoWin.open({ map });
}

async function onMapClick(e) {
  if (ui.tab === 'compare') return;
  const p = curPlan();
  const addAndPlace = c => { commit(); placeCand(p, c); };
  if (e.placeId) {
    e.stop(); // Google標準の吹き出しの代わりに、自前の吹き出しを出す
    try {
      const r = await fetchPlaceById(e.placeId);
      const exists = data.candidates.find(x => x.pid === r.pid);
      popup(e.latLng, `<div class="pop-name">${esc(r.name)}</div><div class="pop-meta">${esc([PRICE[r.price], r.rating ? '★' + r.rating : '', r.addr].filter(Boolean).join(' · '))}</div>${exists ? '<div class="pop-meta">(行きたい場所に追加済み)</div>' : ''}`,
        () => addAndPlace(ensureCand(r)));
    } catch (err) { toast('場所の情報を取得できませんでした: ' + err.message); }
    return;
  }
  const lat = e.latLng.lat(), lng = e.latLng.lng();
  popup(e.latLng, `<div class="pop-name">この地点</div><div class="pop-meta">${lat.toFixed(4)}, ${lng.toFixed(4)}</div>`, async () => {
    const v = await formDialog('地点に名前を付ける', [{ name: 'name', label: '名前', value: '', placeholder: '例: 絶景ポイント、キャンプ場' }]);
    if (!v) return;
    addAndPlace(ensureCand({ name: v.name || `地点 ${lat.toFixed(3)}, ${lng.toFixed(3)}`, lat, lng }));
  });
}

function clearOverlays() {
  overlays.forEach(o => (o instanceof google.maps.Polyline ? o.setMap(null) : (o.map = null)));
  overlays = [];
}
function addPin(p, glyph, color, title) {
  const opts = { background: color, borderColor: color, glyphColor: '#fff' };
  if (glyph) opts.glyph = glyph;
  const pin = new google.maps.marker.PinElement(opts);
  const m = new google.maps.marker.AdvancedMarkerElement({ map, position: { lat: p.lat, lng: p.lng }, content: pin.element, title });
  m.addListener('click', () => {
    infoWin.setContent(`<div style="color:#18181b;font-weight:600">${esc(title)}</div>`);
    infoWin.open({ map, anchor: m });
  });
  overlays.push(m);
}
function addLine(path, color, { dashed = false, geodesic = false } = {}) {
  const opts = { map, path, geodesic, strokeColor: color, strokeOpacity: dashed ? 0 : 0.85, strokeWeight: 4 };
  if (dashed) opts.icons = [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeWeight: 3, scale: 3 }, offset: '0', repeat: '14px' }];
  overlays.push(new google.maps.Polyline(opts));
}
const decode = poly => google.maps.geometry.encoding.decodePath(poly);

function drawLeg(p, i) {
  const L = p.stops[i].leg, a = stopPlace(p.stops[i - 1]), b = stopPlace(p.stops[i]);
  if (!a || !b) return;
  if (L.mode === 'drive') {
    const r = getRoute('DRIVE', a, b, true);
    if (r?.poly) addLine(decode(r.poly), COL.leg);
    else addLine([a, b], COL.leg, { dashed: true });
  } else {
    addLine([a, b], COL.leg, { dashed: true, geodesic: L.mode === 'flight' });
  }
}

function renderMap() {
  if (!map) return;
  try { drawMap(); } catch (e) { console.error('map', e); }
}

function drawMap() {
  clearOverlays();
  const pts = [];
  let key;
  {
    const p = curPlan();
    const si = ui.tab === 'plan' ? ui.stop : -1;
    if (si === -1) {
      // まだ入れていない場所はグレー(★必須は赤)で表示
      trayOf(p).forEach(c => { addPin(c, c.must ? '★' : '', c.must ? COL.must : COL.gray, `未配置: ${c.name}`); pts.push(c); });
      p.stops.forEach((s, i) => {
        if (i > 0) drawLeg(p, i);
        const c = stopPlace(s);
        if (c) { addPin(c, String(i + 1), COL.stop, `${i + 1}. ${c.name}`); pts.push(c); }
      });
    } else {
      const s = p.stops[si], c = stopPlace(s);
      if (c) { addPin(c, String(si + 1), COL.stop, c.name); pts.push(c); }
      const spots = spotsOf(s);
      spots.forEach((x, j) => {
        if (j > 0) { const r = getRoute(s.mode, spots[j - 1], x); if (r?.poly) addLine(decode(r.poly), COL.accent); }
        addPin(x, String(j + 1), COL.accent, `${j + 1}. ${x.name}`);
        pts.push(x);
      });
      if (s.lodging?.place) { addPin(s.lodging.place, '🛏', COL.lodge, `宿: ${s.lodging.place.name}`); pts.push(s.lodging.place); }
    }
    key = `${ui.tab}:${p.id}:${si}:${pts.length}`;
  }
  if (key !== lastFit && pts.length) {
    lastFit = key;
    if (pts.length === 1) { map.setCenter({ lat: pts[0].lat, lng: pts[0].lng }); map.setZoom(12); }
    else {
      const b = new google.maps.LatLngBounds();
      pts.forEach(x => b.extend({ lat: x.lat, lng: x.lng }));
      map.fitBounds(b, 40);
    }
  }
}

/* =========================================================
 * 場所検索ダイアログ
 * ========================================================= */
let pickerCtx = null, pickerResults = [];

function openPicker(ctx) {
  pickerCtx = ctx;
  ctx.type ||= 'auto';
  $('#pickerTitle').textContent = ctx.title;
  $('#pickerInput').value = '';
  $('#pickerResults').innerHTML = '';
  pickerResults = [];
  renderPickerTypes();
  renderPickerCands();
  $('#picker').showModal();
  return new Promise(res => (ctx.resolve = res));
}
function renderPickerTypes() {
  const box = $('#pickerTypes');
  if (!pickerCtx?.typeToggle) { box.innerHTML = ''; return; }
  const opt = [['auto', '自動で判定'], ['stop', '📍 経由地'], ['spot', 'スポット']];
  box.innerHTML = `<span>追加する種類</span><div class="seg">${opt.map(([v, l]) => `<button type="button" data-type="${v}" class="${pickerCtx.type === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
function renderPickerCands() {
  const box = $('#pickerCands');
  const ctx = pickerCtx;
  if (!ctx?.cands) { box.innerHTML = ''; return; }
  const added = ctx.added || new Set();
  // まだ入れていない場所を先に、使用中の場所を後に
  const list = data.candidates.filter(c => !ctx.exclude?.(c) || added.has(c.id))
    .sort((a, b) => (ctx.plan ? isPlaced(ctx.plan, a.id) - isPlaced(ctx.plan, b.id) : 0));
  box.innerHTML = list.length
    ? `<h3 class="sec">行きたい場所から選ぶ</h3><ul class="results">${list.map(c => `
        <li><div class="info"><div class="name">${c.must ? '★ ' : ''}${esc(c.name)}</div><div class="meta">${esc(usedIn(c.id) || '未配置 · ' + c.addr)}</div></div>
        <button class="pick-btn ${added.has(c.id) ? 'done' : ''}" data-cand="${c.id}">${added.has(c.id) ? '✓ 追加' : '追加'}</button></li>`).join('')}</ul>`
    : '<p class="sub">上で検索して追加できます。</p>';
}
function renderPickerResults() {
  const added = pickerCtx?.addedPid || new Set();
  $('#pickerResults').innerHTML = pickerResults.length
    ? pickerResults.map((r, i) => `<li>
        <div class="info"><div class="name">${esc(r.name)}</div><div class="meta">${esc([PRICE[r.price], r.rating ? '★' + r.rating : '', r.addr].filter(Boolean).join(' · '))}</div></div>
        <button class="pick-btn ${added.has(r.pid) ? 'done' : ''}" data-res="${i}">${added.has(r.pid) ? '✓ 追加' : pickerCtx?.multi ? '追加' : '選ぶ'}</button></li>`).join('')
    : '<li class="meta">見つかりませんでした</li>';
}

$('#pickerForm').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('#pickerInput').value.trim();
  if (!q) return;
  $('#pickerInput').blur();
  $('#pickerResults').innerHTML = '<li class="meta">検索中…</li>';
  try {
    pickerResults = await searchPlaces(q);
    renderPickerResults();
  } catch (err) {
    $('#pickerResults').innerHTML = '';
    toast('検索できませんでした: ' + err.message, 6000);
  }
});
$('#picker').addEventListener('click', e => {
  const ctx = pickerCtx;
  if (!ctx) return;
  const tb = e.target.closest('[data-type]');
  const rb = e.target.closest('[data-res]');
  const cb = e.target.closest('[data-cand]');
  if (tb) { ctx.type = tb.dataset.type; renderPickerTypes(); return; }
  if (rb) {
    const r = pickerResults[+rb.dataset.res];
    if (!ctx.multi) { ctx.picked = r; $('#picker').close(); return; }
    (ctx.addedPid ||= new Set()).add(r.pid);
    const c = ctx.onPick(r);
    if (c && ctx.cands) (ctx.added ||= new Set()).add(c.id);
    renderPickerResults(); renderPickerCands();
  } else if (cb) {
    const c = candById(cb.dataset.cand);
    (ctx.added ||= new Set()).add(c.id);
    ctx.onPickCand?.(c);
    renderPickerCands();
  }
});
$('#pickerClose').addEventListener('click', () => $('#picker').close());
$('#picker').addEventListener('close', () => {
  const ctx = pickerCtx; pickerCtx = null;
  ctx?.resolve?.(ctx.picked || null);
});

function ensureCand(place) {
  let c = place.pid ? data.candidates.find(x => x.pid === place.pid) : null;
  if (!c) {
    c = { id: uid(), pid: place.pid || '', name: place.name, addr: place.addr || '', lat: place.lat, lng: place.lng, price: place.price || '', rating: place.rating || 0,
      cost: 0, cur: 'USD', must: false, memo: '' };
    data.candidates.push(c);
    saveData();
  }
  return c;
}

/* =========================================================
 * 汎用フォーム
 * ========================================================= */
function fieldHtml(f) {
  const lab = `<span>${esc(f.label)}</span>`;
  switch (f.type) {
    case 'select':
      return `<label class="f">${lab}<select name="${f.name}">${f.options.map(o => `<option value="${esc(o.v)}" ${String(o.v) === String(f.value) ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select></label>`;
    case 'checkbox':
      return `<label class="f check"><input type="checkbox" name="${f.name}" ${f.value ? 'checked' : ''}><span>${esc(f.label)}</span></label>`;
    case 'textarea':
      return `<label class="f">${lab}<textarea name="${f.name}">${esc(f.value)}</textarea></label>`;
    case 'place':
      return `<div class="f">${lab}<div class="place-field">
        <button type="button" class="place-btn ${f.value ? '' : 'unset'}" data-place="${f.name}">${esc(f.value?.name || 'タップして検索')}</button>
        <button type="button" class="icon-btn" data-clear="${f.name}" aria-label="クリア">✕</button></div></div>`;
    case 'money':
      return `<div class="f-row">
        <label class="f">${lab}<input type="number" inputmode="decimal" step="any" name="${f.name}" value="${esc(f.value ?? 0)}"></label>
        <label class="f"><span>通貨</span><select name="${f.curName}">${CURS.map(o => `<option value="${o.v}" ${o.v === f.cur ? 'selected' : ''}>${o.l}</option>`).join('')}</select></label></div>`;
    case 'note':
      return `<p class="sub">${esc(f.label)}</p>`;
    default:
      return `<label class="f">${lab}<input type="${f.type || 'text'}" name="${f.name}" value="${esc(f.value ?? '')}" ${f.type === 'number' ? 'inputmode="decimal" step="any"' : ''} autocomplete="off" ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}></label>`;
  }
}

function formDialog(title, fields, { deletable = false, deleteLabel = '削除' } = {}) {
  return new Promise(resolve => {
    const dlg = $('#formDlg');
    const places = {};
    fields.filter(f => f.type === 'place').forEach(f => (places[f.name] = f.value || null));
    // 保存ボタンをDOMの先頭に(Enterで削除が押されないように)。見た目は row-reverse で右端
    dlg.innerHTML = `<form method="dialog" class="fd"><h3>${esc(title)}</h3>${fields.map(fieldHtml).join('')}
      <div class="fd-btns">
        <button value="ok" class="primary">保存</button>
        <button value="cancel" class="btn-plain" formnovalidate>キャンセル</button>
        <span class="sp"></span>
        ${deletable ? `<button value="delete" class="btn-danger">${esc(deleteLabel)}</button>` : ''}
      </div></form>`;
    dlg.onclick = async e => {
      const pb = e.target.closest('[data-place]');
      const cb = e.target.closest('[data-clear]');
      if (pb) {
        const f = fields.find(x => x.name === pb.dataset.place);
        const r = await openPicker({ title: f.label + 'を検索' });
        if (r) {
          places[f.name] = { pid: r.pid, name: r.name, addr: r.addr, lat: r.lat, lng: r.lng };
          pb.textContent = r.name; pb.classList.remove('unset');
        }
      } else if (cb) {
        places[cb.dataset.clear] = null;
        const btn = dlg.querySelector(`[data-place="${cb.dataset.clear}"]`);
        btn.textContent = 'タップして検索'; btn.classList.add('unset');
      }
    };
    dlg.onclose = () => {
      const rv = dlg.returnValue;
      if (rv === 'delete') return resolve({ _delete: true });
      if (rv !== 'ok') return resolve(null);
      const form = dlg.querySelector('form');
      const out = { ...places };
      fields.forEach(f => {
        if (f.type === 'place' || f.type === 'note') return;
        const el = form.elements[f.name];
        out[f.name] = f.type === 'checkbox' ? el.checked : (f.type === 'number' || f.type === 'money') ? num(el.value) : el.value.trim();
        if (f.type === 'money') out[f.curName] = form.elements[f.curName].value;
      });
      resolve(out);
    };
    dlg.returnValue = '';
    dlg.showModal();
  });
}

function actionSheet(items) {
  const dlg = $('#menu');
  dlg.innerHTML = `<form method="dialog">${items.map(i => (i.title
    ? `<div class="menu-title">${esc(i.title)}</div>`
    : `<button value="${esc(i.v)}" class="${i.danger ? 'danger' : ''} ${i.rec ? 'rec' : ''}">${esc(i.label)}</button>`)).join('')}
    <button value="" class="muted">閉じる</button></form>`;
  dlg.returnValue = '';
  dlg.showModal();
  return new Promise(res => dlg.addEventListener('close', () => res(dlg.returnValue), { once: true }));
}

/* =========================================================
 * 便の検索ダイアログ
 * ========================================================= */
function legCodes(p, i) {
  const L = p.stops[i].leg;
  return {
    from: L.fromCodes || nearestAirports(stopPlace(p.stops[i - 1])).join(','),
    to: L.toCodes || nearestAirports(stopPlace(p.stops[i])).join(','),
  };
}

function unbundle(p, L) {
  if (!L.bundle) return;
  const other = p.stops.find(s => s.leg.bundle && s.id === L.bundle)?.leg;
  if (other) { other.bundle = null; other.flight = null; other.cost = 0; }
  L.bundle = null;
}

function openFlightSearch(p, i) {
  const dlg = $('#flightDlg');
  const s = p.stops[i], L = s.leg;
  const a = stopPlace(p.stops[i - 1]), b = stopPlace(s);
  const codes = legCodes(p, i);
  const pairs = p.stops.map((x, k) => ({ x, k })).filter(({ x, k }) => k > 0 && k !== i && x.leg.mode === 'flight');
  const pairSel = L.bundle ? p.stops.findIndex(x => x.id === L.bundle) : '';
  const clsDefault = typeof L.flight?.cls === 'number' ? [...new Set([1, L.flight.cls])] : (settings.flightClasses || [1]);
  let state = { step: 0, results: [], legsOrder: null, params: null, first: null, classes: [1], cls: 1, last: null, mix: null };

  dlg.innerHTML = `
    <div class="sheet-head"><h3>✈️ ${esc(a?.name || '')} → ${esc(b?.name || '')}</h3><button class="icon-btn" data-fl="close" aria-label="閉じる">✕</button></div>
    <form class="fl-form" id="flForm">
      <div class="f-row2">
        <label class="f"><span>出発空港</span><input name="from" value="${esc(codes.from)}" autocapitalize="characters" autocomplete="off"></label>
        <label class="f"><span>到着空港</span><input name="to" value="${esc(codes.to)}" autocapitalize="characters" autocomplete="off"></label>
      </div>
      <label class="f"><span>日付</span><input type="date" name="date" value="${esc(L.date)}"></label>
      ${pairs.length ? `<label class="f"><span>まとめて1枚で買う区間(オープンジョー・複数都市)</span><select name="pair">
        <option value="">この区間だけ(片道)</option>
        ${pairs.map(({ x, k }) => `<option value="${k}" ${pairSel === k ? 'selected' : ''}>${esc(stopPlace(p.stops[k - 1])?.name || '')} → ${esc(stopPlace(x)?.name || '')}${x.leg.date ? ' ' + fmtDate(x.leg.date) : ''}</option>`).join('')}
      </select></label>` : ''}
      <div class="f"><span>座席クラス(複数選ぶと並べて比較)</span>
        <div class="cls-pick">${Object.entries(CLASSES).map(([c, n]) =>
          `<label><input type="checkbox" name="cls" value="${c}" ${clsDefault.includes(+c) ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div>
      </div>
      <label class="f check"><input type="checkbox" name="nonstop"><span>直行便のみ</span></label>
      <div class="btn-row">
        <button class="primary" type="submit">検索</button>
        <a class="text-btn" id="gfLink" target="_blank" rel="noopener" href="${gfUrl(codes.from, codes.to, L.date)}">Google Flightsで開く ↗</a>
      </div>
    </form>
    <p class="sub" id="flStatus">${settings.flightProxy ? '空港コードは複数をカンマ区切りで指定できます(例: JFK,LGA,EWR)' : '⚠️ アプリ内で便を検索するには、メニュー →「設定」で中継URLを入れてください。'}</p>
    <ul class="fl-results" id="flResults"></ul>`;

  const form = $('#flForm', dlg);
  const status = msg => ($('#flStatus', dlg).textContent = msg);
  form.addEventListener('input', () => {
    $('#gfLink', dlg).href = gfUrl(form.from.value.trim(), form.to.value.trim(), form.date.value);
  });

  // クラスごとの検索結果を、同じ便どうしで1行にまとめる
  const showResults = (byCls, title, errs = []) => {
    state.last = { byCls, title, errs }; state.mix = null;
    const map = new Map();
    for (const { c, j } of byCls) {
      const opts = [...(j.best_flights || []), ...(j.other_flights || [])].map(parseOption).filter(Boolean);
      for (const o of opts) {
        const k = o.numbers.join() + o.dep.time;
        let row = map.get(k);
        if (!row) map.set(k, (row = { f: o, prices: {}, tokens: {} }));
        if (row.prices[c] == null || (o.price != null && o.price < row.prices[c])) { row.prices[c] = o.price; row.tokens[c] = o.token; }
      }
    }
    const cs = byCls.map(x => x.c);
    const minOf = r => Math.min(...cs.map(c => r.prices[c] ?? Infinity));
    state.results = [...map.values()].sort((a, b) => minOf(a) - minOf(b)).slice(0, 30);
    const cheapest = Object.fromEntries(cs.map(c => [c, Math.min(...state.results.map(r => r.prices[c] ?? Infinity))]));
    const errMsg = errs.length ? ` ⚠️ ${errs.join(' / ')}` : '';
    status((state.results.length ? title : '便が見つかりませんでした。日付や空港を変えてみてください。') + errMsg);
    const summary = cs.length > 1 && state.results.length ? `<li class="cls-sum">${cs.map(c =>
      `<div><span>${CLASSES[c]}の最安</span><b>${isFinite(cheapest[c]) ? fmtJPY(cheapest[c]) : '—'}</b></div>`).join('')}</li>` : '';
    $('#flResults', dlg).innerHTML = summary + state.results.map((r, k) => {
      const f = r.f;
      const one = cs.length === 1;
      return `
      <li ${one ? `data-pick="${k}" data-cls="${cs[0]}"` : ''} class="${one ? '' : 'multi'}">
        <div class="fl-main">
          ${f.logo ? `<img src="${esc(f.logo)}" alt="" width="28" height="28" loading="lazy">` : '<span class="kind">✈️</span>'}
          <div class="info">
            <div class="name">${esc(flightLine(f))}</div>
            <div class="meta">${esc(`${f.airlines.join(' / ')} ${f.numbers.join('→')} · ${fmtDur(f.mins * 60)} · ${flightStops(f)}`)}</div>
            ${f.segs.length > 1 ? `<div class="meta">${esc(f.segs.map(s => `${s.from}→${s.to} ${fmtDur(s.mins * 60)}`).join(' / '))}</div>` : ''}
            ${one && mixedNote(f) ? `<div class="meta warn-txt">${esc(mixedNote(f))}</div>` : ''}
          </div>
          ${one ? `<div class="fl-price">${r.prices[cs[0]] != null ? fmtJPY(r.prices[cs[0]]) : '—'}</div>` : ''}
        </div>
        ${one ? '' : `<div class="cls-prices">${cs.map(c => r.prices[c] !== undefined
          ? `<button type="button" data-pick="${k}" data-cls="${c}" class="${r.prices[c] === cheapest[c] ? 'best' : ''}"><small>${CLASSES[c]}</small>${r.prices[c] != null ? fmtJPY(r.prices[c]) : '価格不明'}</button>`
          : `<span class="na"><small>${CLASSES[c]}</small>設定なし</span>`).join('')}</div>`}
        <details class="itin-box"><summary>行程の詳細</summary>${flightDetailHTML(f, { showCls: one })}</details>
        ${f.segs.length > 1 && state.legsOrder.length === 1
          ? `<button type="button" class="text-btn mix-btn" data-mix="${k}">区間ごとにクラスを変えて見積もる ›</button>` : ''}
      </li>`;
    }).join('');
  };
  // 選んだクラスをそれぞれ検索(1クラス=検索1回)
  const searchClasses = async (params, classes) => {
    const rs = await Promise.allSettled(classes.map(c => flightApi({ ...params, travel_class: c })));
    const ok = [], errs = [];
    rs.forEach((r, n) => r.status === 'fulfilled' ? ok.push({ c: classes[n], j: r.value }) : errs.push(`${CLASSES[classes[n]]}: ${r.reason.message}`));
    if (!ok.length) throw new Error(errs.join(' / '));
    return { ok, errs };
  };

  // ---- 区間ごとにクラスを変える(各区間を別々の片道として見積もる) ----
  const mixRule = () => Object.assign({ hours: 4, short: 1, long: 3 }, settings.mixRule);
  const applyRule = (segs, r) => segs.map(s => (s.mins <= r.hours * 60 ? r.short : r.long));
  const openMix = row => {
    const segs = row.f.segs;
    state.mix = { row, pick: applyRule(segs, mixRule()), prices: segs.map(() => ({})), busy: false };
    drawMix();
  };
  const mixTotal = m => {
    const ps = m.pick.map((c, n) => m.prices[n][c]);
    return ps.every(x => typeof x === 'number') ? ps.reduce((a, b) => a + b, 0) : null;
  };
  const drawMix = () => {
    const m = state.mix, r = mixRule(), segs = m.row.f.segs;
    const total = mixTotal(m);
    const need = m.pick.filter((c, n) => m.prices[n][c] === undefined).length;
    const clsOpts = sel => Object.entries(CLASSES).map(([c, n]) => `<option value="${c}" ${+c === sel ? 'selected' : ''}>${n}</option>`).join('');
    const through = Object.entries(m.row.prices).filter(([, v]) => v != null);
    status('区間ごとにクラスを選んで「見積もる」を押してください');
    $('#flResults', dlg).innerHTML = `
      <li class="mix">
        <button type="button" class="text-btn" data-mixact="back">‹ 便の一覧に戻る</button>
        <div class="mix-rule">
          <span>搭乗 <input type="number" name="mixH" value="${r.hours}" min="0" step="0.5" inputmode="decimal"> 時間以内は <select name="mixS">${clsOpts(r.short)}</select></span>
          <span>それより長い区間は <select name="mixL">${clsOpts(r.long)}</select></span>
          <button type="button" class="chip-btn" data-mixact="rule">当てはめる</button>
        </div>
        ${segs.map((s, n) => {
          const pr = m.prices[n][m.pick[n]];
          return `<div class="mix-seg">
            <div class="name">${esc(`${s.from} ${hhmm(s.dep)} → ${s.to} ${hhmm(s.arr)}`)}</div>
            <div class="meta">${esc(`${s.airline} ${s.num} · 搭乗 ${fmtDur(s.mins * 60)}`)}</div>
            <div class="cls-seg">${Object.entries(CLS_SHORT).map(([c, nm]) =>
              `<button type="button" data-mixseg="${n}" data-c="${c}" class="${m.pick[n] === +c ? 'on' : ''}">${nm}</button>`).join('')}
              <span class="mix-price">${pr === undefined ? '' : pr === null ? 'この便は見つからず' : fmtJPY(pr)}</span>
            </div>
          </div>`;
        }).join('')}
        <div class="mix-sum">
          ${through.map(([c, v]) => `<div><span>通しで${CLASSES[c]}</span><b>${fmtJPY(v)}</b></div>`).join('')}
          <div class="mix-total"><span>この組み合わせ(区間ごとに購入)</span><b>${total != null ? fmtJPY(total) : '—'}</b></div>
        </div>
        <div class="btn-row">
          ${need || m.busy
            ? `<button type="button" class="primary" data-mixact="est" ${m.busy ? 'disabled' : ''}>${m.busy ? '見積もり中…' : `見積もる(検索${need}回分)`}</button>`
            : ''}
          <button type="button" class="${need || m.busy ? 'chip-btn' : 'primary'}" data-mixact="use" ${total != null && !need ? '' : 'disabled'}>この組み合わせで決める</button>
        </div>
        <p class="sub">※ 区間ごとに別々の航空券として買った場合の目安です。前の便が遅れても次の便に振り替えてもらえず、荷物の預け直しも必要になることがあります。航空会社のサイトや旅行会社では、1枚の航空券でクラスを混ぜて買えて、この合計より安くなることもあります。</p>
      </li>`;
  };
  const mixClick = async e => {
    const m = state.mix;
    const seg = e.target.closest('[data-mixseg]');
    if (seg) { m.pick[+seg.dataset.mixseg] = +seg.dataset.c; drawMix(); return; }
    const act = e.target.closest('[data-mixact]')?.dataset.mixact;
    if (act === 'back') { const l = state.last; showResults(l.byCls, l.title, l.errs); return; }
    if (act === 'rule') {
      const box = $('.mix-rule', dlg);
      settings.mixRule = { hours: num(box.querySelector('[name=mixH]').value), short: +box.querySelector('[name=mixS]').value, long: +box.querySelector('[name=mixL]').value };
      saveSettings();
      m.pick = applyRule(m.row.f.segs, settings.mixRule);
      drawMix(); return;
    }
    if (act === 'est') {
      m.busy = true; drawMix();
      const segs = m.row.f.segs;
      const errs = [];
      await Promise.all(segs.map(async (s, n) => {
        const c = m.pick[n];
        if (m.prices[n][c] !== undefined) return;
        try {
          const j = await flightApi({ type: 2, stops: 1, departure_id: s.from, arrival_id: s.to, outbound_date: s.dep.slice(0, 10), travel_class: c });
          const hit = [...(j.best_flights || []), ...(j.other_flights || [])]
            .find(o => (o.flights || []).length === 1 && normNum(o.flights[0].flight_number) === normNum(s.num));
          m.prices[n][c] = hit?.price ?? null;
        } catch (err) { errs.push(`${s.from}→${s.to}: ${err.message}`); }
      }));
      m.busy = false; drawMix();
      if (errs.length) status('一部の区間を見積もれませんでした: ' + errs.join(' / '));
      return;
    }
    if (act === 'use') {
      const total = mixTotal(m);
      if (total == null) return;
      const { token, ...f } = m.row.f;
      const leg = state.legsOrder[0];
      unbundle(p, L);
      Object.assign(L, { flight: { ...f, price: total, cls: 'mix', segCls: m.pick.slice() }, cost: total, cur: 'JPY', date: leg.date, fromCodes: leg.from, toCodes: leg.to });
      dlg.close(); commit(); toast('便を設定しました(区間ごとにクラスを変更)');
    }
  };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const from = form.from.value.trim().toUpperCase().replace(/\s/g, '');
    const to = form.to.value.trim().toUpperCase().replace(/\s/g, '');
    const date = form.date.value;
    if (!from || !to || !date) { status('出発空港・到着空港・日付を入れてください'); return; }
    const k = form.pair?.value ? +form.pair.value : null;
    const base = form.nonstop.checked ? { stops: 1 } : {};
    let params;
    if (k == null) {
      params = { ...base, type: 2, departure_id: from, arrival_id: to, outbound_date: date };
      state.legsOrder = [{ i, from, to, date }];
    } else {
      const other = p.stops[k].leg;
      const oc = legCodes(p, k);
      if (!other.date) { status('まとめる区間の日付を、先にその区間で設定してください'); return; }
      const legs = [{ i, from, to, date }, { i: k, from: oc.from, to: oc.to, date: other.date }].sort((x, y) => x.i - y.i);
      state.legsOrder = legs;
      params = { ...base, type: 3, multi_city_json: JSON.stringify(legs.map(x => ({ departure_id: x.from, arrival_id: x.to, date: x.date }))) };
    }
    const classes = [...form.querySelectorAll('[name="cls"]:checked')].map(x => +x.value);
    if (!classes.length) { status('座席クラスを1つ以上選んでください'); return; }
    settings.flightClasses = classes; saveSettings();
    state.params = params; state.step = 0; state.first = null; state.classes = classes;
    status(classes.length > 1 ? `検索中…(${classes.length}クラス分)` : '検索中…'); $('#flResults', dlg).innerHTML = '';
    try {
      const { ok, errs } = await searchClasses(params, classes);
      const pick = classes.length > 1 ? 'クラスの価格をタップで選択' : 'タップで選択';
      showResults(ok, state.legsOrder.length > 1 ? `① 1つ目の区間の便の${pick}(価格は全区間の合計)` : pick, errs);
    } catch (err) { status('検索できませんでした: ' + err.message); }
  });

  dlg.onclick = async e => {
    if (e.target.closest('[data-fl="close"]')) { dlg.close(); return; }
    if (e.target.closest('.itin-box')) return; // 詳細の開閉では便を選ばない
    if (state.mix && e.target.closest('.mix')) { mixClick(e); return; }
    const mixBtn = e.target.closest('[data-mix]');
    if (mixBtn) { openMix(state.results[+mixBtn.dataset.mix]); return; }
    const li = e.target.closest('[data-pick]');
    if (!li) return;
    const row = state.results[+li.dataset.pick];
    const cls = +li.dataset.cls;
    const f = { ...row.f, price: row.prices[cls], token: row.tokens[cls], cls };
    const legs = state.legsOrder;
    if (legs.length > 1 && state.step === 0) {
      if (!f.token) { status('この便は続きの区間を検索できません。別の便を選んでください'); return; }
      state.first = f; state.step = 1; state.cls = cls;
      status('検索中…'); $('#flResults', dlg).innerHTML = '';
      try {
        // 2つ目の区間は、1つ目で選んだクラスで続きを検索
        const { ok } = await searchClasses({ ...state.params, departure_token: f.token }, [cls]);
        showResults(ok, `② 2つ目の区間を選んでください(${CLASSES[cls]}・価格は全区間の合計)`);
      } catch (err) { status('検索できませんでした: ' + err.message); }
      return;
    }
    // 決定
    const strip = x => { const { token, ...rest } = x; return rest; };
    if (legs.length === 1) {
      unbundle(p, L);
      Object.assign(L, { flight: strip(f), cost: f.price ?? L.cost, cur: 'JPY', date: legs[0].date, fromCodes: legs[0].from, toCodes: legs[0].to });
    } else {
      const [x1, x2] = legs;
      const L1 = p.stops[x1.i].leg, L2 = p.stops[x2.i].leg;
      unbundle(p, L1); unbundle(p, L2);
      Object.assign(L1, { flight: strip(state.first), cost: f.price ?? 0, cur: 'JPY', date: x1.date, fromCodes: x1.from, toCodes: x1.to, bundle: p.stops[x2.i].id });
      Object.assign(L2, { flight: strip(f), cost: 0, cur: 'JPY', date: x2.date, fromCodes: x2.from, toCodes: x2.to, bundle: p.stops[x1.i].id });
    }
    dlg.close();
    commit();
    toast('便を設定しました');
  };

  dlg.showModal();
}

/* =========================================================
 * 操作
 * ========================================================= */
const commit = () => { saveData(); saveUi(); render(true); };

async function editCand(c) {
  const v = await formDialog(c.name, [
    { name: 'name', label: '名前', value: c.name },
    { name: 'cost', curName: 'cur', type: 'money', label: '入場料・体験代など', value: c.cost, cur: c.cur || 'USD' },
    { name: 'must', type: 'checkbox', label: '★ 必ず行きたい', value: c.must },
    { name: 'memo', type: 'textarea', label: 'メモ', value: c.memo },
  ], { deletable: true });
  if (!v) return;
  if (v._delete) {
    const used = usedIn(c.id);
    if (used && !confirm(`「${c.name}」は ${used} で使われています。プランからも外して削除しますか?`)) return;
    data.candidates = data.candidates.filter(x => x !== c);
    data.plans.forEach(p => {
      p.stops = p.stops.filter(s => s.candId !== c.id);
      p.stops.forEach(s => (s.spots = s.spots.filter(id => id !== c.id)));
    });
  } else {
    Object.assign(c, v);
  }
  commit();
}

/* 旅程の k 番目に経由地として差し込む */
function insertStop(p, c, k = p.stops.length) {
  const prev = k > 0 ? stopPlace(p.stops[k - 1]) : null;
  const mode = prev && kmBetween(prev, c) < 700 ? 'drive' : 'flight';
  p.stops.splice(k, 0, newStop(c.id, mode, p.stops.length ? 1 : 0));
  const next = p.stops[k + 1];
  if (next) { // 次の区間は出発地が変わるので、選んでいた便は解除
    const untouched = !next.leg.flight && !num(next.leg.cost);
    clearFlightsAround(p, [k + 1]);
    next.leg.fromCodes = null;
    // まだ何も決めていない区間なら、距離から移動手段を選び直す(例: 成田→ABQ の間に PHX → PHX→ABQ は車)
    if (untouched) {
      const nm = kmBetween(c, stopPlace(next)) < 700 ? 'drive' : 'flight';
      if (nm !== next.leg.mode) Object.assign(next.leg, { mode: nm, cur: nm === 'flight' ? 'JPY' : 'USD' });
    }
  }
}
const addStopToPlan = (p, c) => insertStop(p, c);

/* 寄り道が最小になる差し込み位置・最寄りの経由地 */
function bestInsert(p, c) {
  let best = p.stops.length, bestCost = Infinity;
  for (let k = 0; k <= p.stops.length; k++) {
    const a = k > 0 ? stopPlace(p.stops[k - 1]) : null, b = stopPlace(p.stops[k] || {});
    const cost = a && b ? kmBetween(a, c) + kmBetween(c, b) - kmBetween(a, b) : a ? kmBetween(a, c) : b ? kmBetween(c, b) : 0;
    // 先頭(日本の出発地の前)は通常ありえないので少し不利に
    const adj = k === 0 && p.stops.length ? cost + 1e5 : cost;
    if (adj < bestCost) { bestCost = adj; best = k; }
  }
  return best;
}
function nearestStop(p, c) {
  let best = -1, d = Infinity;
  p.stops.forEach((s, i) => { const x = stopPlace(s); if (x) { const e = kmBetween(x, c); if (e < d) { d = e; best = i; } } });
  return best;
}

/* 行きたい場所を旅程に配置する(経由地として / どこかの経由地で立ち寄り) */
async function placeCand(p, c) {
  const nameOf = i => stopPlace(p.stops[i])?.name || '';
  const how = await actionSheet([
    { title: `「${c.name}」をどう入れますか?` },
    { v: 'stop', label: '📍 経由地として旅程に入れる(移動の区切り・泊まる所など)' },
    ...(p.stops.length ? [{ v: 'spot', label: '🎯 どこかの経由地で立ち寄る(街の中で回る)' }] : []),
    { v: 'later', label: 'あとで決める' },
  ]);
  if (how === 'stop') {
    if (!p.stops.length) { insertStop(p, c, 0); commit(); return; }
    const rec = bestInsert(p, c);
    const opts = [];
    for (let k = 0; k <= p.stops.length; k++) {
      const label = k === 0 ? `最初(${nameOf(0)}の前)`
        : k === p.stops.length ? `最後(${nameOf(k - 1)}の後)`
        : `${nameOf(k - 1)} と ${nameOf(k)} の間`;
      opts.push({ v: String(k), label: label + (k === rec ? '(おすすめ)' : ''), rec: k === rec });
    }
    const v = await actionSheet([{ title: 'どこに入れますか?' }, ...opts]);
    if (v === '') return;
    insertStop(p, c, +v);
    commit();
    toast(`「${c.name}」を旅程に入れました`);
  } else if (how === 'spot') {
    const rec = nearestStop(p, c);
    const v = await actionSheet([
      { title: 'どこで立ち寄りますか?' },
      ...p.stops.map((s, i) => ({ v: String(i), label: `${i + 1}. ${nameOf(i)}${i === rec ? '(いちばん近い)' : ''}`, rec: i === rec })),
    ]);
    if (v === '') return;
    p.stops[+v].spots.push(c.id);
    commit();
    toast(`「${c.name}」を ${nameOf(+v)} に入れました`);
  }
}

async function editLeg(p, i) {
  const L = p.stops[i].leg;
  const a = stopPlace(p.stops[i - 1]), b = stopPlace(p.stops[i]);
  const v = await formDialog(`${a?.name || ''} → ${b?.name || ''}`, [
    { name: 'mode', type: 'select', label: '移動手段', value: L.mode, options: Object.entries(LEGS).map(([k, x]) => ({ v: k, l: `${x.icon} ${x.label}` })) },
    { name: 'date', type: 'date', label: '日付(出発日)', value: L.date },
    { name: 'cost', curName: 'cur', type: 'money', label: '費用(飛行機は便を選ぶと自動。車はレンタカー代など、ガソリン・通行料以外)', value: L.cost, cur: L.cur },
    { name: 'note', label: 'メモ(予約番号など)', value: L.note },
  ]);
  if (!v) return;
  if (v.mode !== 'flight' && L.mode === 'flight') unbundle(p, L);
  Object.assign(L, v);
  commit();
}

async function editLodging(p, s) {
  const l = s.lodging || { place: null, cost: 0, cur: 'USD', note: '' };
  const v = await formDialog('宿', [
    { name: 'place', type: 'place', label: 'ホテル・宿', value: l.place },
    { name: 'cost', curName: 'cur', type: 'money', label: '1泊の料金(税・リゾートフィー込み)', value: l.cost, cur: l.cur },
    { name: 'note', label: 'メモ', value: l.note },
  ], { deletable: !!s.lodging });
  if (!v) return;
  s.lodging = v._delete ? null : v;
  commit();
}

function clearFlightsAround(p, idxs) {
  let cleared = false;
  idxs.forEach(k => {
    const L = p.stops[k]?.leg;
    if (L?.flight) { unbundle(p, L); L.flight = null; L.cost = 0; cleared = true; }
  });
  if (cleared) toast('並び順が変わったので、関係する便の選択を解除しました', 4000);
}

/* 経由地を from 番目から to 番目へ移動。区間(leg)は「前の経由地から来る移動」なので、日付は位置に残す */
function reorderStop(p, from, to) {
  if (from === to || to < 0 || to >= p.stops.length) return false;
  const legs = p.stops.map(s => s.leg);
  const [st] = p.stops.splice(from, 1);
  p.stops.splice(to, 0, st);
  p.stops.forEach((s, i) => (s.leg = legs[i]));
  const lo = Math.min(from, to), hi = Math.max(from, to);
  const idxs = [];
  for (let k = lo; k <= hi + 1 && k < p.stops.length; k++) idxs.push(k);
  const untouched = idxs.filter(k => !p.stops[k].leg.flight && !num(p.stops[k].leg.cost));
  clearFlightsAround(p, idxs);
  p.stops.forEach(s => { s.leg.fromCodes = null; s.leg.toCodes = null; });
  // まだ何も決めていない区間は、距離から移動手段を選び直す
  untouched.forEach(k => {
    if (k === 0) return;
    const a = stopPlace(p.stops[k - 1]), b = stopPlace(p.stops[k]);
    if (!a || !b) return;
    const nm = kmBetween(a, b) < 700 ? 'drive' : 'flight';
    if (nm !== p.stops[k].leg.mode) Object.assign(p.stops[k].leg, { mode: nm, cur: nm === 'flight' ? 'JPY' : 'USD' });
  });
  return true;
}
function moveStop(p, i, dir) {
  if (!reorderStop(p, i, i + dir)) return;
  ui.stop = i + dir;
  commit();
}

/* ---------- ドラッグ並べ替え(SortableJS) ---------- */
let sortables = [];
function setupSortables() {
  sortables.forEach(s => s.destroy());
  sortables = [];
  if (!window.Sortable || ui.tab !== 'plan') return;
  const p = curPlan();
  const base = {
    animation: 150, delay: 200, delayOnTouchOnly: true, touchStartThreshold: 5,
    ghostClass: 'drag-ghost', chosenClass: 'drag-chosen', forceFallback: true, fallbackOnBody: true,
    filter: 'button, select, input, a', preventOnFilter: false,
  };
  const after = fn => setTimeout(() => { fn(); commit(); }, 0); // Sortableの処理が終わってから描き直す
  const tl = $('#view .tl'), tray = $('#view .tray .list'), spots = $('#view .spots');

  if (tl) sortables.push(Sortable.create(tl, {
    ...base, group: { name: 'plan', pull: true, put: true }, draggable: '.tl-item',
    onUpdate: e => after(() => reorderStop(p, e.oldDraggableIndex, e.newDraggableIndex)),
    onAdd: e => { // 「まだ入れていない場所」→ 旅程
      const c = candById(e.item.dataset.cand);
      let k = 0; // 落とした位置より前にある経由地の数 = 差し込む位置
      for (let el = e.item.previousElementSibling; el; el = el.previousElementSibling) if (el.classList.contains('tl-item')) k++;
      if (c) after(() => { insertStop(p, c, k); toast(`「${c.name}」を旅程に入れました`); });
    },
  }));
  if (tray) sortables.push(Sortable.create(tray, {
    ...base, group: { name: 'plan', pull: true, put: true }, sort: false, draggable: '.item',
    onAdd: e => { // 旅程 → 「まだ入れていない場所」(旅程から外す)
      const k = p.stops.findIndex(s => s.id === e.item.dataset.stop);
      if (k < 0) return;
      after(() => {
        const name = stopPlace(p.stops[k])?.name || '';
        clearFlightsAround(p, [k, k + 1]);
        p.stops.splice(k, 1);
        if (p.stops[k]) p.stops[k].leg.fromCodes = null;
        toast(`「${name}」を旅程から外しました`);
      });
    },
  }));
  if (spots) {
    const s = p.stops[ui.stop];
    sortables.push(Sortable.create(spots, {
      ...base, draggable: '.spot-item',
      onUpdate: e => after(() => { const [x] = s.spots.splice(e.oldDraggableIndex, 1); s.spots.splice(e.newDraggableIndex, 0, x); }),
    }));
  }
}

/* ---------- 地図と一覧の仕切り ---------- */
function setupSplitter() {
  const sp = $('#splitter'), app = $('#app');
  const wide = () => matchMedia('(min-width: 900px)').matches;
  const saved = load('tp.split', {});
  if (saved.h) app.style.setProperty('--map-h', saved.h + 'px');
  if (saved.w) app.style.setProperty('--panel-w', saved.w + 'px');
  let dragging = false;
  sp.addEventListener('pointerdown', e => {
    dragging = true; sp.setPointerCapture(e.pointerId);
    sp.classList.add('active'); document.body.classList.add('resizing');
  });
  sp.addEventListener('pointermove', e => {
    if (!dragging) return;
    if (wide()) {
      const w = Math.min(Math.max(e.clientX, 300), innerWidth - 280);
      app.style.setProperty('--panel-w', w + 'px'); saved.w = Math.round(w);
    } else {
      const top = $('#map').getBoundingClientRect().top;
      const h = Math.min(Math.max(e.clientY - top, 80), innerHeight - 160);
      app.style.setProperty('--map-h', h + 'px'); saved.h = Math.round(h);
    }
  });
  const end = () => {
    if (!dragging) return;
    dragging = false; sp.classList.remove('active'); document.body.classList.remove('resizing');
    store('tp.split', saved);
  };
  sp.addEventListener('pointerup', end);
  sp.addEventListener('pointercancel', end);
  sp.addEventListener('dblclick', () => {
    app.style.removeProperty('--map-h'); app.style.removeProperty('--panel-w');
    store('tp.split', {});
  });
}

function clonePlan(p, name) {
  const c = clone(p);
  const ids = {};
  c.id = uid(); c.name = name;
  c.stops.forEach(s => { const n = uid(); ids[s.id] = n; s.id = n; });
  c.stops.forEach(s => { if (s.leg.bundle) s.leg.bundle = ids[s.leg.bundle] || null; });
  return c;
}
const nextPlanName = () => {
  for (let i = 0; i < 26; i++) { const n = String.fromCharCode(65 + i) + '案'; if (!data.plans.some(p => p.name === n)) return n; }
  return `案${data.plans.length + 1}`;
};

async function planMenu(p) {
  const v = await actionSheet([
    { v: 'rename', label: '名前を変更' },
    { v: 'dup', label: 'この案を複製して別案を作る' },
    { v: 'new', label: '空の新しい案を作る' },
    ...(p.stops.length ? [{ v: 'clear', label: '旅程を空にする(場所は「まだ入れていない場所」に戻る)', danger: true }] : []),
    ...(data.plans.length > 1 ? [{ v: 'del', label: 'この案を削除', danger: true }] : []),
  ]);
  if (v === 'clear') {
    if (!confirm(`「${p.name}」の旅程を空にしますか?(行きたい場所のリストは残ります)`)) return;
    p.stops = []; ui.stop = -1;
    commit();
    return;
  }
  if (v === 'rename') {
    const r = await formDialog('案の名前', [{ name: 'name', label: '名前', value: p.name }]);
    if (r?.name) p.name = r.name;
  } else if (v === 'dup') {
    const c = clonePlan(p, p.name + 'のコピー');
    data.plans.push(c); ui.planId = c.id; ui.stop = -1;
    toast('複製しました。名前は ⋯ から変えられます');
  } else if (v === 'new') {
    const c = newPlan(nextPlanName());
    data.plans.push(c); ui.planId = c.id; ui.stop = -1;
  } else if (v === 'del') {
    if (!confirm(`「${p.name}」を削除しますか?`)) return;
    data.plans = data.plans.filter(x => x !== p);
    ui.planId = data.plans[0].id; ui.stop = -1;
  } else return;
  commit();
}

async function mainMenu() {
  const v = await actionSheet([
    { v: 'settings', label: '設定(APIキー・フライト検索・為替・ガソリン)' },
    { v: 'rate', label: '為替レートを最新にする' },
    { v: 'export', label: 'データを書き出す(バックアップ)' },
    { v: 'import', label: 'データを読み込む' },
    { v: 'reset', label: 'すべてのデータを削除', danger: true },
  ]);
  if (v === 'settings') openSettings();
  else if (v === 'rate') { settings.rateManual = false; refreshRate(true); }
  else if (v === 'export') exportData();
  else if (v === 'import') $('#importFile').click();
  else if (v === 'reset') {
    if (!confirm('候補・プランをすべて削除します。元に戻せません。よろしいですか?')) return;
    data = defaultData(); ui.planId = null; ui.stop = -1; ui.tab = 'cand';
    commit();
  }
}

async function openSettings() {
  const v = await formDialog('設定', [
    { name: 'key', label: 'Google Maps APIキー', value: apiKey },
    { name: 'flightProxy', label: 'フライト検索の中継URL(Cloudflare Worker)', value: settings.flightProxy, placeholder: 'https://xxxx.workers.dev' },
    { name: 'rate', type: 'number', label: '為替レート(1ドル = ○円)', value: Math.round(settings.rate * 100) / 100 },
    { name: 'gas', type: 'number', label: 'ガソリン価格($/ガロン)', value: settings.gas },
    { name: 'mpg', type: 'number', label: '燃費(mpg、マイル/ガロン)', value: settings.mpg },
    { name: 'dailyDefault', type: 'number', label: '新しい案の食費・その他(1日あたり $)', value: settings.dailyDefault },
  ]);
  if (!v) return;
  if (Math.abs(v.rate - settings.rate) > 0.005 && v.rate > 0) { settings.rate = v.rate; settings.rateManual = true; }
  if (v.gas > 0) settings.gas = v.gas;
  if (v.mpg > 0) settings.mpg = v.mpg;
  settings.dailyDefault = v.dailyDefault;
  settings.flightProxy = v.flightProxy.replace(/\/+$/, '');
  if (settings.flightProxy && !/^https:\/\//.test(settings.flightProxy)) settings.flightProxy = 'https://' + settings.flightProxy;
  saveSettings();
  if (v.key && v.key !== apiKey) { store(K.key, v.key); location.reload(); return; }
  render(true);
}

function exportData() {
  const blob = new Blob([JSON.stringify({ app: 'tabi-plan', version: 2, data }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${data.tripName || 'trip'}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('#importFile').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    const d = j.data || j;
    if (!Array.isArray(d.plans) || !Array.isArray(d.candidates)) throw new Error('形式が違います');
    if (!confirm('今のデータを、読み込んだデータで置き換えますか?')) return;
    data = migrate(d); ui.planId = null; ui.stop = -1;
    commit();
    toast('読み込みました');
  } catch (err) {
    toast('読み込めませんでした: ' + err.message);
  }
});

/* ---------- イベント ---------- */
$('.tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  ui.tab = b.dataset.tab;
  saveUi(); render(true);
  $('.panel').scrollTop = 0;
});
$('#tripName').addEventListener('change', e => { data.tripName = e.target.value.trim() || 'アメリカ旅行'; saveData(); });
$('#menuBtn').addEventListener('click', mainMenu);

$('#view').addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const p = curPlan();
  const s = p.stops[ui.stop];
  const i = +t.dataset.i, j = +t.dataset.j;
  switch (t.dataset.act) {
    case 'addCand':
      openPicker({ title: '行きたい場所を追加', multi: true, onPick: r => { const c = ensureCand(r); render(true); return c; } });
      break;
    case 'place': placeCand(p, candById(t.dataset.id)); break;
    case 'editCand': editCand(candById(t.dataset.id)); break;
    case 'focus': {
      const c = candById(t.dataset.id);
      if (map && c) { map.panTo({ lat: c.lat, lng: c.lng }); map.setZoom(Math.max(map.getZoom(), 12)); }
      break;
    }
    case 'addStop':
      openPicker({
        title: '経由地を最後に追加', multi: true, cands: true, plan: p,
        onPick: r => { const c = ensureCand(r); addStopToPlan(p, c); commit(); return c; },
        onPickCand: c => { addStopToPlan(p, c); commit(); },
      });
      break;
    case 'openStop': ui.stop = i; saveUi(); render(true); $('.panel').scrollTop = 0; break;
    case 'back': ui.stop = -1; saveUi(); render(true); break;
    case 'editLeg': editLeg(p, i); break;
    case 'findFlight': openFlightSearch(p, i); break;
    case 'flightDetail': if (p.stops[i]?.leg.flight) openFlightDetail(p.stops[i].leg); break;
    case 'stopUp': moveStop(p, ui.stop, -1); break;
    case 'stopDown': moveStop(p, ui.stop, 1); break;
    case 'rmStop':
      if (!confirm(`「${stopPlace(s)?.name}」を旅程から外しますか?(候補リストには残ります)`)) return;
      clearFlightsAround(p, [ui.stop, ui.stop + 1]);
      p.stops.splice(ui.stop, 1); ui.stop = -1; commit();
      break;
    case 'editLodging': editLodging(p, s); break;
    case 'copyLodging': s.lodging = clone(p.stops[ui.stop - 1].lodging); commit(); break;
    case 'addSpot':
      openPicker({
        title: `${stopPlace(s)?.name || ''} で立ち寄る場所`, multi: true, cands: true, plan: p,
        exclude: c => s.spots.includes(c.id) || c.id === s.candId,
        onPick: r => { const c = ensureCand(r); s.spots.push(c.id); commit(); return c; },
        onPickCand: c => { s.spots.push(c.id); commit(); },
      });
      break;
    case 'spotUp': case 'spotDown': {
      const k = t.dataset.act === 'spotUp' ? j - 1 : j + 1;
      [s.spots[j], s.spots[k]] = [s.spots[k], s.spots[j]];
      commit(); break;
    }
    case 'rmSpot': s.spots.splice(j, 1); commit(); break;
    case 'planMenu': planMenu(p); break;
    case 'newPlan': { const c = newPlan(nextPlanName()); data.plans.push(c); ui.planId = c.id; ui.stop = -1; ui.tab = 'plan'; commit(); break; }
    case 'openPlan': ui.planId = t.dataset.id; ui.stop = -1; ui.tab = 'plan'; saveUi(); render(true); break;
    case 'settings': openSettings(); break;
  }
});

$('#view').addEventListener('change', e => {
  const f = e.target.dataset.field;
  if (!f) return;
  const p = curPlan();
  const s = p.stops[ui.stop];
  const v = e.target.value;
  if (f === 'plan') { ui.planId = v; ui.stop = -1; }
  else if (f === 'mode') s.mode = v;
  else if (f === 'nights') s.nights = Math.max(0, Math.round(num(v)));
  else if (f === 'dailyAmount') p.daily = { ...p.daily, amount: num(v) };
  else if (f === 'dailyCur') p.daily = { ...p.daily, cur: v };
  commit();
});
$('#view').addEventListener('focusout', () => { if (renderDeferred) setTimeout(() => { if (renderDeferred) render(); }, 0); });

/* ---------- 起動 ---------- */
async function start() {
  if (!apiKey) {
    $('#setup').hidden = false;
    $('#keySave').onclick = () => {
      const k = $('#keyInput').value.trim();
      if (!k) return;
      apiKey = k; store(K.key, k);
      $('#setup').hidden = true;
      start();
    };
    return;
  }
  $('#app').hidden = false;
  setupSplitter();
  render(true);
  refreshRate();
  try {
    await loadMaps();
    initMap();
    render(true);
  } catch {
    toast('地図を読み込めませんでした。通信状況かAPIキーを確認してください', 6000);
  }
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

start();
