# S8 现场速查
服务角色: 全员
载体: 哨兵热键技能
优先级: P1

## 角色可见性
- 组长
- 医疗组
- 财务组
- 信息组
- 政策组
- 数据组

## 输入 schema
- query: string
- region: string
- as_of: date

## 输出 schema
- kb_hits[]
- citation_refs[]

## 依赖既有资产
- KB 检索
- 引用解析
- schema 校验包装器

## LLM 降级路径
- structuredCall
- KB keyword search
- 明确标注未验证
