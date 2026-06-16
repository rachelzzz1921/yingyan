# 鹰眼原型 · 任务台账（单一事实来源 · 只进不丢）

> 规则见 `claude-code-自迭代全栈开发提示词-v2.md` 第1.5节。任务离开台账只有两条路：完成，或写明理由移入 BACKLOG。
> 状态：TODO / DOING / DONE / DEFERRED(+原因)。来源：用户要求(U) / 自规划(S) / 测评评审发现(R)。

## 本期 SMART 目标
把 04/05/06/07/08 五份战略+架构+评审文档**全部落地为可现场点击的运行原型**；引擎对违规件跑出正确疑点、对干净件零误报；doc08 三大宏观机制（合议/覆盖度/冲突仲裁）可演示。

---

## DONE（截至本轮）
| # | 内容 | 来源 | 轮次 |
|---|---|---|---|
| D01 | 模拟病历包实体(NSCLC,6违规+2干扰)+金标准+可读MD | U | iter-1 |
| D02 | 全量机读 rules.yaml(42条:通用33+肿瘤8+E-503)+rules.json | U | iter-1 |
| D03 | 零依赖全栈原型(server+确定性引擎+LLM路径+稽核工作台UI) | U | iter-1 |
| D04 | KB1政策库(条例38/40逐字+目录限定支付逐字)+KB2临床库(指导原则2025逐字) | U | iter-1 |
| D05 | 政策核验勘误(38条七项/40条四项/2025问题清单肿瘤15条收费类/T-201改挂依据) | S/R | iter-1 |
| D06 | 控辩裁多Agent对质(T-205疑点→线索降级演示) | U(04) | iter-2 |
| D07 | 事实层Case Object(每条事实带源锚点+OCR置信) | U(07升1) | iter-3 |
| D08 | 触发器路由(42条激活11条) | U(07升2) | iter-3 |
| D09 | AuditBench评测(干净件0误报红线PASS) | U(07升3) | iter-3 |
| D10 | 复核工作台(点证据→费用行高亮+采纳/驳回/补材料) | U(07升4) | iter-3 |
| D11 | E-503对抗注入检测+注入演示 | U(07升5) | iter-3 |
| D12 | 置信度校准+金额×置信排序 | U(07升6) | iter-3 |
| D13 | CoVe取证自检 | U(05) | iter-3 |
| D14 | 双模式(稽核/体检)+监管文书化导出+pitch演示要点面板 | U(05/06) | iter-3 |
| D15 | 干净对照件(AuditBench干净件) | S | iter-3 |
| D16 | 主文档回写 v1.5(§0落地实况表逐项对照蓝图→实现) | U | iter-3 |

## DONE（doc08 系统级评审落地 · iter-4）
| # | 内容 | 来源 | 状态 |
|---|---|---|---|
| T01 | ⭐合议层 Reconciliation：白蛋白"一笔钱三规则命中"→1主疑点B-201+2佐证[A-110,A-108]、金额只算¥1280(非¥3840) | U(08宏观①) | ✅DONE(engine reconcile+UI recon banner/block,实测) |
| T02 | 覆盖度声明 Coverage Manifest：7维度+执行/跳过+材料完整性(基因检测缺失) | U(08宏观②) | ✅DONE(coverageManifest+UI覆盖度表) |
| T03 | 规则关系仲裁：A-108⊥A-107、C-301⊃C-302 relations字段+全局豁免清单(meta) | U(08宏观③) | ✅DONE(rules.yaml relations+global_suppression_list) |
| T04 | 三级短路计数(材料门→L1=3→触发器13→L2候选10) | U(08效率②) | ✅DONE(routing.short_circuit+UI路由条) |
| T05 | C-301分级阈值(核心区≤7/观察区8-15/豁免白名单) | U(08细节) | ✅DONE(checkDistractors zone+rules.yaml threshold_zones) |
| T06 | A-109/T-204扣最小包装规格+损耗(computeExpectedQty向上取整,差额≥1支才报) | U(08细节) | ✅DONE |
| T07 | 规则Schema增 relations 字段(B-201/A-108/C-301) | U(08) | ✅DONE |
| T08 | G/H类全景占位(meta.category_roadmap 8类+其他缺口) | U(08第二部分) | ✅DONE(占位,真实现见B05) |
| T09 | 主文档增§3.7规则系统级机制(合议/覆盖度/冲突) | U(08第五部分) | ✅DONE(master v1.5 §3.7) |

## 方法论（采纳 claude-code 自迭代提示词 v2 · iter-4）
| # | 内容 | 来源 | 状态 |
|---|---|---|---|
| M01 | 任务台账(本文件)+PREMORTEM | U | ✅DONE |
| M02 | Phase3 多角色测评(P1/P3/P5/P6)+尼尔森审计+SUS78 | U | ✅DONE(PERSONA_FEEDBACK.md+USABILITY_AUDIT.md) |
| M03 | Phase4 RICE+Kano建议(12条,采纳7)→DECISIONS.md | U | ✅DONE |
| M04 | Phase5 采纳项落地(合议/覆盖度/关系/分级 + 移动端头部S3/对比度S4) | U | ✅DONE |
| M05 | Phase6 迭代报告(KPT+遗漏扫描) | U | ✅DONE(iter-21) |

## DONE（iter-5 · 骨科备演案例）
| # | 内容 | 来源 | 状态 |
|---|---|---|---|
| I5-1 | 骨科PKP备演案例(4硬证据违规+1干扰)：A-101穿刺内涵重复¥680/A-106球囊复位分解¥1200/A-109球囊数量¥3800/A-107骨水泥串换¥3200 | U(04备演) | ✅DONE(case_ortho,实测4疑点¥8880) |
| I5-2 | 4个骨科checker(内涵重复/分解/耗材数量vs手术记录/高低值串换)+手术记录结构化 | S | ✅DONE |
| I5-3 | UI案卷选择器(肿瘤/干净/骨科切换)+手术记录tab(耗材实际用量比对表) | S | ✅DONE |
| I5-4 | 联网核验骨科政策→KB1椎体成形费内涵逐字(✅天津转发立项指南)+骨科耗材分类代码2026-01-16 | R | ✅DONE(A-101/A-106/A-107引用已核验内涵) |
| I5-5 | record形状归一(缺单据默认空,checker免各自防御) | R(bug修复) | ✅DONE |
| I5-6 | AuditBench纳入骨科(3案卷),干净件0误报红线仍PASS | S | ✅DONE |

## DONE（iter-6 · D-401高套分组案例）
| # | 内容 | 来源 | 状态 |
|---|---|---|---|
| I6-1 | DRG高套案例 case_drg(社区获得性肺炎编为重症肺炎,病历不支持)+1干扰(次诊断糖尿病编码正确) | U(主文档D-401) | ✅DONE(实测1疑点D-401 ¥3100) |
| I6-2 | D-401 checker(主诊断编码vs病历反向证据,CC/MCC升级类,negation-aware防"无呼吸衰竭"误判) | S | ✅DONE |
| I6-3 | D-401政策引用修正(实施细则23条:高套→38条第七项 + DRG2.0分组方案) | R | ✅DONE |
| I6-4 | UI案卷选择器纳入drg(4案卷),AuditBench 4案卷干净件0误报红线仍PASS | S | ✅DONE |
| I6-5 | hasPositiveEvidence否定感知helper(排除无/未/非/未见/排除/不伴) | R(bug修复) | ✅DONE |

## DONE（iter-7 · 输入端：多模态摄取 + 医院API接口）★Rachel点名补的缺口
| # | 内容 | 来源 | 状态 |
|---|---|---|---|
| I7-1 | engine/ingest.js 摄取层：①结构化上传(即用) ②document多模态(接Claude视觉,配key真跑;无key给PP-StructureV3/RAGFlow契约) ③medical_record契约校验 | U(点名) | ✅DONE |
| I7-2 | connectors/hospital.js 医院适配器接口(留好接口)：MockHIS(可运行demo)+FHIR R4(映射契约)+HL7v2(契约) | U(点名) | ✅DONE |
| I7-3 | server: /api/ingest(structured/document/connector→uploaded案卷) + /api/connectors | S | ✅DONE |
| I7-4 | UI 导入材料模态(3入口:扫描件多模态/粘JSON/HIS拉取)+导入即注册uploaded案卷可稽核 | S | ✅DONE |
| I7-5 | 事实层anchor.bbox契约打通(多模态解析回填page/bbox/ocr_conf→点击疑点原件高亮坐标来源) | S | ✅契约级(待真OCR填值) |

## DONE（iter-8 · Rachel三点反馈：真Agent/全领域规则/宏观审查）
| # | 内容 | 来源 | 状态 |
|---|---|---|---|
| I8-1 | ★真·LLM多Agent管线 engine/llm-agent.js(稽核→CoVe→控辩裁,每阶段真模型调用);server mode=llm用它;无key诚实告知不假跑 | U(点名"假分析") | ✅DONE |
| I8-2 | 诚实标注:确定性引擎"检测=真算/推理控辩裁CoVe=模板脚本";UI mode-banner+kind-tag"脚本演示·真版切LLM";新增🧠真·语义分析(LLM)按钮 | U | ✅DONE(实测) |
| I8-3 | 全领域规则扩展:42→58条(+麻醉M-301~304/重症ICU-301~303/药店P-301~303/影像IMG-301~303/心血管CV-301~302/血净BP-301) | U(点名"不止肿瘤") | ✅DONE |
| I8-4 | 问题清单KB kb1_problem_lists.json:麻醉17/重症9/药店19/肿瘤15/影像14逐字✅+心血管/血净/康复/检验(行业/旁证,诚实标注)+口腔内分泌精神(框架);3个research agent核验 | R | ✅DONE |
| I8-5 | server wire问题清单→policyTexts(专科规则引官方逐字序号);四案卷零回归,58规则 | S | ✅DONE |
| I8-6 | ★宏观架构+体验流审查 docs/ARCHITECTURE_REVIEW.md(发现P0:58规则但仅~14有checker会fire,深度不均) | U(点名"宏观看架构") | ✅DONE |

## DONE（iter-9 · 接入MiniMax真跑：真LLM分析+原生多模态都成真）★Rachel给key
| # | 内容 | 来源 | 状态 |
|---|---|---|---|
| I9-1 | MiniMax key安全存.env(+.gitignore不进git)+server轻量.env加载器(无dotenv依赖) | U(给key) | ✅DONE |
| I9-2 | 实测MiniMax接口:文本=MiniMax-Text-01 / 视觉=abab6.5s-chat(原生多模态),endpoint api.minimaxi.com/v1/text/chatcompletion_v2(OpenAI兼容) | R(实测) | ✅DONE |
| I9-3 | engine/llm-provider.js 提供方适配层(MiniMax/Anthropic统一callLLM+callVision);llm-agent.js+ingest.js改用它 | S | ✅DONE |
| I9-4 | ★真·LLM管线真跑成功:MiniMax读病历自由文本→6疑点+1线索(独立判断,白蛋白A-108+A-110双角度,CoVe正确降级T-205)~100s | U(点名"假分析") | ✅DONE(实测real_agent=true) |
| I9-5 | ★原生多模态真跑成功:canvas生成病历图→MiniMax-VL读图→结构化(患者/诊断/4费用行,契约通过)19s | U("原生多模态") | ✅DONE(实测) |
| I9-6 | llm-agent管线务实化:prosecutor(1调用)+批量CoVe(1调用),控辩裁改按需runDebate(省成本/时延) | S | ✅DONE |
| I9-7 | health/connectors/UI报告provider=MiniMax,LLM就绪;真·语义分析按钮真跑MiniMax | S | ✅DONE(header"LLM就绪") |

## DONE（iter-10 · 收敛规则库落差 + 修标签 + LLM合议）
| # | 内容 | 来源 | 状态 |
|---|---|---|---|
| I10-1 | ②修多模态source标签:llm-provider加visionModelName(),ingest显"MiniMax-VL(abab6.5s-chat)"(原错显文本模型) | iter9-§10 | ✅DONE |
| I10-2 | ③P0收敛落差:医学影像案例case_imaging(IMG-301增强重复平扫¥280/IMG-302胶片收10用4超量¥72)+1干扰(DR摄影合规)+2 checker(读影像检查记录硬比对)+案卷选择器+影像记录tab | U(ARCHITECTURE_REVIEW P0) | ✅DONE(实测2疑点+1不报) |
| I10-3 | ①LLM findings过合议层reconcile(白蛋白A-108+A-110双角度→1主疑点+佐证去重),audit-engine导出reconcile,llm-agent后置调用 | iter9-§10 | ✅DONE(mock验证3→2去重) |
| I10-4 | IMG-302规则名/violation_type对齐firing逻辑(胶片超张数,重复收费序2);影像问题清单逐字引用✅ | R | ✅DONE |
| I10-5 | 现可fire领域:肿瘤/骨科/DRG/影像(+合议/对抗E-503/F/A类),6案卷AuditBench干净件0误报红线PASS | S | ✅DONE |

## DONE（iter-11 · 边界干扰件红线加固 + 误报回流闭环）
| # | 内容 | 来源 | 状态 |
|---|---|---|---|
| I11-1 | ①红蓝对抗边界干扰件case_edge_egfr(奥希替尼+EGFR L858R阳性报告→T-201除外正确不报),embedded=0纳入AuditBench干净件 | iter6-KPT-Try承诺 | ✅DONE(实测0疑点0线索) |
| I11-2 | ①红蓝对抗边界干扰件case_edge_gcsf(长效升白针+前次重度4级中性粒减少→T-205限定支付满足正确不报),embedded=0纳入干净件 | iter6-KPT-Try承诺 | ✅DONE(实测0疑点0线索) |
| I11-3 | 两边界件注册server loadAll(cases.edge_egfr/edge_gcsf),AuditBench干净件3件(clean+2边界)误报总数=0红线PASS | S | ✅DONE(meta red_line_clean_zero_fp:true) |
| I11-4 | ②⭐误报回流闭环-server:/api/review POST(持久化data/review_feedback.json)+GET(读历史+stats)+reviewStats()(by_rule聚合/totals/flagged_rules) | U(iter11承诺) | ✅DONE |
| I11-5 | ②驳回回流:某规则被驳回≥REJECT_RETHRESHOLD(3)次自动进flagged_rules标"高误报待复审"触发re_review | U(iter11承诺) | ✅DONE(curl验A-110连驳3) |
| I11-6 | ②UI:reviewAction真POST(原仅切视觉态),驳回必填原因(prompt拦空),即时回显"已持久化(动作)·累计驳回N次";renderActions带data-rule/fid | U(iter11承诺) | ✅DONE(浏览器实测持久化+回显) |
| I11-7 | ②AuditBench模态新增「复核反馈回流」区renderReviewFlow(显累计采纳/驳回/补材料+flagged高误报待复审规则) | S | ✅DONE(showBench并联fetch/api/review) |
| I11-8 | 仓库根.gitignore(密钥app/.env/node_modules/日志/data/review_feedback.json统一忽略);修app/.gitignore误置data路径(gitignore相对自身目录) | R(bug修复) | ✅DONE |
| I11-9 | 全链路无回归:7案卷AuditBench干净件0误报红线PASS,浏览器0 console error;全程走确定性引擎省MiniMax额度 | S | ✅DONE |

## DONE（iter-12 · 规则状态机·观察期shadow：误报闭环从"标记"到"执行"）
| # | 内容 | 来源 | 状态 |
|---|---|---|---|
| I12-1 | ⭐runAudit加shadowRules选项:命中shadow规则的发现标shadow:true+shadow_reason,从suspected/clue计数剔除,排序沉底,保留findings透明展示(完整证据链) | iter11-KPT-Try承诺 | ✅DONE |
| I12-2 | report_meta.summary加shadow_count/shadow_rules/shadow_amount_withheld(扣留金额) | S | ✅DONE |
| I12-3 | server currentShadowRules()读review_feedback→reviewStats.flagged_rules→注入/api/audit默认确定性路径(实时生效) | S | ✅DONE |
| I12-4 | UI:观察期banner(显扣留金额)+findingCard shadow徽标「🌓观察期·不计分」+金额划线+灰底沉底(.finding.shadow CSS)+shadow_reason说明 | S | ✅DONE |
| I12-5 | UI:AuditBench「复核反馈回流」区把flagged重述为"已转shadow观察期·稽核时仍跑仍展示但不计分" | S | ✅DONE |
| I12-6 | 设计取舍:shadow只作用live /api/audit,bench保持纯引擎red line oracle(不被运行期治理叠加污染),关注点分离 | S(决策) | ✅DONE |
| I12-7 | 安全缺省回归:空feedback→main 6+1/¥8901 shadow0与iter-11完全一致,7案卷红线PASS | S | ✅DONE(curl实测) |
| I12-8 | shadow执行验证:A-105连驳3→转shadow,main疑点6→5/金额¥8901→¥8797/扣留¥104/卡片沉底;重置→秒回弹基线 | R | ✅DONE(curl+浏览器+截图) |

## DONE（iter-13 · 麻醉专科真fire：第5个完整可fire领域）★三连轮第1轮
| # | 内容 | 来源 | 状态 |
|---|---|---|---|
| I13-1 | case_anes麻醉案例(全麻下腹腔镜胆囊切除术,anesthesia_record为事实基准):M-301时长240>180¥300/M-302气管插管¥150+心电¥80+氧饱和度¥60/M-303丙泊酚5>3支¥90/M-304未入PACU收监护费线索+1干扰(PCA) | U("全面全") | ✅DONE(实测5疑点+1线索+1不报) |
| I13-2 | 4个checker M-301~304(读anesthesia_record:actual_duration_min/drugs_used/pacu_used硬比对)+触发谓词+CoVe取证自检 | S | ✅DONE |
| I13-3 | 政策引新疆官方麻醉问题清单逐字(序155/156/157/159/160/162,✅已核实);policyTexts管线ver"2025版"归一2025匹配规则ref;UI显✅已核验 | R | ✅DONE |
| I13-4 | UI:案卷选择器新增💉麻醉专科+补齐两边界件标签;新增麻醉记录tab(方式/实际时长/实际用药/恢复室,标注各规则硬比对基准) | S | ✅DONE |
| I13-5 | 修bug:M-302抓气管插管另收行时find(/气管插管/)误命中麻醉行本身("全身麻醉（气管插管）")→加!/麻醉/排除;靠raw6→merged5少1条反查出 | R(bug修复) | ✅DONE |
| I13-6 | 8案卷AuditBench干净件0误报红线无回归PASS(clean 3件 fp 0);麻醉案路由激活7/58(M命中,A-101/105/106激活但正确未fire);0 console error | S | ✅DONE(curl+浏览器+截图) |

## DONE（iter-14 · 机构汇总画像：单件初筛升维到机构画像）★三连轮第2轮·换维度
| # | 内容 | 来源 | 状态 |
|---|---|---|---|
| I14-1 | server /api/institution + institutionPortrait():对全部案卷跑runAudit后聚合(by_rule/by_type/by_dept/by_domain/case_rows) | S(B08落地) | ✅DONE |
| I14-2 | 聚合:高频违规规则TOP(按金额)/违规类型分布/科室分布/专科领域覆盖(5领域)/受检案卷清单(违规-合规) | S | ✅DONE |
| I14-3 | UI 🏥机构画像按钮+showInstitution模态:5 KPI卡+横向条形图(规则橙条/领域蓝条)+科室/类型双列表+案卷清单 | S | ✅DONE |
| I14-4 | CSS:ins-bar条形/ins-2col双列/bench-kpis改auto-fit适配5卡;干净/合规件灰显正确放行 | S | ✅DONE |
| I14-5 | 实测:受检8案/疑点18/¥21913/干净3-3/5领域;T-201¥4704领涨;0 console error;纯叠加未动引擎红线PASS | R | ✅DONE(curl+浏览器+截图) |

## DONE（iter-15 · 门诊药店专科真fire：第6个领域·首次跳出住院场景）★三连轮收官
| # | 内容 | 来源 | 状态 |
|---|---|---|---|
| I15-1 | case_pharmacy门诊药店案(新结构:pharmacy_info/sales_records/fee_list带actual_sold/inventory_supported/trace_code):P-303串换口罩¥85+保健品¥60(疑点)/P-301空刷¥38(线索)/P-302回流药¥100(线索)+1干扰(二甲双胍真实售药) | U("全面全"+非住院场景) | ✅DONE(实测2疑点+2线索+1不报) |
| I15-2 | 3 checker P-301/302/303(读actual_sold/inventory_supported/trace_code硬比对)+触发谓词+P-303 CoVe | S | ✅DONE |
| I15-3 | 政策引官方定点零售药店问题清单逐字(序1/5/7,✅已核实);UI显✅已核验 | R | ✅DONE |
| I15-4 | UI:案卷选择器💊门诊药店+药店/进销存tab(医保结算vs实际销售vs追溯码对照表,违规行红底高亮);institution DOMAIN_BY_ID+pharmacy映射 | S | ✅DONE |
| I15-5 | A-108无医嘱误报防控:零售无医嘱→每行设linked_order(处方号/POS号)让A-108谓词不激活(数据层规避,不改A-108) | R(防误报) | ✅DONE(raw=4无脏发现) |
| I15-6 | 9案卷AuditBench干净件0误报红线无回归PASS(clean 3 fp 0);药店案路由激活3/58(P命中);0 console error | S | ✅DONE(curl+浏览器+截图) |

## DONE（iter-16 · 规则三态治理落盘：误报闭环从"运行期计算"到"可追溯治理"）
| # | 内容 | 来源 | 状态 |
|---|---|---|---|
| I16-1 | engine runAudit加retiredRules(deprecated规则跳过不fire)+summary.retired_rules | S | ✅DONE |
| I16-2 | server overlay data/rule_states.json(治理状态与rules.yaml定义分离)+loadRuleStates/saveRuleStates/transitionRule(落盘history from/to/by/reason/ts) | iter12-Try承诺 | ✅DONE |
| I16-3 | currentShadowRules/currentRetiredRules改从落盘状态读;/api/review POST驳回≥3自动转shadow落盘(autoShadowFromReview作用域限本次复核规则) | S | ✅DONE(落盘持久,重启仍生效) |
| I16-4 | 反向流/api/rule-governance GET(状态机+三态汇总+history)/POST(restore→active/retire→deprecated必填理由/shadow) | iter12-Try承诺 | ✅DONE |
| I16-5 | UI 🗂规则治理面板:状态机图+在役/观察/下线KPI+非active规则流转history+复审按钮(恢复在役/确认下线);复核反馈回流区指向治理页 | S | ✅DONE |
| I16-6 | 修bug:autoShadowFromReview原遍历全flagged→人工restore被无关复核覆盖→收窄到本次被复核规则 | R(bug修复) | ✅DONE |
| I16-7 | 验收:自动shadow落盘+重启持久+restore回active+retire不fire+空理由拒+作用域修正;9案卷红线PASS;0 console error | S | ✅DONE(curl+浏览器+截图) |

## DONE（iter-17 · 重症ICU专科真fire：第7个完整可fire领域）
| # | 内容 | 来源 | 状态 |
|---|---|---|---|
| I17-1 | case_icu重症ICU案例(ARDS,icu_record为事实基准):ICU-302呼吸机120>96¥1200+CRRT48>40¥640/ICU-301特级护理重复收专项护理¥300+ICU-303干扰(有ICU收治记录正确不报)+心电监测计费=实际不报 | U("全面全") | ✅DONE(实测3疑点+1不报) |
| I17-2 | 3 checker ICU-301/302/303(读icu_record:ventilator/crrt.actual_hours/nursing_level/admission_to_icu)+触发谓词+ICU-302/301 CoVe | S | ✅DONE |
| I17-3 | 政策引官方重症医学问题清单逐字(序174/175/179,✅已核实);UI显✅已核验 | R | ✅DONE |
| I17-4 | UI:案卷选择器🫀重症ICU+重症记录tab(ICU收治/护理级别/呼吸机·CRRT实际时长硬比对基准);institution DOMAIN_BY_ID+icu映射 | S | ✅DONE |
| I17-5 | 误报防控一次过:ARDS诊断避D-401/linked_order避A-108/美罗培南避B-202/护理一致避A-105;raw=3无脏发现 | R(防误报) | ✅DONE |
| I17-6 | 10案卷AuditBench干净件0误报红线无回归PASS(clean 3 fp 0);路由chip ICU-303 hit=false正确未误标;0 console error | S | ✅DONE(curl+浏览器+截图) |

## DONE（iter-18 · 机构画像导出《院端体检报告》：可交付物落地）
| # | 内容 | 来源 | 状态 |
|---|---|---|---|
| I18-1 | server renderInstitutionReport(portrait)→markdown《院端体检报告》(体检结论+规则TOP+类型/科室/领域分布+受检案卷清单+免责)+/api/export/institution端点 | B08(画像可用化) | ✅DONE |
| I18-2 | UI机构画像模态加📄导出院端体检报告按钮(window.open新标签下载) | S | ✅DONE |
| I18-3 | 实测:导出10份/疑点23/¥24198/7领域5表完整;纯叠加未动引擎红线无回归;0 console error | R | ✅DONE(curl+浏览器) |

## DONE（iter-19 · 规则治理增强：复审计数清零 + 治理操作流水）
| # | 内容 | 来源 | 状态 |
|---|---|---|---|
| I19-1 | 复审计数清零:restore记ack_rejects(已确认驳回数),autoShadowFromReview改按"有效驳回=累计−已确认"≥阈值才转shadow(修iter-16限制) | iter-16 backlog B07d | ✅DONE(四步curl验) |
| I19-2 | 治理操作流水:/api/rule-governance GET加audit_log(各规则history聚合时间线倒序)+UI🧾治理操作流水表(最近12条) | iter-16 backlog B07d | ✅DONE(浏览器验) |
| I19-3 | 复核反馈回流/治理页文案同步"复审恢复清零计数";10案卷红线无回归;0 console error | S | ✅DONE |

## DONE（iter-20 · 稽核/体检模式真差异化 + 后台起江苏价格research agent）
| # | 内容 | 来源 | 状态 |
|---|---|---|---|
| I20-1 | 模式真差异化(引擎不变只换panel口径):结论卡(疑点/疑点涉及金额→风险点待自查整改/飞检暴露金额)+VIEW_EXAM全局 | U(点选mode-toggle问"有区别吗") | ✅DONE |
| I20-2 | examDisposal()处置语气转换(责令退回→飞检前主动退回/移交骗保线索→院端重点自查留存,app+server双份+责令catch-all);disposal标签处置建议→自查整改建议 | U | ✅DONE |
| I20-3 | 体检横幅说明院端视角+疑点区标题⚠疑点与线索→🩺风险点与线索(院端自查口径) | S | ✅DONE |
| I20-4 | 导出文书分模式:/api/export/checklist?mode=exam→《自查整改清单(院端自查)》(院端整改状态:已整改/已主动退回),renderChecklist加mode参 | S | ✅DONE |
| I20-5 | 实测同案两模式findings一致(6+1/¥8901)红线不动;导出两版措辞正确;0 console error | R | ✅DONE(curl+浏览器+截图) |
| I20-6 | 后台起research agent联网核实江苏护理价格(回应用户"江苏数据导入"问)→核到苏医保发2025-20号护理类价格(特160/Ⅰ65/Ⅱ30/Ⅲ22元/日官方逐字),为iter-21导入备料 | U(问江苏导入) | ✅DONE(research完成) |

## 交互微调（用户即时请求，随手做随手记）
| # | 内容 | 来源 | 状态 |
|---|---|---|---|
| UX-1 | logo溢出修复+做真logo:header "鹰眼"两字溢出46px方框→换成鹰眼SVG标志(白色眼形轮廓+青色虹膜+鹰眉,brand青accent),.logo去字体样式+overflow:hidden;配套favicon.svg(navy底鹰眼,浏览器标签页) | U(点选logo"做个logo字也不要溢出") | ✅DONE(浏览器验无溢出+截图) |

## DONE（iter-GIAC · 增量调优 · GIAC 五件套）
| # | 内容 | 来源 | 状态 |
|---|---|---|---|
| G1 | 内部案卷编号 `YY-{SCOPE}-{DOMAIN}-{SEQ}` + case_registry.json + intake 自动 INT 号 | U(GIAC) | ✅DONE |
| G2 | PII 脱敏 pii-redact.js — 送 LLM 前脱敏姓名/证件/住院号 | U(GIAC) | ✅DONE |
| G3 | RAG as_of 入院日过滤 kb/as-of.js + retrieval + L5 评测 Q21/Q22 | U(GIAC) | ✅DONE |
| G4 | Parse QA parse-qa.js — intake 写入 parse_quality + 置信惩罚 + UI 警告 | U(GIAC) | ✅DONE |
| G5 | 合规前置 compliance-gate.js C-001~C-005 确定性 + UI compliance_flags | U(GIAC) | ✅DONE |
| G6 | LLM context-budget.js token 预算 + context_manifest | U(GIAC) | ✅DONE |
| G7 | AuditBench 扩至 20 案卷 + 全案 expected_findings.json | U(GIAC) | ✅DONE |
| G8 | 驳回→eval 草案 queue + dashboard 确认/忽略 UI | U(GIAC) | ✅DONE |
| G9 | YHF G1 shadow strict 开启 + 10 core rules 聚合 | U(GIAC) | ✅DONE |
| G10 | GET /api/maturity + dashboard 工程成熟度/GIAC 卡片 | U(GIAC) | ✅DONE |
| G11 | `bash yhf/run.sh --strict` G0+G4+G1 全 PASS | R | ✅DONE |

## DONE（iter-21 · Intake/OCR 链闭环）
| # | 内容 | 来源 | 状态 |
|---|---|---|---|
| I21-1 | PP-Structure sidecar lite+tesseract 路径 + install-paddle Py≤3.12 说明 | U | ✅DONE |
| I21-2 | demo 费用清单 PNG/PDF + `scripts/verify-intake-bbox.js` E2E | S | ✅DONE(PDF 3行 bbox PASS) |
| I21-3 | ppstructure-mapper OCR 词行分列解析 → anchor.bbox | S | ✅DONE |
| I21-4 | 双入口：intake.html 完整页 + 主工作台快速导入弹窗 | U | ✅DONE |
| I21-5 | 疑点 jumpToLoc → 费用行 `.bbox-highlight` + OCR 坐标 tooltip | S | ✅DONE |
| I21-6 | 顶栏 L1✓(engine) / L1— honest 提示 | S | ✅DONE |

### 案卷编号规范（registry 单一事实来源）
```
YY-{SCOPE}-{DOMAIN}-{SEQ:03d}
SCOPE: DEMO | BENCH | INT | LIVE
DOMAIN: NSCLC | ORTHO | DRG | CLEAN | …（见 case_registry.json）
SEQ: 001–999 按 DOMAIN 递增，禁止手填重复
```

## BACKLOG / DEFERRED（写明理由）
| # | 内容 | 理由 |
|---|---|---|
| B01 | ~~骨科耗材备演案例~~ | ✅iter-5已完成(走价格内涵分解收费路径,有官方逐字内涵支撑) |
| B02 | LLM真·多Agent辩论/LangGraph | DEFERRED：需API key，P2，确定性脚本版已够演示 |
| B03 | 抓官方88类/24.7万规则库做KB1基线 | DEFERRED：需联网批量抓取+OCR，P1下轮 |
| B04 | PP-StructureV3真OCR坐标接事实层 | DEFERRED：anchor.bbox已预留，生产期接 |
| B05 | G类时序/H类统计离群 真实现 | DEFERRED：依赖批量/群体数据底座，P2，本轮仅占位 |
| B06 | 门诊/药店/耗材规则族 | DEFERRED：P2扩展，本轮架构图体现 |
| B07 | ~~re_review真联动规则状态机(flagged→自动转shadow态只观察不计分)~~ | ✅iter-12已完成(runAudit shadowRules,实测A-105扣留¥104,安全缺省回归PASS) |
| B07b | ~~shadow/复审结论落盘:status三态(draft/shadow/active)+复审恢复反向流+规则质检页三态流转~~ | ✅iter-16已完成(用overlay rule_states.json分离定义与状态,而非改rules.yaml源;auto-shadow落盘+restore/retire反向流+🗂规则治理页) |
| B07d | ~~restore后驳回计数清零 + 治理操作audit log~~ + deprecated规则在routing显"下线"标 | 前两项✅iter-19完成(ack_rejects计数清零+治理操作流水);routing显下线标仍待做(P3小项) |
| B07c | LLM路径(/api/audit?mode=llm)也接shadow(post-process llmAgentAudit findings) | P2：确定性主路已接,LLM慢路径后补,省额度 |
| B08 | ~~机构汇总画像一页(多案卷聚合院端体检:高频违规TOP/涉及金额/科室分布)~~ | ✅iter-14已完成(/api/institution+🏥机构画像模态,受检8案/疑点18/¥21913/5领域) |
| B08b | 机构画像接导出PDF/真实趋势同比(需多时间断面数据底座) | P2：本轮静态聚合屏显，趋势需历史数据 |
| B09 | 驳回原因内联输入框(替原生prompt) | P2：demo用prompt够用，UX优化 |
| B10 | 更多专科边界干扰件(麻醉/重症/药店除外情形红蓝对抗) | P2：增量补，丰富AuditBench |
