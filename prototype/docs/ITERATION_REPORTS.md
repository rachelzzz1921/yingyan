# 鹰眼原型 · 迭代报告（每轮 KPT 复盘 + 遗漏扫描）

> 通宵自迭代循环。每轮 Phase1-6 + 反思。最新在最上。

---

## iter-22 — GIAC 精进 + 江苏 KB + G2/B07d

**SMART目标**：江苏护理价真导入、GIAC 七项可演示精进、routing 下线标、dashboard G2；gate strict PASS。

**1. 本轮完成**：
- KB1 `KB1-江苏-护理价格2025`（苏医保发2025-20 特160/Ⅰ65/Ⅱ30/Ⅲ22）+ `jiangsu-prices.js` + A-105 引擎单价
- MockHIS 二级护理 12→30元/日；DRG 负面清单措辞修正
- routing 条：deprecated 规则 chip 标「已下线」
- `syncRegistryFromCases` 补 bench 案卷 meta；沉淀 Agent feedback PII 脱敏
- `/api/maturity` + dashboard：G2（eval baseline_lowtemp）+ L1 sidecar
- `yhf/harness/l1-prompt.js` 支持 prompts.*.cases 结构

**2. 测试**：`bash yhf/run.sh --strict` PASS

**3. iter-23 计划**：规则沉淀 LLM demo 验收 · Supabase as_of 验通 · embed 脚本 · B07c LLM shadow

---

## iter-21 — Intake/OCR 链闭环（PP-Structure lite + OCR 词行 bbox）

**SMART目标**：拖入 demo 费用 PDF → intake batch → fee_list.anchor.bbox 非空 → 稽核点击证据高亮费用行；gate strict PASS。

**1. 本轮完成**：
- sidecar `prototype/ppstructure/`（lite-pdfplumber 词级 bbox + tesseract 扫描图可选）
- `ppstructure-mapper.js` 词行分列解析（无 tables 时从 words 重建费用行 + bbox）
- demo 样例 `prototype/data/intake_samples/fee_list_demo.pdf` + 验收脚本 `scripts/verify-intake-bbox.js`
- UI：主工作台「快速导入」弹窗 + `/intake.html` 完整中心；L1 状态灯；疑点跳转 `.bbox-highlight`
- `install-paddle.sh` 注明 Python 3.14 暂无 wheel，需 ≤3.12

**2. 测试**：`node scripts/verify-intake-bbox.js` → fee rows 3 | with bbox 3 PASS；`bash yhf/run.sh --strict` PASS

**3. 已知限制**：PNG 扫描图 bbox 需 `brew install tesseract tesseract-lang`；Paddle PP-StructureV3 需 Python ≤3.12

**4. iter-22 计划（用户已核对）**：GIAC 七项精进 + 规则沉淀 full + 江苏 KB + eval/G2 + corpus/embed

---

## iter-20 — 稽核/体检模式真差异化（用户点名：两个模式有区别吗）+ 后台起江苏价格research agent

**SMART目标**：把🛡稽核/🏥体检从"只差横幅"做成"真有区别"(同引擎两口径),验收同案两模式findings一致、措辞/文书按视角切换、红线不动。

**1. 本轮完成**：用户点选mode-toggle问"这两个模式有区别吗"——查证后发现之前仅差一条横幅(runAudit完全相同)。本轮做真差异化(引擎/疑点不变,只换展示层口径,按panel驱动):①结论卡(疑点/疑点涉及金额→风险点(待自查整改)/飞检暴露金额,线索需调阅→建议补全材料);②处置语气examDisposal()(责令退回→飞检前主动退回,移交骗保线索→院端重点自查留存说明;app+server双份);③横幅(体检视角说明)+疑点区标题(⚠疑点与线索→🩺风险点与线索院端自查口径);④导出文书(/api/export/checklist?mode=exam→《自查整改清单(院端自查)》,机构申诉意见→院端整改状态)。同时后台起research agent联网核实江苏护理价格(为iter-21江苏数据导入备料)。
**2. 测试**：curl+浏览器双验。导出实测稽核《疑点核查清单》"处置建议·责令退回"/体检《自查整改清单(院端自查)》"自查整改建议·飞检前主动退回·院端整改状态";浏览器同案(main)切两模式findings完全一致(7卡=6疑点+1线索¥8901),稽核卡"疑点(证据闭环)/疑点涉及金额"、体检卡"风险点(待自查整改)/飞检暴露金额"+院端横幅+🩺风险点标题+disposal"自查整改建议·主动退回";红线无回归(引擎未动);0 console error+截图。
**3. 多角色测评(Phase3)**：用户本人直接点出"两模式无区别"=最真实的可用性反馈,已修。P5医院医保办(体检模式目标用户):"风险点/飞检暴露金额/自查整改建议/主动退回"正是院端飞检前自查想看的口径,《自查整改清单》可直接下发科室;P1稽核员(稽核模式):保持"疑点/责令退回/对质"监管口径不变。
**4. 建议自审(Phase4·RICE摘要)**：采纳①模式真差异化(基本型:坐实"一套引擎两种模式"pitch,否则toggle是摆设)②examDisposal口径转换(期望型:同一疑点两种动作语言)③导出文书分稽核/体检(期望型:两类用户各拿各的可交付物);进backlog:状态badge"疑点/风险点"也随模式变(本轮保留三态核心词疑点/线索不变,只换summary/disposal口径,避免动核心vocab)、体检模式加"整改时限"字段(期望型)。
**5. 灵活性体检(Phase6)**：纯展示层差异化——引擎/规则/案例/findings**完全不动**(红线天然安全),靠既有panel标志驱动;app.js VIEW_EXAM全局+exam分支,server renderChecklist加mode参,examDisposal app/server各一份(语气转换);新增模式只需加panel分支,不碰检测逻辑。
**6. 拒绝/搁置**：①状态词疑点→风险点全局替换(三态疑点/线索/不输出是产品核心vocab,只在summary/disposal层换口径,不动badge);②体检模式隐藏监管专属项(移交等)(本轮用examDisposal软化措辞而非隐藏,保留信息透明);③模式持久化(MODE是前端态,刷新回稽核默认,demo够用)。
**7. 遗漏扫描(逐条核对iter-20承诺)**：
- 两模式真差异(结论卡/处置/横幅/标题/导出) → ✅(curl+浏览器验)
- 引擎/findings不变(红线安全) → ✅(同案6+1一致)
- examDisposal口径转换(责令退回→主动退回等) → ✅(app+server双份+catch-all责令→主动)
- 导出文书分稽核/体检 → ✅(疑点核查清单/自查整改清单)
- 0 console error → ✅
- 后台起research agent核江苏价格(响应用户江苏导入问) → ✅(已起,核到苏医保发2025-20号护理价)
- 文档(CHANGELOG/本报告/TASKS/记忆) → ✅
**8. 已知问题与风险**：①examDisposal为关键词替换(责令退回/移交等),少数生僻措辞可能漏转(已加责令catch-all);②体检模式状态badge仍显"疑点/线索"(核心vocab未动,summary层已换"风险点");③模式不持久化(前端态)。
**9. KPT复盘**：Keep=用户直接点UI元素问"有区别吗"是金标准可用性反馈,先查证(读代码确认"真没区别")再老实承认+给方案,而非辩解——诚实定位问题比掩盖强;差异化放展示层、引擎一行不动,让"高可见改动"零红线风险。Problem=preview导航后首个eval报"target navigated"(老问题),重试即恢复,已是固定现象。Try=iter-21把后台research agent核到的江苏护理价(特160/Ⅰ65/Ⅱ30/Ⅲ22元/日,苏医保发2025-20号官方)真导入——替换hospital.js占位12元假值、A-105用真江苏价、修负面清单措辞,回应用户"江苏数据导入"。
**10. 下一轮(iter-21)计划**：⭐导入research agent核到的江苏真实数据(守"政策不编造"红线,这正是用户问的"江苏数据导入"):①hospital.js二级护理12→30元/日(占位假值→苏医保发2025-20号官方逐字);②A-105护理价用真江苏值(应收Ⅱ级30 vs 实收Ⅰ级65=多收35/日);③KB1入苏医保发2025-20号(护理类价格规范整合)+重症监护/专项护理"不得重复收取"逐字(支撑ICU-301/A-105);④修负面清单措辞(江苏无独立"收费行为负面清单",是苏医保发2022-57号绩效评价办法内的负面清单扣分项)。每轮先反思+规划下一轮。
**11. 需拍板事项**：江苏护理费占位12→官方30元/日的替换(research agent建议),iter-21将执行(可核验官方值,非编造)。

---

## iter-19 — 规则治理增强：复审计数清零 + 治理操作流水（审计台账）

**SMART目标**：修iter-16已知限制(restore后旧驳回1次即再shadow)+加治理操作审计台账。验收①restore后需攒满阈值新驳回才再shadow②治理流水时间线③0回归。

**1. 本轮完成**：①复审计数清零——restore时规则状态记ack_rejects(已确认驳回数=restore时累计驳回),autoShadowFromReview改按"有效驳回=累计−已确认"判定(≥阈值才转shadow);②治理操作流水——/api/rule-governance GET加audit_log(各规则流转history聚合成时间线,倒序),UI规则治理面板加🧾治理操作流水表(最近12条);③复核反馈回流文案+治理页说明同步"复审恢复清零计数"。
**2. 测试**：curl四步验计数清零——3驳回→shadow / restore→active(ack=3) / +1驳回(累计4有效1)→仍active / +2驳回(累计6有效3)→re-shadow,全对;浏览器治理流水渲染(A-109 active→shadow(auto)→active(human复审)两条倒序,时间/规则/流转/操作者/理由完整);10案卷红线无回归PASS;0 console error。全程确定性引擎省MiniMax额度。
**3. 多角色测评(Phase3)**：P5信息科/医保办(关心可问责):治理流水正中要害——"谁把这条规则停了/恢复了、为什么"一表看清,审计可追溯;计数清零符合直觉"复审过了就该给规则清白,不能拿旧账反复罚"。原话"我批了恢复,结果系统又自己把它关了,那我批个啥"→计数清零已解决。
**4. 建议自审(Phase4·RICE摘要)**：采纳①复审计数清零(基本型:修真bug,否则restore形同虚设)②治理操作流水(期望型:可问责审计,复用history零新数据);进backlog:治理操作权限/鉴权(生产态)、ack_rejects也记入流水(期望型)、deprecated到期自动复审(governance_model设想)。
**5. 灵活性体检(Phase6)**：纯server逻辑+UI展示——autoShadowFromReview改判定式(累计→有效)、restore handler+ack_rejects快照、GET+audit_log聚合(复用history)、UI+1表;未动引擎/规则/案例;ack_rejects是规则状态上的一个数,治理流水是history的视图,零新存储。
**6. 拒绝/搁置**：①治理鉴权(demo无);②ack_rejects变更也进流水(本轮流水只记status流转,ack是附属计数,搁置);③"按时间窗口的驳回率"替代"累计计数"(更精细但需时间序列分析,搁置)。
**7. 遗漏扫描(逐条核对iter-19承诺)**：
- restore后驳回计数清零(需新驳回攒满阈值才再shadow) → ✅(四步curl验)
- 治理操作流水audit_log时间线 → ✅(GET+UI表)
- 复核反馈回流/治理页文案同步 → ✅(提到清零计数)
- 10案卷红线无回归 → ✅PASS
- 0 console error → ✅
- 文档(CHANGELOG/本报告/TASKS/记忆) → ✅
**8. 已知问题与风险**：①计数清零按"累计−已确认",未按时间窗(长期看仍是绝对计数,生产可换滑窗误报率);②治理无鉴权;③audit_log展示最近12条(更多需分页);④ack_rejects只在restore设,retire/手动shadow未涉及(语义上不需要)。
**9. KPT复盘**：Keep=修自己上轮埋的限制要一次修彻底(iter-16只收窄了作用域防"无关复核覆盖",本轮才真正"计数清零"解决"同规则旧账反复罚"),自迭代要回头清自己的技术债;治理类功能配"审计流水"几乎是标配(有状态变更就该有变更留痕),低成本高可信。Problem=bash heredoc里python f-string转义反复踩坑(本会话第N次),应改用单引号heredoc或写临时py文件,已多次提醒自己。Try=iter-20转广度——起research agent联网核实心血管/血净官方逐字补第8专科(强政策),或做单件核查清单↔机构报告交叉引用。
**10. 下一轮(iter-20)计划**：误报治理闭环(iter-11/12/16/19)已稳。iter-20倾向(a)起后台research agent核实心血管CV/血净BP官方问题清单逐字→补第8专科(守"政策不编造"红线,补成✅核验再扩);(b)真·LLM在新领域(ICU/药店)跑一次完整案例存证(证明LLM路径覆盖扩展领域,需酌情用MiniMax额度);(c)单件↔机构交叉引用。倾向(a)。每轮先反思+规划下一轮。
**11. 需拍板事项**：无。

---

## iter-18 — 机构画像导出《院端体检报告》：可交付物落地

**SMART目标**：把iter-14机构画像做成可导出markdown《院端体检报告》(可交付文书),验收导出各表完整+UI按钮+0回归。

**1. 本轮完成**：server renderInstitutionReport(portrait)→markdown《院端体检报告》(体检结论+高频违规规则TOP+违规类型分布+科室分布+专科领域覆盖+受检案卷清单+免责)+/api/export/institution端点(text/markdown下载,复用institutionPortrait);UI机构画像模态加「📄导出院端体检报告」按钮(window.open新标签)。
**2. 测试**：curl导出实测——受检10份/疑点23/线索4/¥24198/干净件3-3/覆盖7领域,5张表完整,案卷清单标"🟢合规放行/🔴检出问题";浏览器机构画像模态导出按钮present+10案卷(含icu)+KPI 10/23/¥24198/3-3/7;0 console error。纯叠加未动引擎,红线无回归。全程确定性引擎省MiniMax额度。
**3. 多角色测评(Phase3)**：P5信息科/医保办主任(关心可交付/留痕):《院端体检报告》正是其要的东西——飞检前给被检机构一份可下发的体检报告、指导整改,markdown可转PDF/打印;原话"光在屏幕上看没用,我得有个能发给科室的文件"→已满足。P1主任:报告是机构级,不在其单件稽核流,不干扰。
**4. 建议自审(Phase4·RICE摘要)**：采纳①机构画像导出(基本型:画像不可导出=只能看不能用,补齐可交付物最后一环,复用portrait)②报告含"每条疑点可下钻单件三要素证据链"说明(期望型:报告与单件稽核打通);进backlog:导出真PDF(本轮markdown,期望型)、报告含趋势同比(需历史数据,期望型)、单件疑点核查清单与机构报告交叉引用(期望型)。
**5. 灵活性体检(Phase6)**：纯叠加——server 1渲染函数+1端点(复用institutionPortrait,无新数据)、UI 1按钮(window.open),**未动引擎/规则/案例/画像聚合**;新增案卷/领域自动进报告(渲染遍历portrait各表);与既有/api/export/checklist(单件疑点核查清单)同模式(text/markdown下载),导出能力成范式。
**6. 拒绝/搁置**：①真PDF导出(本轮markdown够用且通用,PDF需依赖库违"零依赖",搁置);②趋势同比(需多时间断面,搁置);③报告鉴权/水印(demo无,生产态)。
**7. 遗漏扫描(逐条核对iter-18承诺)**：
- 机构画像导出markdown《院端体检报告》 → ✅(/api/export/institution)
- 报告含汇总/规则TOP/类型/科室/领域/案卷清单 → ✅(5表完整)
- UI导出按钮 → ✅(机构画像模态内)
- 纯叠加未动引擎,红线无回归 → ✅
- 0 console error → ✅
- 文档(CHANGELOG/本报告/TASKS/记忆) → ✅
**8. 已知问题与风险**：①导出为markdown非PDF(通用但需用户自转,已为零依赖取舍);②无趋势(静态聚合);③报告基于演示案卷集(已免责标注真实飞检按抽样)。
**9. KPT复盘**：Keep=把"能看"做成"能用"(可交付文书)——demo里一份能下发的报告比屏幕上的图更有说服力,且复用已有聚合零新逻辑、零回归;导出能力沿用既有checklist范式(text/markdown下载),一致性高。Problem=本轮小而顺无坑。Try=iter-19转回深度:补研究核实的专科(心血管/血净需研究agent核官方逐字)或治理增强(restore计数清零+audit log),让广度/深度交替推进不单调。
**10. 下一轮(iter-19)计划**：(a)起后台research agent联网核实心血管/血净官方问题清单逐字→补第8专科(强政策);(b)治理增强(restore后计数清零+治理audit log+routing显deprecated下线标,iter-16 backlog);(c)单件核查清单↔机构报告交叉引用。倾向(a)(用研究agent把弱政策领域补成✅核验再扩,守"政策不编造"红线)或(b)。每轮先反思+规划下一轮。
**11. 需拍板事项**：无。

---

## iter-17 — 重症ICU专科真fire（第7个完整可fire领域）

**SMART目标**：补重症医学ICU专科真fire(照麻醉/药店pattern)，验收ICU案真出3疑点+1正确不报、10案卷干净件0误报红线无回归、0 console error。

**1. 本轮完成**：case_icu(ICU ARDS,以icu_record/设备使用记录为事实基准硬比对):ICU-302按小时监护时长虚计(呼吸机计费120>实际96→¥1200/CRRT计费48>实际40→¥640,序174)/ICU-301特级护理重复收一般专项护理费¥300(序175)；ICU-303(非ICU患者收重症监护费)设为干扰(本例有ICU收治记录→正确不报,序179)+心电监测计费96=实际96也正确不报。3 checker(ICU-301/302/303读icu_record:ventilator/crrt.actual_hours/nursing_level/admission_to_icu)+触发谓词+ICU-302/301 CoVe;政策引官方重症问题清单逐字✅已核实;UI案卷选择器🫀重症ICU+重症记录tab(ICU收治/护理级别/呼吸机·CRRT实际时长硬比对基准)。
**2. 测试**：node/curl+浏览器双验。ICU案**3疑点(¥2140)+1正确不报**与金标准一致(ICU-302×2+ICU-301),raw=3一次命中无脏发现;10案卷AuditBench干净件3件误报0**红线PASS**;路由ICU案激活5/58(ICU-301/302命中,ICU-303+A-105/A-109激活但正确未fire,路由chip hit标记验证ICU-303 hit=false正确);政策UI✅已核验;浏览器重症记录tab渲染+三要素证据链(呼吸机计费120 vs ICU记录实际96→¥1200)+0 console error+截图。全程确定性引擎省MiniMax额度。
**3. 多角色测评(Phase3)**：P1主任医师(耐心零):ICU案"对错分明"——呼吸机/CRRT时长是设备记录硬数,特级护理含专项护理是内涵硬规,无指征争议,3次点击内看到证据链;原话"别跟我扯临床判断,告诉我哪笔多算了多少"→ICU-302计算栏"计费120−实际96=超24h×50=¥1200"正中其需求。P5信息科:重症记录tab把设备时长来源标清(ICU记录/设备记录),可追溯。SUS主稽核流维持78基线。
**4. 建议自审(Phase4·RICE摘要)**：采纳①ICU专科真fire(基本型,收敛可fire落差+住院领域做厚)②ICU-303设干扰而非硬报(基本型:真ICU患者收ICU费合规,误报会伤公信)③心电监测计费=实际作"正确不报"二号佐证(期望型:展示同类项时长一致就不报,反衬时长不符才报)。进backlog:抢救项目超计价序176/床位串换层流洁净序178等重症其他违规型(期望型)、ICU-302接真实设备时长系统(期望型)。
**5. 灵活性体检(Phase6)**：新领域=案例JSON(新结构icu_record:ventilator/crrt/nursing_level/admission_to_icu)+3 checker读这些字段+触发谓词,其他9案卷无icu_record自动不触发→零跨层扩散;复用mkFinding/reconcile/CoVe/控辩裁/置信全链路+hours_charged比对模式(同M-301时长/IMG-302张数/M-303用量,"计费量vs实际量"成稳定范式);institution DOMAIN_BY_ID+icu映射自动纳入画像。
**6. 拒绝/搁置**：①重症其他违规型(抢救超标序176/经纤支镜串换序177/床位串换层流序178)本轮先做3条核心(时长/特级护理/ICU费);②ICU-302真接设备时长系统(本轮按记录字段,生产期接);③ICU-303反向案例(真"非ICU患者收ICU费"违规件,本轮以干扰形态体现除外,正向违规件可后补)。
**7. 遗漏扫描(逐条核对iter-17承诺)**：
- 重症ICU案例(真fire,以ICU记录硬比对) → ✅(3疑点)
- ICU-301/302/303 checker+触发谓词 → ✅(301/302 fire,303除外不报)
- 问题清单逐字引用(序174/175/179) → ✅(UI显✅已核验)
- 1干扰正确不报(重症监护费有ICU收治记录) → ✅(+心电监测计费=实际也不报)
- UI案卷选择器+重症记录tab → ✅(硬比对基准标注+截图)
- D-401/A-108/B-202/A-105误报防控 → ✅(ARDS诊断/linked_order/美罗培南/护理一致,raw=3一次过)
- 10案卷干净件0误报红线无回归 → ✅PASS
- 路由chip ICU-303未误标hit → ✅(eval验hit=false)
- 0 console error → ✅
- 文档(CHANGELOG/本报告/TASKS/记忆) → ✅
**8. 已知问题与风险**：①重症仅3条核心型(抢救/经纤支镜/床位串换未覆盖);②ICU-302依赖icu_record设备时长字段(真实需设备系统对接);③ICU-303本轮只有"除外不报"形态,无正向违规件(非ICU患者却收ICU费),正向案例可后补强化;④hours_charged为案例自带字段,真实费用清单需从计价单位"小时"行解析。
**9. KPT复盘**：Keep=新专科前先列"本案该报什么/不该报什么"再设计案例字段,且主动设计"正确不报"干扰项(ICU-303除外+心电监测时长一致)——能正确不报比能报更显稽核可信,这是"宁漏勿误"的正面表达;改案例前先盘点"哪些既有规则的触发谓词会被新案例数据误激活"(D-401诊断/A-108无医嘱/B-202抗菌药名),用数据层规避(选词/补字段)而非改规则——本轮raw=3一次过没有踩坑,是iter-13(M-302误命中)/iter-15(A-108)经验固化的成果。Problem=本轮较顺无大坑,唯一小插曲是看截图误判ICU-303 chip为命中(实际hit=false),提醒"颜色目测不可靠,关键状态用eval查DOM类名核实"。Try=iter-18继续按价值:补第8领域(心血管CV/血净BP)或转治理增强(restore计数清零+audit log)或机构画像导出。
**10. 下一轮(iter-18)计划**：可fire领域已7个(肿瘤/骨科/DRG/影像/麻醉/门诊药店/重症ICU)。iter-18按价值自主:(a)补心血管CV-301~302或血净BP-301专科(继续收敛"58规则仅~28可fire");(b)治理增强(restore后计数清零+治理audit log+routing显deprecated下线标,iter-16 backlog B07d);(c)机构画像接导出PDF。倾向(a)血净BP(透析超频/串换,场景独特)或(b)治理增强(把误报闭环打磨更稳)。每轮先反思+规划下一轮。
**11. 需拍板事项**：无(按既定方向自主推进)。

---

## iter-16 — 规则三态治理落盘：误报闭环从"运行期计算"到"可追溯治理"

**SMART目标**：把iter-11/12误报闭环执行端从"运行期计算"→"文件落盘+可逆治理"。验收①驳回≥3自动转shadow并落盘rule_states.json、重启仍生效；②反向流restore→active/retire→deprecated(不fire);③规则治理UI三态流转+复审按钮;④9案卷红线无回归;⑤0 console error。不做:改rules.yaml源(用overlay分离定义与状态)、规则编辑器。

**1. 本轮完成**：对齐rules.yaml既有governance_model(draft→in_review→shadow→active→re_review/deprecated)。①engine runAudit加retiredRules(deprecated规则跳过不跑)+summary.retired_rules;②server overlay data/rule_states.json(治理状态,与rules.yaml定义分离)+loadRuleStates/saveRuleStates/transitionRule(落盘history:from/to/by/reason/ts)+currentShadowRules/currentRetiredRules改从落盘状态读;③/api/review POST驳回≥3自动转shadow落盘(autoShadowFromReview,作用域限本次被复核规则);④反向流/api/rule-governance GET(状态机+三态汇总+流转history)/POST(restore→active/retire→deprecated必填理由/shadow);⑤UI 🗂规则治理面板(状态机图+在役/观察/下线KPI+非active规则流转history+复审按钮);⑥AuditBench复核反馈回流区指向治理页。
**2. 测试(Phase2自测+Phase6回归)**：curl+浏览器双验。①回归(安全缺省):空rule_states→main 6+1 shadow0 retired0、9案卷红线PASS,与iter-15一致;②自动shadow落盘:A-105连驳3→active→shadow写入rule_states.json带history、main 6→5;③★落盘持久:重启server+清空review_feedback后A-105仍shadow(区别iter-12运行期重算);④restore:A-105→active、main回6;⑤retire F-003→deprecated、main 5且F-003不fire、retired_rules显示、空理由retire被拒;⑥作用域修正:restore A-105后post无关B-201复核→A-105仍active(未被旧驳回拽回);⑦浏览器:治理面板渲染(状态机+57/1/0/58 KPI+A-105 shadow卡含流转history+复审按钮)、点restore→刷新回全在役、main 6+1无回归、0 console error+截图。bench为纯引擎oracle不受治理影响红线稳定。全程确定性引擎省MiniMax额度。
**3. 多角色测评(Phase3)**：重点人设P5医院信息科管理员/规则治理员(关心审计/可追溯/权限)——本功能正中其关切:rule_states.json带完整流转history(谁/何时/为何把规则降级或下线)=可审计的治理台账,落盘可追溯远胜"运行期算完即忘";原话式吐槽改进点:"自动转shadow我认,但谁批准恢复在役得有记录"→已满足(history记by:human(复审)+reason)。P1主任医师:治理页是管理员后台不在其稽核流,不干扰主流程(正确分层)。P3护士/P6老花医生:本轮无录入交互,不适用。SUS:治理页为新增管理能力,主稽核流SUS不受影响(维持iter-4起的78基线)。
**4. 建议自审(Phase4·RICE摘要)**：本轮采纳:①规则三态落盘(基本型,RICE高:误报闭环不落盘=治理半截子,复用iter-11/12)②反向流restore/retire(基本型:有降级必须有恢复/确认,否则规则只进不出)③作用域限本次复核规则(基本型bug防护:防restore被旧驳回覆盖)。进backlog(未本轮做):restore后驳回计数清零(期望型,避免restore后1次驳回即再shadow)/治理操作独立audit log(期望型)/deprecated规则在触发器路由显"下线"标(期望型)/rule_states.json并发写锁(生产态)。
**5. 灵活性体检(Phase6)**：纯叠加+overlay分离——engine仅+retiredRules跳过(1处)、server+overlay读写与2端点、UI+1面板,**未改rules.yaml源/未改规则checker/未碰案例**;安全缺省(空overlay=旧行为)让"改计数+改fire"的高风险特性零回归上线;治理状态文件与定义文件分离=换规则库不丢治理状态、换治理实现不动规则定义,关注点清晰。
**6. 拒绝/搁置**：①不改rules.yaml源写status(用overlay更优:可逆/免重建build-rules/定义与状态分离),已在报告说明取舍;②restore后计数清零(本轮作用域修正已解决"被无关复核拽回",计数清零是锦上添花,进backlog);③deprecated到期自动恢复/KB条款effective_to驱动(governance_model有此设想,需时间轴数据,搁置);④治理操作权限/鉴权(demo无鉴权,生产态接)。
**7. 遗漏扫描(逐条核对iter-16承诺)**：
- 驳回≥3自动转shadow并落盘rule_states.json → ✅(带history)
- 落盘持久:重启server后仍生效 → ✅(清空review_feedback仍shadow)
- 反向流restore→active(恢复计分) → ✅(main回6)
- 反向流retire→deprecated(不fire) → ✅(F-003不fire+retired_rules显示)
- retire必填理由 → ✅(空理由被拒)
- 规则治理UI三态流转+复审按钮 → ✅(状态机+KPI+history+按钮,截图)
- AuditBench复核反馈回流区指向治理页 → ✅(文案改"到🗂规则治理页复审")
- 作用域修正(restore不被无关复核覆盖) → ✅(发现并修复)
- 9案卷干净件0误报红线无回归 → ✅PASS
- 0 console error → ✅
- 安全缺省(空overlay=iter-15行为) → ✅
- 文档(CHANGELOG/本报告/TASKS/记忆) → ✅
**8. 已知问题与风险**：①restore后该规则若再被驳回1次(累计仍≥3)会再次转shadow(作用域修正只防"无关复核"覆盖,未做"restore后计数清零",已进backlog);②治理无鉴权(demo);③rule_states.json无并发写锁(单机demo无碍);④deprecated规则仍在computeRouting显示为"激活"(只是不fire),路由展示未标"下线"(进backlog);⑤bench刻意不接治理状态(纯引擎oracle),与live audit的治理叠加是两套视图,已在iter-12决策说明。
**9. KPT复盘**：Keep=安全缺省(空overlay=旧行为)+overlay分离(定义vs状态)让高风险治理特性零回归上线,回归一跑即证——这是"宁漏勿误红线"的工程护栏;改A的同时先想"有没有反向操作"(有shadow必有restore、有retire必有恢复),否则规则只进不出会越治理越死。Problem=第一版autoShadowFromReview遍历所有flagged规则,会让人工restore被下次无关复核覆盖(restore形同虚设)——"自动化动作"要警惕作用域过宽吃掉"人工决策",已收窄到"本次被复核规则";另preview重启后页面空白老问题,继续靠window.location.href导航root恢复(已是标准动作)。Try=iter-17做(b续)restore后驳回计数清零+治理audit log,或转(a)补重症ICU专科凑齐住院全领域,或(c)机构画像接导出。
**10. 下一轮(iter-17)计划**：误报治理闭环(iter-11/12/16)已闭环且落盘可追溯。iter-17按价值自主选:(a)补重症ICU-301~303住院专科(收敛"58规则仅~25可fire",重症问题清单9条已逐字核实)；(b)治理增强:restore后计数清零+治理操作audit log+routing显deprecated下线标;(c)机构画像接导出PDF/趋势。倾向(a)(把可fire领域继续做厚,demo广度更稳)。每轮仍先反思+规划下一轮+ScheduleWakeup续跑。
**11. 需拍板事项**：无(按既定方向自主推进)。

---

## iter-15 — 门诊药店专科真fire（第6个领域·首次跳出住院场景）（三连轮第3轮·收官）

**1. 本轮完成**：补门诊/定点零售药店专科——**鹰眼首次跳出住院病案结构**。case_pharmacy(以销售小票/进销存/追溯码为事实基准,对医保结算明细硬比对):P-303生活用品串换医保药品(实际售口罩¥85/保健品¥60却结算奥美拉唑/蒙脱石散→2疑点,材料内可闭环,序7)/P-301空刷医保凭证(布洛芬¥38刷卡但进销存无销售记录→线索,序1)/P-302回流药追溯码断链(阿托伐他汀¥100→线索,序5)+1干扰(二甲双胍真实售药正确不报)。3 checker(P-301/302/303)+触发谓词+P-303 CoVe;政策引官方药店问题清单逐字(序1/5/7✅已核实);UI案卷选择器+药店/进销存tab(医保结算vs实际销售vs追溯码对照表,违规行红底)。零售无医嘱→每行设linked_order防A-108误报。
**2. 测试**：node/curl+浏览器双验。药店案**2疑点(¥145)+2线索+1正确不报**与金标准一致(P-303×2疑点+P-301/P-302线索),raw=4无脏发现(A-108未误触发,linked_order守卫生效);9案卷AuditBench干净件3件误报0**红线PASS**;路由药店案激活3/58(P-301~303命中);政策UI显✅已核验;浏览器药店/进销存tab渲染对照表(奥美拉唑¥85 vs 口罩红底高亮)+三要素证据链+0 console error+截图。全程确定性引擎省MiniMax额度。
**3. 可用性**：门诊药店是第6个可fire领域且首个非住院场景——回应"系统只能查住院吗"的潜在质疑;药店/进销存tab把"医保结算名目vs实际销售商品"并排红底高亮,串换一目了然(口罩串奥美拉唑);P-301/P-302作线索(空刷/回流药需进销存/追溯码外部佐证),P-303作疑点(材料内可闭环),三态分明体现"宁漏勿误";二甲双胍真实售药正确不报,串换比对不误伤。
**4. 灵活性体检**：新场景=案例JSON(新结构:pharmacy_info/sales_records/fee_list带actual_sold/inventory_supported/trace_code)+3 checker读这些字段+触发谓词,其他8案卷无pharmacy_info自动不触发→零跨层扩散;compileCaseObject全optional chaining,门诊case无住院字段不崩;关键防护:零售无医嘱,靠每行linked_order让A-108谓词不激活(不需改A-108代码,数据层规避);institution画像DOMAIN_BY_ID+1映射自动纳入。
**5. 采纳建议**：补门诊药店(Rachel"全面全"+证明非住院场景+ARCHITECTURE_REVIEW落差);以进销存/追溯码为事实基准(2025-07强制扫码结算=第四验证轴,前瞻);P-301/302作线索不坐实(空刷/回流需外部数据,材料内不闭环→线索,守"宁漏勿误");政策引官方逐字(序1/5/7已核实)。
**6. 拒绝/搁置**：①P-301/P-302真接进销存/追溯码系统(本轮按L3线索设计+needs_more,需外部数据底座,生产期接);②超量开药序15/无处方售处方药序13等更多药店违规型(本轮先3条核心:串换/空刷/回流);③门诊统筹起付线/限额规则(本轮聚焦串换骗保);④药店case未纳入AuditBench"线索数"硬断言(线索为软指标,只硬断言干净件0误报)。
**7. 遗漏扫描**(逐条核对iter-15承诺)：
- 门诊药店案例(真fire,跳出住院结构) → ✅(2疑点+2线索)
- P-301/302/303 checker+触发谓词 → ✅(全firing正确)
- 问题清单逐字引用(序1/5/7) → ✅(UI显✅已核验)
- 1干扰正确不报(二甲双胍真实售药) → ✅
- UI案卷选择器+药店/进销存tab(对照表) → ✅(红底高亮+截图)
- A-108无医嘱误报防控(linked_order) → ✅(raw=4无脏发现)
- 9案卷干净件0误报红线无回归 → ✅PASS
- 0 console error → ✅
- 文档(CHANGELOG/本报告/TASKS/记忆) → ✅
**8. 已知问题/风险**：①P-301/P-302依赖外部进销存/追溯码(本轮按线索设计已标注);②药店违规仅3条核心(超量/无处方售药/起付线未覆盖);③P-303串换判定依赖actual_sold.category命名(生活用品/保健品等),真实需商品分类字典;④门诊case复用front_page结构(admit=discharge=门诊当日),语义上是借壳,真实门诊材料结构更简。
**9. KPT**：Keep=新场景跳出既有结构时,先确认底层(compileCaseObject)全optional chaining不崩、再用"数据层规避"而非"改代码"解决跨规则误报(linked_order防A-108,不动A-108逻辑)——最小侵入扩场景;Problem=preview重启后又遇页面空白,已固化"重启后先window.location.href导航root再操作"为标准动作(连续3轮都靠这个恢复);Try=iter-16三连轮已收官,可转向(a)补剩余住院专科(重症ICU/心血管/血净)凑齐"全面全"、(b)shadow规则落盘(iter-12 backlog B07b,完成治理闭环)、(c)机构画像接导出/趋势。
**10. 下一轮(iter-16)计划**：三连轮(iter-13~15)已完成(麻醉→机构画像→门诊药店)。iter-16起按价值自主选:倾向(b)shadow规则三态落盘(写回rules.yaml status+复审恢复反向流,把iter-11/12误报治理闭环彻底做实),或(a)再补1-2个住院专科(重症ICU-301~303)继续收敛"58规则仅~22可fire"落差。每轮仍先反思+规划下一轮。
**11. 拍板**：无(按既定方向自主推进)。

---

## iter-14 — 机构汇总画像（院端体检）：单件初筛升维到机构画像（三连轮第2轮·换维度）

**1. 本轮完成**：把8案卷批量初筛后聚合成「院端体检报告」。server /api/institution + institutionPortrait()(对全部案卷跑runAudit后聚合:高频违规规则TOP按金额/违规类型分布/科室分布/专科领域覆盖5领域/受检案卷清单);UI新增🏥机构画像按钮+模态(5 KPI卡+横向条形图规则橙条领域蓝条+科室/类型双列表+案卷清单);CSS ins-bar条形/ins-2col双列/bench-kpis改auto-fit适配5卡。
**2. 测试**：curl+浏览器双验。/api/institution实测:受检8案/疑点18/¥21913/干净件3-3/覆盖5领域;规则TOP T-201¥4704/A-109¥3980(2案)/A-107¥3200/D-401¥3100/T-207¥2600;领域 肿瘤¥8901/骨科¥8880/DRG¥3100/麻醉¥680/影像¥352。浏览器模态渲染5 KPI+13条形(8规则+5领域)+双列表+21表行+0 console error+截图。纯叠加未动引擎,8案卷红线仍PASS。全程确定性引擎省MiniMax额度。
**3. 可用性**：从"查一个病人"升维到"给一家医院画像"——飞检真实工作单位是机构,这页把鹰眼从单件工具讲成机构级稽核底座;条形图一眼定位高风险规则(T-201最高)/高风险科室,指导抽样;干净件3/3正确放行同屏可见,"宁漏勿误"有数据背书;5领域覆盖图直观展示横向广度(把iter-5~13建的多领域可fire一图收口)。
**4. 灵活性体检**：纯叠加层——新增1 server端点+1聚合函数+1 UI模态+CSS,**未动引擎/规则/案例**;institutionPortrait复用runAudit逐案跑后rollup(by_rule/by_type/by_dept/by_domain),新增案卷自动纳入画像无需改聚合;bench-kpis改auto-fit后AuditBench(4卡)与画像(5卡)共用响应式。
**5. 采纳建议**：机构画像(§0路线图"机构画像一页"落地,RICE高:复用已建案卷,新维度demo提升altitude);院端体检叙事(2026定点机构强制自查自纠+飞检前置,产品双场景);干净件零误报同屏(宁漏勿误可视化)。
**6. 拒绝/搁置**：①画像金额只计疑点未计线索(避免把"待核线索"算成"已坐实金额"夸大,线索单列);②真实趋势/同比(需多时间断面数据底座,本轮静态聚合);③科室下钻到医生/票据(需更细数据,本轮到科室/领域粒度);④导出画像PDF(本轮屏显,后续接export)。
**7. 遗漏扫描**(逐条核对iter-14承诺)：
- 多案卷聚合院端体检 → ✅(/api/institution 8案聚合)
- 高频违规规则TOP/涉及金额 → ✅(T-201~A-101橙条)
- 科室分布 → ✅(肿瘤内科/骨科/呼吸内科/肝胆外科/放射科)
- 专科领域覆盖(5领域可视化) → ✅(蓝条)
- 违规类型分布 → ✅(双列表)
- 受检案卷清单(违规/合规) → ✅(红/绿标)
- UI按钮+模态+条形图 → ✅(截图)
- 干净件0误报红线无回归 → ✅PASS
- 0 console error → ✅
- 文档(CHANGELOG/本报告/TASKS/记忆) → ✅
**8. 已知问题/风险**：①画像基于8个演示案卷(产品态需真实抽样批量,已disclaimer标注);②金额聚合为初筛疑点金额非最终核定(已注未计线索);③科室名来自case front_page.admit_dept(真实需HIS科室字典对齐);④领域映射DOMAIN_BY_ID硬编码(新领域需补映射,已fallback case_meta.specialty)。
**9. KPT**：Keep=纯叠加层设计(新维度复用runAudit逐案rollup,不碰引擎)让"机构画像"这种大功能零回归风险上线,红线一跑即证;Problem=preview重启+location.reload后页面一度空白(scripts全空),是reload时序问题,改用window.location.href显式导航root后恢复——preview改后端口/重启,UI验证前要先显式导航再操作(summary早记过的坑,本轮又踩,固化为纪律);Try=iter-15(三连轮第3轮)收尾——补门诊药店专科开"门诊场景"新结构(P-301~303,跳出住院材料结构),或把机构画像接导出/趋势。
**10. 下一轮(iter-15)计划**：三连轮第3轮(收官)。倾向补门诊药店专科(P-301~303):开"门诊/零售药店"新场景结构(处方+购药记录,区别于住院病案),回应"全面全"再下一城+证明系统不只住院;药店问题清单19条已逐字核实在kb1。备选:机构画像接导出PDF/趋势,或shadow规则落盘(iter-12 backlog B07b)。
**11. 拍板**：无(按既定方向自主推进)。

---

## iter-13 — 麻醉专科真fire（第5个完整可fire领域，回应"其他也全面全"）

**1. 本轮完成**：新增麻醉专科完整可fire领域（照影像iter-10 pattern）。case_anes（全麻下腹腔镜胆囊切除术，以麻醉记录单为事实基准硬比对）：M-301收费时长240>实际180→¥300(序156)/M-302全麻内涵含气管插管另收¥150(序159)+术中监测内涵含心电¥80+氧饱和度¥60另收(序160)/M-303丙泊酚收5支>实际3支→¥90(序155)/M-304未入麻醉恢复室却收监护费→线索(序162)；+1干扰(术后镇痛泵PCA独立操作正确不报)。4个checker(M-301~304)+触发谓词+CoVe;政策引新疆官方麻醉问题清单逐字(✅已核实);UI案卷选择器+麻醉记录tab(标注各为哪条规则硬比对基准)+补齐边界件标签。
**2. 测试**：node/curl+浏览器双验。麻醉案**5疑点(¥680)+1线索+1正确不报**与金标准一致(M-301×1/M-302×3/M-303×1疑点+M-304线索)；8案卷AuditBench干净件3件(clean+2边界)误报0**红线PASS**;路由麻醉案激活7/58(M-301~304命中,A-101/105/106激活但正确未fire);政策引用UI显✅已核验逐字;浏览器麻醉记录tab渲染+三要素证据链(费用240min vs 麻醉记录180min→¥300)+0 console error+截图。全程确定性引擎省MiniMax额度。
**3. 可用性**：麻醉成第5个"现场切真出疑点不尴尬"领域(继肿瘤/骨科/DRG/影像);麻醉记录tab把"实际时长/实际用量/未入恢复室"显式标注为各规则比对基准,稽核员一眼看懂证据从哪来;M-302把"全麻内涵已含气管插管/监测"逐字摊开,对错分明无指征争议。
**4. 灵活性体检**：新领域=案例JSON+4 checker读anesthesia_record专属字段(actual_duration_min/drugs_used.actual_qty/pacu_used)+触发谓词,其他7案卷无anesthesia_record自动不触发→零跨层扩散;复用mkFinding/reconcile/CoVe/控辩裁/置信全链路;政策逐字走既有问题清单→policyTexts管线(ver"2025版"自动归一2025匹配规则ref)。
**5. 采纳建议**：补麻醉专科(Rachel明确"其他也全面全"+ARCHITECTURE_REVIEW P0落差收敛);以麻醉记录单为事实基准做硬比对(对错分明路径,继影像/骨科);政策只引官方逐字(序155/156/157/159/160/162已核实,不编造)。
**6. 拒绝/搁置**：M-304真接机构资质数据(本轮按规则L3设计输出线索+needs_more,需外部PACU资质库,生产期接);更多麻醉违规型(如神经阻滞分解/麻醉耗材串换,本轮先4条核心);其余专科(重症/药店/心血管/血净)增量补(iter-14起)。
**7. 遗漏扫描**(逐条核对iter-13承诺)：
- 麻醉案例(真fire,以麻醉记录硬比对) → ✅(5疑点+1线索)
- M-301~304 checker+触发谓词 → ✅(全部firing正确)
- 问题清单逐字引用(序155/156/157/159/160/162) → ✅(UI显✅已核验)
- 1干扰正确不报(PCA独立操作) → ✅
- UI案卷选择器+麻醉记录tab → ✅(渲染+硬比对基准标注)
- 8案卷干净件0误报红线无回归 → ✅PASS
- M-302误命中麻醉行本身bug → ✅发现并修复(加!/麻醉/排除)
- 0 console error → ✅
- 文档(CHANGELOG/本报告/TASKS/记忆) → ✅
**8. 已知问题/风险**：①M-304线索依赖外部机构PACU资质(本轮按L3线索设计,已needs_more标注不夸大);②麻醉违规仅4条核心型(神经阻滞/麻醉耗材等未覆盖);③M-302监测内涵判定依赖费用行命名(心电监测/氧饱和度监测),若机构命名异化需扩regex;④可fire领域达5个但重症/药店/心血管/血净仍库存待补。
**9. KPT**：Keep=新领域先研究已核验问题清单逐字再建案例(麻醉17条早已核实,直接引序号,不编造措辞)——政策禁编造红线靠"先有逐字源再写规则"落地;Problem=`items.find(/气管插管/)`误命中麻醉行本身("全身麻醉（气管插管）"名内含子串),关键词匹配要警惕"基准行vs另立行"混淆,已加`!/麻醉/`排除并在测试中靠"raw6→merged5少1条"反查出来——raw/merged计数差是抓checker漏报的好探针;Try=iter-14换维度做机构汇总画像页(把8案卷聚合成院端体检,展示横向覆盖广度),或继续补门诊药店专科(开新场景结构)。
**10. 下一轮(iter-14)计划**：本轮是"三连轮"第1轮。二选一——(A)机构汇总画像一页(多案卷聚合院端体检:高频违规规则TOP/涉及金额/科室分布/可fire领域覆盖图)——换维度、把已建广度可视化、demo提升altitude；(B)再补一个专科(重症ICU-301~303住院 或 药店P-301~303开门诊新场景),继续"全面全"。倾向(A)(round1已补专科,round2换维度做画像更有节奏,且能把5领域覆盖一图展示)。
**11. 拍板**：无(按既定方向自主推进)。

---

## iter-12 — 规则状态机·观察期(shadow)：误报闭环从"标记"到"执行"

**1. 本轮完成**：把 iter-11 的"高误报待复审"标记**做成真执行**——规则被复核驳回≥3次→自动转 shadow 观察期：稽核时仍跑仍展示完整证据链，但**不计入疑点/金额**（沉底+置灰+金额划线），等 re_review。`runAudit`加`shadowRules`选项(命中→`shadow:true`+`shadow_reason`，从suspected/clue剔除，排序沉底，保留findings透明展示)；summary加`shadow_count/shadow_rules/shadow_amount_withheld`；server`currentShadowRules()`读review_feedback→flagged_rules→注入`/api/audit`实时生效；UI观察期banner+卡片「🌓观察期·不计分」徽标+金额划线+灰底+理由+AuditBench「复核反馈回流」区重述为"已转shadow观察期"。
**2. 测试**：curl+浏览器双验。**①回归(安全缺省)**：空feedback→main 6疑点+1线索¥8901 shadow0、7案卷干净件0误报红线PASS，与iter-11**完全一致**；**②shadow执行**：A-105连驳3次→转shadow，main疑点6→5、疑点金额¥8901→¥8797、shadow扣留¥104、shadow_rules['A-105']、A-105卡片沉底标shadow；**③回弹**：重置feedback→秒回6+1/¥8901 shadow0、红线PASS。浏览器实测shadow-banner+卡片徽标+金额划线+沉底+0 console error+截图存证。全程确定性引擎省MiniMax额度。
**3. 可用性**：误报闭环现"看得见摸得着"——驳回不再石沉大海，≥阈值规则当场降权、金额扣留可见(¥104已扣留待复审)，稽核员的"不认同"真正改变了引擎输出；shadow卡片保留完整证据链(透明:为何本该报却不计)，而非粗暴隐藏，符合"可解释/可对质"基调。
**4. 灵活性体检**：shadow=纯叠加层——`runAudit`无shadowRules时零行为变化(安全缺省)，规则/checker/案例**全未动**；server 1个helper+1处注入；UI 1 banner+findingCard微调+1 CSS块；bench刻意不接shadow(保持纯引擎red line oracle，治理叠加只在live audit)，关注点分离干净。
**5. 采纳建议**：误报闭环"标记→执行"(iter-11 KPT-Try承诺兑现，恒识式"淘汰坏规则"落到实处)；shadow态对齐三审三验治理模型(active→shadow只观察)；bench保持纯引擎oracle(red line语义稳定，不被运行期feedback污染)。
**6. 拒绝/搁置**：①LLM路径(`/api/audit?mode=llm`)暂未接shadow(llmAgentAudit自有管线，本轮聚焦默认确定性路径——demo主路；后续可post-process其findings)；②shadow→真正改rules.yaml的rule.status字段落盘(本轮是运行期动态计算flagged，未回写规则文件三态status；回写需配套"复审通过→恢复active"的反向流，进iter后续)；③shadow阈值3为经验值(真实按规则历史误报率校准)。
**7. 遗漏扫描**(逐条核对iter-12承诺)：
- flagged规则→自动转shadow只观察不计分 → ✅(runAudit shadowRules，实测A-105扣留¥104)
- 安全缺省:空feedback行为=iter-11 → ✅(main 6+1/¥8901 shadow0，红线PASS)
- shadow发现仍展示证据链(透明非隐藏) → ✅(A-105卡片完整evidence/policy/CoVe/控辩裁)
- UI可见(banner+徽标+金额处理+沉底) → ✅(截图存证)
- AuditBench复核反馈回流区反映shadow态 → ✅(重述"已转shadow观察期")
- bench保持纯引擎red line不被污染 → ✅(bench未接shadow)
- 重置可回弹 → ✅(秒回基线)
- 0 console error+不破坏现有功能 → ✅
- 文档(CHANGELOG/本报告/TASKS) → ✅
**8. 已知问题/风险**：①shadow仅运行期动态计算(读feedback)，未回写rules.yaml的status三态字段——规则文件仍标active，"真治理落盘"待iter后续(+复审恢复反向流)；②LLM路径未接shadow(确定性主路已接)；③若误把合规规则(如F-003)驳到shadow会漏报该类——但可秒重置且有shadow_reason透明可追溯，且驳回必填原因有门槛；④阈值3需真实误报率校准。
**9. KPT**：Keep=安全缺省设计(空输入=旧行为)让高风险特性(改计数)也能放心上线，回归测试一跑即证零偏差——这是"宁漏勿误红线"在工程上的护栏；Problem=本轮一度想顺手把bench也接shadow，及时刹住(bench是引擎oracle不该被运行期feedback污染)，关注点分离要克制；Try=iter-13把shadow"落盘"——复审动作(采纳规则申诉/确认下线)写回rules.yaml的status(draft/shadow/active)+复审恢复反向流，让规则三态治理从"运行期算"到"文件落盘"，或转做机构汇总画像页(单件→院端体检维度)。
**10. 下一轮(iter-13)计划**：二选一——(A)规则三态落盘:shadow/复审结论写回rules.yaml的status字段+"复审通过恢复active"反向流+规则质检页显三态流转(把治理从运行期动态计算升级为文件可追溯)；(B)机构汇总画像一页(多案卷聚合院端体检:高频违规规则TOP/涉及金额/科室分布/趋势)。倾向(A)(把iter-11/12的误报治理闭环彻底做实再横向扩)。
**11. 拍板**：无(按既定方向自主推进)。

---

## iter-11 — 边界干扰件红线加固 + 误报回流闭环（"规则沉淀"的对偶=淘汰坏规则）

**1. 本轮完成**：①红蓝对抗边界干扰件×2(`case_edge_egfr`奥希替尼+EGFR阳性报告→T-201正确不报；`case_edge_gcsf`长效升白针+前次重度中性粒减少→T-205正确不报)，embedded=0纳入AuditBench干净件；②⭐误报回流闭环——采纳/驳回/补材料真持久化(`data/review_feedback.json`，server `/api/review` POST/GET+reviewStats)，驳回必填原因，某规则被驳回≥3次自动标"高误报待复审"(re_review)，AuditBench模态「复核反馈回流」区可见+每次点击即时回显累计驳回次数；③仓库根`.gitignore`(密钥/依赖/日志/运行期反馈，路径修正)。
**2. 测试**：node+curl——7案卷AuditBench干净件3件(clean+edge_egfr+edge_gcsf)误报总数=0**红线PASS**(meta `red_line_clean_zero_fp:true`)，两边界件均0疑点0线索；review闭环 curl 实测 A-110连驳3次→正确进flagged_rules、采纳1次入库；浏览器实测 main案运行→7动作块带data-rule/fid、点采纳→持久化+回显"已持久化(采纳)"、showBench模态显"累计：采纳1·驳回0·补材料0"、**0 console error**。省MiniMax额度全程走确定性引擎。
**3. 可用性**：误报闭环把"规则沉淀"从口号做成**可见**——驳回必填原因杜绝无脑驳，≥3次自动复审让稽核员的"不认同"真正反推规则治理；边界干扰件让评委看到"鹰眼不是见药就报"，宁漏勿误的红线有了红蓝对抗背书。
**4. 灵活性体检**：边界件=纯数据JSON(零代码)，靠现有checker除外逻辑(T-201靶点检测/T-205前次重度)自然不报，验证"除外情形"是引擎能力非硬编码；review闭环=server加2端点+1统计函数+UI改2函数(renderActions/reviewAction)+1新函数(renderReviewFlow)，零侵入引擎/规则；运行期反馈文件gitignore，不污染源。
**5. 采纳建议**：误报回流闭环(恒识式"规则沉淀"对偶，doc05论文治理思想落地)、边界干扰件红蓝对抗(iter-6 KPT的Try承诺兑现)、驳回≥阈值re_review(规则治理三审三验的运行期入口)。
**6. 拒绝/搁置**：驳回reason用原生`prompt()`(非内联输入框)——demo够用且自动化可走API验，内联表单UX优化进backlog；re_review后真正"自动改规则状态draft/shadow"(本轮仅标记flagged，规则状态机联动进iter后续)；更多专科边界件(麻醉/重症等除外情形)增量补。
**7. 遗漏扫描**(逐条核对iter-11承诺)：
- 边界干扰件T-201(EGFR阳性) → ✅0疑点(除外生效)
- 边界干扰件T-205(前次重度中性粒减少) → ✅0疑点(除外生效)
- 两件纳入AuditBench+干净件红线 → ✅(clean_cases 3, false_positive_total 0)
- 采纳/驳回/补材料持久化json+server端点 → ✅(/api/review POST/GET)
- 驳回必填原因 → ✅(UI prompt拦空)
- 驳回回流统计≥阈值标高误报待复审 → ✅(reviewStats flagged_rules, curl验A-110连驳3)
- 复核界面显示历史标注/反馈 → ✅(AuditBench模态「复核反馈回流」区+点击回显)
- UI按钮真POST(非仅视觉) → ✅(浏览器实测持久化)
- 0误报红线无回归 → ✅PASS
- 文档(TASKS/CHANGELOG/本报告) → ✅
**8. 已知问题/风险**：①驳回原因用原生prompt()，UX粗(demo可接受，已标backlog)；②re_review目前仅"标记"，未联动规则状态机(draft→shadow)真下线规则，需iter后续接三审三验；③review_feedback.json无并发锁(单机demo无碍，生产需DB);④flagged阈值3为经验值，真实需按规则历史误报率校准。
**9. KPT**：Keep=每轮先node/curl standalone测全链路再浏览器eval验UI(本轮curl验闭环+浏览器验持久化双保险，省MiniMax额度走确定性)；Problem=`app/.gitignore`里写`data/...`路径无效(gitignore相对自身目录)，已改为仓库根`.gitignore`修正——以后gitignore路径必确认相对位置；Try=iter-12把re_review真正联动规则状态机(flagged规则→自动转shadow态停止计分，让"淘汰坏规则"从标记走到执行)，或补一份机构汇总画像页(把单件稽核升到院端体检)。
**10. 下一轮(iter-12)计划**：二选一推进——(A)规则状态机联动:flagged高误报规则自动转shadow态(只观察不计分)+规则质检页显状态流转，让误报闭环从"标记"到"执行";(B)机构汇总画像一页:多案卷聚合成院端"体检报告"(高频违规规则/涉及金额TOP/科室分布),把单件稽核升维到机构画像。倾向(A)(闭环完整性优先)。
**11. 拍板**：无(按既定方向自主推进)。

---

## iter-10 — 收敛规则库落差（影像案例真fire）+LLM合议+修标签

**1. 本轮完成**：②修多模态vision标签(visionModelName);③医学影像案例case_imaging+IMG-301/302 checker(增强重复平扫/胶片超量,读影像检查记录);①LLM findings过合议层reconcile(audit-engine导出,白蛋白双角度去重);IMG-302名/类型对齐firing。
**2. 测试**：node standalone——5基准案卷(main6+1/clean0/ortho4/drg1/imaging2)AuditBench干净件0误报红线PASS;影像案IMG-301¥280+IMG-302¥72政策✅✅+DR摄影正确不报;reconcile mock 3→2去重(白蛋白A-108+A-110→1主+佐证¥1280非¥2560)。浏览器eval确认影像案加载+影像检查记录tab+2 IMG findings。未跑全量LLM(省Rachel的MiniMax额度,reconcile用mock验)。
**3. 可用性**：医学影像成第4个完整可fire领域(继肿瘤/骨科/DRG),现场切影像案真出疑点不尴尬;案卷选择器6项。
**4. 灵活性体检**：新领域=案例JSON+checker读专属记录(operation_note/imaging_record)+trigger谓词,其他案卷无该记录不触发,零扩散;reconcile复用于确定性引擎+LLM两路。
**5. 采纳建议**：P0收敛落差(ARCHITECTURE_REVIEW,基本型——避免"全都能跑"错觉);LLM也走合议(一致体验);标签诚实(显真实vision模型)。
**6. 拒绝/搁置**：麻醉/重症/药店/心血管/血净案例+checker(本轮先做影像1个示范,其余增量补);全量LLM跑验合议(省额度,mock已验逻辑)。
**7. 遗漏扫描**(逐条核对iter-10承诺)：
- ②修vision标签 → ✅(visionModelName,显abab6.5s-chat)
- ③影像案例+checker真fire → ✅(IMG-301/302实测+干扰不报+零回归)
- ①LLM过合议层 → ✅(reconcile导出+后置调用+mock验去重)
- 干净件0误报红线+原案卷零回归 → ✅(5案卷)
- 文档(TASKS/CHANGELOG v1.0/本报告) → ✅
**8. 已知问题/风险**：①规则库58条仍非全部可fire(现可fire领域:肿瘤/骨科/DRG/影像+通用A/F/E-503≈18条;麻醉/重症/药店/心血管/血净/口腔等仍库存待补案例+checker)——已增量收敛,非一轮能全补;②真·LLM合议未跑全量验证(省额度,mock验逻辑对);③imaging案护理记录空(门诊),A-105等不误触发已确认。
**9. KPT**：Keep=收敛落差用"做实1个示范领域"而非空喊,影像继骨科/DRG成第4个完整闭环;省额度用mock验逻辑。Problem=规则库铺得比checker快,需持续增量补案例;preview截图偶发stale(eval已确认功能,不纠结截图)。Try=iter-11边界干扰件(误报控制)或误报回流闭环(采纳驳回持久化)或再补1领域(麻醉)案例。
**10. 下一轮(iter-11)计划**：边界干扰件深化误报控制(T-201-EGFR阳性/T-205-前次重度中性粒减少"看似违规实则合规");或误报回流闭环(采纳/驳回持久化+驳回原因回流);或再补麻醉案例+checker。
**11. 拍板**：无。

---

## iter-9 — 接入MiniMax：真·LLM分析+原生多模态都跑成真（Rachel给key）

**触发**：Rachel睡前给MiniMax key"跑真的,他有原生多模态"。
**1. 本轮完成**：①key安全存.env+.gitignore+server轻量env加载器;②实测MiniMax接口(文本MiniMax-Text-01/视觉abab6.5s-chat,api.minimaxi.com/v1/text/chatcompletion_v2);③llm-provider.js提供方适配层,llm-agent+ingest改用;④真·LLM管线真跑(6疑点+1线索,独立判断,~100s);⑤原生多模态真跑(canvas病历图→MiniMax-VL→结构化,19s);⑥管线务实化(prosecutor+批量CoVe,控辩裁按需)。
**2. 测试**：✅真·LLM:real_agent=true,provider=MiniMax,读病历自由文本独立提6疑点(白蛋白识别为A-108+A-110双角度,CoVe降级T-205→线索)。✅多模态:浏览器canvas生成病历图POST/api/ingest→MiniMax-VL抽出患者"张测试"/诊断"右肺腺癌"/4费用行,契约通过。health"LLM就绪 provider=MiniMax"。
**3. 可用性**：真·语义分析按钮现真跑(green banner);导入扫描件真解析。确定性引擎仍是1-7ms快路径,LLM是~100s"证明真"路径。
**4. 灵活性体检**：provider适配层解耦,换Anthropic只需切env;callLLM/callVision统一接口,llm-agent/ingest零感知provider。
**5. 采纳建议**：MiniMax原生多模态(Rachel指定);provider抽象(免锁单一厂商);管线务实化(17调用→2,控成本)。
**6. 拒绝/搁置**：PDF多模态(MiniMax-VL读图,PDF需先转图,已提示);控辩裁自动跑(改按需,省成本)。
**7. 遗漏扫描**(逐条核对iter-9承诺)：
- key安全存.env不进git → ✅(.gitignore)
- 真·LLM跑成真(修假分析) → ✅(MiniMax实测real_agent=true,真推理)
- 原生多模态跑成真 → ✅(MiniMax-VL实测读图抽结构化)
- provider适配层 → ✅(llm-provider.js,MiniMax/Anthropic)
- UI/health报告就绪 → ✅("LLM就绪")
- 四案卷零回归(确定性引擎不受影响) → ✅(独立路径)
- 文档(TASKS/CHANGELOG v0.9/本报告) → ✅
**8. 已知问题/风险**：①多模态source标签显文本模型名(cosmetic,应显abab6.5s-chat),iter-10修;②真·LLM~100s较慢(2大调用),现场演示用确定性快路径+LLM按需证明;③LLM输出金额/规则归类与确定性引擎略异(独立判断,白蛋白未走合议层去重)——可选:对LLM findings也跑合议层;④key是Rachel的,消耗其MiniMax额度(已最小化调用数)。
**9. KPT**：Keep=用户给key先实测接口格式再写适配(empirical,避免猜错模型名:MiniMax-VL-01错/abab6.5s-chat对);密钥进.env不进代码。Problem=多Agent全跑17调用太重,务实化到2;真·LLM慢。Try=iter-10:①对LLM findings跑合议层去重;②修vision标签;③回到P0收敛规则库落差(麻醉/影像案例+checker)。
**10. 下一轮(iter-10)计划**：①LLM findings过合议层(白蛋白去重);②修vision provider标签;③P0收敛规则库落差(麻醉/影像案例+checker让专科规则真fire);④可选优化LLM时延(prosecutor流式/精简prompt)。
**11. 拍板**：无(key已给,真跑已通)。真·LLM消耗Rachel的MiniMax额度,已把每次审计的调用数从17压到2。

---

## iter-8 — 真Agent分析 + 全领域规则 + 宏观审查（Rachel三点反馈）

**触发**：Rachel三点——①时不时宏观看架构/体验流;②"现在agent分析也是假分析吧";③全领域资料写更完善规则不止肿瘤。
**1. 本轮完成**：①真·LLM多Agent管线(llm-agent.js:稽核→CoVe→控辩裁,真模型调用)+诚实标注(模板脚本vs真LLM)+真·语义分析按钮;②全领域规则42→58(麻醉/重症/药店/影像/心血管/血净);③问题清单KB(5领域逐字✅+4领域行业旁证+3领域框架,3 research agent);④宏观架构审查ARCHITECTURE_REVIEW.md。
**2. 测试**：curl实测 mode=llm无key→诚实needs_key不假跑;默认→analysis_kind=deterministic+template。浏览器实测 mode-banner"⚙确定性引擎...模板脚本"+kind-tag"脚本演示·真版切LLM"+🧠真·语义分析按钮。58规则,四案卷零回归(6+1/0/4/1),干净件0误报红线PASS。
**3. 可用性**：诚实标注后,演示不再"假装真Agent";真版需key一键切。规则库全领域全景(58条)显著扩。
**4. 灵活性体检**：真Agent管线与确定性引擎并存(mode切换);新专科规则=纯条目,问题清单KB自动建序号引用,server零改动resolve。
**5. 采纳建议**：诚实化"假分析"(Rachel点名,基本型最高优先);真·LLM多阶段管线(doc04/05控辩裁+CoVe落为真调用);全领域逐字优先于编造(research agent先行)。
**6. 拒绝/搁置**：真OCR/真LLM跑通需key(已建管线,待Rachel给key录真演示);专科规则checker+案例(P0落差,iter-9补);口腔/内分泌/精神逐字(官方未上网,标框架)。
**7. 遗漏扫描**(逐条核对iter-8承诺)：
- 真Agent管线(稽核/CoVe/控辩裁真调用) → ✅(llm-agent.js,无key诚实回退)
- 诚实标注"模板脚本vs真LLM" → ✅(banner+kind-tag+按钮,实测)
- 全领域规则(不止肿瘤) → ✅(58条,+6领域16规则)
- 问题清单全领域逐字资料 → ✅(麻醉/重症/药店/肿瘤/影像逐字+其余诚实标注)
- 宏观架构+体验流审查 → ✅(ARCHITECTURE_REVIEW.md,发现P0落差)
- 四案卷零回归+红线 → ✅
- 文档(TASKS/CHANGELOG v0.8/本报告) → ✅
**8. 已知问题/风险**(诚实)：①真·LLM需配ANTHROPIC_API_KEY方能真跑(管线已建,现场无key仍是确定性引擎+模板,但已诚实标注不假装);②★58规则仅~14有checker会fire——切麻醉/影像案例不会出疑点(规则库≠全部可fire),已在ARCHITECTURE_REVIEW标P0,iter-9收敛;③心血管/血净/康复/检验逐字为行业旁证(部分核实),口腔/内分泌/精神仅框架,均诚实标注待官方核。
**9. KPT**：Keep=用户质疑"假"时先诚实承认+标注,再建真版,不粉饰;研究agent先核验再写规则,绝不编造清单措辞。Problem=纵向深度不均(规则库铺开但checker没跟上),易给"全都能跑"的错觉。Try=iter-9收敛规则库落差(给麻醉/影像各补1案例+checker,或UI明确区分可fire vs库存)+边界干扰件。
**10. 下一轮(iter-9)计划**：P0收敛"规则库vs会fire"落差(麻醉/影像案例+checker 或 UI区分)+边界干扰件(误报控制);P1误报回流闭环(采纳/驳回持久化)。
**11. 拍板**：真·LLM语义分析要现场真跑需 Rachel 提供 ANTHROPIC_API_KEY(管线已就位,这是唯一外部依赖)。

---

## iter-7 — 输入端：多模态摄取 + 医院API接口（Rachel点名补的缺口）

**触发**：Rachel 问"输入端是不是没做、多模态/医院API接口留好没有"。诚实答：之前只手工喂结构化JSON，多模态解析与医院接口都没做。本轮补齐。
**1. 本轮完成**：engine/ingest.js(3入口:结构化/多模态视觉/连接器+契约校验)、connectors/hospital.js(适配器接口+MockHIS可运行+FHIR/HL7契约)、/api/ingest+/api/connectors、UI导入材料模态、事实层anchor.bbox契约打通。
**2. 测试**：curl实测——/api/connectors列3连接器(MockHIS可用/FHIR/HL7待配,视觉未配);/api/ingest connector(mock-his)→uploaded案卷;稽核uploaded 0疑点(样例clean)。浏览器实测导入模态3入口渲染完整(扫描件多模态+未配视觉提示+PP-StructureV3契约/粘JSON/HIS拉取)。
**3. 可用性**：导入模态把"材料怎么进来"讲清,数据不出域写在显眼处;多模态未配key时给契约而非报错,P5信息科友好。
**4. 灵活性体检**：新增医院接入=实现一个Connector子类的pullEncounter;新解析器=实现ingestDocument分支。摄取产物统一medical_record契约,下游零改动。
**5. 采纳建议**：补输入端(Rachel点名,基本型最高优先);多模态接Claude视觉(配key真跑)+PP-StructureV3/RAGFlow契约回退(诚实);连接器接口化(FHIR/HL7/HIS)。
**6. 拒绝/搁置**：真OCR坐标填anchor.bbox(需配视觉模型/PP-StructureV3,契约已打通,真值待生产);FHIR/HL7真实现(需对接目标医院)。
**7. 遗漏扫描**(逐条核对iter-7承诺)：
- 多模态解析入口 → ✅(engine/ingest.js document路径,接Claude视觉/契约回退)
- 医院API接口留好 → ✅(connectors/hospital.js 适配器接口+MockHIS可运行+FHIR/HL7契约)
- /api/ingest + /api/connectors → ✅(curl实测)
- UI导入入口 → ✅(导入材料模态3入口)
- 数据不出域声明 → ✅(模态显著位置+连接器注释)
- 事实层anchor.bbox契约 → ✅(解析schema要求回填,待真OCR值)
- 文档(TASKS/CHANGELOG v0.7/master §0.6/本报告) → ✅
**8. 已知问题/风险**：①多模态视觉解析需配ANTHROPIC_API_KEY或接PP-StructureV3方能真跑(无key给契约,不夸大);②FHIR/HL7连接器为契约级(MockHIS可跑demo);③uploaded案卷存内存,?fresh=1重载会清(演示无碍)。
**9. KPT**：Keep=遇到用户点名的缺口,先诚实承认现状再补,不粉饰;Problem=preview截图偶发捕捉不到模态(eval确认已开但截图是背景),改用"再开一次立即截";Try=iter-8回到边界干扰件深化误报控制。
**10. 下一轮(iter-8)计划**：边界干扰件(T-201-EGFR阳性/T-205-前次重度中性粒减少 等"看似违规实则合规"),纳入AuditBench干净件红线;或门诊场景。
**11. 拍板**：无(输入端按"接口留好+多模态配key真跑"方向补齐,符合既定全栈方向)。

---

## iter-6 — D-401 高套分组案例（支付方式维度）

**1. 本轮完成**：DRG高套案例(社区获得性肺炎编重症肺炎)、D-401 checker(主诊断vs病历反向证据,negation-aware)、政策引用修正(实施细则23条)、4案卷UI选择器+AuditBench、hasPositiveEvidence否定感知helper。
**2. 测试**：4案卷实测——main 6+1、clean 0误报、ortho 4、drg 1(D-401 ¥3100)；AuditBench红线✅PASS 1ms；浏览器实测drg案卷切换+病案首页高套编码展示+D-401渲染。
**3. 可用性**：案卷选择器现4选项(肿瘤/干净/骨科/DRG),一键切换覆盖4类违规场景;D-401报告含"出院诊断vs主诊断不一致"印证,说服力强。
**4. 灵活性体检**：新增D-401仅加SEVERITY_CODING表+1 checker+1预测谓词,读front_page,其他案卷无重症编码不触发——零扩散。
**5. 采纳建议**：D-401支付方式维度(主文档既定)、CC/MCC升级思路(doc07研究:不入组编码是白名单,真风险在CC/MCC)。
**6. 拒绝/搁置**：精确高套金额(需OpenDRG分组器跑ES1x vs ES3x)——本轮用估算¥3100+needs_more标注,真分组器接入进iter后续。
**7. 遗漏扫描**(逐条核对iter-6承诺)：
- DRG高套案例+1干扰 → ✅(1疑点D-401+糖尿病正确不报)
- D-401 checker(编码vs病历反向证据,不入组/CC-MCC思路) → ✅
- server注册+UI选择器+病案首页编码展示 → ✅
- 4案卷干净件0误报红线 → ✅PASS
- negation-aware(防"无呼吸衰竭"误判) → ✅(发现并修复)
- 头孢日期一致性(防A-109误报) → ✅(修复L03起止)
- 文档(TASKS/CHANGELOG/本报告) → ✅
**8. 已知问题/风险**：①高套金额为估算,真值需分组器(已needs_more标注,不夸大);②D-401的SEVERITY_CODING目前仅"重症肺炎"一条,其他高套模式(脓毒症/恶性肿瘤伴并发症)待扩;③实施细则23条逐字为⚠部分核实(官方图片PDF),已标注。
**9. KPT**：Keep=每轮先node standalone测全案卷再浏览器验,快速抓回归(本轮抓到2个bug);Problem=中文否定词在关键词匹配中易假阳(无呼吸衰竭),已建hasPositiveEvidence通用helper以后复用;Try=iter-7做边界干扰件深化误报控制(红蓝对抗阴性用例)。
**10. 下一轮(iter-7)计划**：边界干扰件(T-201-EGFR阳性/T-205-前次重度中性粒减少 等"看似违规实则合规"案例,测规则除外情形)纳入AuditBench;附一次4案卷案卷切换的人设/可用性走查。
**11. 拍板**：无。

---

## iter-5 — 骨科备演案例（硬证据托底）

**1. 本轮完成**：骨科 PKP 备演案例(4硬证据违规+1干扰)、4个骨科checker、手术记录结构化、UI三案卷选择器+手术记录tab、联网核验骨科政策(KB1椎体成形费内涵逐字✅)、record形状归一(bug修复)。
**2. 测试**：3案卷实测——main 6疑点+1线索、clean 0误报、ortho 4疑点¥8880+1正确不报；AuditBench红线✅PASS；引擎/JSON全绿；浏览器实测案卷切换+手术记录tab+骨科疑点渲染无误。
**3. 可用性**：骨科备演是"对错分明"场景，P1/评委友好（数量/内涵硬比对，无指征争议）；案卷选择器一键切换，操作效率高。
**4. 灵活性体检**：新增一份案卷=丢JSON+server注册1行+(如需)新checker；本轮加4 checker均读operation_note，肿瘤/干净案卷无operation_note自动不触发——零跨层扩散。✓
**5. 采纳建议**：骨科备演(doc04建议,RICE高)、走"内涵分解收费"路径(研究agent纠偏:PVP无独立问题清单条目)。
**6. 拒绝/搁置**：PVP"专门违规条目"——研究核实官方无此条目，改走内涵路径(避免被申诉挑出)。
**7. 遗漏扫描**(逐条核对iter-5承诺)：
- 骨科案例4违规+1干扰 → ✅全部firing正确
- 4 checker(A-101内涵/A-106分解/A-109数量/A-107串换) → ✅
- UI案卷选择器+手术记录tab → ✅
- 政策核验+KB入库+引用 → ✅(椎体成形费内涵已核验逐字)
- record形状归一 → ✅(修复ortho无progress_notes崩溃)
- 干净件红线 → ✅仍PASS
- 主文档§0.5+CHANGELOG+TASKS → ✅
**8. 已知问题/风险**：①骨科违规逐字措辞为"行业/省局汇编(部分核实)"，官方网页未刊登骨科逐条——已改走"官方价格内涵"路径(已核实)规避；②骨科耗材分类代码日期纠正为2026-01-16(研究agent发现任务书"2024-01"有误)，已入KB正确日期；③串换用"进口/国产"代理高低值,官方通用名实为"含药/非含药"——已在KB audit_note标注。
**9. KPT**：Keep=研究agent先行核验再建案例，避免编造问题清单措辞；Problem=改engine必重启server(模块缓存)，已成固定动作;Try=下轮D-401高套引入OpenDRG思路对比。
**10. 下一轮(iter-6)计划**：D-401/T-208 高套分组案例+checker(病案首页编码vs病历反向证据,用DRG2.0不入组编码列表)。
**11. 拍板**：无(按既定肿瘤主线+骨科备演方向,默认推进)。

---

## iter-4 — doc08 规则系统级评审（合议/覆盖度/冲突仲裁）
见对话内 iter-4 报告。核心：合议层(白蛋白¥1280三规则→1主疑点+2佐证、金额去重)、覆盖度声明、规则关系仲裁、三级短路、C-301分级。SUS 75→78，干净件0误报红线PASS。
