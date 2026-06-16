'use strict';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let QUEUE = [];
let SLOTS = [];
let LAST_RECORD = null;

async function init() {
  const [health, slots] = await Promise.all([
    fetch('/api/health').then(r => r.json()).catch(() => ({})),
    fetch('/api/intake/slots').then(r => r.json()).catch(() => ({ slots: [] })),
  ]);
  SLOTS = slots.slots || [];
  renderStatus(health);
  renderServiceCard(health);
  bindDropZone();
  $('#btnRun').onclick = runBatch;
  $('#btnClear').onclick = () => { QUEUE = []; renderQueue(); };
}

function renderStatus(h) {
  const pills = [];
  pills.push(`<span class="pill ok">规则 ${h.rules ?? '—'}</span>`);
  if (h.ppstructure?.reachable) {
    pills.push(`<span class="pill ok">L1 ${esc(h.ppstructure.recommended_engine || '就绪')}</span>`);
  } else {
    pills.push(`<span class="pill warn">L1 未启动</span>`);
  }
  if (h.llm_ready) pills.push(`<span class="pill ok">LLM ${esc(h.provider || '')}</span>`);
  else pills.push(`<span class="pill warn">LLM 未配置</span>`);
  $('#statusPills').innerHTML = pills.join('');
}

function renderServiceCard(h) {
  const pp = h.ppstructure || {};
  const lines = [
    ['L1 Sidecar', pp.reachable ? '✓ 已连接' : '✗ 未连接'],
    ['解析引擎', pp.recommended_engine || (pp.reachable ? '—' : '需启动 sidecar')],
    ['Paddle OCR', pp.paddle_available ? '已安装' : '未安装（lite 模式）'],
    ['Tesseract', pp.tesseract_available ? '可用' : '可选'],
    ['LLM 语义', h.llm_ready ? h.provider : '未配置（OCR 回退受限）'],
    ['演示案卷', `${h.cases ?? 0} 个 + uploaded`],
  ];
  let hint = '';
  if (!pp.reachable) {
    hint = `<div class="svc-hint">启动 L1 解析（支持 PDF 直传）：<br><code>cd prototype/ppstructure && bash run.sh</code></div>`;
  }
  $('#serviceCard').innerHTML = lines.map(([k, v]) =>
    `<div class="svc-row"><span>${esc(k)}</span><span class="svc-val">${esc(v)}</span></div>`).join('') + hint;
}

function slotOptions() {
  return SLOTS.map(s => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join('');
}

function bindDropZone() {
  const zone = $('#dropZone');
  const input = $('#fileInput');
  zone.onclick = () => input.click();
  input.onchange = (e) => addFiles(e.target.files);
  zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('dragover'); };
  zone.ondragleave = () => zone.classList.remove('dragover');
  zone.ondrop = (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  };
}

function addFiles(fileList) {
  for (const f of fileList) QUEUE.push(f);
  $('#fileInput').value = '';
  renderQueue();
}

function renderQueue() {
  const el = $('#fileQueue');
  const has = QUEUE.length > 0;
  el.classList.toggle('hidden', !has);
  $('#btnRun').disabled = !has;
  $('#btnClear').disabled = !has;
  if (!has) return;
  el.innerHTML = QUEUE.map((f, i) => `
    <div class="file-row" data-idx="${i}">
      <span class="file-name" title="${esc(f.name)}">${esc(f.name)}</span>
      <span class="file-size">${(f.size / 1024).toFixed(1)}K</span>
      <select class="file-slot" data-idx="${i}">
        <option value="">自动识别</option>${slotOptions()}
      </select>
      <button type="button" class="file-rm" data-idx="${i}" title="移除">✕</button>
    </div>`).join('');
  el.querySelectorAll('.file-rm').forEach(b => b.onclick = () => {
    QUEUE.splice(Number(b.dataset.idx), 1);
    renderQueue();
  });
}

function readFileB64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

async function runBatch() {
  const btn = $('#btnRun');
  const logEl = $('#runLog');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>解析中…';
  logEl.classList.remove('hidden');
  logEl.innerHTML = '<p class="muted">正在识别分类并解析…</p>';

  const merge = $('#mergeChk').checked;
  const selects = document.querySelectorAll('.file-slot');
  const files = await Promise.all(QUEUE.map(async (f, i) => {
    const sel = [...selects].find(s => Number(s.dataset.idx) === i);
    return {
      name: f.name,
      mime: f.type || 'application/octet-stream',
      fileBase64: await readFileB64(f),
      slotOverride: sel?.value || undefined,
    };
  }));

  try {
    const r = await fetch('/api/intake/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files, merge }),
    }).then(x => x.json());

    renderBatchLog(r);
    if (r.record) {
      LAST_RECORD = r.record;
      await renderPreview(r);
    }
  } catch (e) {
    logEl.innerHTML = `<div class="log-summary err">请求失败：${esc(e.message)}</div>`;
  }

  btn.disabled = false;
  btn.innerHTML = '<span class="btn-label">识别并填入</span>';
}

function renderBatchLog(r) {
  const el = $('#runLog');
  const ok = r.ok && r.record;
  const cls = ok ? (r.errors?.length ? 'partial' : 'ok') : 'err';
  const summary = ok
    ? `✓ 已填入 ${(r.slotsFilled || []).length} 个材料区块${r.record?.front_page?.patient_name ? ' · ' + r.record.front_page.patient_name : ''}`
    : `✗ ${esc(r.error || r.errors?.join('；') || '导入失败')}`;

  const badges = (r.slotsFilled || []).map(s => `<span class="slot-badge">${esc(s.label)}</span>`).join('');
  const pq = r.record?.case_meta?.parse_quality;
  const parseQaHtml = pq ? (() => {
    const cls = pq.level === 'ok' ? 'ok' : pq.level === 'critical' ? 'err' : 'partial';
    const msgs = (pq.flags || []).map(f => esc(f.message)).join(' · ');
    return `<div class="log-summary ${cls}" style="margin-top:8px">Parse QA · ${esc(pq.level)} (score ${pq.score ?? '—'})${msgs ? `<div class="muted">${msgs}</div>` : ''}</div>`;
  })() : '';
  const items = (r.items || []).map(it => {
    const c = it.classification || {};
    const st = it.ok ? 'ok' : 'err';
    return `<div class="log-item ${st}"><b>${esc(it.name)}</b> → ${esc(c.slotLabel || c.slot || '?')}
      <div class="muted">${esc((it.log || []).join(' · '))}${it.error ? ' · ' + esc(it.error) : ''}</div></div>`;
  }).join('');

  el.innerHTML = `
    <div class="log-summary ${cls}">${summary}</div>
    ${parseQaHtml}
    ${badges ? `<div class="slot-badges">${badges}</div>` : ''}
    ${(r.warnings || []).length ? `<p class="muted">${esc(r.warnings.join(' · '))}</p>` : ''}
    ${items}
    ${!r.validation?.ok ? `<p class="muted">契约提示：${esc((r.validation?.errors || []).join('；'))}</p>` : ''}`;
}

async function renderPreview(batchResult) {
  let rec = batchResult.record;
  try {
    rec = await fetch('/api/case?id=uploaded').then(r => r.json());
  } catch (_) {}

  $('#previewEmpty').classList.add('hidden');
  const card = $('#previewCard');
  card.classList.remove('hidden');
  $('#previewActions').classList.remove('hidden');

  const fp = rec.front_page || {};
  const fees = rec.fee_list?.items || [];
  const feeRows = fees.slice(0, 8).map(it => {
    const bb = it.anchor?.bbox;
    return `<tr>
      <td>${it.line_no}${bb ? ' <span class="bbox-mark" title="OCR bbox">⌖</span>' : ''}</td>
      <td>${esc(it.item_name)}</td>
      <td class="num">${typeof it.amount === 'number' ? it.amount.toFixed(2) : esc(it.amount)}</td>
    </tr>`;
  }).join('');

  const layouts = rec.intake_layouts ? Object.keys(rec.intake_layouts).length : 0;
  card.innerHTML = `
    <div class="preview-kv">
      <span class="k">案卷</span><span class="v">📥 导入的材料</span>
      <span class="k">患者</span><span class="v">${esc(fp.patient_name || '—')}</span>
      <span class="k">诊断</span><span class="v">${esc(fp.principal_diagnosis?.name || '—')}</span>
      <span class="k">费用行</span><span class="v">${fees.length} 行${layouts ? ` · L1布局 ${layouts} 文件` : ''}</span>
    </div>
    ${fees.length ? `<table class="fee-mini"><thead><tr><th>行</th><th>项目</th><th class="num">金额</th></tr></thead><tbody>${feeRows}</tbody></table>
      ${fees.length > 8 ? `<p class="muted" style="margin-top:6px">… 另有 ${fees.length - 8} 行</p>` : ''}` : '<p class="muted">暂无费用行，可继续追加费用清单文件</p>'}`;
}

init();
