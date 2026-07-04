# S5 当日碰头会小结
服务角色: 组长
载体: 报告引擎模板
优先级: P0

## 角色可见性
- 组长

## 输入 schema
- plan_id: string

## 输出 schema
- onsite_daily_brief markdown
- onsite_daily_brief html
- onsite_daily_brief pdf fallback

## 依赖既有资产
- leader-report 报告引擎
- inspection_task

## LLM 降级路径
- 不使用 LLM
- PDF 失败回退可打印 HTML
