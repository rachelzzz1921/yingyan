#!/usr/bin/env node
/** Assemble 鹰眼 Swiss deck into docs/deliverables/ppt/index.html */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deckPath = path.join(root, 'docs/deliverables/ppt/index.html');
const templatePath = path.join(process.env.HOME || '', '.agents/skills/guizang-ppt-skill/assets/template-swiss.html');
fs.copyFileSync(templatePath, deckPath);
let html = fs.readFileSync(deckPath, 'utf8');

html = html.replace(
  /<title>.*?<\/title>/,
  '<title>鹰眼 · 医保基金稽核智能体 · Deck</title>'
);

const NN = 30;

function chrome(n, tag) {
  return `<div class="chrome-min"><div class="l">鹰眼 YINGYAN · ${tag}</div><div class="r">${String(n).padStart(2, '0')} / ${NN}</div></div>`;
}

const slides = [
  // 1 Cover
  `<section class="slide accent" data-layout="S01" data-animate="hero">
  <div class="canvas-card">
    <canvas class="ascii-bg" aria-hidden="true"></canvas>
    ${chrome(1, 'COVER')}
    <div style="flex:1;padding:0;display:grid;grid-template-rows:auto 1fr auto;gap:2.6vh">
      <div data-anim="kicker" class="t-meta" style="color:rgba(255,255,255,.78);letter-spacing:.22em">MEDICAL INSURANCE AUDIT · AI AGENT</div>
      <h1 data-anim="title" style="align-self:start;font-family:var(--sans),var(--sans-zh);font-weight:200;font-size:min(10vw,17vh);line-height:.94;letter-spacing:-.025em;color:#fff">鹰眼<br/><span style="font-style:italic;font-weight:300">医保基金稽核智能体</span></h1>
      <div data-anim="bottom" style="display:grid;gap:1.6vh;border-top:1px solid rgba(255,255,255,.22);padding-top:2vh">
        <div class="lead" style="max-width:52ch;color:rgba(255,255,255,.86);font-weight:300;font-size:max(18px,1.1vw)">90 秒输出可对质的三要素证据链 · 宁漏报不误报 · iter-36</div>
        <div class="t-meta" style="color:rgba(255,255,255,.6)">2026-06 · 黑客松 Demo · → 方向键翻页</div>
      </div>
    </div>
  </div>
</section>`,

  // 2 Statement
  `<section class="slide dark" data-layout="S09" data-animate="statement-rise">
  <div class="canvas-card">
    ${chrome(2, 'STATEMENT')}
    <h1 class="h-statement" style="font-family:var(--sans),var(--sans-zh);font-weight:200;font-size:min(8vw,14vh);line-height:.95;margin-top:8vh">
      <span>引不出原文的疑点，</span><br/><span style="font-style:italic;font-weight:300">我们不输出。</span>
    </h1>
    <span class="t-meta" style="margin-top:auto;opacity:.7">— 稽核结论要对质医院，可信度是硬通货</span>
  </div>
</section>`,

  // 3 Split positioning
  `<section class="slide split" data-layout="S03" data-animate="split-reveal">
  <div class="canvas-card cover-split">
    <div class="half cover-ink" style="background:var(--ink);color:var(--paper);padding:5.6vh 3.6vw">
      <span class="t-cat">WHAT WE ARE</span>
      <h2 class="h-xl-zh" style="font-weight:200;font-size:min(5.8vw,10vh);margin-top:2vh">事后行政查处<br/>AI 初筛员</h2>
      <p style="font-size:18px;line-height:1.6;margin-top:3vh;opacity:.85">飞检 · 专项稽核 · 案卷复核<br/>读懂扫描件与非结构化病历</p>
    </div>
    <div class="half" style="padding:5.6vh 3.6vw">
      <span class="t-cat">WHAT WE ARE NOT</span>
      <h2 class="h-xl-zh" style="font-weight:200;font-size:min(5.2vw,9vh);margin-top:2vh;color:var(--grey-3)">不是院端实时拦截<br/>不是经办结算引擎</h2>
      <p style="font-size:18px;line-height:1.6;margin-top:3vh;color:var(--text-secondary)">国家系统强在结构化筛查；鹰眼是稽核员手里的<strong>取证放大镜</strong></p>
    </div>
  </div>
</section>`,

  // 4 Why Now
  `<section class="slide light" data-layout="S18" data-animate="grid-reveal">
  <div class="canvas-card">
    ${chrome(4, 'WHY NOW')}
    <div style="flex:1;padding:0;display:grid;grid-template-rows:auto 1fr;gap:3vh">
      <div><div class="t-meta">TRIPLE VALIDATION</div><h2 class="h-xl-zh" style="font-weight:200;font-size:min(5.8vw,10vh);margin-top:1vh">一条被验证过三次的路</h2></div>
      <div class="why-now-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
        <article class="card-fill" style="padding:24px"><div class="t-cat">政策</div><p style="font-size:18px;margin-top:12px;font-weight:500">2026 细则 7 号令 · AI+医保监管</p><p style="font-size:16px;margin-top:8px;color:var(--text-secondary)">两库 1.0 · 79 条框架</p></article>
        <article class="card-fill" style="padding:24px"><div class="t-cat">商业</div><p style="font-size:18px;margin-top:12px;font-weight:500">Alaffia 美国验证</p><p style="font-size:16px;margin-top:8px;color:var(--text-secondary)">可回链原文 · 按追回分成</p></article>
        <article class="card-accent" style="padding:24px"><div class="t-cat">地方</div><p style="font-size:18px;margin-top:12px;font-weight:500">江苏需求已在场</p><p style="font-size:16px;margin-top:8px;color:rgba(255,255,255,.85)">苏州 AI 比对耗材真实性</p></article>
      </div>
    </div>
  </div>
</section>`,

  // 5 KPI
  `<section class="slide grey" data-layout="S06" data-animate="tower-grow">
  <div class="canvas-card">
    ${chrome(5, 'DATA HERO')}
    <div class="t-meta">PAIN → PROMISE</div>
    <h2 class="h-xl-zh" style="font-weight:200;font-size:min(5.2vw,9vh);margin:1.4vh 0 3vh">把 40 分钟变成 90 秒</h2>
    <div class="kpi-tower-row" style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;align-items:end">
      <div class="tower-col card-fill" style="padding:20px"><span class="num-mega accent" style="font-size:min(8vw,14vh);font-weight:200">342</span><span style="font-size:16px;display:block;margin-top:8px">亿元 · 2025 全国追回</span><div class="bar-tower" style="--h:28vh;background:var(--accent);width:100%;margin-top:16px"></div></div>
      <div class="tower-col card-fill" style="padding:20px"><span class="num-mega" style="font-size:min(8vw,14vh);font-weight:200">40</span><span style="font-size:16px;display:block;margin-top:8px">分钟 · 人工单份</span><div class="bar-tower" style="--h:32vh;background:var(--grey-2);width:100%;margin-top:16px"></div></div>
      <div class="tower-col card-accent" style="padding:20px"><span class="num-mega" style="font-size:min(8vw,14vh);font-weight:200;color:#fff">90</span><span style="font-size:16px;display:block;margin-top:8px;color:rgba(255,255,255,.9)">秒 · 鹰眼初筛</span><div class="bar-tower" style="--h:12vh;background:rgba(255,255,255,.35);width:100%;margin-top:16px"></div></div>
    </div>
  </div>
</section>`,

  // 6 Compare
  `<section class="slide light" data-layout="S08" data-animate="duo-compare">
  <div class="canvas-card">
    ${chrome(6, 'COMPARE')}
    <div class="t-meta">POSITIONING</div>
    <h2 class="h-xl-zh" style="font-weight:200;font-size:min(5.2vw,9vh);margin:1vh 0 3vh">国家系统 × 语义增强层</h2>
    <div class="duo-compare" style="display:grid;grid-template-columns:1fr 2px 1fr;gap:24px;flex:1">
      <div><h3 style="font-size:20px;font-weight:500;margin-bottom:16px">传统 / 国家智能监管</h3><ul style="font-size:18px;line-height:1.8;color:var(--text-secondary);list-style:none"><li>— 结构化结算流水</li><li>— 已编码规则大规模筛查</li><li>— 字段比对为主</li></ul></div>
      <div class="vrule" style="background:var(--border-subtle)"></div>
      <div><h3 style="font-size:20px;font-weight:500;color:var(--accent);margin-bottom:16px">鹰眼</h3><ul style="font-size:18px;line-height:1.8;list-style:none"><li>— 扫描件 / 自由文本语义</li><li>— 三要素强制证据链</li><li>— 控辩裁 · 对抗鲁棒 E-503</li></ul></div>
    </div>
  </div>
</section>`,

  // 7 System diagram
  `<section class="slide dark" data-layout="S17" data-animate="grid-reveal">
  <div class="canvas-card">
    ${chrome(7, 'SYSTEM')}
    <div class="t-meta">ARCHITECTURE</div>
    <h2 class="h-xl-zh" style="font-weight:200;font-size:min(5.2vw,9vh);margin:1vh 0 2vh">六层流水线 + 横向门禁</h2>
    <div class="system-diagram" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;font-size:16px">
      <div class="card-outlined" style="padding:16px">L1 输入<br/><span style="color:var(--text-secondary)">ingest · intake</span></div>
      <div class="card-outlined" style="padding:16px">L2 事实层<br/><span style="color:var(--text-secondary)">Case Object</span></div>
      <div class="card-outlined" style="padding:16px">L3 知识<br/><span style="color:var(--text-secondary)">KB1 · KB2</span></div>
      <div class="card-accent" style="padding:16px">L4 规则<br/><span style="opacity:.9">58 在库 · 触发器路由</span></div>
      <div class="card-outlined" style="padding:16px">L5 验证<br/><span style="color:var(--text-secondary)">三要素 · 控辩裁</span></div>
      <div class="card-outlined" style="padding:16px">L6 输出<br/><span style="color:var(--text-secondary)">报告 · 清单</span></div>
    </div>
    <p class="t-meta nav-safe-bottom" style="margin-top:3vh">横向：AuditBench 20 · YHF G0 · Priority v2 · Governance</p>
  </div>
</section>`,

  // 8 Three layers ingest
  `<section class="slide light" data-layout="S05" data-animate="sub-stack">
  <div class="canvas-card">
    ${chrome(8, 'THREE LAYERS')}
    <div class="grid-2-9" style="display:grid;grid-template-columns:1fr 1.2fr;gap:32px;flex:1">
      <div><span class="t-cat">L1–L3</span><h2 class="h-xl-zh" style="font-weight:200;font-size:min(5vw,8.5vh);margin-top:1vh">从材料到可判事实</h2><p class="lead" style="font-size:18px;margin-top:2vh;color:var(--text-secondary)">每条事实自带 anchor · OCR 置信度传播</p></div>
      <div class="sub-card-stack" style="display:flex;flex-direction:column;gap:12px">
        <article class="card-fill sub-card" style="padding:20px"><span class="big-num">01</span><h4 style="font-size:18px;margin:8px 0">摄取 Intake</h4><p style="font-size:16px;color:var(--text-secondary)">PDF/图片/JSON · 槽位分类 · MockHIS</p></article>
        <article class="card-fill sub-card" style="padding:20px"><span class="big-num">02</span><h4 style="font-size:18px;margin:8px 0">事实层 Case Object</h4><p style="font-size:16px;color:var(--text-secondary)">fee_lines · orders · diagnoses + bbox</p></article>
        <article class="card-fill sub-card" style="padding:20px"><span class="big-num">03</span><h4 style="font-size:18px;margin:8px 0">知识 RAG</h4><p style="font-size:16px;color:var(--text-secondary)">条例 · 目录备注 · 2025 抗肿瘤原则</p></article>
      </div>
    </div>
  </div>
</section>`,

  // 9 Rules + validation
  `<section class="slide grey" data-layout="S05" data-animate="sub-stack">
  <div class="canvas-card">
    ${chrome(9, 'L4–L5')}
    <div class="grid-2-9" style="display:grid;grid-template-columns:1fr 1.2fr;gap:32px;flex:1">
      <div><span class="t-cat">ENGINE</span><h2 class="h-xl-zh" style="font-weight:200;font-size:min(5vw,8.5vh);margin-top:1vh">规则执行与验证</h2></div>
      <div class="sub-card-stack" style="display:flex;flex-direction:column;gap:12px">
        <article class="card-accent sub-card" style="padding:20px"><h4 style="font-size:18px">触发器路由</h4><p style="font-size:16px;margin-top:8px">本案仅激活相关规则 · 90% 零成本跳过</p></article>
        <article class="card-fill sub-card" style="padding:20px"><h4 style="font-size:18px">确定性引擎 + 可选 LLM</h4><p style="font-size:16px;margin-top:8px">无 Key 回退确定性 · 已诚实标注</p></article>
        <article class="card-fill sub-card" style="padding:20px"><h4 style="font-size:18px">三态输出</h4><p style="font-size:16px;margin-top:8px">疑点 · 线索 · 不输出</p></article>
      </div>
    </div>
  </div>
</section>`,

  // 10 Timeline flow
  `<section class="slide light" data-layout="S11" data-animate="timeline-h">
  <div class="canvas-card">
    ${chrome(10, 'FLOW')}
    <div class="t-meta">REQUEST LIFECYCLE</div>
    <h2 class="h-xl-zh" style="font-weight:200;font-size:min(4.8vw,8.5vh);margin:1vh 0 4vh">单案卷稽核七步</h2>
    <div class="timeline-h" style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
      ${['导入','事实层','路由','判定','门禁','控辩裁','导出'].map((s,i)=>`<div class="tl-h-node" style="flex:1"><div class="dot" style="width:12px;height:12px;background:var(--accent);margin:0 0 12px"></div><div style="font-size:16px;font-weight:500">${s}</div></div>`).join('')}
    </div>
  </div>
</section>`,

  // 11 Six cells - three elements
  `<section class="slide dark" data-layout="S04" data-animate="six-cells">
  <div class="canvas-card">
    ${chrome(11, 'THREE ELEMENTS')}
    <div class="t-meta">EVIDENCE CHAIN</div>
    <h2 class="h-xl-zh" style="font-weight:200;font-size:min(4.8vw,8.5vh);margin:1vh 0 3vh">每条疑点三要素</h2>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
      ${[['01','证据定位','费用行 · 病历原文 · anchor'],['02','政策条款','KB 引用 · verify_status'],['03','推理过程','CoVe · 控辩裁留痕']].map(([n,t,d])=>`<article class="card-fill" style="padding:24px"><span class="cell-num accent" style="font-size:min(4vw,7vh);font-weight:200">${n}</span><h4 style="font-size:20px;margin:12px 0;font-weight:500">${t}</h4><p style="font-size:16px;color:var(--text-secondary)">${d}</p></article>`).join('')}
    </div>
  </div>
</section>`,

  // 12 Duo three states
  `<section class="slide light" data-layout="S08" data-animate="duo-compare">
  <div class="canvas-card">
    ${chrome(12, 'THREE STATES')}
    <h2 class="h-xl-zh" style="font-weight:200;font-size:min(5vw,8.5vh);margin-bottom:3vh">三态 · 对齐官方口径</h2>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
      <article class="card-accent" style="padding:24px"><h3 style="font-size:20px">疑点</h3><p style="font-size:16px;margin-top:12px">证据闭环 · 可对质</p></article>
      <article class="card-fill" style="padding:24px"><h3 style="font-size:20px">线索</h3><p style="font-size:16px;margin-top:12px">证据不全 · 需补材料</p></article>
      <article class="card-outlined" style="padding:24px"><h3 style="font-size:20px">不输出</h3><p style="font-size:16px;margin-top:12px">除外情形 · 干扰项正确不报</p></article>
    </div>
  </div>
</section>`,

  // 13 Image hero workbench
  `<section class="slide light" data-layout="S22" data-animate="grid-reveal">
  <div class="canvas-card">
    ${chrome(13, 'WORKBENCH')}
    <div class="image-hero" style="display:grid;grid-template-rows:auto 1fr auto;gap:2vh;flex:1">
      <h2 class="h-xl-zh" style="font-weight:200;font-size:min(4.6vw,8vh)">稽核工作台 · 证据点击高亮</h2>
      <div class="hero-img-wrap frame-img r-21x9" style="background:var(--grey-1);min-height:32vh;display:flex;align-items:center;justify-content:center;overflow:hidden">
        <img src="images/13-workbench.png" alt="工作台" data-image-slot="s22-hero-21x9" class="frame-img r-21x9 fit-contain" style="max-height:36vh;width:100%;object-fit:contain" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
        <div style="display:none;flex-direction:column;align-items:flex-start;justify-content:center;color:var(--text-secondary);font-size:18px;padding:24px"><span style="font-size:min(6vw,10vh);font-weight:200;color:var(--accent)">localhost:3700</span><span style="margin-top:12px">index.html · 开始稽核 · 三要素卡片</span></div>
      </div>
      <div class="hero-stats" style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
        <div><span class="num-mega accent" style="font-size:min(5vw,8vh);font-weight:200">5+1</span><span style="font-size:16px;display:block">疑点+线索 demo</span></div>
        <div><span class="num-mega" style="font-size:min(5vw,8vh);font-weight:200">0</span><span style="font-size:16px;display:block">干净件误报 G0</span></div>
        <div><span class="num-mega" style="font-size:min(5vw,8vh);font-weight:200">⚔</span><span style="font-size:16px;display:block">控辩裁降级演示</span></div>
      </div>
    </div>
  </div>
</section>`,

  // 14 Four cards workbench features
  `<section class="slide grey" data-layout="S19" data-animate="grid-reveal">
  <div class="canvas-card">
    ${chrome(14, 'FEATURES')}
    <h2 class="h-xl-zh" style="font-weight:200;font-size:min(4.8vw,8.5vh);margin-bottom:3vh">工作台能力矩阵</h2>
    <div class="four-cards" style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px">
      ${[['事实层','Case Object + anchor'],['触发器','全规则 · 本案激活子集'],['AuditBench','20 案卷评测'],['E-503','对抗注入检测'],['双模式','稽核 ↔ 体检口径'],['文书化','核查清单导出']].map(([t,d])=>`<article class="card-fill" style="padding:20px"><h4 style="font-size:18px;font-weight:500">${t}</h4><p style="font-size:16px;margin-top:8px;color:var(--text-secondary)">${d}</p></article>`).join('')}
    </div>
  </div>
</section>`,

  // 15 Brief debate
  `<section class="slide light" data-layout="S16" data-animate="grid-reveal">
  <div class="canvas-card">
    ${chrome(15, 'DEBATE')}
    <div class="t-meta">MULTI-AGENT</div>
    <h2 class="h-xl-zh" style="font-weight:200;font-size:min(4.8vw,8.5vh);margin:1vh 0 3vh">控辩裁 · 误报过滤器</h2>
    <div class="brief-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
      <article class="card-fill" style="padding:20px"><div class="t-cat">控</div><p style="font-size:16px;margin-top:8px">主张违规 · 引用 KB</p></article>
      <article class="card-fill" style="padding:20px"><div class="t-cat">辩</div><p style="font-size:16px;margin-top:8px">申诉 · 证据缺失则降级</p></article>
      <article class="card-accent" style="padding:20px"><div class="t-cat">裁</div><p style="font-size:16px;margin-top:8px">疑点→线索 · eval_draft</p></article>
    </div>
    <p style="font-size:16px;margin-top:3vh;color:var(--text-secondary)">iter-36：/api/debate 写回 review_feedback · 工作台 debate 历史</p>
  </div>
</section>`,

  // 16 Priority intro
  `<section class="slide dark" data-layout="S17" data-animate="grid-reveal">
  <div class="canvas-card">
    ${chrome(16, 'PRIORITY')}
    <div class="t-meta">SECOND MAINLINE</div>
    <h2 class="h-xl-zh" style="font-weight:200;font-size:min(5vw,8.5vh);margin:1vh 0 2vh">稽核优先通路 v2</h2>
    <p class="lead" style="font-size:18px;max-width:48ch;margin-bottom:3vh">飞检上万份案卷 · api_score 排序 · 先查高风险</p>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;font-size:16px">
      <div class="card-outlined" style="padding:16px">priority.html 队列首屏</div>
      <div class="card-outlined" style="padding:16px">批量 /api/audit/batch</div>
      <div class="card-outlined" style="padding:16px">举证包 evidence-package</div>
      <div class="card-outlined" style="padding:16px">违规统计 violation-summary</div>
    </div>
  </div>
</section>`,

  // 17 KPI api_score
  `<section class="slide light" data-layout="S06" data-animate="tower-grow">
  <div class="canvas-card">
    ${chrome(17, 'API SCORE')}
    <h2 class="h-xl-zh" style="font-weight:200;font-size:min(4.6vw,8vh);margin-bottom:3vh">api_score 四维核心</h2>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
      ${[['EC','线索密度'],['AMT','涉及金额'],['SEV','严重度'],['H×B×O','历史·广度·离群']].map(([a,b])=>`<div class="card-fill" style="padding:20px"><div class="accent" style="font-size:min(4vw,7vh);font-weight:200">${a}</div><div style="font-size:16px;margin-top:8px">${b}</div></div>`).join('')}
    </div>
    <p class="t-meta nav-safe-bottom" style="margin-top:3vh;font-family:var(--mono);font-size:14px">tier↑ · api_score↓ · shadow 不计分</p>
  </div>
</section>`,

  // 18 Matrix v2
  `<section class="slide grey" data-layout="S15" data-animate="grid-reveal">
  <div class="canvas-card">
    ${chrome(18, 'V2 MATRIX')}
    <h2 class="h-xl-zh" style="font-weight:200;font-size:min(4.6vw,8vh);margin-bottom:2vh">v2 真实场景增强 · 8 项</h2>
    <div class="matrix-fill" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;font-size:14px">
      ${['violation_nature','DRG L3','特例单议','举证包','违规统计','9大领域','自查清单','双边模式'].map(x=>`<div class="matrix-cell card-fill" style="padding:12px">${x}</div>`).join('')}
    </div>
  </div>
</section>`,

  // 19 Ledger formula
  `<section class="slide light" data-layout="S20" data-animate="grid-reveal">
  <div class="canvas-card">
    ${chrome(19, 'FORMULA')}
    <h2 class="h-xl-zh" style="font-weight:200;font-size:min(4.6vw,8vh);margin-bottom:3vh">排序公式</h2>
    <div class="stacked-ledger">
      ${['tier = 1 疑点 · 2 线索 · 3 无 active','core = geometric_mean(EC, AMT, SEV)','api_score = 100 × core × HistoryPrior × Breadth × Outlier','ORDER BY tier ASC, api_score DESC'].map((r,i)=>`<div class="ledger-row card-fill" style="padding:16px 20px;margin-bottom:8px;font-family:var(--mono);font-size:16px">${r}</div>`).join('')}
    </div>
  </div>
</section>`,

  // 20 Shadow compare
  `<section class="slide dark" data-layout="S08" data-animate="duo-compare">
  <div class="canvas-card">
    ${chrome(20, 'BUCKETS')}
    <h2 class="h-xl-zh" style="font-weight:200;font-size:min(4.8vw,8.5vh);margin-bottom:3vh">队列分桶</h2>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
      <article class="card-accent" style="padding:24px"><h3 style="font-size:18px">Active</h3><p style="font-size:16px;margin-top:12px">计入 api_score · 优先稽核</p></article>
      <article class="card-fill" style="padding:24px"><h3 style="font-size:18px">Shadow</h3><p style="font-size:16px;margin-top:12px">影子规则 · 沉底观测</p></article>
      <article class="card-fill" style="padding:24px"><h3 style="font-size:18px">Boundary</h3><p style="font-size:16px;margin-top:12px">AuditBench 边界 · iter-36</p></article>
    </div>
  </div>
</section>`,

  // 21 H-bar bench
  `<section class="slide light" data-layout="S07" data-animate="hbar-grow">
  <div class="canvas-card">
    ${chrome(21, 'BENCH')}
    <h2 class="h-xl-zh" style="font-weight:200;font-size:min(4.6vw,8vh);margin-bottom:3vh">AuditBench · YHF</h2>
    <div class="h-bar-chart" style="display:flex;flex-direction:column;gap:16px">
      ${[[ '案卷数', '20', '100%'],['干净件 FP', '0', '100%'],['G0 strict', 'PASS', '95%'],['Recall L3', 'PASS', '90%']].map(([l,v,w])=>`<div class="bar-row" style="display:grid;grid-template-columns:120px 1fr 60px;align-items:center;gap:12px"><span class="bar-lbl" style="font-size:16px">${l}</span><span class="bar-fill" style="display:block;height:8px;background:var(--accent);transform-origin:left;width:${w}"></span><span style="font-size:16px;font-weight:500">${v}</span></div>`).join('')}
    </div>
  </div>
</section>`,

  // 22 Governance brief
  `<section class="slide grey" data-layout="S16" data-animate="grid-reveal">
  <div class="canvas-card">
    ${chrome(22, 'GOVERNANCE')}
    <h2 class="h-xl-zh" style="font-weight:200;font-size:min(4.6vw,8vh);margin-bottom:3vh">治理 · 三审三验</h2>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
      ${['Policy 政策审','Clinical 临床审','Engineering 工程审'].map(t=>`<article class="card-fill" style="padding:20px;font-size:16px;font-weight:500">${t}</article>`).join('')}
    </div>
    <p style="font-size:16px;margin-top:3vh;color:var(--text-secondary)">shadow_metrics · rule_governance · eval_draft 闭环</p>
  </div>
</section>`,

  // 23 Phase roadmap timeline
  `<section class="slide light" data-layout="S11" data-animate="timeline-h">
  <div class="canvas-card">
    ${chrome(23, 'ROADMAP')}
    <h2 class="h-xl-zh" style="font-weight:200;font-size:min(4.6vw,8vh);margin-bottom:4vh">Phase 4–8 迭代</h2>
    <div style="display:flex;justify-content:space-between;gap:8px">
      ${['P4 评测✅','P5 治理','P6 多模态','P7 批量','P8 生产'].map(p=>`<div style="flex:1"><div style="height:4px;background:var(--accent);margin-bottom:12px"></div><span style="font-size:16px">${p}</span></div>`).join('')}
    </div>
  </div>
</section>`,

  // 24 Vertical iter
  `<section class="slide dark" data-layout="S02" data-animate="timeline-vertical">
  <div class="canvas-card">
    ${chrome(24, 'ITER')}
    <h2 class="h-xl-zh" style="font-weight:200;font-size:min(4.6vw,8vh);margin-bottom:3vh">ECC 迭代 · iter-36</h2>
    <div style="display:flex;flex-direction:column;gap:20px">
      ${[['Evaluate','控辩裁未衔接 eval · boundary 混排'],['Correct','eval_draft · boundary_bucket · debate 历史'],['Continue','verify-36 · yhf strict PASS']].map(([t,d])=>`<div style="display:grid;grid-template-columns:140px 1fr;gap:16px;border-top:1px solid rgba(255,255,255,.15);padding-top:16px"><span class="accent" style="font-size:18px;font-weight:500">${t}</span><span style="font-size:16px;opacity:.85">${d}</span></div>`).join('')}
    </div>
  </div>
</section>`,

  // 25 Demo
  `<section class="slide light" data-layout="S22" data-animate="grid-reveal">
  <div class="canvas-card">
    ${chrome(25, 'DEMO')}
    <h2 class="h-xl-zh" style="font-weight:200;font-size:min(4.6vw,8vh)">现场 Demo 要点</h2>
    <div class="hero-img-wrap frame-img r-21x9" style="background:var(--grey-1);min-height:28vh;display:flex;align-items:center;justify-content:center;margin:2vh 0">
      <img src="images/25-priority.png" alt="优先通路" data-image-slot="s22-hero-21x9" class="fit-contain" style="max-height:30vh;width:100%;object-fit:contain" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
      <div style="display:none;flex-direction:column;align-items:flex-start;font-size:18px;color:var(--text-secondary)"><span class="accent" style="font-size:min(5vw,8vh);font-weight:200">priority.html</span><span>api_score 队列 · Top-N 批量</span></div>
    </div>
    <p style="font-size:16px">6 违规 + 2 干扰 · 重点讲「正确不报」· 控辩裁降级</p>
  </div>
</section>`,

  // 26 Jiangsu
  `<section class="slide grey" data-layout="S18" data-animate="grid-reveal">
  <div class="canvas-card">
    ${chrome(26, 'DEPLOY')}
    <h2 class="h-xl-zh" style="font-weight:200;font-size:min(4.6vw,8vh);margin-bottom:3vh">全国基线 + 江苏覆盖层</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <article class="card-fill" style="padding:24px"><h4 style="font-size:18px">基线</h4><p style="font-size:16px;margin-top:12px;color:var(--text-secondary)">条例 · 7号令 · 2025目录 · 12领域清单</p></article>
      <article class="card-accent" style="padding:24px"><h4 style="font-size:18px">江苏层</h4><p style="font-size:16px;margin-top:12px">价格目录 · DRG负面清单 · 监管指引</p></article>
    </div>
  </div>
</section>`,

  // 27 Manifesto
  `<section class="slide accent" data-layout="S12" data-animate="manifesto">
  <div class="canvas-card">
    ${chrome(27, 'MANIFESTO')}
    <h2 style="font-family:var(--sans),var(--sans-zh);font-weight:200;font-size:min(7vw,12vh);line-height:.95;color:#fff;margin-top:10vh">让每一分救命钱，<br/><span style="font-style:italic;font-weight:300">都查得有据。</span></h2>
    <p style="font-size:18px;color:rgba(255,255,255,.85);margin-top:3vh;max-width:40ch">站在官方规则库肩上的语义增强层 · 国家系统的取证放大镜</p>
  </div>
</section>`,

  // 28 Closing
  `<section class="slide split" data-layout="S10" data-animate="split-reveal">
  <div class="canvas-card closing-split cover-split">
    <div class="half cover-ink" style="background:var(--accent);color:#fff;padding:5.6vh 3.6vw">
      ${chrome(28, 'CLOSING')}
      <h2 style="font-weight:200;font-size:min(6vw,10vh);margin-top:6vh;line-height:.95">鹰眼<br/>YINGYAN</h2>
      <p style="font-size:18px;margin-top:3vh;opacity:.9">yingyan.vercel.app</p>
    </div>
    <div class="half" style="padding:5.6vh 3.6vw">
      <div class="t-cat">TAKEAWAYS</div>
      ${['90秒可对质证据链','双主线：工作台+优先队列','AuditBench 零误报红线'].map((t,i)=>`<div style="padding:2vh 0;border-top:1px solid var(--border-subtle)"><span style="font-weight:200;font-size:min(3vw,5vh);color:var(--accent)">0${i+1}</span> <span style="font-size:18px;margin-left:12px">${t}</span></div>`).join('')}
      <p class="t-meta" style="margin-top:auto;text-align:right">谢谢 · Q&A</p>
    </div>
  </div>
</section>`,

  // 29 Tech spec API
  `<section class="slide light" data-layout="S21" data-animate="grid-reveal">
  <div class="canvas-card">
    ${chrome(29, 'APPENDIX A')}
    <h2 class="h-xl-zh" style="font-weight:200;font-size:min(4.2vw,7.5vh);margin-bottom:2vh">技术附录 · 核心 API</h2>
    <div class="tech-spec" style="font-family:var(--mono);font-size:14px;line-height:1.9">
      POST /api/audit · GET /api/priority/rank<br/>
      POST /api/audit/batch · POST /api/evidence-package<br/>
      GET /api/bench · GET /api/yhf · POST /api/debate<br/>
      GET /api/export/checklist · GET /api/caseobject
    </div>
  </div>
</section>`,

  // 30 Modules
  `<section class="slide grey" data-layout="S04" data-animate="six-cells">
  <div class="canvas-card">
    ${chrome(30, 'APPENDIX B')}
    <h2 class="h-xl-zh" style="font-weight:200;font-size:min(4.2vw,7.5vh);margin-bottom:2vh">引擎模块 · 验收命令</h2>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;font-size:15px">
      ${['audit-engine.js','priority-score.js','compliance-gate.js','review-debate.js','yhf/run.sh --strict','verify-priority-pathway.js'].map(m=>`<div class="card-fill" style="padding:14px;font-family:var(--mono)">${m}</div>`).join('')}
    </div>
  </div>
</section>`,
];

const slideBlock = slides.join('\n\n');
const startMarker = '<!-- SLIDES_HERE';
const endMarker = '</div>\n\n<div id="nav">';
const startIdx = html.indexOf(startMarker);
const endIdx = html.indexOf(endMarker);
if (startIdx === -1 || endIdx === -1) {
  console.error('Could not find slide insertion markers');
  process.exit(1);
}
// Remove from first <section after marker through before </div> closing deck
const before = html.slice(0, startIdx);
const after = html.slice(endIdx);
html = before + slideBlock + '\n\n' + after;
fs.writeFileSync(deckPath, html);
console.log('Wrote', slides.length, 'slides to', deckPath);
