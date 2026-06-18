import * as cheerio from 'cheerio';
import { fetchText, resolveUrl } from './fetch.mjs';
import { extractDocNo, extractPublishDate, stripHtmlText } from './normalize.mjs';

export async function fetchArticle(url) {
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const title = ($('meta[name="ArticleTitle"]').attr('content')
    || $('h1').first().text()
    || $('title').text() || '').trim();
  const bodySel = $('.article-content, .content, .TRS_Editor, #zoom, .zoom, .article');
  let bodyHtml = '';
  bodySel.each((_, el) => {
    const h = $(el).html() || '';
    if (h.length > bodyHtml.length) bodyHtml = h;
  });
  if (!bodyHtml) bodyHtml = $('body').html() || '';
  const text = stripHtmlText(bodyHtml);
  const attachments = extractAttachments($, url, html);
  return {
    url,
    title,
    text,
    bodyHtml,
    docNo: extractDocNo(title + text),
    publishDate: extractPublishDate(html, url),
    attachments,
  };
}

function parseCdataRecords(html, baseUrl) {
  const articles = [];
  const seen = new Set();
  const re = /<record><!\[CDATA\[([\s\S]*?)\]\]><\/record>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const block = m[1];
    const hrefM = block.match(/href=['"]([^'"]*\/art\/[^'"]+)['"]/i);
    if (!hrefM) continue;
    const abs = resolveUrl(baseUrl, hrefM[1]);
    if (!abs || seen.has(abs)) continue;
    const titleM = block.match(/title=['"]([^'"]+)['"]/) || block.match(/<a[^>]*>([^<]{4,})<\/a>/);
    const title = (titleM?.[1] || '').trim();
    seen.add(abs);
    articles.push({ url: abs, title });
  }
  return articles;
}

export async function crawlList(seed) {
  const articles = [];
  const seen = new Set();
  const filterRe = seed.filter ? new RegExp(seed.filter) : null;
  const maxPages = seed.maxPages || 2;
  const maxArticles = seed.maxArticles || 10;

  for (let page = 0; page < maxPages; page++) {
    const listUrl = page === 0
      ? seed.url
      : seed.url.replace(/index\.html$/, `index_${page}.html`);
    let html;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        html = await fetchText(listUrl);
        break;
      } catch (e) {
        if (attempt === 1) html = null;
      }
    }
    if (!html) break;

    const fromCdata = parseCdataRecords(html, listUrl);
    const $ = cheerio.load(html);
    const fromDom = [];
    $('a[href]').each((_, a) => {
      const href = $(a).attr('href');
      const label = $(a).text().trim();
      const abs = resolveUrl(listUrl, href);
      if (!abs || !/\/art\/\d{4}\//.test(abs)) return;
      fromDom.push({ url: abs, title: label });
    });

    for (const art of [...fromCdata, ...fromDom]) {
      if (seen.has(art.url)) continue;
      if (filterRe && !filterRe.test(art.title)) continue;
      seen.add(art.url);
      articles.push(art);
    }
    if (articles.length >= maxArticles) break;
  }
  return articles.slice(0, maxArticles);
}

function extractAttachments($, baseUrl, rawHtml = '') {
  const out = [];
  const seen = new Set();
  const add = (abs, label, extHint = '') => {
    if (!abs || seen.has(abs)) return;
    seen.add(abs);
    let ext = extHint;
    const em = abs.match(/\.(xlsx|xls|pdf|docx?)(?:\?|$)/i);
    if (em) ext = em[1].toLowerCase();
    else if (/xlsx|xls/i.test(label + abs)) ext = 'xlsx';
    else if (/pdf/i.test(label + abs)) ext = 'pdf';
    out.push({ url: abs, label, ext });
  };

  $('a[href]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const label = $(a).text().trim();
    const abs = resolveUrl(baseUrl, href);
    const isAttach = /downfile\.jsp|\.xlsx?|\.pdf|\.docx?/i.test(href)
      || /附件|下载|\.xls|\.pdf/i.test(label + href);
    if (!isAttach) return;
    add(abs, label);
  });

  if (rawHtml) {
    const downRe = /href="([^"]*downfile\.jsp[^"]+)"/gi;
    let dm;
    while ((dm = downRe.exec(rawHtml)) !== null) {
      add(resolveUrl(baseUrl, dm[1]), '附件');
    }
  }
  return out;
}

export { extractAttachments };
