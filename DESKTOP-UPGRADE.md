# 记忆引擎升级说明（v285-d/v286-d 桌面版）

与手机端（ib-mobile-private v285-p/v286-p）同源的内存引擎升级，移植到电脑版 InternalBeyond.html。
基准：腾讯云 /opt/internalbeyond-web/desktop/InternalBeyond.html（服务器版，含 GitHub 没有的本地修改）。

## 移植差异（相对手机端）
- 注入函数：`getMemoryContext`（手机端为 buildMemBlock），行构建 `_formatMemLine`
- 预算口径：15000/4000（手机 2000/200），保留 15% 探索预算给联想专座
- 记忆创建漏斗：`quickCreateMemory`（手机端直接 dbPut）
- 事实核查走 `callApi(cfg, ...)`（手机端 callAI）
- 养护抽屉：桌面端为右侧滑出面板（460px 固定定位），按钮在 Memory 页按钮组

## 功能（与手机端一致）
1. 门槛制召回：idf 覆盖度绝对门槛 0.15（可调/可关），总上限 8，近 7 天 ≤3，联想专座取代随机探索，浮现面包屑
2. 引语逐字回源：quickCreateMemory / _generateMemoryCore / _ibMemWriteExec 全路径，对不上转待审，确认前不注入不检索
3. 记忆养护面板：待审队列 / 做梦提醒 / 归档建议（只建议不执行）/ 假零自检 / 门槛日志与被挡回顾 / 嵌入通道设置
4. 检索零命中自动重检 + 待审排除
5. 可选嵌入通道（默认关，失败降级词法）

## 验证
13 个脚本块 node --check 全过；冒烟 11/11（门槛/语义救援/降级/待审/回源/浮现道）。

## 部署
已部署到腾讯云 /opt/internalbeyond-web/desktop/（emberroom.cn/desktop/），原文件备份为 InternalBeyond.html.bak-before-v286d-*。许可：PolyForm Noncommercial，仅私人使用。
