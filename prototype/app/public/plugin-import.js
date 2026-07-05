/**
 * 鹰眼 · 插件靶站通用导入（CSV/TSV/JSON · PDF/图片 L1 解析 · 拖拽/点击）
 * YingyanPluginImport.mount(el, { mode, onImport, onImage, hint, parseImages, slot })
 */
(function (global) {
  'use strict';

  var ALIASES = {
    name: ['药品', '项目', '名称', 'item', 'item_name', 'ord-name', '药品/项目名称', '收费项目', '项目名称'],
    spec: ['规格', 'spec'],
    qty: ['数量', 'qty', 'quantity'],
    unit: ['单位', 'unit'],
    usage: ['用法', 'usage', '频次'],
    amount: ['金额', 'amount', '单价金额', '合计'],
    trace: ['追溯', 'trace', '追溯码'],
    date: ['日期', 'settle', '结算日期', 'fee_date', '收费日期'],
    icd: ['icd', 'icd10', '编码'],
    diagnosis: ['诊断', 'diagnosis', '主诊断'],
    dept: ['科室', 'dept'],
    sex: ['性别', 'sex'],
    age: ['年龄', 'age'],
    rule: ['规则', 'rule', '命中规则', 'rule_id'],
    doctor: ['医生', 'doctor', '开单医生'],
    row_id: ['编号', 'row_id', '结算编号', '行号', '序号'],
  };

  var DEFAULT_ACCEPT = '.csv,.tsv,.txt,.json,.pdf,image/*,application/json,text/csv,text/plain,application/pdf';

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

  function isLikelyPdf(name, type, textHead) {
    var n = String(name || '').toLowerCase();
    if (n.endsWith('.pdf') || type === 'application/pdf') return true;
    return /^\s*%PDF[-\d]/.test(String(textHead || '').slice(0, 16));
  }

  function isRemoteParseCandidate(name, type) {
    var n = String(name || '').toLowerCase();
    if (isLikelyPdf(n, type, '')) return true;
    if (/^image\//.test(type || '')) return true;
    return /\.(jpe?g|png|webp|bmp|tiff?|pdf)$/i.test(n);
  }

  function parseTableText(text) {
    text = String(text || '').replace(/^\uFEFF/, '').trim();
    if (!text) return { headers: [], rows: [] };
    if (isLikelyPdf('', '', text)) return { headers: [], rows: [], _reject: 'pdf_as_text' };
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

  function pickSmart(row, headers, aliasKey) {
    var v = pick(row, headers, aliasKey);
    if (v !== '' && v != null) return v;
    if (aliasKey === 'name') {
      var ni = colIndex(headers, ALIASES.name);
      if (ni >= 0 && row[headers[ni]]) return row[headers[ni]];
      for (var i = 0; i < headers.length; i++) {
        var cell = String(row[headers[i]] || '').trim();
        if (cell && /[\u4e00-\u9fa5a-zA-Z]/.test(cell) && !/^[\d.,\-–—]+$/.test(cell)) return cell;
      }
      return row[headers[1]] || row[headers[0]] || '';
    }
    if (aliasKey === 'qty') {
      var qi = colIndex(headers, ALIASES.qty);
      if (qi >= 0 && row[headers[qi]] != null && row[headers[qi]] !== '') return row[headers[qi]];
      for (var q = 0; q < headers.length; q++) {
        var raw = String(row[headers[q]] || '').trim();
        if (/^\d+\.?\d*$/.test(raw) && Number(raw) > 0 && Number(raw) < 100000) return raw;
      }
      return '1';
    }
    if (aliasKey === 'amount') {
      var ai = colIndex(headers, ALIASES.amount);
      if (ai >= 0 && row[headers[ai]] != null && row[headers[ai]] !== '') return row[headers[ai]];
      for (var j = headers.length - 1; j >= 0; j--) {
        var amt = Number(String(row[headers[j]]).replace(/[^\d.]/g, ''));
        if (amt > 0) return row[headers[j]];
      }
    }
    if (aliasKey === 'date') {
      var di = colIndex(headers, ALIASES.date);
      if (di >= 0 && row[headers[di]]) return row[headers[di]];
    }
    return v;
  }

  function readFileText(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve({ name: file.name, type: file.type, text: r.result }); };
      r.onerror = reject;
      r.readAsText(file, 'UTF-8');
    });
  }

  function readFileDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        var dataUrl = r.result;
        var objectUrl = null;
        try { objectUrl = URL.createObjectURL(file); } catch (_) {}
        resolve({ name: file.name, type: file.type, dataUrl: dataUrl, objectUrl: objectUrl, file: file });
      };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function readFile(file) {
    if (isRemoteParseCandidate(file.name, file.type)) {
      return readFileDataUrl(file).then(function (r) {
        return {
          name: r.name,
          type: r.type,
          dataUrl: r.dataUrl,
          objectUrl: r.objectUrl,
          file: r.file,
          base64: String(r.dataUrl).split(',')[1] || '',
          remote: true,
        };
      });
    }
    return readFileText(file).then(function (r) {
      if (isLikelyPdf(r.name, r.type, r.text)) {
        return readFileDataUrl(file).then(function (r2) {
          return {
            name: r2.name,
            type: r2.type,
            dataUrl: r2.dataUrl,
            objectUrl: r2.objectUrl,
            file: r2.file,
            base64: String(r2.dataUrl).split(',')[1] || '',
            remote: true,
          };
        });
      }
      if (/^image\//.test(r.type)) {
        return readFileDataUrl(file).then(function (r2) {
          return {
            name: r2.name,
            type: r2.type,
            dataUrl: r2.dataUrl,
            objectUrl: r2.objectUrl,
            file: r2.file,
            base64: String(r2.dataUrl).split(',')[1] || '',
            remote: true,
          };
        });
      }
      return { name: r.name, type: r.type, text: r.text, remote: false };
    });
  }

  function sourceMetaFromFile(f) {
    return {
      name: f.name,
      type: f.type,
      dataUrl: f.dataUrl,
      objectUrl: f.objectUrl,
      file: f.file,
    };
  }

  function isPdfMeta(meta) {
    return isLikelyPdf(meta.name, meta.type || '', '') || meta.type === 'application/pdf';
  }

  function renderInlinePreview(meta, previewEl) {
    if (!previewEl) return;
    var url = meta.objectUrl || meta.dataUrl;
    previewEl.innerHTML = '';
    if (!url) { previewEl.style.display = 'none'; return; }
    previewEl.style.display = 'block';
    var wrap = document.createElement('div');
    wrap.className = 'yy-import-preview';
    var hd = document.createElement('div');
    hd.className = 'yy-import-preview-hd';
    hd.innerHTML = '📄 原件预览 <span></span>';
    hd.querySelector('span').textContent = meta.name || '';
    var body = document.createElement('div');
    body.className = 'yy-import-preview-body';
    if (isPdfMeta(meta)) {
      var iframe = document.createElement('iframe');
      iframe.title = meta.name || 'PDF';
      iframe.src = url + '#view=FitH';
      body.appendChild(iframe);
    } else {
      var img = document.createElement('img');
      img.alt = meta.name || '导入照片';
      img.src = url;
      body.appendChild(img);
    }
    wrap.appendChild(hd);
    wrap.appendChild(body);
    previewEl.appendChild(wrap);
  }

  function emitSourcePreview(meta, opts, previewEl) {
    if (opts.showPreview) renderInlinePreview(meta, previewEl);
    if (typeof opts.onSourcePreview === 'function') opts.onSourcePreview(meta);
  }

  function parseRemoteFile(meta, opts) {
    if (!global.fetch) {
      return Promise.resolve({ ok: false, error: '当前环境无法调用解析 API' });
    }
    return fetch('/api/plugin/parse-table', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: meta.name,
        mime: meta.type || 'application/octet-stream',
        fileBase64: meta.base64,
        slot: opts.slot || 'fee_list',
      }),
    }).then(function (x) { return x.json(); });
  }

  function prefersMobileActions(opts) {
    if (opts.cameraCapture === false) return false;
    if (opts.cameraCapture === true) return true;
    try {
      return global.matchMedia('(max-width: 768px)').matches ||
        global.matchMedia('(pointer: coarse)').matches;
    } catch (_) { return false; }
  }

  function mount(el, opts) {
    opts = opts || {};
    var root = typeof el === 'string' ? document.querySelector(el) : el;
    if (!root) return;

    var mobileUi = prefersMobileActions(opts);
    var accept = esc(opts.accept || DEFAULT_ACCEPT);
    root.className = (root.className || '') + ' yy-import' + (mobileUi ? ' yy-import--mobile' : '');

    var actionsHtml = mobileUi
      ? '<div class="yy-import-actions">' +
          '<button type="button" class="yy-import-btn yy-import-btn-cam">' +
            '📷 拍照识别<small>对着费用表拍</small></button>' +
          '<button type="button" class="yy-import-btn yy-import-btn-file">' +
            '📂 选 PDF/表格<small>相册或文件</small></button>' +
        '</div>' +
        '<input type="file" class="yy-import-camera" accept="image/*" capture="environment" hidden>' +
        '<input type="file" class="yy-import-input" multiple accept="' + accept + '" hidden>'
      : '';

    var dropInputHtml = mobileUi
      ? ''
      : '<input type="file" class="yy-import-input" multiple accept="' + accept + '" hidden>';

    root.innerHTML =
      actionsHtml +
      '<div class="yy-import-drop" tabindex="0" role="button">' +
        '<span class="yy-import-ico">' + (mobileUi ? '📥' : '📂') + '</span>' +
        '<span class="yy-import-label"><strong>' + (mobileUi ? '或点此处选文件' : '导入数据') + '</strong> · ' +
          esc(opts.hint || (mobileUi ? 'PDF / Excel / 照片' : '拖入 CSV / Excel 另存 CSV / PDF / JSON / 图片，或点击选择')) +
        '</span>' +
        dropInputHtml +
      '</div>' +
      '<div class="yy-import-status"></div>' +
      '<div class="yy-import-preview-slot"></div>' +
      '<div class="yy-import-thumb"></div>';

    var drop = root.querySelector('.yy-import-drop');
    var input = root.querySelector('.yy-import-input');
    var cameraInput = root.querySelector('.yy-import-camera');
    var status = root.querySelector('.yy-import-status');
    var previewSlot = root.querySelector('.yy-import-preview-slot');
    var thumb = root.querySelector('.yy-import-thumb');

    if (mobileUi) {
      var btnCam = root.querySelector('.yy-import-btn-cam');
      var btnFile = root.querySelector('.yy-import-btn-file');
      if (btnCam && cameraInput) btnCam.addEventListener('click', function (e) { e.stopPropagation(); cameraInput.click(); });
      if (btnFile && input) btnFile.addEventListener('click', function (e) { e.stopPropagation(); input.click(); });
      if (cameraInput) cameraInput.addEventListener('change', function () { handleFiles(cameraInput.files); cameraInput.value = ''; });
    }

    function setStatus(msg, kind) {
      status.textContent = msg;
      status.className = 'yy-import-status show' + (kind === 'warn' ? ' warn' : kind === 'err' ? ' err' : '');
    }

    function handleFiles(fileList) {
      var files = Array.prototype.slice.call(fileList || []);
      if (!files.length) return;
      setStatus('正在读取 ' + files.length + ' 个文件…', 'warn');
      Promise.all(files.map(readFile)).then(function (results) {
        var pending = results.length;
        var hadErr = false;
        function doneOne() {
          pending -= 1;
          if (pending <= 0 && hadErr && !status.textContent) setStatus('部分文件未能导入', 'warn');
        }

        results.forEach(function (f) {
          if (f.remote) {
            var isImg = /^image\//.test(f.type || '');
            var isPdf = isPdfMeta(f);
            var src = sourceMetaFromFile(f);
            if (isImg || isPdf) emitSourcePreview(src, opts, previewSlot);
            if (isImg && !opts.parseImages) {
              var im = document.createElement('img');
              im.src = f.dataUrl;
              im.alt = f.name;
              im.title = f.name;
              thumb.appendChild(im);
              if (opts.onImage) opts.onImage(src);
              else dispatch({ kind: 'image', name: f.name, dataUrl: f.dataUrl, source: src });
              setStatus('已接收图片 · ' + f.name + ' · 可前往材料导入中心做 OCR', 'warn');
              doneOne();
              return;
            }
            if (isPdf || (isImg && opts.parseImages)) {
              setStatus('已载入原件 · 正在解析 ' + f.name + '…', 'warn');
            } else {
              setStatus('正在解析 ' + f.name + '…', 'warn');
            }
            parseRemoteFile(f, opts).then(function (r) {
              if (!r.ok) {
                hadErr = true;
                var hint = r.hint ? ' · ' + r.hint : '';
                setStatus((r.error || '解析失败') + hint, 'err');
                if (isImg && opts.onImage) opts.onImage(Object.assign({}, src, { error: r.error }));
                else if (isPdf) emitSourcePreview(src, opts, previewSlot);
                doneOne();
                return;
              }
              dispatch({ kind: 'table', table: r.table, filename: f.name, engine: r.engine, parsed_remote: true, source: src });
              var eng = r.engine ? ' · ' + r.engine : '';
              setStatus('已解析 ' + r.row_count + ' 行 · ' + f.name + eng, 'ok');
              doneOne();
            }).catch(function (e) {
              hadErr = true;
              setStatus('解析请求失败：' + e.message, 'err');
              doneOne();
            });
            return;
          }

          if (String(f.text).indexOf('data:image/') === 0) {
            var imgSrc = { name: f.name, type: f.type, dataUrl: f.text };
            emitSourcePreview(imgSrc, opts, previewSlot);
            var img = document.createElement('img');
            img.src = f.text;
            img.alt = f.name;
            thumb.appendChild(img);
            if (opts.onImage) opts.onImage(imgSrc);
            else dispatch({ kind: 'image', name: f.name, dataUrl: f.text, source: imgSrc });
            setStatus('已接收图片 · ' + f.name, '');
            doneOne();
            return;
          }

          var name = (f.name || '').toLowerCase();
          if (name.endsWith('.json')) {
            try {
              var data = JSON.parse(f.text);
              dispatch({ kind: 'json', data: data, filename: f.name });
              setStatus('已导入 JSON · ' + f.name);
            } catch (e) {
              hadErr = true;
              setStatus('JSON 解析失败：' + e.message, 'err');
            }
            doneOne();
            return;
          }

          var table = parseTableText(f.text);
          if (table._reject === 'pdf_as_text') {
            hadErr = true;
            setStatus('PDF 不能直接当文本读 · 请确保 L1 解析服务已启动（bash prototype/ppstructure/run.sh）', 'err');
            doneOne();
            return;
          }
          if (!table.rows.length) {
            hadErr = true;
            setStatus('未识别到表格行：' + f.name, 'warn');
            doneOne();
            return;
          }
          var usable = table.rows.filter(function (row) {
            return pickSmart(row, table.headers, 'name');
          }).length;
          dispatch({ kind: 'table', table: table, filename: f.name });
          if (usable === 0) {
            setStatus('已读 ' + table.rows.length + ' 行但列名未匹配 · 请检查表头或改用 CSV/PDF', 'warn');
          } else {
            setStatus('已导入 ' + usable + ' 行 · ' + f.name + (table.sep === '\t' ? ' (TSV)' : ' (CSV)'), usable < table.rows.length ? 'warn' : 'ok');
          }
          doneOne();
        });
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

    drop.addEventListener('click', function () { if (input) input.click(); });
    drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (input) input.click(); } });
    if (input) input.addEventListener('change', function () { handleFiles(input.files); input.value = ''; });
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
      var name = pickSmart(row, h, 'name') || row[h[0]] || '';
      var spec = pickSmart(row, h, 'spec') || '—';
      var qty = pickSmart(row, h, 'qty') || '1';
      var unit = pickSmart(row, h, 'unit') || '盒';
      var usage = pickSmart(row, h, 'usage') || '';
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
        item_name: pickSmart(row, h, 'name') || row[h[1]] || '',
        qty: Number(pickSmart(row, h, 'qty')) || 1,
        amount: Number(String(pickSmart(row, h, 'amount')).replace(/[^\d.]/g, '')) || 0,
        trace_code: pickSmart(row, h, 'trace') || '—',
        settle_date: pickSmart(row, h, 'date') || '2026-06-16',
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
    var dx = pickSmart(row, h, 'diagnosis');
    var icd = pickSmart(row, h, 'icd');
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
    pickSmart: pickSmart,
    isLikelyPdf: isLikelyPdf,
    renderInlinePreview: renderInlinePreview,
    prefersMobileActions: prefersMobileActions,
    ALIASES: ALIASES,
  };
})(typeof window !== 'undefined' ? window : global);
