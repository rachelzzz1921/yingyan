# 鹰眼 EagleEye · 浏览器扩展(开单事前提醒)

**口号:安装即用,无需对接,无需调整任何调度。**

政策出处:"定点医药机构可以将两库置于本机构智能提醒等信息化系统中……将不合规行为消除在萌芽阶段"。
定位:医院**自装自用**提升服务效能的工具(不触碰"医保部门统一APP"边界,全程 B 端)。

## 安装(演示)
1. 启动鹰眼本地服务:`cd prototype/app && node server.js`(:3700)
2. Chrome/Edge 打开 `chrome://extensions` → 开发者模式 → "加载已解压的扩展程序" → 选本目录
3. 访问演示靶站 `http://localhost:3700/mockhis.html` → 右上角出现"🦅 鹰眼已挂载"
4. 点"提交医嘱" → 插件先审方:16岁患者开左氧氟沙星 → 浮层弹出 AGE-101 提醒(两库年龄分层依据+政策原文)

## 结构
- `manifest.json` MV3;host_permissions 仅本地引擎(数据不出机)
- `yingyan-precheck.js` 共享实现(与 MockHIS 内嵌演示通道同一份逻辑,源在 prototype/app/public/plugin/)
- `content.js` 挂载徽标 + 拦截"提交医嘱"先审方(有命中暂缓提交,不阻断诊疗——医生复核后可坚持提交)

## 适配真实 HIS
content script 的表单读取按"标签文本→相邻单元格"退化匹配(年龄/性别/临床诊断),
对未做 data-field 标注的老 HIS 表格同样工作;matches 域名按院方部署加白即可。
