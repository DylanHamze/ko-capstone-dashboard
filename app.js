
const fmtMoney = (v) => v == null || Number.isNaN(v) ? '—' : '$' + Number(v).toLocaleString(undefined,{maximumFractionDigits:1});
const fmtPct = (v) => v == null || Number.isNaN(v) ? '—' : (Number(v)*100).toFixed(1)+'%';
const fmtNum = (v) => v == null || Number.isNaN(v) ? '—' : Number(v).toLocaleString(undefined,{maximumFractionDigits:1});

let trendChart, compareChart, data, baseScenario;

(function bootstrap(){
  try {
    data = window.DASHBOARD_DATA;
    if (!data || !Array.isArray(data.scenarios) || !data.scenarios.length) throw new Error('Scenario data missing');
    baseScenario = data.scenarios.find(s=>s.name==='base') || data.scenarios[0];
    init();
  } catch (err) {
    const app = document.querySelector('.app');
    const msg = document.createElement('div');
    msg.className='card';
    msg.style.margin='20px 0';
    msg.innerHTML = `<h2>Dashboard failed to load</h2><p>${err.message}</p><p>Make sure <code>index.html</code>, <code>styles.css</code>, <code>app.js</code>, and <code>dashboard_data.js</code> are all in the repo root.</p>`;
    app.prepend(msg);
    console.error(err);
  }
})();

function init(){
  renderManifest();
  const select = document.getElementById('scenarioSelect');
  data.scenarios.sort((a,b)=>(a.order||0)-(b.order||0)).forEach(s=>{
    const opt=document.createElement('option'); opt.value=s.name; opt.textContent=s.label; select.appendChild(opt);
  });
  select.value = baseScenario.name;
  select.addEventListener('change', renderAll);
  document.getElementById('metricSelect').addEventListener('change', renderAll);
  renderAll();
}

function getScenario(){
  const name = document.getElementById('scenarioSelect').value || baseScenario.name;
  return data.scenarios.find(s=>s.name===name) || baseScenario;
}

function renderManifest(){
  const m = Array.isArray(data.manifest)
    ? Object.fromEntries(data.manifest.map(x=>[x.key || x.label || x.name, x.value]))
    : (data.manifest || {});
  const box = document.getElementById('manifestBox');
  const rows = [
    ['Company', data.company],
    ['Ticker', data.ticker],
    ['Run ID', m.run_id || m.RunID || 'R_latest'],
    ['Model Version', m.model_version || m.ModelVersion || '—'],
    ['Data Version', m.data_version || m.DataVersion || '—'],
  ];
  box.innerHTML = rows.map(([k,v])=>`<div class="row"><strong>${k}</strong><span>${v}</span></div>`).join('');
}

function renderAll(){
  const s = getScenario();
  document.getElementById('scenarioNotes').textContent = s.notes || 'Scenario selected.';
  renderKpis(s);
  renderCharts(s);
  renderTable('incomeTable', s.statements.income_statement, ['Revenue','GrossProfit','EBITDA','EBIT','NetIncome','GrossMargin','EBITDAMargin']);
  renderTable('balanceTable', s.statements.balance_sheet, ['Cash','AR','Inventory','NetPPE','TotalAssets','AP','TermDebt','Revolver','TotalLiabilities','TotalEquity','TotalLiabEquity']);
  renderTable('cashTable', s.statements.cash_flow, ['NetIncome','DA','CFO','CapEx','CFI','CFF','NetChangeInCash','EndingCash']);
  renderDiagnostics(s);
  renderStatus(s);
}

function renderKpis(s){
  const latest = (s.kpis||[])[(s.kpis||[]).length-1] || {};
  const cards = [
    ['Revenue', fmtMoney(latest.Revenue), latest.period || ''],
    ['EBITDA Margin', fmtPct(latest.EBITDAMargin), latest.period || ''],
    ['Net Income', fmtMoney(latest.NetIncome), latest.period || ''],
    ['Free Cash Flow', fmtMoney(latest.FreeCashFlow), latest.period || ''],
    ['Cash', fmtMoney(latest.Cash), latest.period || ''],
    ['Term Debt', fmtMoney(latest.TermDebt), latest.period || ''],
  ];
  document.getElementById('kpiGrid').innerHTML = cards.map(c=>`<div class="card kpi"><div class="label">${c[0]}</div><div class="value">${c[1]}</div><div class="sub">FY ${c[2]}</div></div>`).join('');
}

function renderCharts(s){
  const metric = document.getElementById('metricSelect').value;
  const labels = (s.kpis||[]).map(r=>r.period);
  const selectedVals = (s.kpis||[]).map(r=>r[metric]);
  const baseVals = (baseScenario.kpis||[]).map(r=>r[metric]);
  if (trendChart) trendChart.destroy();
  trendChart = new Chart(document.getElementById('trendChart'), {
    type:'line',
    data:{labels,datasets:[{label:s.label,data:selectedVals,borderColor:'#d71920',backgroundColor:'rgba(215,25,32,.12)',fill:true,tension:.25,borderWidth:3,pointRadius:4}]},
    options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{ticks:{callback:(v)=>Number.isFinite(v)? '$'+Number(v).toLocaleString() : v}}}}
  });
  if (compareChart) compareChart.destroy();
  compareChart = new Chart(document.getElementById('compareChart'), {
    type:'bar',
    data:{labels:(s.kpis||[]).map(r=>r.period),datasets:[{label:'Base',data:(baseScenario.kpis||[]).map(r=>r.Revenue),backgroundColor:'#f4b5b8'},{label:s.label,data:(s.kpis||[]).map(r=>r.Revenue),backgroundColor:'#d71920'}]},
    options:{responsive:true,plugins:{legend:{position:'bottom'}},scales:{y:{ticks:{callback:(v)=>Number.isFinite(v)? '$'+Number(v).toLocaleString() : v}}}}
  });
}

function renderTable(id, rows, wanted){
  const table = document.getElementById(id);
  rows = rows || [];
  const headers = ['period', ...wanted];
  table.innerHTML = `<thead><tr>${headers.map(h=>`<th>${h==='period'?'Year':nice(h)}</th>`).join('')}</tr></thead>` +
    `<tbody>${rows.map(r=>`<tr>${headers.map(h=>`<td>${formatCell(h,r[h])}</td>`).join('')}</tr>`).join('')}</tbody>`;
}

function renderDiagnostics(s){
  const table = document.getElementById('diagTable');
  const d = s.diagnostics || [];
  const hardFails = d.filter(x=>x.severity==='hard' && !x.pass).length;
  const softWarns = d.filter(x=>x.severity==='soft' && !x.pass).length;
  document.getElementById('diagSummary').innerHTML = `
    <span class="badge ${hardFails? 'fail':'pass'}">Hard Fails: ${hardFails}</span>
    <span class="badge ${softWarns? 'warn':'pass'}">Soft Warns: ${softWarns}</span>
    <span class="badge ${statusClass(s.diagnosticStatus)}">${s.diagnosticStatus || 'PASS'}</span>`;
  const cols = ['period','check','severity','pass','message'];
  table.innerHTML = `<thead><tr>${cols.map(c=>`<th>${nice(c)}</th>`).join('')}</tr></thead>` +
    `<tbody>${d.slice(0,12).map(r=>`<tr>${cols.map(c=>`<td>${c==='pass' ? (r[c] ? 'PASS':'FAIL') : (r[c] ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody>`;
}

function renderStatus(s){
  const el=document.getElementById('selectedStatus');
  el.textContent=s.diagnosticStatus || 'PASS';
  el.className='status '+statusClass(s.diagnosticStatus);
}

function statusClass(v){
  const x=(v||'').toLowerCase();
  if(x.includes('warn')) return 'warn';
  if(x.includes('fail')) return 'fail';
  return 'pass';
}
function nice(s){ return String(s).replace(/([A-Z])/g,' $1').replace(/^./,m=>m.toUpperCase()); }
function formatCell(k,v){
  if(k==='period') return v;
  if(String(k).toLowerCase().includes('margin')) return fmtPct(v);
  return typeof v==='number' ? fmtNum(v) : (v ?? '—');
}
