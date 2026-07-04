/**
 * 鹰眼 · 插件靶站通用导入（CSV/TSV/JSON · 图片预览 · 拖拽/点击）
 * YingyanPluginImport.mount(el, { mode, onImport, onImage, hint })
 */
(function (global) {
  'use strict';

  var ALIASES = {
    name: ['药品', '项目', '名称', 'item', 'item_name', 'ord-name', '药品/项目名称'],
    spec: ['规格', 'spec'],
    qty: ['数量', 'qty', 'quantity'],
    unit: ['单位', 'unit'],
    usage: ['用法', 'usage', '频次'],
    amount: ['金额', 'amount', '单价金额'],
    trace: ['追溯', 'trace', '追溯码'],
    date: ['日期', 'settle', '结算日期', 'fee_date'],
    icd: ['icd', 'icd10', '编码'],
    diagnosis: ['诊断', 'diagnosis', '主诊断'],
    dept: ['科室', 'dept'],
    sex: ['性别', 'sex'],
    age: ['年龄', 'age'],
    rule: ['规则', 'rule', '命中规则', 'rule_id'],
    doctor: ['医生', 'doctor', '开单医生'],
    row_id: ['编号', 'row_id', '结算编号', '行号'],
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function splitLine(line, sep) {
    if (sep === '\t') return line.split('\t');
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') { q = !q; continue; }
      if (!q && ch === sep) { out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  }

  function detectSep(text) {
    var first = (text.split(/\r?\n/).filter(Boolean)[0] || '');
    var tabs = (first.match(/\t/g) || []).length;
    var commas = (first.match(/,/g) || []).length;
    return tabs >= commas ? '\t' : ',';
  }

  function parseTableText(text) {
    text = String(text || '').replace(/^\uFEFF/, '').trim();
    if (!text) return { headers: [], rows: [] };
    var sep = detectSep(text);
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
    var headers = splitLine(lines[0], sep).map(function (h) { return h.replace(/^"|"$/g, '').trim(); });
    var rows = lines.slice(1).map(function (line) {
      var cells = splitLine(line, sep).map(function (c) { return c.replace(/^"|"$/g, '').trim(); });
      var obj = {};
      headers.forEach(function (h, i) { obj[h] = cells[i] != null ? cells[i] : ''; });
      return obj;
    });
    return { headers: headers, rows: rows, sep: sep };
  }

  function colIndex(headers, keys) {
    for (var i = 0; i < headers.length; i++) {
      var h = headers[i].toLowerCase();
      for (var k = 0; k < keys.length; k++) {
        if (h.indexOf(keys[k].toLowerCase()) >= 0 || keys[k].toLowerCase().indexOf(h) >= 0) return i;
      }
    }
    return -1;
  }

  function pick(row, headers, aliasKey) {
    var keys = ALIASES[aliasKey] || [];
    for (var i = 0; i < headers.length; i++) {
      var h = headers[i];
      for (var k = 0; k < keys.length; k++) {
        if (h.indexOf(keys[k]) >= 0 || keys[k].indexOf(h) >= 0) return row[h];
      }
    }
    return '';
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve({ name: file.name, type: file.type, text: r.result }); };
      r.onerror = reject;
      if (/^image\//.test(file.type)) r.readAsDataURL(file);
      else r.readAsText(file, 'UTF-8');
    });
  }

  function mount(el, opts) {
    opts = opts || {};
    var root = typeof el === 'string' ? document.querySelector(el) : el;
    if (!root) return;

    root.className = (root.className || '') + ' yy-import';
    root.innerHTML =
      '<div class="yy-import-drop" tabindex="0" role="button">' +
        '<span class="yy-import-ico">📂</span>' +
        '<span class="yy-import-label"><strong>导入数据</strong> · ' + esc(opts.hint || '拖入 CSV / Excel 另存 CSV / JSON / 图片，或点击选择') + '</span>' +
        '<input type="file" class="yy-import-input" multiple accept="' + esc(opts.accept || '.csv,.tsv,.txt,.json,image/*,application/json,text/csv,text/plain') + '">' +
      '</div>' +
      '<div class="yy-import-status"></div>' +
      '<div class="yy-import-thumb"></div>';

    var drop = root.querySelector('.yy-import-drop');
    var input = root.querySelector('.yy-import-input');
    var status = root.querySelector('.yy-import-status');
    var thumb = root.querySelector('.yy-import-thumb');

    function setStatus(msg, kind) {
      status.textContent = msg;
      status.className = 'yy-import-status show' + (kind === 'warn' ? ' warn' : kind === 'err' ? ' err' : '');
    }

    function handleFiles(fileList) {
      var files = Array.prototype.slice.call(fileList || []);
      if (!files.length) return;
      Promise.all(files.map(readFile)).then(function (results) {
        var texts = [], images = [];
        results.forEach(function (r) {
          if (String(r.text).indexOf('data:image/') === 0) images.push(r);
          else texts.push(r);
        });

        texts.forEach(function (f) {
          var name = (f.name || '').toLowerCase();
          if (name.endsWith('.json')) {
            try {
              var data = JSON.parse(f.text);
              dispatch({ kind: 'json', data: data, filename: f.name });
              setStatus('已导入 JSON · ' + f.name);
            } catch (e) {
              setStatus('JSON 解析失败：' + e.message, 'err');
            }
            return;
          }
          var table = parseTableText(f.text);
          if (!table.rows.length) {
            setStatus('未识别到表格行：' + f.name, 'warn');
            return;
          }
          dispatch({ kind: 'table', table: table, filename: f.name });
          setStatus('已导入 ' + table.rows.length + ' 行 · ' + f.name + (table.sep === '\t' ? ' (TSV)' : ' (CSV)'));
        });

        images.forEach(function (img) {
          var im = document.createElement('img');
          im.src = img.text;
          im.alt = img.name;
          im.title = img.name;
          thumb.appendChild(im);
          if (opts.onImage) opts.onImage({ name: img.name, dataUrl: img.text });
          else dispatch({ kind: 'image', name: img.name, dataUrl: img.text });
        });
        if (images.length && !texts.length) {
          setStatus('已接收 ' + images.length + ' 张图片' + (global.fetch ? ' · 可前往材料导入中心做 OCR 解析' : ''), images.length ? '' : 'warn');
        }
      }).catch(function (e) {
        setStatus('读取文件失败：' + e.message, 'err');
      });
    }

    function dispatch(payload) {
      if (typeof opts.onImport === 'function') {
        opts.onImport(payload);
        return;
      }
      if (opts.mode === 'orders' && payload.kind === 'table') applyOrders(payload.table);
      else if (opts.mode === 'fee' && payload.kind === 'table') applyFee(payload.table, opts);
      else if (opts.mode === 'coder' && (payload.kind === 'json' || payload.kind === 'table')) applyCoder(payload, opts);
      else if (opts.mode === 'triage' && payload.kind === 'table') applyTriage(payload.table, opts);
      else if (opts.mode === 'files' && payload.kind === 'image') { /* thumb only */ }
    }

    drop.addEventListener('click', function () { input.click(); });
    drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', function () { handleFiles(input.files); input.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) {
        e.preventDefault();
        drop.classList.remove('dragover');
        if (ev === 'drop') handleFiles(e.dataTransfer.files);
      });
    });
  }

  function applyOrders(table) {
    var tb = document.querySelector('#orderTable tbody');
    if (!tb) return;
    var h = table.headers;
    tb.innerHTML = '';
    table.rows.forEach(function (row) {
      var tr = document.createElement('tr');
      var name = pick(row, h, 'name') || row[h[0]] || '';
      var spec = pick(row, h, 'spec') || '—';
      var qty = pick(row, h, 'qty') || '1';
      var unit = pick(row, h, 'unit') || '盒';
      var usage = pick(row, h, 'usage') || '';
      tr.innerHTML =
        '<td><input class="ord-name" value="' + esc(name) + '"></td>' +
        '<td><input class="ord-spec" value="' + esc(spec) + '"></td>' +
        '<td><input class="ord-qty" value="' + esc(qty) + '" type="number"></td>' +
        '<td><input class="ord-unit" value="' + esc(unit) + '"></td>' +
        '<td><input class="ord-usage" value="' + esc(usage) + '"></td>' +
        '<td><button class="ghost btn-del" type="button">删行</button></td>';
      tb.appendChild(tr);
    });
  }

  function applyFee(table, opts) {
    var rows = table.rows.map(function (row, i) {
      var h = table.headers;
      return {
        item_name: pick(row, h, 'name') || row[h[1]] || '',
        qty: Number(pick(row, h, 'qty')) || 1,
        amount: Number(String(pick(row, h, 'amount')).replace(/[^\d.]/g, '')) || 0,
        trace_code: pick(row, h, 'trace') || '—',
        settle_date: pick(row, h, 'date') || '2026-06-16',
      };
    }).filter(function (r) { return r.item_name; });
    if (opts.onFeeRows) opts.onFeeRows(rows);
    else if (global.FEE && Array.isArray(global.FEE)) {
      global.FEE.length = 0;
      rows.forEach(function (r) { global.FEE.push(r); });
      if (typeof global.renderFee === 'function') global.renderFee();
    }
  }

  function applyCoder(payload, opts) {
    if (payload.kind === 'json') {
      var d = payload.data;
      if (d.diagnosis != null) document.getElementById('dxName').value = d.diagnosis;
      if (d.icd10 != null || d.icd != null) document.getElementById('dxIcd').value = d.icd10 || d.icd;
      if (d.has_severe_evidence != null) document.getElementById('severeEvidence').checked = !!d.has_severe_evidence;
      if (d.procedures != null) document.getElementById('proc').value = d.procedures;
      return;
    }
    var row = payload.table.rows[0] || {};
    var h = payload.table.headers;
    var dx = pick(row, h, 'diagnosis');
    var icd = pick(row, h, 'icd');
    if (dx) document.getElementById('dxName').value = dx;
    if (icd) document.getElementById('dxIcd').value = icd;
  }

  function applyTriage(table, opts) {
    if (typeof opts.onTriageRows === 'function') opts.onTriageRows(table.rows, table.headers);
  }

  global.YingyanPluginImport = {
    mount: mount,
    parseTableText: parseTableText,
    pick: pick,
    ALIASES: ALIASES,
  };
})(typeof window !== 'undefined' ? window : global);
