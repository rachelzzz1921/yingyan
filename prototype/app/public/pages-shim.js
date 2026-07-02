/**
 * GitHub Pages 静态预览：拦截 /api/* 请求，改读构建时烘焙的 api-static JSON。
 * 仅在 *.github.io 上生效；本地 node server.js 不受影响。
 */
(function () {
  if (!location.hostname.endsWith('github.io')) return;

  const seg = location.pathname.split('/').filter(Boolean)[0];
  const BASE = seg ? '/' + seg : '';
  const API = BASE + '/api-static';
  const orig = window.fetch.bind(window);

  function jsonResponse(obj, status) {
    return new Response(JSON.stringify(obj), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  function previewWrite(path) {
    return jsonResponse({
      ok: false,
      preview: true,
      message: 'GitHub Pages 为只读演示预览，写入类操作请在本地 node server.js 使用',
      path,
    });
  }

  function staticPath(url) {
    const u = new URL(url, location.origin);
    const p = u.pathname.replace(BASE, '') || u.pathname;

    if (p === '/api/health') return API + '/health.json';
    if (p === '/api/rules') return API + '/rules.json';
    if (p === '/api/cases') return API + '/cases.json';
    if (p === '/api/caseobject') return API + '/caseobject.json';
    if (p === '/api/bench') return API + '/bench.json';
    if (p === '/api/yhf') return API + '/yhf.json';
    if (p === '/api/institution') return API + '/institution.json';
    if (p === '/api/rule-governance') return API + '/rule-governance.json';
    if (p === '/api/tasks') return API + '/tasks.json';
    if (p === '/api/kb/status') return API + '/kb-status.json';
    if (p === '/api/maturity') return API + '/maturity.json';
    if (p === '/api/review') return API + '/review.json';
    if (p === '/api/rule-precipitation') return API + '/rule-precipitation.json';
    if (p === '/api/docs') return API + '/docs/index.json';
    if (p === '/api/eval/status') return API + '/eval-status.json';
    if (p === '/api/eval-drafts') return API + '/eval-drafts.json';
    if (p === '/api/brand/gpt-v2') return API + '/brand-gpt-v2.json';
    if (p === '/api/governance/sync/status') return API + '/governance-sync-status.json';
    if (p === '/api/audit/batch') return API + '/audit-batch.json';
    if (p === '/api/connectors') return API + '/connectors.json';
    if (p === '/api/intake/slots') return API + '/intake-slots.json';
    if (p === '/api/priority/rank') return API + '/priority-rank.json';
    if (p === '/api/priority/config') return API + '/priority-config.json';
    if (p === '/api/history') return API + '/history.json';
    if (p === '/api/report/violation-summary') return API + '/violation-summary.json';
    if (p === '/api/checklist/national-2026-self/map') {
      const id = u.searchParams.get('case_id') || 'main';
      return API + '/checklist/national-2026-self-map-' + encodeURIComponent(id) + '.json';
    }

    if (p === '/api/case') {
      const id = u.searchParams.get('id') || 'main';
      return API + '/cases/' + encodeURIComponent(id) + '.json';
    }
    if (p === '/api/rectification') {
      const id = u.searchParams.get('case_id') || 'main';
      return API + '/rectification/' + encodeURIComponent(id) + '.json';
    }
    if (p.startsWith('/api/docs/')) {
      const id = decodeURIComponent(p.slice('/api/docs/'.length));
      const full = u.searchParams.get('full') === '1' ? '-full' : '';
      return API + '/docs/' + encodeURIComponent(id) + full + '.json';
    }
    if (p.startsWith('/api/audit/batch/')) {
      const rest = p.slice('/api/audit/batch/'.length);
      if (rest.includes('/export')) return null;
      return API + '/audit-batch/' + encodeURIComponent(rest) + '.json';
    }
    if (p.startsWith('/api/cases/')) {
      const id = decodeURIComponent(p.slice('/api/cases/'.length).replace(/\/imports$/, ''));
      const imports = p.endsWith('/imports') ? '-imports' : '';
      return API + '/case-details/' + encodeURIComponent(id) + imports + '.json';
    }
    return null;
  }

  function auditFile(url, body) {
    const u = new URL(url, location.origin);
    const mode = u.searchParams.get('mode') || 'default';
    const caseId = body.caseId || body.record?.case_meta?.case_id || 'main';
    const inject = body.inject ? '-inject' : '';
    const modePart = mode && mode !== 'default' ? '-' + mode : '';
    return API + '/audit/' + encodeURIComponent(caseId) + modePart + inject + '.json';
  }

  window.fetch = function (url, opts) {
    opts = opts || {};
    const href = typeof url === 'string' ? url : (url && url.url) || '';
    if (!href.startsWith('/api/') && !href.startsWith(BASE + '/api/')) {
      return orig(url, opts);
    }

    const method = (opts.method || 'GET').toUpperCase();

    if (href.includes('/api/audit') && method === 'POST' && !href.includes('/api/audit/batch')) {
      let body = {};
      try { body = opts.body ? JSON.parse(opts.body) : {}; } catch (_) {}
      const file = auditFile(href, body);
      return orig(file).then(function (r) {
        if (r.ok) return r;
        return orig(API + '/audit/main.json');
      });
    }

    if (method !== 'GET' && method !== 'HEAD') {
      return Promise.resolve(previewWrite(href));
    }

    const mapped = staticPath(href);
    if (mapped) return orig(mapped);

    return orig(url, opts);
  };

  document.addEventListener('DOMContentLoaded', function () {
    var bar = document.createElement('div');
    bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;padding:6px 12px;font:12px/1.4 system-ui,sans-serif;text-align:center;background:#0B2A4A;color:#e8f0fa;opacity:.92';
    bar.textContent = 'GitHub Pages 演示预览（只读）· 完整交互请本地 npm start';
    document.body.appendChild(bar);
  });
})();
