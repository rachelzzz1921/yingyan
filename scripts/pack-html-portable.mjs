#!/usr/bin/env node
/**
 * 生成静态展示导航页（相对路径，支持 file:// 双击打开）
 */
import fs from 'fs';
import path from 'path';

const dest = process.argv[2];
if (!dest) {
  console.error('用法: node pack-html-portable.mjs <静态展示目录>');
  process.exit(1);
}

const cards = [
  {
    href: '01-S4作品卷宗/yingyan-s4-interactive.html',
    tag: 'S4 作品卷宗 · 交互',
    title: '鹰眼作品卷宗',
    desc: '横向叙事 + 数据实测 + 章节导航。推荐路演首屏。',
    primary: true,
  },
  {
    href: '02-路演PPT/index.html',
    tag: '30 slides · Swiss IKB',
    title: '路演 PPT',
    desc: '键盘 ← → 翻页，按 B 切换静态模式。部分动画需联网。',
  },
  {
    href: '03-架构图/鹰眼-逻辑架构与迭代-中文版.html',
    tag: 'Mermaid · 全中文',
    title: '逻辑架构图（中文版）',
    desc: '六层流水线、双入口、ECC 环。Mermaid 已内嵌 vendor，可离线。',
  },
  {
    href: '03-架构图/鹰眼-逻辑架构与迭代.html',
    tag: 'Mermaid · 中英混排',
    title: '逻辑架构与迭代',
    desc: '英文节点版架构图，可打印。',
  },
  {
    href: '04-宣传海报/yingyan-field-posters-10.html',
    tag: '10 张 · 现场',
    title: '飞检现场宣传海报',
    desc: '十张 A3 风格海报合集（若已打包）。',
    optional: '04-宣传海报/yingyan-field-posters-10.html',
  },
  {
    href: '04-宣传海报/yingyan-print-pack/02-产品白皮书-A4打印.html',
    tag: 'A4 打印',
    title: '产品白皮书（打印版）',
    desc: 'A4 打印物料（若已打包）。',
    optional: '04-宣传海报/yingyan-print-pack/02-产品白皮书-A4打印.html',
  },
];

const visible = cards.filter((c) => {
  if (!c.optional) return true;
  return fs.existsSync(path.join(dest, c.optional));
});

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>鹰眼 · 外地演示包</title>
  <style>
    :root { --ink:#14110E; --paper:#F4F1EA; --accent:#C6402E; --muted:#6B6459; --line:#E0DACE; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "PingFang SC","Noto Sans SC",system-ui,sans-serif; background: var(--paper); color: var(--ink); min-height: 100vh; padding: 48px 24px 64px; }
    .wrap { max-width: 920px; margin: 0 auto; }
    .eyebrow { font-size: 12px; letter-spacing: .18em; text-transform: uppercase; color: var(--muted); }
    h1 { font-size: clamp(28px, 5vw, 40px); font-weight: 600; margin: 12px 0 8px; }
    .lead { font-size: 17px; line-height: 1.65; color: #525252; max-width: 52ch; margin-bottom: 28px; }
    .notice { border-left: 3px solid var(--accent); background: #fff; padding: 14px 18px; margin-bottom: 32px; font-size: 15px; line-height: 1.6; color: #404040; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
    a.card { display: block; text-decoration: none; color: inherit; background: #fff; border: 1px solid var(--line); padding: 24px; transition: border-color .15s, box-shadow .15s; }
    a.card:hover { border-color: var(--accent); box-shadow: 0 8px 28px rgba(198,64,46,.1); }
    a.card.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
    a.card.primary .tag { color: rgba(255,255,255,.75); }
    a.card.primary p { color: rgba(255,255,255,.9); }
    .tag { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); margin-bottom: 10px; }
    .card h2 { font-size: 20px; font-weight: 600; margin-bottom: 8px; }
    .card p { font-size: 15px; line-height: 1.55; color: var(--muted); }
    .foot { margin-top: 40px; font-size: 13px; color: var(--muted); line-height: 1.7; }
  </style>
</head>
<body>
  <div class="wrap">
    <p class="eyebrow">Yingyan · Portable Pack</p>
    <h1>鹰眼 · 外地演示包</h1>
    <p class="lead">解压后<strong>双击本页</strong>即可浏览。下方卡片均为相对路径，U 盘 / 微信传文件均可。</p>
    <div class="notice">
      若从 IDE 里打开 .html 看到的是源代码，请用 <strong>Chrome / Edge / Safari</strong> 直接打开本文件。
      完整稽核工作台见上级目录「完整交互原型」→ 需 Node.js 一键启动。
    </div>
    <div class="grid">
${visible.map((c) => `      <a class="card${c.primary ? ' primary' : ''}" href="${c.href}">
        <div class="tag">${c.tag}</div>
        <h2>${c.title}</h2>
        <p>${c.desc}</p>
      </a>`).join('\n')}
    </div>
    <div class="foot">
      <p>在线演示（有网）：<a href="https://yingyan.vercel.app/" style="color:var(--accent)">yingyan.vercel.app</a></p>
      <p style="margin-top:8px">PPT 部分动效依赖 Google Fonts / Lucide CDN；架构图 Mermaid 已本地化。</p>
    </div>
  </div>
</body>
</html>
`;

fs.writeFileSync(path.join(dest, '打开演示.html'), html, 'utf8');
console.log('  写入 打开演示.html');
