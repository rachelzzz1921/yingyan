# 鹰眼 · 医保基金稽核智能体 —— 可运行原型 v0.3

为飞检稽核员做"AI 初筛"：输入患者完整就诊材料包 → 三方交叉验证 → 输出带**三要素证据链**的结构化稽核报告。

> 本原型为黑客松现场演示而建：**零依赖、一行命令即起、改材料包则疑点随之变化**（引擎为真·计算，非硬编码答案）。

## v0.3 新增（v2.0 架构落地 · 均可现场点击）

| 功能 | 一句话 | 入口 |
|---|---|---|
| 🧬 事实层 Case Object | 材料编译为类型化事实，每条自带源锚点+OCR置信度，证据定位成硬字段 | 顶栏"事实层"按钮 / 证据卡⚓锚点 |
| 🔀 触发器路由 | 全42条规则本案只激活11条，其余零成本跳过（90秒承诺的工程基础） | 报告顶部路由条 |
| 📊 AuditBench 评测 | 违规件+干净件评测集（**20 案卷**），**干净件误报=0红线**，指标盘 | 顶栏"AuditBench"按钮 / 看板 |
| 🔒 PII 脱敏 + 内部案卷号 | 送 LLM 前自动脱敏姓名/证件；`YY-{SCOPE}-{DOMAIN}-{SEQ}` registry 排号 | 引擎 llm-agent / case_registry.json |
| 🪤 对抗鲁棒性 E-503 | 病历=不可信输入；"写给AI的小抄"本身即证据(40条二) | 顶栏"注入对抗演示"按钮 |
| 🔁 CoVe 取证自检 | 疑点定稿前生成验证问题逐题独立回查 | 疑点卡内 |
| ⚖️ 控辩裁 + 置信校准 | 控/辩/裁三方对质(申诉Agent=误报过滤器)；排序=金额×置信 | 疑点卡内 |
| 🏥 双模式 / 📄 文书化 / 🎤 演示要点 | 稽核↔体检模式切换；一键导出《疑点核查清单》；pitch弹药面板 | 顶栏 |

---

## 🚀 一分钟跑起来

```bash
cd prototype/app
node server.js          # 需 Node 18+（实测 Node 24）；无需 npm install
# 浏览器打开 http://localhost:3700→ 点右上角「开始稽核」
```

> 仅 `build:rules`（把 rules.yaml 转 rules.json）用到 js-yaml 这个 dev 依赖；运行时服务零依赖。rules.json 已生成并提交，开箱即跑。

**可选：开启 LLM 真·语义稽核路径**（读病历自由文本，演示"超越字段比对"）：
```bash
export ANTHROPIC_API_KEY=sk-...      # 配置后，UI/接口可走 LLM 路径
export YINGYAN_MODEL=claude-sonnet-4-6   # 可选，默认 sonnet
node server.js
# 调用 POST /api/audit?mode=llm 即走 LLM；无 key 自动回退确定性引擎
```

---

## 🎬 现场演示脚本（90秒讲清）

1. **左栏**展示患者材料包（病案首页/病程/医嘱/护理/检验/病理/费用清单/出院小结）——一份真实可读的 NSCLC 住院化疗材料。
2. 点**「开始稽核」**：引擎跑 41 条规则，**人工约40分钟 vs 鹰眼约1–5ms**。
3. 出 **5 疑点 + 1 线索（涉及金额 ¥7,621）**，逐个点开看**三要素**：①证据定位（可点击跳到费用行）②政策条款原文（KB 引用ID + ✅已核验/⚠待核验）③推理过程。
   - **重点讲 #1 奥希替尼（T-201，¥4704）**：三层政策互锁全部✅已核验——法规(条例38条二/六)+医保目录(奥希替尼限EGFR突变逐字)+诊疗口径(指导原则"不得未做检测盲目用药")。全材料包无EGFR检测报告 → 证据闭环疑点。
   - **重点讲 #6 升白针（T-205，线索）**：展开**🗣 控辩裁三方对质**——控方主张超限定支付，辩方指出"前次是否重度中性粒减少"的决定性证据(前次血常规)不在本单份材料包内、未闭环，裁判据此**疑点→线索降级**。这是"宁漏报不误报"的工程实现。
4. **主动讲两个"正确不报"**（误报防控）：贝伐珠单抗（非明确作用靶点类，无需基因检测→不报T-201）、放化疗周期再入院（命中肿瘤周期白名单→不报C-301）。**能正确"不报"比报得多更能体现稽核可信度。**

---

## 📁 目录结构

```
prototype/
├── README.md                     # 本文件
├── data/
│   ├── case_NSCLC/
│   │   ├── medical_record.json    # 模拟病历包（多模态解析后的结构化材料，6违规+2干扰）
│   │   └── expected_findings.json # 金标准稽核结果（验证用）
│   ├── rules/
│   │   ├── rules.yaml             # 全量机读规则41条（单一事实来源，人读+机读）
│   │   └── rules.json             # 由 yaml 构建的运行时产物
│   └── kb/
│       ├── kb1_policies.json      # KB1 政策库（条例/细则/目录/清单/DRG/江苏，含逐字原文+核验状态）
│       └── kb2_clinical.json      # KB2 临床库（指导原则2025逐字+NSCLC/结直肠癌病种包）
└── app/
    ├── server.js                  # 零依赖 HTTP 服务 + API
    ├── build-rules.js             # rules.yaml → rules.json（需 js-yaml dev依赖）
    ├── engine/
    │   ├── audit-engine.js        # 确定性规则引擎（真·计算）
    │   ├── debate.js              # 控辩裁多Agent对质引擎
    │   └── llm-audit.js           # LLM 语义稽核路径（可选）
    └── public/                    # 稽核工作台前端（原生JS，无框架）
```

## 📥 一键导入 + L1 解析（PP-Structure Sidecar）

**两条终端：**

```bash
# 终端 1 · L1 解析服务（PDF/图片 → bbox 坐标）
cd prototype/ppstructure && bash run.sh

# 终端 2 · 稽核工作台
cd prototype/app && node server.js
```

顶栏显示 **L1✓(lite)** 表示解析 sidecar 就绪。**材料导入**（完整页）或 **快速导入**（弹窗）→ 拖入 PDF/JSON/CSV/图片。

验收：`node scripts/verify-intake-bbox.js`（需 sidecar + app 已启动）。扫描图 PNG 还需 `brew install tesseract tesseract-lang`。

| API | 说明 |
|---|---|
| `POST /api/intake/batch` | 批量拖入 `{ files: [{ name, mime, fileBase64 }] }` |
| `GET /api/intake/slots` | 材料槽位清单 |
| `GET /api/health` | 含 `ppstructure.reachable` |

详见 [`ppstructure/README.md`](ppstructure/README.md)。

---

## 🔌 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/case?id=main\|clean\|ortho\|drg\|uploaded` | 患者材料包（肿瘤/干净/骨科/DRG高套/导入） |
| GET | `/api/cases` | 案卷清单 |
| POST | `/api/intake/batch` | **一键导入**：批量文件→自动分类→合并 medical_record（含 bbox） |
| GET | `/api/intake/slots` | 导入材料槽位（费用清单/病案首页/医嘱…） |
| POST | `/api/ingest` | **输入端**：摄取材料 `{type:structured\|document\|connector,...}`→结构化 medical_record，注册 uploaded 案卷 |
| GET | `/api/connectors` | **输入端**：医院连接器清单（MockHIS/FHIR/HL7）+ 状态 |
| GET | `/api/rules` | 全量规则（meta+42条，含governance治理） |
| GET | `/api/kb` / `/api/kb2` | KB1 政策库 / KB2 临床库 |
| GET | `/api/expected` | 金标准稽核结果 |
| GET | `/api/caseobject?id=` | 事实层稽核案卷对象（类型化事实+锚点） |
| GET | `/api/bench` | AuditBench：跑全部案卷出指标盘（干净件0误报红线） |
| GET | `/api/export/checklist` | 导出《疑点核查清单》（监管文书化） |
| POST | `/api/audit` | 运行稽核；body `{record?,caseId?,inject?}`；`?mode=llm\|exam`（LLM语义/体检模式） |
| GET | `/api/health` | 健康检查（规则数、案卷数、LLM、**L1 sidecar**） |

## 🧱 设计原则（写进代码的产品承诺）

- **证据链强制**：每条疑点必有三要素，引不出原文不输出为疑点（降级线索/不输出）。
- **宁漏报不误报**：医学合理性争议出线索；规则写明除外情形；控辩裁的"申诉Agent"即误报过滤器。
- **政策禁止凭记忆生成**：报告条款原文一律取自 KB（带引用ID+核验状态），代码层不编造条款。
- **真·可证伪**：确定性引擎对结构化可判定规则做真计算——改 `medical_record.json`（如补入 EGFR 检测报告），对应疑点会自动消失/变化。

## ⚠️ 数据合规

模拟病历包为**虚构演示数据**，不含任何真实患者信息。政策条款引自国家医保局/卫健委公开文件，核验状态见 KB 的 `verify_status` 字段。标 ⚠待核验 者进正式稽核报告前须人工比对官方原件。

---

*配套主文档：`../docs/00-项目主文档.md`（v1.6）*
