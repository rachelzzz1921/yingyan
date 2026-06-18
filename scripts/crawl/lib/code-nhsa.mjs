import { fetchText } from './fetch.mjs';

export async function fetchCodeNhsaPdfUrl(sysflag) {
  const url = `https://code.nhsa.gov.cn/search.html?sysflag=${sysflag}`;
  const html = await fetchText(url, {
    headers: { Referer: 'https://code.nhsa.gov.cn/' },
  });
  const pdfM = html.match(/id=["']pdfId["'][^>]*href=["']([^"']+)["']/i)
    || html.match(/downloadFileByUser\.html\?path=[^"']+/i);
  const pdfUrl = pdfM
    ? (pdfM[1] || pdfM[0]).startsWith('http')
      ? (pdfM[1] || pdfM[0])
      : `https://code.nhsa.gov.cn${(pdfM[1] || pdfM[0]).replace(/^\//, '/')}`
    : null;
  const titleM = html.match(/<title>([^<]+)<\/title>/i);
  return {
    url: pdfUrl,
    title: titleM?.[1]?.trim() || `医保编码维护${sysflag}`,
    pageUrl: url,
    sysflag,
  };
}

export async function enumerateCodeNhsaSeeds(sysflags = []) {
  const out = [];
  for (const sf of sysflags) {
    try {
      const info = await fetchCodeNhsaPdfUrl(sf);
      if (info.url) out.push(info);
    } catch (e) {
      out.push({ sysflag: sf, error: e.message, pageUrl: `https://code.nhsa.gov.cn/search.html?sysflag=${sf}` });
    }
  }
  return out;
}
