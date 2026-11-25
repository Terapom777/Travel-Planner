'use strict';

/* =========================================================
 * 旅プラン — 候補 → 複数プラン → 費用比較
 * ========================================================= */

/* ---------- utils ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const load = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

const K = { key: 'tp.key', data: 'tp.data', settings: 'tp.settings', routes: 'tp.routes', ui: 'tp.ui' };

const KINDS = {
  flight: { icon: '✈️', label: '飛行機' },
  drive:  { icon: '🚗', label: 'ドライブ(レンタカーで移動)' },
  rental: { icon: '🔑', label: 'レンタカー代' },
  train:  { icon: '🚆', label: '鉄道' },
  bus:    { icon: '🚌', label: 'バス' },
  other:  { icon: '📦', label: 'その他' },
};
const MODES = {
  WALK:    { icon: '🚶', label: '徒歩' },
  TRANSIT: { icon: '🚇', label: '電車・バス' },
  DRIVE:   { icon: '🚗', label: '車' },
};
const CURS = [{ v: 'USD', l: '$ ドル' }, { v: 'JPY', l: '¥ 円' }];
const COL = { accent: '#0f766e', must: '#dc2626', gray: '#71717a', seg: '#7c3aed', lodge: '#2563eb' };

/* ---------- state ---------- */
let apiKey = load(K.key, '');
const settings = Object.assign(
  { rate: 150, rateDate: '', rateManual: false, gas: 3.6, mpg: 30, dailyDefault: 60 },
  load(K.settings, {})
);
let data = load(K.data, null) || defaultData();
const ui = Object.assign({ tab: 'cand', planId: null, day: -1 }, load(K.ui, {}));

function newDay() {
  return { id: uid(), title: '', mode: 'WALK', spots: [], lodging: null, daily: { amount: settings.dailyDefault, cur: 'USD' } };
}
function newPlan(name) { return { id: uid(), name, segments: [], days: [newDay()] }; }
function defaultData() { return { tripName: 'アメリカ旅行', candidates: [], plans: [newPlan('A案')] }; }

const saveData = () => store(K.data, data);
const saveSettings = () => store(K.settings, settings);
const saveUi = () => store(K.ui, ui);

function curPlan() {
  let p = data.plans.find(x => x.id === ui.planId);
  if (!p) { p = data.plans[0]; ui.planId = p.id; }
  if (ui.day >= p.days.length) ui.day = p.days.length - 1;
  return p;
}
const candById = id => data.candidates.find(c => c.id === id);
const daySpots = d => d.spots.map(candById).filter(Boolean);

/* ---------- money & format ---------- */
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

/* Places API (New): テキスト検索 */
async function searchPlaces(q) {
  const body = { textQuery: q, languageCode: 'ja', maxResultCount: 8 };
  const b = map?.getBounds();
  if (b) {
    const sw = b.getSouthWest(), ne = b.getNorthEast();
    if (sw.lng() < ne.lng()) {
      body.locationBias = { rectangle: { low: { latitude: sw.lat(), longitude: sw.lng() }, high: { latitude: ne.lat(), longitude: ne.lng() } } };
    }
  }
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.priceLevel,places.rating',
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
  }));
}

/* Routes API: ルート・時間・運賃・通行料(結果は端末にキャッシュ) */
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
  const urls = [
    'https://api.frankfurter.dev/v1/latest?base=USD&symbols=JPY',
    'https://api.frankfurter.app/latest?from=USD&to=JPY',
  ];
  for (const u of urls) {
    try {
      const j = await (await fetch(u)).json();
      if (j.rates?.JPY) {
        Object.assign(settings, { rate: j.rates.JPY, rateDate: j.date || today, rateManual: false });
        saveSettings();
        scheduleRender();
        if (force) toast(`1ドル = ${j.rates.JPY.toFixed(2)}円 に更新しました`);
        return;
      }
    } catch {}
  }
  if (force) toast('為替レートを取得できませんでした');
}

/* =========================================================
 * 費用計算
 * ========================================================= */
const zeroCost = () => ({ flight: 0, ground: 0, lodging: 0, local: 0, sight: 0, daily: 0, driveM: 0, driveS: 0, pending: false });
function addCost(a, b) {
  for (const k in b) if (typeof b[k] === 'number') a[k] += b[k];
  a.pending = a.pending || b.pending;
  return a;
}

function segCost(s) {
  const c = zeroCost();
  const base = toJPY(num(s.cost), s.cur);
  if (s.kind === 'flight') c.flight += base; else c.ground += base;
  if (s.kind === 'drive' && s.from && s.to) {
    const r = getRoute('DRIVE', s.from, s.to, true);
    if (!r) c.pending = true;
    else if (r.m) {
      c.driveM += r.m; c.driveS += r.s;
      c.ground += toJPY(gasCost(r.m), 'USD');
      if (r.toll) c.ground += toJPY(r.toll.amount, r.toll.cur);
    }
  }
  return c;
}

function dayCost(d) {
  const c = zeroCost();
  if (d.lodging) c.lodging += toJPY(num(d.lodging.cost), d.lodging.cur);
  c.daily += toJPY(num(d.daily?.amount), d.daily?.cur || 'USD');
  const spots = daySpots(d);
  spots.forEach(s => (c.sight += toJPY(num(s.cost), s.cur || 'USD')));
  for (let i = 1; i < spots.length; i++) {
    const r = getRoute(d.mode, spots[i - 1], spots[i]);
    if (!r) { c.pending = true; continue; }
    if (r.fare) c.local += toJPY(r.fare.amount, r.fare.cur);
    if (d.mode === 'DRIVE' && r.m) c.local += toJPY(gasCost(r.m), 'USD');
  }
  return c;
}

function planCost(p) {
  const c = zeroCost();
  p.segments.forEach(s => addCost(c, segCost(s)));
  p.days.forEach(d => addCost(c, dayCost(d)));
  c.total = c.flight + c.ground + c.lodging + c.local + c.sight + c.daily;
  return c;
}
const costTotal = c => c.flight + c.ground + c.lodging + c.local + c.sight + c.daily;

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
  // 入力中は描き直さない(入力内容が消えるのを防ぐ)
  if (!force && view.contains(ae) && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) {
    renderDeferred = true;
    renderMap();
    return;
  }
  renderDeferred = false;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === ui.tab));
  if (document.activeElement !== $('#tripName')) $('#tripName').value = data.tripName;
  view.innerHTML = ui.tab === 'cand' ? viewCand() : ui.tab === 'plan' ? viewPlan() : viewCompare();
  renderMap();
}

/* ---------- 候補 ---------- */
function usedIn(id) {
  const out = [];
  data.plans.forEach(p => p.days.forEach((d, i) => { if (d.spots.includes(id)) out.push(`${p.name} ${i + 1}日目`); }));
  return out.join(', ');
}

function viewCand() {
  const list = data.candidates.map(c => {
    const meta = [
      num(c.cost) ? fmtMoney(num(c.cost), c.cur) : '',
      PRICE[c.price] || '',
      c.rating ? '★' + c.rating : '',
      usedIn(c.id) ? '📅 ' + usedIn(c.id) : '',
      c.memo,
    ].filter(Boolean).join(' · ');
    return `<li class="item" data-act="focus" data-id="${c.id}">
      <span class="pin ${c.must ? 'must' : ''}">${c.must ? '★' : '●'}</span>
      <div class="info"><div class="name">${esc(c.name)}</div><div class="meta">${esc(meta || c.addr)}</div></div>
      <button class="icon-btn sm" data-act="editCand" data-id="${c.id}" aria-label="編集">✎</button>
    </li>`;
  }).join('');
  const must = data.candidates.filter(c => c.must).length;
  return `
    <p class="sub">行きたい場所をとりあえずストック。★必須にした場所は、比較画面で「何か所回れるか」を数えます。</p>
    <button class="add-btn" data-act="addCand">＋ 候補を追加</button>
    <ul class="list">${list}</ul>
    ${data.candidates.length ? `<p class="sub">${data.candidates.length}か所(★必須 ${must})</p>` : '<p class="empty">まだ候補がありません</p>'}`;
}

/* ---------- プラン ---------- */
function viewPlan() {
  const p = curPlan();
  const opts = data.plans.map(x => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  const tabs = `<button class="${ui.day === -1 ? 'active' : ''}" data-act="day" data-i="-1">全体</button>`
    + p.days.map((d, i) => `<button class="${ui.day === i ? 'active' : ''}" data-act="day" data-i="${i}">${i + 1}日目${d.title ? ' ' + esc(d.title) : ''}</button>`).join('')
    + `<button data-act="addDay" aria-label="日を追加">＋</button>`;
  return `
    <div class="plan-bar">
      <select data-field="plan" aria-label="プラン">${opts}</select>
      <button class="icon-btn" data-act="planMenu" aria-label="プランのメニュー">⋯</button>
    </div>
    <nav class="day-tabs">${tabs}</nav>
    ${ui.day === -1 ? viewOverview(p) : viewDay(p, ui.day)}`;
}

function sortedSegs(p) {
  return p.segments.slice().sort((a, b) => (num(a.day) || 999) - (num(b.day) || 999));
}

function segItem(s) {
  const k = KINDS[s.kind] || KINDS.other;
  const title = s.from && s.to ? `${s.from.name} → ${s.to.name}` : (s.from?.name || s.to?.name || k.label);
  const meta = [num(s.day) ? `${s.day}日目` : '日付未定', k.label];
  if (s.kind === 'drive' && s.from && s.to) {
    const r = getRoute('DRIVE', s.from, s.to, true);
    meta.push(routeText(r));
    if (r?.m) meta.push('ガソリン約' + fmtUSD(gasCost(r.m)) + (r.toll ? ' + 通行料' + fmtMoney(r.toll.amount, r.toll.cur) : ''));
  }
  if (num(s.cost)) meta.push(fmtMoney(num(s.cost), s.cur));
  if (s.note) meta.push(s.note);
  return `<li class="item" data-act="editSeg" data-id="${s.id}">
    <span class="kind">${k.icon}</span>
    <div class="info"><div class="name">${esc(title)}</div><div class="meta">${esc(meta.join(' · '))}</div></div>
    <span class="chev">›</span></li>`;
}

function viewOverview(p) {
  const c = planCost(p);
  const chips = [
    ['✈️', c.flight], ['🚗', c.ground], ['🛏', c.lodging], ['🚇', c.local], ['🎟', c.sight], ['🍔', c.daily],
  ].filter(x => x[1]).map(x => `${x[0]} ${fmtJPY(x[1])}`).join('　');
  const segs = sortedSegs(p);
  const days = p.days.map((d, i) => {
    const meta = [`${d.spots.length}か所`, d.lodging ? '🛏 ' + (d.lodging.place?.name || '宿') : '宿なし'];
    const segN = p.segments.filter(s => num(s.day) === i + 1).map(s => (KINDS[s.kind] || KINDS.other).icon).join('');
    if (segN) meta.unshift(segN);
    return `<li class="item" data-act="day" data-i="${i}">
      <span class="daynum">${i + 1}</span>
      <div class="info"><div class="name">${esc(d.title || `${i + 1}日目`)}</div><div class="meta">${esc(meta.join(' · '))}</div></div>
      <span class="chev">›</span></li>`;
  }).join('');
  return `
    <div class="summary">
      <span>合計 <b>${fmtJPY(c.total)}</b></span><span>${p.days.length}日間</span>
      ${c.driveM ? `<span>運転 ${fmtMi(c.driveM)} / ${fmtDur(c.driveS)}</span>` : ''}
      ${chips ? `<div class="chips">${chips}</div>` : ''}
    </div>
    <h3 class="sec">大移動</h3>
    <p class="sub">飛行機(入国・出国が別の空港でもOK)、レンタカーでのドライブ、鉄道など</p>
    <ul class="list">${segs.map(segItem).join('')}</ul>
    <button class="add-btn" data-act="addSeg">＋ 大移動を追加</button>
    <h3 class="sec">日程</h3>
    <ul class="list">${days}</ul>
    <button class="add-btn" data-act="addDay">＋ 日を追加</button>`;
}

function viewDay(p, i) {
  const d = p.days[i];
  const segs = p.segments.filter(s => num(s.day) === i + 1);
  const spots = daySpots(d);
  const prev = p.days[i - 1];

  let list = '';
  spots.forEach((c, j) => {
    if (j > 0) {
      const r = getRoute(d.mode, spots[j - 1], c);
      const fare = r?.fare ? ' · 運賃 ' + fmtMoney(r.fare.amount, r.fare.cur) : '';
      list += `<li class="leg">${MODES[d.mode].icon} ${esc(routeText(r) + fare)}</li>`;
    }
    const meta = [num(c.cost) ? fmtMoney(num(c.cost), c.cur) : '', c.must ? '★必須' : '', PRICE[c.price] || ''].filter(Boolean).join(' · ');
    list += `<li class="spot">
      <span class="num">${j + 1}</span>
      <div class="info"><div class="name">${esc(c.name)}</div>${meta ? `<div class="meta">${esc(meta)}</div>` : ''}</div>
      <div class="ctrl">
        <button data-act="up" data-j="${j}" ${j === 0 ? 'disabled' : ''} aria-label="上へ">↑</button>
        <button data-act="down" data-j="${j}" ${j === spots.length - 1 ? 'disabled' : ''} aria-label="下へ">↓</button>
        <button class="del" data-act="rmSpot" data-j="${j}" aria-label="外す">✕</button>
      </div></li>`;
  });

  const lodging = d.lodging
    ? `<ul class="list"><li class="item" data-act="editLodging"><span class="kind">🛏</span>
        <div class="info"><div class="name">${esc(d.lodging.place?.name || '宿(場所未設定)')}</div>
        <div class="meta">${esc([fmtMoney(num(d.lodging.cost), d.lodging.cur) + ' / 泊', d.lodging.note].filter(Boolean).join(' · '))}</div></div>
        <span class="chev">›</span></li></ul>`
    : `<div class="btn-row"><button class="add-btn" data-act="editLodging">＋ 宿を設定</button>
        ${prev?.lodging ? '<button class="add-btn ghost" data-act="copyLodging">前日と同じ宿</button>' : ''}</div>`;

  const c = dayCost(d);
  segs.forEach(s => addCost(c, segCost(s)));

  return `
    <input class="day-title" data-field="dayTitle" value="${esc(d.title)}" placeholder="${i + 1}日目のメモ(例: サンフランシスコ)">
    ${segs.length ? `<h3 class="sec">この日の大移動</h3><ul class="list">${segs.map(segItem).join('')}</ul>` : ''}
    <h3 class="sec">宿</h3>
    ${lodging}
    <div class="sec-row">
      <h3 class="sec">スポット</h3>
      <select data-field="mode" aria-label="移動手段">${Object.entries(MODES).map(([k, m]) => `<option value="${k}" ${d.mode === k ? 'selected' : ''}>${m.icon} ${m.label}</option>`).join('')}</select>
    </div>
    <ol class="spots">${list}</ol>
    ${spots.length ? '' : '<p class="empty">候補リストから、この日に回る場所を追加しましょう</p>'}
    <button class="add-btn" data-act="addSpot">＋ スポットを追加</button>
    <h3 class="sec">食費・その他(この日)</h3>
    <div class="money-row">
      <input type="number" inputmode="decimal" step="any" data-field="dailyAmount" value="${esc(d.daily?.amount ?? 0)}" aria-label="金額">
      <select data-field="dailyCur" aria-label="通貨">${CURS.map(x => `<option value="${x.v}" ${d.daily?.cur === x.v ? 'selected' : ''}>${x.l}</option>`).join('')}</select>
    </div>
    <div class="day-foot">
      <span>この日の費用 <b>${fmtJPY(costTotal(c))}</b></span>
      <button class="text-btn danger" data-act="delDay">この日を削除</button>
    </div>`;
}

/* ---------- 比較 ---------- */
function viewCompare() {
  const rows = [['flight', '✈️ 航空券'], ['ground', '🚗 陸路の大移動'], ['lodging', '🛏 宿泊'], ['local', '🚇 現地の交通'], ['sight', '🎟 観光・入場'], ['daily', '🍔 食費・その他']];
  const cs = data.plans.map(p => ({ p, c: planCost(p) }));
  const min = Math.min(...cs.map(x => x.c.total));
  const mustIds = data.candidates.filter(c => c.must).map(c => c.id);
  const cover = p => {
    const used = new Set(p.days.flatMap(d => d.spots));
    return mustIds.filter(id => used.has(id)).length;
  };
  const td = f => cs.map(f).map(v => `<td>${v}</td>`).join('');
  const pending = cs.some(x => x.c.pending);

  return `
    <div class="rate">
      <span>1ドル = ${settings.rate.toFixed(2)}円${settings.rateManual ? '(手入力)' : settings.rateDate ? `(${esc(settings.rateDate)})` : ''}</span>
      <button class="text-btn" data-act="settings">変更</button>
    </div>
    <div class="table-wrap"><table class="cmp">
      <thead><tr><th></th>${cs.map(x => `<th data-act="openPlan" data-id="${x.p.id}">${esc(x.p.name)}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.map(([k, l]) => `<tr><th>${l}</th>${td(x => x.c[k] ? fmtJPY(x.c[k]) : '—')}</tr>`).join('')}
        <tr class="total"><th>合計</th>${cs.map(x => `<td class="${cs.length > 1 && x.c.total === min ? 'best' : ''}">${fmtJPY(x.c.total)}</td>`).join('')}</tr>
        <tr class="gap"><th>日数</th>${td(x => x.p.days.length + '日')}</tr>
        <tr><th>1日あたり</th>${td(x => fmtJPY(x.c.total / Math.max(1, x.p.days.length)))}</tr>
        <tr><th>運転距離</th>${td(x => x.c.driveM ? fmtMi(x.c.driveM) : '—')}</tr>
        <tr><th>運転時間</th>${td(x => x.c.driveS ? fmtDur(x.c.driveS) : '—')}</tr>
        <tr><th>スポット数</th>${td(x => x.p.days.reduce((n, d) => n + d.spots.length, 0))}</tr>
        ${mustIds.length ? `<tr><th>★必須</th>${td(x => `${cover(x.p)} / ${mustIds.length}`)}</tr>` : ''}
      </tbody>
    </table></div>
    ${pending ? '<p class="sub">ルートを計算中の項目があります…</p>' : ''}
    <p class="sub">ガソリン代は ${settings.mpg} mpg・$${settings.gas}/ガロンで概算しています。電車・バスの運賃と高速の通行料は、Googleから取れた場合だけ自動で足しています。</p>
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
    mapId: 'DEMO_MAP_ID',
    colorScheme: 'FOLLOW_SYSTEM',
    disableDefaultUI: true, zoomControl: true, fullscreenControl: false,
    gestureHandling: 'greedy', clickableIcons: false,
  });
  infoWin = new google.maps.InfoWindow();
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

function drawSeg(s, pts) {
  const k = KINDS[s.kind] || KINDS.other;
  [s.from, s.to].filter(Boolean).forEach(pl => { addPin(pl, k.icon, COL.seg, `${k.label}: ${pl.name}`); pts.push(pl); });
  if (!s.from || !s.to || s.kind === 'rental') return;
  if (s.kind === 'drive') {
    const r = getRoute('DRIVE', s.from, s.to, true);
    if (r?.poly) addLine(decode(r.poly), COL.seg);
    else addLine([s.from, s.to], COL.seg, { dashed: true });
  } else {
    addLine([s.from, s.to], COL.seg, { dashed: true, geodesic: s.kind === 'flight' });
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

  if (ui.tab === 'cand') {
    data.candidates.forEach(c => { addPin(c, c.must ? '★' : '', c.must ? COL.must : COL.accent, c.name); pts.push(c); });
    key = 'cand:' + pts.length;
  } else {
    const p = curPlan();
    const day = ui.tab === 'plan' ? ui.day : -1;
    if (day === -1) {
      p.segments.forEach(s => drawSeg(s, pts));
      p.days.forEach((d, i) => {
        daySpots(d).forEach(c => { addPin(c, String(i + 1), COL.gray, `${i + 1}日目: ${c.name}`); pts.push(c); });
        if (d.lodging?.place) { addPin(d.lodging.place, '🛏', COL.lodge, `${i + 1}日目の宿: ${d.lodging.place.name}`); pts.push(d.lodging.place); }
      });
    } else {
      const d = p.days[day];
      p.segments.filter(s => num(s.day) === day + 1).forEach(s => drawSeg(s, pts));
      const spots = daySpots(d);
      spots.forEach((c, j) => {
        if (j > 0) {
          const r = getRoute(d.mode, spots[j - 1], c);
          if (r?.poly) addLine(decode(r.poly), COL.accent);
        }
        addPin(c, String(j + 1), COL.accent, `${j + 1}. ${c.name}`);
        pts.push(c);
      });
      if (d.lodging?.place) { addPin(d.lodging.place, '🛏', COL.lodge, `宿: ${d.lodging.place.name}`); pts.push(d.lodging.place); }
    }
    key = `${ui.tab === 'plan' ? 'plan' : 'cmp'}:${p.id}:${day}:${pts.length}`;
  }

  if (key !== lastFit && pts.length) {
    lastFit = key;
    if (pts.length === 1) { map.setCenter({ lat: pts[0].lat, lng: pts[0].lng }); map.setZoom(13); }
    else {
      const b = new google.maps.LatLngBounds();
      pts.forEach(p => b.extend({ lat: p.lat, lng: p.lng }));
      map.fitBounds(b, 40);
    }
  }
}

/* =========================================================
 * ダイアログ
 * ========================================================= */

/* ---------- 場所検索 ---------- */
let pickerCtx = null, pickerResults = [];

function openPicker(ctx) {
  pickerCtx = ctx;
  $('#pickerTitle').textContent = ctx.title;
  $('#pickerInput').value = '';
  $('#pickerResults').innerHTML = '';
  pickerResults = [];
  renderPickerCands();
  const dlg = $('#picker');
  dlg.showModal();
  return new Promise(res => (ctx.resolve = res));
}

function renderPickerCands() {
  const box = $('#pickerCands');
  if (!pickerCtx?.cands) { box.innerHTML = ''; return; }
  const added = pickerCtx.added || new Set();
  box.innerHTML = data.candidates.length
    ? `<h3 class="sec">候補リストから</h3><ul class="results">${data.candidates.map(c => `
        <li><div class="info"><div class="name">${c.must ? '★ ' : ''}${esc(c.name)}</div><div class="meta">${esc(usedIn(c.id) || c.addr)}</div></div>
        <button class="pick-btn ${added.has(c.id) ? 'done' : ''}" data-cand="${c.id}">${added.has(c.id) ? '✓ 追加' : '追加'}</button></li>`).join('')}</ul>`
    : '<p class="sub">候補リストは空です。上で検索して追加できます。</p>';
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
  const rb = e.target.closest('[data-res]');
  const cb = e.target.closest('[data-cand]');
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

/* 候補に追加(同じ場所は重複させない) */
function ensureCand(place) {
  let c = data.candidates.find(x => x.pid && x.pid === place.pid);
  if (!c) {
    c = { id: uid(), pid: place.pid, name: place.name, addr: place.addr, lat: place.lat, lng: place.lng, price: place.price, rating: place.rating, cost: 0, cur: 'USD', must: false, memo: '' };
    data.candidates.push(c);
    saveData();
  }
  return c;
}

/* ---------- 汎用フォーム ---------- */
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
    default:
      return `<label class="f">${lab}<input type="${f.type || 'text'}" name="${f.name}" value="${esc(f.value ?? '')}" ${f.type === 'number' ? 'inputmode="decimal" step="any"' : ''} autocomplete="off"></label>`;
  }
}

function formDialog(title, fields, { deletable = false } = {}) {
  return new Promise(resolve => {
    const dlg = $('#formDlg');
    const places = {};
    fields.filter(f => f.type === 'place').forEach(f => (places[f.name] = f.value || null));
    // 保存ボタンをDOMの先頭に置く(Enterキーで削除が押されないように)。見た目は row-reverse で右端
    dlg.innerHTML = `<form method="dialog" class="fd"><h3>${esc(title)}</h3>${fields.map(fieldHtml).join('')}
      <div class="fd-btns">
        <button value="ok" class="primary">保存</button>
        <button value="cancel" class="btn-plain" formnovalidate>キャンセル</button>
        <span class="sp"></span>
        ${deletable ? '<button value="delete" class="btn-danger">削除</button>' : ''}
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
        if (f.type === 'place') return;
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
  dlg.innerHTML = `<form method="dialog">${items.map(i => `<button value="${i.v}" class="${i.danger ? 'danger' : ''}">${esc(i.label)}</button>`).join('')}
    <button value="" class="muted">閉じる</button></form>`;
  dlg.returnValue = '';
  dlg.showModal();
  return new Promise(res => dlg.addEventListener('close', () => res(dlg.returnValue), { once: true }));
}

/* =========================================================
 * 操作
 * ========================================================= */
const commit = () => { saveData(); saveUi(); render(true); };

async function editCand(c) {
  const v = await formDialog(c.name, [
    { name: 'name', label: '名前', value: c.name },
    { name: 'cost', curName: 'cur', type: 'money', label: '入場料・体験代など(1人)', value: c.cost, cur: c.cur || 'USD' },
    { name: 'must', type: 'checkbox', label: '★ 必ず行きたい', value: c.must },
    { name: 'memo', type: 'textarea', label: 'メモ', value: c.memo },
  ], { deletable: true });
  if (!v) return;
  if (v._delete) {
    const used = usedIn(c.id);
    if (used && !confirm(`「${c.name}」は ${used} で使われています。プランからも外して削除しますか?`)) return;
    data.candidates = data.candidates.filter(x => x !== c);
    data.plans.forEach(p => p.days.forEach(d => (d.spots = d.spots.filter(id => id !== c.id))));
  } else {
    Object.assign(c, v);
  }
  commit();
}

function segFields(s, p) {
  return [
    { name: 'kind', type: 'select', label: '種類', value: s.kind, options: Object.entries(KINDS).map(([k, x]) => ({ v: k, l: `${x.icon} ${x.label}` })) },
    { name: 'day', type: 'select', label: '日にち', value: s.day || 0, options: [{ v: 0, l: '未定' }, ...p.days.map((d, i) => ({ v: i + 1, l: `${i + 1}日目${d.title ? ' ' + d.title : ''}` }))] },
    { name: 'from', type: 'place', label: '出発地(レンタカー代なら受取場所)', value: s.from },
    { name: 'to', type: 'place', label: '到着地(レンタカー代なら返却場所)', value: s.to },
    { name: 'cost', curName: 'cur', type: 'money', label: '費用(ドライブなら、ガソリン・通行料以外の追加分)', value: s.cost, cur: s.cur || 'USD' },
    { name: 'note', label: 'メモ(便名・予約番号など)', value: s.note },
  ];
}

async function editSeg(p, s) {
  const isNew = !s;
  s ||= { id: uid(), kind: 'flight', day: ui.day >= 0 ? ui.day + 1 : 0, from: null, to: null, cost: 0, cur: 'JPY', note: '' };
  const v = await formDialog(isNew ? '大移動を追加' : '大移動を編集', segFields(s, p), { deletable: !isNew });
  if (!v) return;
  if (v._delete) p.segments = p.segments.filter(x => x.id !== s.id);
  else {
    Object.assign(s, v, { day: num(v.day) });
    if (isNew) p.segments.push(s);
  }
  commit();
}

async function editLodging(d) {
  const l = d.lodging || { place: null, cost: 0, cur: 'USD', note: '' };
  const v = await formDialog('宿', [
    { name: 'place', type: 'place', label: 'ホテル・宿', value: l.place },
    { name: 'cost', curName: 'cur', type: 'money', label: '1泊の料金(税・リゾートフィー込み)', value: l.cost, cur: l.cur },
    { name: 'note', label: 'メモ', value: l.note },
  ], { deletable: !!d.lodging });
  if (!v) return;
  d.lodging = v._delete ? null : v;
  commit();
}

function clonePlan(p, name) {
  const c = JSON.parse(JSON.stringify(p));
  c.id = uid(); c.name = name;
  c.days.forEach(d => (d.id = uid()));
  c.segments.forEach(s => (s.id = uid()));
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
    ...(data.plans.length > 1 ? [{ v: 'del', label: 'この案を削除', danger: true }] : []),
  ]);
  if (v === 'rename') {
    const r = await formDialog('案の名前', [{ name: 'name', label: '名前', value: p.name }]);
    if (r?.name) p.name = r.name;
  } else if (v === 'dup') {
    const c = clonePlan(p, p.name + 'のコピー');
    data.plans.push(c); ui.planId = c.id;
    toast('複製しました。名前は ⋯ から変えられます');
  } else if (v === 'new') {
    const c = newPlan(nextPlanName());
    data.plans.push(c); ui.planId = c.id; ui.day = -1;
  } else if (v === 'del') {
    if (!confirm(`「${p.name}」を削除しますか?`)) return;
    data.plans = data.plans.filter(x => x !== p);
    ui.planId = data.plans[0].id; ui.day = -1;
  } else return;
  commit();
}

function delDay(p, i) {
  if (p.days.length === 1) { toast('最後の1日は削除できません'); return; }
  if (!confirm(`${i + 1}日目を削除しますか?`)) return;
  p.days.splice(i, 1);
  p.segments.forEach(s => {
    if (num(s.day) === i + 1) s.day = 0;
    else if (num(s.day) > i + 1) s.day = num(s.day) - 1;
  });
  ui.day = Math.min(i, p.days.length - 1);
  commit();
}

async function mainMenu() {
  const v = await actionSheet([
    { v: 'settings', label: '設定(APIキー・為替・ガソリン)' },
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
    data = defaultData(); ui.planId = null; ui.day = -1; ui.tab = 'cand';
    commit();
  }
}

async function openSettings() {
  const v = await formDialog('設定', [
    { name: 'key', label: 'Google Maps APIキー', value: apiKey },
    { name: 'rate', type: 'number', label: '為替レート(1ドル = ○円)', value: Math.round(settings.rate * 100) / 100 },
    { name: 'gas', type: 'number', label: 'ガソリン価格($/ガロン)', value: settings.gas },
    { name: 'mpg', type: 'number', label: '燃費(mpg、マイル/ガロン)', value: settings.mpg },
    { name: 'dailyDefault', type: 'number', label: '新しい日の食費・その他の初期値($)', value: settings.dailyDefault },
  ]);
  if (!v) return;
  if (Math.abs(v.rate - settings.rate) > 0.005 && v.rate > 0) { settings.rate = v.rate; settings.rateManual = true; }
  if (v.gas > 0) settings.gas = v.gas;
  if (v.mpg > 0) settings.mpg = v.mpg;
  settings.dailyDefault = v.dailyDefault;
  saveSettings();
  if (v.key && v.key !== apiKey) { store(K.key, v.key); location.reload(); return; }
  render(true);
}

function exportData() {
  const blob = new Blob([JSON.stringify({ app: 'tabi-plan', version: 1, data, settings }, null, 2)], { type: 'application/json' });
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
    data = d; ui.planId = null; ui.day = -1;
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
  const d = p.days[ui.day];
  const j = +t.dataset.j;
  switch (t.dataset.act) {
    case 'addCand':
      openPicker({ title: '候補を追加', multi: true, onPick: r => { const c = ensureCand(r); render(true); return c; } });
      break;
    case 'editCand': editCand(candById(t.dataset.id)); break;
    case 'focus': {
      const c = candById(t.dataset.id);
      if (map && c) { map.panTo({ lat: c.lat, lng: c.lng }); map.setZoom(Math.max(map.getZoom(), 13)); }
      break;
    }
    case 'day': ui.day = +t.dataset.i; saveUi(); render(true); break;
    case 'addDay': p.days.push(newDay()); ui.day = p.days.length - 1; commit(); break;
    case 'delDay': delDay(p, ui.day); break;
    case 'planMenu': planMenu(p); break;
    case 'newPlan': { const c = newPlan(nextPlanName()); data.plans.push(c); ui.planId = c.id; ui.day = -1; ui.tab = 'plan'; commit(); break; }
    case 'openPlan': ui.planId = t.dataset.id; ui.day = -1; ui.tab = 'plan'; saveUi(); render(true); break;
    case 'addSeg': editSeg(p, null); break;
    case 'editSeg': editSeg(p, p.segments.find(s => s.id === t.dataset.id)); break;
    case 'editLodging': editLodging(d); break;
    case 'copyLodging': d.lodging = JSON.parse(JSON.stringify(p.days[ui.day - 1].lodging)); commit(); break;
    case 'addSpot':
      openPicker({
        title: `${ui.day + 1}日目に追加`, multi: true, cands: true,
        onPick: r => { const c = ensureCand(r); d.spots.push(c.id); commit(); return c; },
        onPickCand: c => { d.spots.push(c.id); commit(); },
      });
      break;
    case 'up': case 'down': {
      const k = t.dataset.act === 'up' ? j - 1 : j + 1;
      [d.spots[j], d.spots[k]] = [d.spots[k], d.spots[j]];
      commit(); break;
    }
    case 'rmSpot': d.spots.splice(j, 1); commit(); break;
    case 'settings': openSettings(); break;
  }
});

$('#view').addEventListener('change', e => {
  const f = e.target.dataset.field;
  if (!f) return;
  const p = curPlan();
  const d = p.days[ui.day];
  const v = e.target.value;
  if (f === 'plan') { ui.planId = v; ui.day = -1; }
  else if (f === 'dayTitle') d.title = v.trim();
  else if (f === 'mode') d.mode = v;
  else if (f === 'dailyAmount') d.daily = { ...d.daily, amount: num(v) };
  else if (f === 'dailyCur') d.daily = { ...d.daily, cur: v };
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
