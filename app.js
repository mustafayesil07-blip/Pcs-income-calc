(() => {
  'use strict';

  const STORAGE_KEY = 'pcs-calc-scenarios-v2';
  const RATE_STORAGE_KEY = 'pcs-usdtry-v1';
  const NUM_SCENARIOS = 5;
  const CONTRACT_MULTIPLIER = 100;
  const RATE_TTL_MS = 6 * 60 * 60 * 1000;
  const TR_NET_RATIO = 0.75;
  const GR_NET_RATIO = 0.85;

  const FIELDS = ['name', 'width', 'premium', 'tp', 'sl', 'winRate', 'contracts', 'dte', 'concurrent'];

  const EMPTY = () => ({
    name: '', width: '', premium: '', tp: '', sl: '',
    winRate: '', contracts: '', dte: '', concurrent: ''
  });

  const EXAMPLE = [
    { name: 'Konservatif',   width: 5,  premium: 0.50, tp: 50, sl: 200, winRate: 88, contracts: 5, dte: 30, concurrent: 1 },
    { name: 'Dengeli',       width: 5,  premium: 1.00, tp: 50, sl: 200, winRate: 85, contracts: 5, dte: 30, concurrent: 2 },
    { name: 'Agresif TP/SL', width: 5,  premium: 1.50, tp: 60, sl: 150, winRate: 78, contracts: 5, dte: 30, concurrent: 1 },
    { name: 'Kısa vadeli',   width: 5,  premium: 0.75, tp: 50, sl: 200, winRate: 82, contracts: 5, dte: 7,  concurrent: 3 },
    { name: 'Geniş kanat',   width: 10, premium: 2.00, tp: 50, sl: 200, winRate: 84, contracts: 3, dte: 30, concurrent: 2 },
  ];

  let scenarios = loadScenarios();

  let usdTryRate = 34;
  let rateOverride = false;
  let rateFetchedAt = 0;

  function loadRate() {
    try {
      const raw = localStorage.getItem(RATE_STORAGE_KEY);
      if (!raw) return;
      const c = JSON.parse(raw);
      if (typeof c?.rate === 'number' && c.rate > 0) {
        usdTryRate = c.rate;
        rateOverride = !!c.override;
        rateFetchedAt = c.at || 0;
      }
    } catch {}
  }

  function saveRate() {
    try {
      localStorage.setItem(RATE_STORAGE_KEY, JSON.stringify({
        rate: usdTryRate, override: rateOverride, at: rateFetchedAt
      }));
    } catch {}
  }

  async function fetchRate(force = false) {
    if (rateOverride && !force) return;
    if (!force && rateFetchedAt && (Date.now() - rateFetchedAt < RATE_TTL_MS)) return;
    const endpoints = [
      { url: 'https://open.er-api.com/v6/latest/USD', pick: d => d?.rates?.TRY },
      { url: 'https://api.frankfurter.app/latest?from=USD&to=TRY', pick: d => d?.rates?.TRY },
    ];
    for (const ep of endpoints) {
      try {
        const resp = await fetch(ep.url, { cache: 'no-store' });
        if (!resp.ok) continue;
        const data = await resp.json();
        const rate = ep.pick(data);
        if (typeof rate === 'number' && rate > 0) {
          usdTryRate = rate;
          rateOverride = false;
          rateFetchedAt = Date.now();
          saveRate();
          syncRateInput();
          renderAllResults();
          renderComparison();
          return;
        }
      } catch {}
    }
  }

  function syncRateInput() {
    const input = document.getElementById('rate-input');
    if (!input) return;
    if (document.activeElement === input) return;
    input.value = usdTryRate.toFixed(2);
  }

  function setUserRate(v) {
    const n = parseFloat(String(v).replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return;
    usdTryRate = n;
    rateOverride = true;
    rateFetchedAt = Date.now();
    saveRate();
    renderAllResults();
    renderComparison();
  }

  function loadScenarios() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return Array.from({ length: NUM_SCENARIOS }, EMPTY);
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return Array.from({ length: NUM_SCENARIOS }, EMPTY);
      return Array.from({ length: NUM_SCENARIOS }, (_, i) => ({ ...EMPTY(), ...(data[i] || {}) }));
    } catch {
      return Array.from({ length: NUM_SCENARIOS }, EMPTY);
    }
  }

  function saveScenarios() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios)); } catch {}
  }

  function toNum(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : NaN;
  }

  function calculate(s) {
    const width = toNum(s.width);
    const premium = toNum(s.premium);
    const tp = toNum(s.tp) / 100;
    const sl = toNum(s.sl) / 100;
    const winRate = toNum(s.winRate) / 100;
    const contracts = toNum(s.contracts);
    const dte = toNum(s.dte);
    const concurrent = toNum(s.concurrent);

    if (![width, premium, tp, sl, winRate, contracts, dte, concurrent].every(Number.isFinite)) return null;
    if (width <= 0 || premium <= 0 || contracts <= 0 || dte <= 0 || concurrent <= 0) return null;

    const widthInvalid = premium >= width;
    const maxProfitPerContract = premium * CONTRACT_MULTIPLIER;
    const maxLossPerContract = Math.max(0, (width - premium) * CONTRACT_MULTIPLIER);

    const maxProfitPerTrade = maxProfitPerContract * contracts;
    const maxLossPerTrade = maxLossPerContract * contracts;
    const capitalPerPosition = maxLossPerTrade;
    const deployedCapital = capitalPerPosition * concurrent;

    const tpGainPerTrade = maxProfitPerTrade * tp;
    const slLossPerTrade = Math.min(maxProfitPerTrade * sl, maxLossPerTrade);

    const evPerTrade = winRate * tpGainPerTrade - (1 - winRate) * slLossPerTrade;
    const rocPerTrade = capitalPerPosition > 0 ? (evPerTrade / capitalPerPosition) * 100 : 0;

    const monthlyCycles = 30 / dte;
    const monthlyTrades = concurrent * monthlyCycles;
    const monthlyEV = evPerTrade * monthlyTrades;
    const monthlyEVTRNet = monthlyEV * TR_NET_RATIO;
    const monthlyEVGRNet = monthlyEV * GR_NET_RATIO;
    const monthlyROC = deployedCapital > 0 ? (monthlyEV / deployedCapital) * 100 : 0;

    const dailyCollateral = (monthlyTrades * dte * capitalPerPosition) / 30;

    const annualEV = monthlyEV * 12;
    const annualEVTRNet = annualEV * TR_NET_RATIO;
    const annualEVGRNet = annualEV * GR_NET_RATIO;
    const annualROC = monthlyROC * 12;

    const riskReward = tpGainPerTrade > 0 ? slLossPerTrade / tpGainPerTrade : 0;
    const breakevenWR = (tpGainPerTrade + slLossPerTrade) > 0
      ? (slLossPerTrade / (tpGainPerTrade + slLossPerTrade)) * 100
      : 0;
    const edge = (winRate * 100) - breakevenWR;

    return {
      widthInvalid,
      maxProfitPerTrade, maxLossPerTrade,
      capitalPerPosition, deployedCapital, dailyCollateral,
      tpGainPerTrade, slLossPerTrade,
      evPerTrade, rocPerTrade,
      monthlyCycles, monthlyTrades,
      monthlyEV, monthlyEVTRNet, monthlyEVGRNet, monthlyROC,
      annualEV, annualEVTRNet, annualEVGRNet, annualROC,
      riskReward, breakevenWR, edge,
    };
  }

  function fmtMoney(v) {
    if (!Number.isFinite(v)) return '—';
    const sign = v < 0 ? '-' : '';
    const abs = Math.abs(v);
    return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  function fmtTRY(v) {
    if (!Number.isFinite(v)) return '—';
    const sign = v < 0 ? '-' : '';
    const abs = Math.abs(v);
    const digits = abs >= 100 ? 0 : 2;
    return `${sign}₺${abs.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  }
  function fmtPct(v) {
    if (!Number.isFinite(v)) return '—';
    return `${v.toFixed(2)}%`;
  }
  function fmtRatio(v) {
    if (!Number.isFinite(v)) return '—';
    return `${v.toFixed(2)} : 1`;
  }
  function fmtEdge(v) {
    if (!Number.isFinite(v)) return '—';
    const sign = v >= 0 ? '+' : '';
    return `${sign}${v.toFixed(1)} pp`;
  }
  function fmtNum(v) {
    if (!Number.isFinite(v)) return '—';
    return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  }

  const scenariosRoot = document.getElementById('scenarios');
  const template = document.getElementById('scenario-template');
  const cards = [];

  function buildCards() {
    scenariosRoot.innerHTML = '';
    cards.length = 0;
    for (let i = 0; i < NUM_SCENARIOS; i++) {
      const node = template.content.firstElementChild.cloneNode(true);
      node.dataset.index = i;
      node.querySelector('.scenario-badge').textContent = `Senaryo ${i + 1}`;
      FIELDS.forEach(f => {
        const input = node.querySelector(`[data-field="${f}"]`);
        if (input) input.value = scenarios[i][f] ?? '';
      });
      node.addEventListener('input', e => onCardInput(i, e));
      node.querySelector('.clear-row').addEventListener('click', () => clearRow(i));
      scenariosRoot.appendChild(node);
      cards.push(node);
    }
  }

  function onCardInput(i, e) {
    const target = e.target;
    const field = target.dataset.field;
    if (!field) return;
    scenarios[i][field] = target.value;
    saveScenarios();
    renderResults(i);
    renderComparison();
  }

  function clearRow(i) {
    scenarios[i] = EMPTY();
    saveScenarios();
    FIELDS.forEach(f => {
      const input = cards[i].querySelector(`[data-field="${f}"]`);
      if (input) input.value = '';
    });
    renderResults(i);
    renderComparison();
  }

  function tileHtml(t) {
    const cls = ['result-tile', t.big ? 'big' : '', t.cls || ''].filter(Boolean).join(' ');
    let body;
    if (typeof t.usd === 'number') {
      body = `<div class="result-value">${fmtMoney(t.usd)}</div>
              <div class="result-value-try">${fmtTRY(t.usd * usdTryRate)}</div>`;
    } else {
      body = `<div class="result-value">${t.value}</div>`;
    }
    return `<div class="${cls}"><div class="result-label">${t.label}</div>${body}</div>`;
  }

  function renderResults(i) {
    const card = cards[i];
    const target = card.querySelector('.results');
    const r = calculate(scenarios[i]);

    if (!r) {
      target.innerHTML = '<div class="empty-state">Hesaplama için tüm alanları doldur (sıfırdan büyük değerlerle).</div>';
      return;
    }

    const warn = r.widthInvalid
      ? '<div class="empty-state" style="color:var(--danger); border-color:var(--danger);">Uyarı: Alınan prim, kanat genişliğinden büyük olamaz.</div>'
      : '';

    const evCls = r.monthlyEV >= 0 ? 'positive' : 'negative';
    const tiles = [
      { label: 'Aylık Prim (Gross)',        usd: r.monthlyEV,       big: true, cls: evCls },
      { label: 'Aylık Prim TR Net (%75)',   usd: r.monthlyEVTRNet,  big: true, cls: evCls },
      { label: 'Aylık Prim GR Net (%85)',   usd: r.monthlyEVGRNet,  big: true, cls: evCls },
      { label: 'Aylık ROC',                 value: fmtPct(r.monthlyROC), big: true, cls: r.monthlyROC >= 0 ? 'positive' : 'negative' },
      { label: 'Kullanılan Sermaye',        usd: r.deployedCapital, big: true, cls: 'neutral' },

      { label: 'Yıllık Prim (Gross)',       usd: r.annualEV,        cls: evCls },
      { label: 'Yıllık ROC (basit)',        value: fmtPct(r.annualROC), cls: r.annualROC >= 0 ? 'positive' : 'negative' },
      { label: 'Ort. Günlük Collateral',    usd: r.dailyCollateral, cls: 'neutral' },
      { label: 'Sermaye / Pozisyon',        usd: r.capitalPerPosition, cls: 'neutral' },

      { label: 'Aylık Trade Sayısı',        value: fmtNum(r.monthlyTrades), cls: 'neutral' },
      { label: 'Aylık Cycle (30/DTE)',      value: fmtNum(r.monthlyCycles), cls: 'neutral' },

      { label: 'Beklenen Değer / Trade',    usd: r.evPerTrade, cls: r.evPerTrade >= 0 ? 'positive' : 'negative' },
      { label: 'ROC / Trade',               value: fmtPct(r.rocPerTrade), cls: r.rocPerTrade >= 0 ? 'positive' : 'negative' },
      { label: 'Max Kâr (TP) / Trade',      usd: r.tpGainPerTrade, cls: 'positive' },
      { label: 'Max Zarar (SL) / Trade',    usd: -r.slLossPerTrade, cls: 'negative' },

      { label: 'Risk / Ödül',               value: fmtRatio(r.riskReward), cls: 'neutral' },
      { label: 'Breakeven Win Rate',        value: fmtPct(r.breakevenWR), cls: 'neutral' },
      { label: 'Edge (WR − BE)',            value: fmtEdge(r.edge), cls: r.edge >= 0 ? 'positive' : 'negative' },
    ];

    target.innerHTML = warn + tiles.map(tileHtml).join('');
  }

  function renderAllResults() {
    for (let i = 0; i < NUM_SCENARIOS; i++) renderResults(i);
  }

  const COMPARE_METRICS = [
    { key: 'monthlyEV',          label: 'Aylık Prim (Gross)',     fmt: fmtMoney, best: 'max' },
    { key: 'monthlyEVTRNet',     label: 'Aylık TR Net (%75)',     fmt: fmtMoney, best: 'max' },
    { key: 'monthlyEVGRNet',     label: 'Aylık GR Net (%85)',     fmt: fmtMoney, best: 'max' },
    { key: 'monthlyROC',         label: 'Aylık ROC',              fmt: fmtPct,   best: 'max' },
    { key: 'annualROC',          label: 'Yıllık ROC',             fmt: fmtPct,   best: 'max' },
    { key: 'monthlyTrades',      label: 'Aylık Trade Sayısı',     fmt: fmtNum,   best: 'max' },
    { key: 'evPerTrade',         label: 'Beklenen Değer / Trade', fmt: fmtMoney, best: 'max' },
    { key: 'rocPerTrade',        label: 'ROC / Trade',            fmt: fmtPct,   best: 'max' },
    { key: 'deployedCapital',    label: 'Kullanılan Sermaye',     fmt: fmtMoney, best: 'min' },
    { key: 'dailyCollateral',    label: 'Ort. Günlük Collateral', fmt: fmtMoney, best: 'min' },
    { key: 'capitalPerPosition', label: 'Sermaye / Pozisyon',     fmt: fmtMoney, best: 'min' },
    { key: 'riskReward',         label: 'Risk / Ödül',            fmt: fmtRatio, best: 'min' },
    { key: 'breakevenWR',        label: 'Breakeven WR',           fmt: fmtPct,   best: 'min' },
    { key: 'edge',               label: 'Edge (WR − BE)',         fmt: fmtEdge,  best: 'max' },
  ];

  const comparisonRoot = document.getElementById('comparison-table');

  function renderComparison() {
    const calced = scenarios.map((s, i) => ({
      i,
      name: s.name || `Senaryo ${i + 1}`,
      r: calculate(s),
    })).filter(x => x.r !== null);

    if (calced.length === 0) {
      comparisonRoot.innerHTML = '<div class="compare-empty">Karşılaştırma için en az bir senaryo doldurun.</div>';
      return;
    }

    const headerCols = calced.map(c => `<th title="Senaryo ${c.i + 1}">${escapeHtml(c.name)}</th>`).join('');
    const bodyRows = COMPARE_METRICS.map(m => {
      const vals = calced.map(c => c.r[m.key]);
      const finite = vals.filter(Number.isFinite);
      if (finite.length === 0) return '';
      const bestVal = m.best === 'max' ? Math.max(...finite) : Math.min(...finite);

      const cells = calced.map(c => {
        const v = c.r[m.key];
        const isBest = calced.length > 1 && Math.abs(v - bestVal) < 1e-6;
        return `<td class="${isBest ? 'best' : ''}">${m.fmt(v)}</td>`;
      }).join('');

      return `<tr><td class="metric-name">${m.label}</td>${cells}</tr>`;
    }).join('');

    comparisonRoot.innerHTML = `
      <table class="compare-table">
        <thead><tr><th>Metrik</th>${headerCols}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    `;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  document.getElementById('example-btn').addEventListener('click', () => {
    scenarios = EXAMPLE.map(s => ({ ...EMPTY(), ...s }));
    saveScenarios();
    buildCards();
    renderAllResults();
    renderComparison();
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    if (!confirm('Tüm senaryolar temizlenecek. Devam edilsin mi?')) return;
    scenarios = Array.from({ length: NUM_SCENARIOS }, EMPTY);
    saveScenarios();
    buildCards();
    renderAllResults();
    renderComparison();
  });

  document.getElementById('export-btn').addEventListener('click', exportCSV);

  function exportCSV() {
    const header = [
      'Senaryo','Kanat($)','Prim($)','TP(%)','SL(%)','WinRate(%)','Kontrat','DTE','EşzamanlıPozisyon',
      'KullanılanSermaye($)','OrtGünlükCollateral($)','SermayePerPozisyon($)',
      'AylıkTradeSayısı','AylıkCycle',
      'EV/Trade($)','ROC/Trade(%)',
      'AylıkGrossPrim($)','AylıkTRNet($)','AylıkGRNet($)','AylıkROC(%)',
      'YıllıkGrossPrim($)','YıllıkTRNet($)','YıllıkGRNet($)','YıllıkROC(%)',
      'MaxKârTP($)','MaxZararSL($)','R/R','BreakevenWR(%)','Edge(pp)',
      'USDTRY','AylıkGrossPrim(₺)','AylıkTRNet(₺)','AylıkGRNet(₺)'
    ];
    const rows = [header];
    let any = false;

    scenarios.forEach((s, i) => {
      const r = calculate(s);
      if (!r) return;
      any = true;
      rows.push([
        s.name || `Senaryo ${i + 1}`,
        s.width, s.premium, s.tp, s.sl, s.winRate, s.contracts, s.dte, s.concurrent,
        r.deployedCapital.toFixed(2),
        r.dailyCollateral.toFixed(2),
        r.capitalPerPosition.toFixed(2),
        r.monthlyTrades.toFixed(2),
        r.monthlyCycles.toFixed(2),
        r.evPerTrade.toFixed(2),
        r.rocPerTrade.toFixed(2),
        r.monthlyEV.toFixed(2),
        r.monthlyEVTRNet.toFixed(2),
        r.monthlyEVGRNet.toFixed(2),
        r.monthlyROC.toFixed(2),
        r.annualEV.toFixed(2),
        r.annualEVTRNet.toFixed(2),
        r.annualEVGRNet.toFixed(2),
        r.annualROC.toFixed(2),
        r.tpGainPerTrade.toFixed(2),
        (-r.slLossPerTrade).toFixed(2),
        r.riskReward.toFixed(2),
        r.breakevenWR.toFixed(2),
        r.edge.toFixed(2),
        usdTryRate.toFixed(4),
        (r.monthlyEV * usdTryRate).toFixed(2),
        (r.monthlyEVTRNet * usdTryRate).toFixed(2),
        (r.monthlyEVGRNet * usdTryRate).toFixed(2),
      ]);
    });

    if (!any) {
      alert('Dışa aktarılacak hesaplanmış senaryo yok.');
      return;
    }

    const csv = rows.map(row => row.map(cell => {
      const s = String(cell ?? '');
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pcs-karsilastirma-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const rateInput = document.getElementById('rate-input');
  const rateRefresh = document.getElementById('rate-refresh');
  rateInput.addEventListener('input', e => setUserRate(e.target.value));
  rateInput.addEventListener('blur', syncRateInput);
  rateRefresh.addEventListener('click', () => fetchRate(true));

  let deferredPrompt = null;
  const installBtn = document.getElementById('install-btn');

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.hidden = false;
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') installBtn.hidden = true;
    deferredPrompt = null;
  });

  window.addEventListener('appinstalled', () => { installBtn.hidden = true; });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js')
        .then(reg => reg.update())
        .catch(() => {});
    });
  }

  loadRate();
  syncRateInput();
  buildCards();
  renderAllResults();
  renderComparison();
  fetchRate();
})();
