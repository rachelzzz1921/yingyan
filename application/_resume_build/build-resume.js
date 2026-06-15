const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, BorderStyle, WidthType, ShadingType,
  VerticalAlign, ImageRun, ExternalHyperlink, TabStopType,
} = require("docx");

const NAVY = "1F3A5F", ACCENT = "2E6BA8", GREY = "595959", LIGHT = "EAF1F8", RULE = "2E6BA8";
const FONT = "Microsoft YaHei", EN = "Arial";

const sectionHeading = (zh, en) =>
  new Paragraph({
    spacing: { before: 220, after: 90 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: RULE, space: 2 } },
    children: [
      new TextRun({ text: zh, bold: true, size: 24, color: NAVY, font: FONT }),
      new TextRun({ text: "  " + en, bold: true, size: 15, color: ACCENT, font: EN }),
    ],
  });

const entryHeader = (left, right, leftSize = 21) =>
  new Paragraph({
    spacing: { before: 130, after: 10 },
    tabStops: [{ type: TabStopType.RIGHT, position: 9350 }],
    children: [
      new TextRun({ text: left, bold: true, size: leftSize, color: "222222", font: FONT }),
      new TextRun({ text: "\t" + right, size: 16, color: GREY, font: EN }),
    ],
  });

const subLine = (text) =>
  new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text, italics: true, size: 17, color: GREY, font: FONT })] });

const bullet = (runs) =>
  new Paragraph({ numbering: { reference: "b", level: 0 }, spacing: { after: 30 },
    children: Array.isArray(runs) ? runs : [new TextRun({ text: runs, size: 18, color: "333333", font: FONT })] });

const r = (text, opts = {}) => new TextRun({ text, size: 18, color: "333333", font: FONT, ...opts });
const b = (text, opts = {}) => new TextRun({ text, size: 18, bold: true, color: "1A1A1A", font: FONT, ...opts });
const link = (text, url) =>
  new ExternalHyperlink({ link: url, children: [new TextRun({ text, size: 18, color: ACCENT, font: EN, underline: {} })] });

const photo = fs.readFileSync("assets/photo.png");

const headerTable = new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [7060, 2300],
  borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
  rows: [
    new TableRow({
      children: [
        new TableCell({
          width: { size: 7060, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
          margins: { top: 0, bottom: 0, left: 0, right: 120 },
          children: [
            new Paragraph({ spacing: { after: 30 }, children: [
              new TextRun({ text: "陈知维", bold: true, size: 46, color: NAVY, font: FONT }),
              new TextRun({ text: "  Rachel Chen", size: 22, color: ACCENT, font: EN }),
            ] }),
            new Paragraph({ spacing: { after: 40 }, children: [
              new TextRun({ text: "会计学背景 · 用 AI 工具构建并上线产品", bold: true, size: 20, color: ACCENT, font: FONT }),
            ] }),
            new Paragraph({ spacing: { after: 20 }, children: [
              new TextRun({ text: "香港中文大学 会计学（辅修计量金融 & 统计）· 懂业务、能动手做出可运行的产品原型", size: 17, color: "444444", font: FONT }),
            ] }),
            new Paragraph({ children: [
              new TextRun({ text: "+852 5775 5317   |   rachelzzz1921@gmail.com   |   常驻 香港 · 深圳", size: 17, color: "444444", font: EN }),
            ] }),
          ],
        }),
        new TableCell({
          width: { size: 2300, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
          margins: { top: 0, bottom: 0, left: 60, right: 0 },
          children: [ new Paragraph({ alignment: AlignmentType.RIGHT, children: [
            new ImageRun({ type: "png", data: photo, transformation: { width: 96, height: 120 }, altText: { title: "证件照", description: "陈知维", name: "photo" } }),
          ] }) ],
        }),
      ],
    }),
  ],
});

// 赛道匹配表
const tb = { style: BorderStyle.SINGLE, size: 4, color: "C9D9EA" };
const tbs = { top: tb, bottom: tb, left: tb, right: tb };
const trackRow = (track, ability, fill) =>
  new TableRow({ children: [
    new TableCell({ width: { size: 2300, type: WidthType.DXA }, borders: tbs, shading: { fill, type: ShadingType.CLEAR },
      margins: { top: 70, bottom: 70, left: 130, right: 100 }, verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ children: [new TextRun({ text: track, bold: true, size: 17, color: NAVY, font: FONT })] })] }),
    new TableCell({ width: { size: 7060, type: WidthType.DXA }, borders: tbs,
      margins: { top: 70, bottom: 70, left: 130, right: 120 }, verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ children: ability })] }),
  ] });

const trackTable = new Table({
  width: { size: 9360, type: WidthType.DXA }, columnWidths: [2300, 7060],
  rows: [
    new TableRow({ tableHeader: true, children: [
      new TableCell({ width: { size: 2300, type: WidthType.DXA }, borders: tbs, shading: { fill: NAVY, type: ShadingType.CLEAR }, margins: { top: 60, bottom: 60, left: 130, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "医保赛道", bold: true, size: 17, color: "FFFFFF", font: FONT })] })] }),
      new TableCell({ width: { size: 7060, type: WidthType.DXA }, borders: tbs, shading: { fill: NAVY, type: ShadingType.CLEAR }, margins: { top: 60, bottom: 60, left: 130, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "我能贡献什么", bold: true, size: 17, color: "FFFFFF", font: FONT })] })] }),
    ] }),
    trackRow("基金监管", [ r("有 "), b("审计、凭证复核、往来对账"), r(" 经验，懂业务上"), b("哪里容易出问题"), r("；可参与设计反欺诈/违规识别的核查逻辑与原型。") ], "FFFFFF"),
    trackRow("价格治理", [ r("有 "), b("成本核算、财务分析"), r(" 基础，实习中"), b("参与搭建过 AI 产品成本知识库"), r("；可参与价格/成本相关的数据梳理与原型。") ], "F6F9FC"),
    trackRow("经办服务", [ r("做过的产品都含 "), b("结构化问答 + AI 对话 + 账户体系"), r("；这套思路可迁移到医保政策问答 / 经办导办类应用。") ], "FFFFFF"),
    trackRow("数据赋能", [ r("能用 "), b("Python 做数据处理、回测与可视化看板"), r("；可参与医保数据的清洗、分析与呈现。") ], "F6F9FC"),
  ],
});

const doc = new Document({
  creator: "陈知维",
  title: "陈知维 简历 · 模法黑客松 S4 医保智能体专场",
  numbering: { config: [ { reference: "b", levels: [{ level: 0, format: LevelFormat.BULLET, text: "▸", alignment: AlignmentType.LEFT, style: { run: { color: ACCENT }, paragraph: { indent: { left: 300, hanging: 200 } } } }] } ] },
  styles: { default: { document: { run: { font: FONT, size: 18 } } } },
  sections: [ {
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 900, right: 1440, bottom: 900, left: 1440 } } },
    children: [
      headerTable,
      new Paragraph({ spacing: { after: 40 }, border: { bottom: { style: BorderStyle.SINGLE, size: 14, color: NAVY, space: 4 } }, children: [] }),

      new Paragraph({ spacing: { before: 140, after: 0 }, shading: { fill: LIGHT, type: ShadingType.CLEAR }, children: [
        new TextRun({ text: " 申请定位  ", bold: true, size: 18, color: NAVY, font: FONT }),
        new TextRun({ text: "模法黑客松 S4 · 医保智能体开发专场　|　希望参与：业务理解 + 产品/原型设计 + AI 落地", size: 18, color: "333333", font: FONT }),
      ] }),

      sectionHeading("个人简介", "PROFILE"),
      new Paragraph({ spacing: { after: 20 }, children: [
        r("香港中文大学会计学大三在读（辅修计量金融与统计）。我的特点是"),
        b("既有财务/数据的业务基础，又愿意动手把想法做出来"),
        r("：在 Claude、Cursor 等 AI 编程工具的辅助下，独立完成过 2 款 AI 网页产品的设计与上线，也做过 AI 智能体、反欺诈合规原型与量化数据分析。我不是资深工程师，更擅长"),
        b("把业务需求快速变成能跑起来的产品原型"),
        r("，并在团队里承担业务、产品、数据与演示部分。"),
      ] }),

      sectionHeading("赛道匹配 · 我能贡献什么", "TRACK FIT"),
      new Paragraph({ spacing: { after: 70 }, children: [r("本场四条赛道，我都能从业务理解或数据/原型角度参与：", { color: GREY, size: 17 })] }),
      trackTable,

      sectionHeading("代表作品 · 自主项目", "PROJECTS"),
      new Paragraph({ spacing: { after: 30 }, children: [r("以下均在 AI 工具辅助下独立或主导完成；详细可交互演示见随附作品集网页。", { italics: true, color: GREY, size: 17 })] }),

      entryHeader("易测 iCHING · AI 六爻问卜网页", "已上线"),
      bullet([ r("结构化问事 → 起卦 → 大模型生成解读 → 历史记录，含账户与会员体系；前后端与上线部署独立完成。") ]),
      bullet([ r("线上："), link("yice.47-237-68-213.sslip.io", "https://yice.47-237-68-213.sslip.io/"), r("　·　可类比迁移为医保政策问答 / 经办导办类应用。", { color: GREY, size: 16 }) ]),

      entryHeader("MIRROR / LoveCompass · AI 关系测评网页", "已上线"),
      bullet([ r("三层测评 + AI 对话建议；题库、评分、Prompt 模板都放在后台可改，不用改代码就能调整内容。") ]),
      bullet([ r("线上："), link("47-237-68-213.sslip.io", "https://47-237-68-213.sslip.io/") ]),

      entryHeader("HomeTree · 中銀香港創新先驅大賽 2026 参赛作品", "参赛 · 方案与原型"),
      bullet([ r("跨境结算方向，做了一个 "), b("AI 合规预审原型"), r("：KYC、反洗钱筛查、自动对账、风险评分 + 人工复核兜底——和医保反欺诈/智能核查思路相近。我负责方案撰写与原型设计。") ]),

      entryHeader("AgentFlux · AI Agent 信息网络（Demo）", "概念验证"),
      bullet([ r("一个让多个 AI Agent 通过网关交换信息、按意图匹配的小型 Demo，跑通了端到端流程。") ]),

      entryHeader("量化选股模型 · Python 数据分析", "自学项目"),
      bullet([ r("用 Python 做沪深300/中证500 的数据下载、选股回测与可视化看板，体现数据处理与分析能力。") ]),

      sectionHeading("实习经历", "EXPERIENCE"),
      entryHeader("深圳如帆科技（RFone）— 财会管理助理 · 科技部", "2025.07 – 2025.08"),
      bullet([ r("用 Python 与 AI 工具协助自动化部分财务及外贸流程；参与搭建产品成本知识库，推动财务流程数字化。") ]),
      entryHeader("香港 MagaHub 天汇财经 / 深圳点证科技 — 销售部 · 香港特派代表", "2025.05 – 2025.06"),
      bullet([ r("作为香港代表对接 "), b("博时基金、浙商银行、金证股份"), r(" 等 B 端金融客户；参与中信建投 App 更新项目投标。") ]),
      entryHeader("深圳市四维智成咨询有限公司 — 财务会计实习生 · 财务部", "2024.12 – 2025.03"),
      bullet([ r("日常会计核算与凭证复核、往来对账、差异分析；参与所得税汇算清缴。"), r("（与基金监管/合规相关）", { color: GREY, size: 16 }) ]),

      sectionHeading("教育背景 · 竞赛 · 技能 · 语言", "EDUCATION & MORE"),
      bullet([ b("香港中文大学　"), r("会计学学士 · 商学院 · 辅修 计量金融学 & 统计学　"), r("2023.09 – 2027.06", { color: GREY, size: 16 }) ]),
      bullet([ b("技能与工具："), r("项目中使用过 React / Next.js、Node / Express、PostgreSQL / Redis、Docker，以及大模型 API（通义千问、智谱、OpenAI / Claude）；Python、财务建模、Excel / PowerPoint、Adobe Illustrator；均借助 AI 编程工具完成。") ]),
      bullet([ b("竞赛："), r("中銀香港創新先驅大賽 2026（HomeTree）、Lead to the Future 2024、CFA 2025 Research Challenge、Acup 校园赛；GRA 全球阅读大奖赛 联合创始人。") ]),
      bullet([ b("语言："), r("普通话（母语）、英语（流利）、粤语（日常交流）。") ]),
    ],
  } ],
});

Packer.toBuffer(doc).then((buf) => { fs.writeFileSync("陈知维_简历_医保智能体黑客松.docx", buf); console.log("resume written"); });
