(() => {
  'use strict';

  const STORAGE_KEY = 'pcs-calc-scenarios-v1';
  const NUM_SCENARIOS = 5;
  const CONTRACT_MULTIPLIER = 100;

  const FIELDS = ['name', 'width', 'premium', 'tp', 'sl', 'winRate', 'contracts', 'dte', 'monthlyTrades'];

  const EMPTY = () => ({
    name: '', width: '', premium: '', tp: '', sl: '',
    winRate: '', contracts: '', dte: '', monthlyTrades: ''
  });

  const EXAMPLE = [
    { name: 'Konservatif',   width: 5,  premium: 0.50, tp: 50, sl: 200, winRate: 88, contracts: 5, dte: 30, monthlyTrades: 1 },
    { name: 'Dengeli',       width: 5,  premium: 1.00, tp: 50, sl: 200, winRate: 85, contracts: 5, dte: 30, monthlyTrades: 1 },
    { name: 'Agresif TP/SL', width: 5,  premium: 1.50, tp: 60, sl: 150, winRate: 78, contracts: 5, dte: 30, monthlyTrades: 1 },
    { name: 'Kısa vadeli',   width: 5,  premium: 0.75, tp: 50, sl: 200, winRate: 82, contracts: 5, dte: 7,  monthlyTrades: 4 },
    { name: 'Geniş kanat',   width: 10, premium: 2.00, tp: 50, sl: 200, winRate: 84, contracts: 3, dte: 30, monthlyTrades: 1 },
  ];

  let scenarios = loadScenarios();

  function loadScenarios() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return Array.from({ length: NUM_SCENARIOS }, EMPTY);
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return Array.from({ length: NUM_SCENARIOS }, EMPTY);
      const padded = Array.from({ length: NUM_SCENARIOS }, (_, i) => ({ ...EMPTY(), ...(data[i] || {}) }));
      return padded;
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
    const monthlyTrades = toNum(s.monthlyTrades);

    if (![width, premium, tp, sl, winRate, contracts, dte, monthlyTrades].every(Number.isFinite)) return null;
    if (width <= 0 || premium <= 0 || contracts <= 0 || dte <= 0 || monthlyTrades <= 0) return null;

    const widthInvalid = premium >= width;
    const maxProfitPerContract = premium * CONTRACT_MULTIPLIER;
    const maxLossPerContract = Math.max(0, (width - premium) * CONTRACT_MULTIPLIER);

    const totalMaxProfit = maxProfitPerContract * contracts;
    const totalMaxLoss = maxLossPerContract * contracts;
    const totalCapital = totalMaxLoss;

    const tpGainPerTrade = totalMaxProfit * tp;
    const slLossPerTrade = Math.min(totalMaxProfit * sl, totalMaxLoss);

    const evPerTrade = winRate * tpGainPerTrade - (1 - winRate) * slLossPerTrade;
    const monthlyEV = evPerTrade * monthlyTrades;
    const monthlyROC = totalCapital > 0 ? (monthlyEV / totalCapital) * 100 : 0;
    const annualEV = monthlyEV * 12;
    const annualROC = monthlyROC * 12;

    const riskReward = tpGainPerTrade > 0 ? slLossPerTrade / tpGainPerTrade : 0;
    const breakevenWR = (tpGainPerTrade + slLossPerTrade) > 0
      ? (slLossPerTrade / (tpGainPerTrade + slLossPerTrade)) * 100
      : 0;
    const edge = (winRate * 100) - breakevenWR;
    const rocPerTrade = totalCapital > 0 ? (evPerTrade / totalCapital) * 100 : 0;

    const concurrentAvg = (dte * monthlyTrades) / 30;
    const concurrent = Math.max(1, Math.ceil(concurrentAvg));
    const peakCapital = totalCapital * concurrent;

    return {
      widthInvalid,
      totalMaxProfit, totalMaxLoss, totalCapital,
      tpGainPerTrade, slLossPerTrade,
      evPerTrade, rocPerTrade,
      monthlyEV, monthlyROC,
      annualEV, annualROC,
      riskReward, breakevenWR, edge,
      concurrent, peakCapital,
    };
  }

  function fmtMoney(v) {
    if (!Number.isFinite(v)) return '—';
    const sign = v < 0 ? '-' : '';
    const abs = Math.abs(v);
    return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

    const tiles = [
      { label: 'Aylık Beklenen Prim Geliri', value: fmtMoney(r.monthlyEV), big: true, cls: r.monthlyEV >= 0 ? 'positive' : 'negative' },
      { label: 'Aylık ROC',                   value: fmtPct(r.monthlyROC), big: true, cls: r.monthlyROC >= 0 ? 'positive' : 'negative' },
      { label: 'Yatırılan Sermaye / Pozisyon',value: fmtMoney(r.totalCapital), big: true, cls: 'neutral' },
      { label: 'Beklenen Değer / Trade',      value: fmtMoney(r.evPerTrade), cls: r.evPerTrade >= 0 ? 'positive' : 'negative' },
      { label: 'ROC / Trade',                 value: fmtPct(r.rocPerTrade), cls: r.rocPerTrade >= 0 ? 'positive' : 'negative' },
      { label: 'Max Kâr (TP) / Trade',        value: fmtMoney(r.tpGainPerTrade), cls: 'positive' },
      { label: 'Max Zarar (SL) / Trade',      value: fmtMoney(-r.slLossPerTrade), cls: 'negative' },
      { label: 'Yıllık Beklenen Gelir',       value: fmtMoney(r.annualEV), cls: r.annualEV >= 0 ? 'positive' : 'negative' },
      { label: 'Yıllık ROC (basit)',          value: fmtPct(r.annualROC), cls: r.annualROC >= 0 ? 'positive' : 'negative' },
      { label: 'Risk / Ödül',                 value: fmtRatio(r.riskReward), cls: 'neutral' },
      { label: 'Breakeven Win Rate',          value: fmtPct(r.breakevenWR), cls: 'neutral' },
      { label: 'Edge (WR − BE)',              value: fmtEdge(r.edge), cls: r.edge >= 0 ? 'positive' : 'negative' },
      { label: r.concurrent > 1 ? `Tepe Sermaye (~${r.concurrent} eşzamanlı)` : 'Tepe Sermaye', value: fmtMoney(r.peakCapital), cls: 'neutral' },
      { label: 'Teorik Max Zarar',            value: fmtMoney(-r.totalMaxLoss), cls: 'negative' },
    ];

    target.innerHTML = warn + tiles.map(t => `
      <div class="result-tile ${t.big ? 'big' : ''} ${t.cls || ''}">
        <div class="result-label">${t.label}</div>
        <div class="result-value">${t.value}</div>
      </div>
    `).join('');
  }

  function renderAllResults() {
    for (let i = 0; i < NUM_SCENARIOS; i++) renderResults(i);
  }

  const COMPARE_METRICS = [
    { key: 'monthlyEV',   label: 'Aylık Beklenen Gelir', fmt: fmtMoney, best: 'max' },
    { key: 'monthlyROC',  label: 'Aylık ROC',            fmt: fmtPct,   best: 'max' },
    { key: 'annualROC',   label: 'Yıllık ROC',           fmt: fmtPct,   best: 'max' },
    { key: 'evPerTrade',  label: 'Beklenen Değer / Trade', fmt: fmtMoney, best: 'max' },
    { key: 'rocPerTrade', label: 'ROC / Trade',          fmt: fmtPct,   best: 'max' },
    { key: 'totalCapital',label: 'Sermaye / Pozisyon',   fmt: fmtMoney, best: 'min' },
    { key: 'peakCapital', label: 'Tepe Sermaye',         fmt: fmtMoney, best: 'min' },
    { key: 'riskReward',  label: 'Risk / Ödül',          fmt: fmtRatio, best: 'min' },
    { key: 'breakevenWR', label: 'Breakeven WR',         fmt: fmtPct,   best: 'min' },
    { key: 'edge',        label: 'Edge (WR − BE)',       fmt: fmtEdge,  best: 'max' },
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
      'Senaryo','Kanat($)','Prim($)','TP(%)','SL(%)','WinRate(%)','Kontrat','DTE','AylıkTrade',
      'Sermaye($)','TepeSermaye($)','EV/Trade($)','ROC/Trade(%)',
      'AylıkGelir($)','AylıkROC(%)','YıllıkGelir($)','YıllıkROC(%)',
      'MaxKârTP($)','MaxZararSL($)','R/R','BreakevenWR(%)','Edge(pp)'
    ];
    const rows = [header];
    let any = false;

    scenarios.forEach((s, i) => {
      const r = calculate(s);
      if (!r) return;
      any = true;
      rows.push([
        s.name || `Senaryo ${i + 1}`,
        s.width, s.premium, s.tp, s.sl, s.winRate, s.contracts, s.dte, s.monthlyTrades,
        r.totalCapital.toFixed(2),
        r.peakCapital.toFixed(2),
        r.evPerTrade.toFixed(2),
        r.rocPerTrade.toFixed(2),
        r.monthlyEV.toFixed(2),
        r.monthlyROC.toFixed(2),
        r.annualEV.toFixed(2),
        r.annualROC.toFixed(2),
        r.tpGainPerTrade.toFixed(2),
        (-r.slLossPerTrade).toFixed(2),
        r.riskReward.toFixed(2),
        r.breakevenWR.toFixed(2),
        r.edge.toFixed(2),
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
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    });
  }

  buildCards();
  renderAllResults();
  renderComparison();
})();
