# 实现计划：Gemini Deep Think Extension

## 概述

将现有 Gemini 深度思考 UserScript（main.js）迁移为 Manifest V3 浏览器扩展。按照从基础架构搭建、核心数据模型、引擎逻辑、DOM 处理、UI 组件到最终集成的顺序，逐步实现并验证。

## 任务列表

- [ ] 1. 项目初始化与 Manifest V3 基础架构
  - [ ] 1.1 初始化 Vite + React + TypeScript 项目
    - 使用 Vite 最新版（Rolldown 引擎）创建项目
    - 安装依赖：react, react-dom, @mui/material, @emotion/react, @emotion/styled, mobx, mobx-react-lite
    - 安装开发依赖：typescript, vitest, fast-check, @testing-library/react, jsdom, @types/chrome
    - 配置 tsconfig.json 启用装饰器支持（MobX）和严格模式
    - _需求: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ] 1.2 配置 Vite 构建扩展产物
    - 配置 Vite 以 IIFE 格式输出 content-script.js
    - 配置 CSS 提取为独立文件 content-script.css
    - 配置 background.js 的最小化 Service Worker 构建入口
    - 确保构建产物输出到 dist/ 目录
    - _需求: 1.2_

  - [ ] 1.3 创建 manifest.json
    - 声明 Manifest V3 规范
    - 配置 content_scripts 注入 `https://gemini.google.com/app/*`
    - 声明 content-script.js 和 content-script.css
    - 声明 background service worker
    - 声明 storage 权限（用于 chrome.storage.local）
    - 创建占位图标文件
    - _需求: 1.1_

  - [ ] 1.4 创建 background.js Service Worker
    - 实现最小化 Service Worker，仅处理扩展生命周期事件（onInstalled）
    - _需求: 1.1_

  - [ ] 1.5 创建 Content Script 入口文件和 React 挂载点
    - 创建 src/content-script/index.tsx 作为入口
    - 在 Gemini 页面 DOM 中创建 React 根容器节点
    - 初始化 React 应用挂载
    - 预留 Skills 扩展入口的模块结构（空目录 + 导出占位）
    - _需求: 1.2, 1.7_

- [ ] 2. 数据模型与状态管理层
  - [ ] 2.1 定义 TypeScript 类型与接口
    - 创建 src/types/index.ts
    - 定义 DeepThinkConfig、ActionMarkerConfig、EngineState、FloatingBallPosition、EnginePhase 等类型
    - 定义 DEFAULT_CONFIG 常量（包含默认 reviewPhases、markers、systemPromptTemplate）
    - _需求: 8.1, 8.2, 8.3_

  - [ ] 2.2 实现 PersistService
    - 创建 src/services/persist-service.ts
    - 实现 load()：从 chrome.storage.local 读取配置，失败时返回 null
    - 实现 save()：将配置写入 chrome.storage.local，失败时 console.warn
    - 使用 STORAGE_KEY = 'dt-extension-config'
    - _需求: 8.4, 8.5_

  - [ ] 2.3 实现 StateStore（MobX）
    - 创建 src/stores/state-store.ts
    - 使用 MobX makeAutoObservable 定义运行时状态字段和配置字段
    - 实现 toggleAgent、setGenerating、incrementLoop、resetState、updateConfig 等 action
    - 实现 loadConfig()：调用 PersistService.load()，失败回退 DEFAULT_CONFIG
    - 实现 persistConfig()：防抖 500ms 调用 PersistService.save()
    - _需求: 1.5, 2.11, 2.12, 8.4, 8.5_

  - [ ]* 2.4 编写 StateStore 属性测试
    - **Property 1: 配置持久化往返一致性** — 任意合法 DeepThinkConfig 经 save 后 load 应完全等价
    - **验证需求: 2.11, 2.12, 8.4**

  - [ ]* 2.5 编写 StateStore 属性测试
    - **Property 22: 配置加载失败回退默认值** — storage 返回 null/异常时应回退 DEFAULT_CONFIG
    - **验证需求: 8.5**

- [ ] 3. Site Adapter 层
  - [ ] 3.1 定义 ISiteAdapter 接口
    - 创建 src/adapters/site-adapter.ts
    - 定义接口方法：getEditor, getSendButton, isGenerating, getLastResponseText, insertTextAndSend, getUserBubbles, getResponseMessages, getObserverConfig, isGenerationComplete, isGenerationStarted, shouldReinjectUI
    - _需求: 1.6, 9.1_

  - [ ] 3.2 实现 GeminiAdapter
    - 创建 src/adapters/gemini-adapter.ts
    - 封装所有 Gemini 特有 DOM 选择器（.ql-editor, .send-button, message-content, .query-text 等）
    - 实现 insertTextAndSend：使用 execCommand 插入文本 + 轮询发送按钮（最多 15 次，200ms 间隔）
    - 实现 isGenerationComplete / isGenerationStarted：基于 send-button 的 stop class 变化判断
    - 实现 shouldReinjectUI：检测 leading-actions-wrapper 或 UI 容器被移除
    - _需求: 9.2, 9.3_

- [ ] 4. 检查点 - 基础架构验证
  - 确保项目可以正常构建（vite build）
  - 确保 TypeScript 编译无错误
  - 确保所有测试通过，如有问题请询问用户

- [ ] 5. 深度思考引擎核心逻辑
  - [ ] 5.1 实现 DeepThinkEngine 类
    - 创建 src/core/deep-think-engine.ts
    - 构造函数接收 ISiteAdapter 和 StateStore
    - 实现 parseActionMarkers()：解析 THINK_MORE、GOAL_REACHED、NEXT_PROMPT
    - 实现 getReviewPhase()：按 (currentLoop - 2) % reviewPhases.length 索引取审查视角
    - 实现 buildReviewPrompt()、buildForceDeepReviewPrompt()、buildSummaryPrompt()、buildCorrectionPrompt()
    - 实现 sendPrompt()：添加 DT 标签前缀后调用 adapter.insertTextAndSend
    - _需求: 3.2, 3.7, 3.9_

  - [ ] 5.2 实现 evaluateAndAct 核心决策逻辑
    - 实现完整状态机：THINK_MORE → 递增轮次发送审查 Prompt / 超 maxLoops 强制总结
    - GOAL_REACHED → 未达 minLoops 强制深化 / 已达 minLoops 进入总结
    - 无标记 → 发送纠偏 Prompt
    - 总结完成 → 重置状态 + DOM 美化
    - _需求: 3.2, 3.3, 3.4, 3.5, 3.6, 3.8_

  - [ ] 5.3 实现 interceptFirstSend
    - 拦截用户首次发送，记录 originalQuestion
    - 将 System_Prompt 追加到用户输入末尾
    - 设置 currentLoop = 1，触发实际发送
    - _需求: 3.1_

  - [ ] 5.4 实现 abort 方法
    - 设置 userAborted = true
    - 调用 store.resetState() 重置所有状态
    - _需求: 4.1, 4.2_

  - [ ]* 5.5 编写 DeepThinkEngine 属性测试 — Property 6
    - **Property 6: 首次发送拦截** — 深度思考开启且 loop=0 时，interceptFirstSend 应设置 originalQuestion、loop=1，发送文本以用户输入开头 + System_Prompt 结尾
    - **验证需求: 3.1**

  - [ ]* 5.6 编写 DeepThinkEngine 属性测试 — Property 7
    - **Property 7: THINK_MORE 处理** — 包含 THINK_MORE 且 loop ≤ maxLoops 时应递增轮次并生成审查 Prompt
    - **验证需求: 3.2**

  - [ ]* 5.7 编写 DeepThinkEngine 属性测试 — Property 8
    - **Property 8: GOAL_REACHED 与 minLoops 强制执行** — loop < minLoops 时拦截 GOAL_REACHED 继续深化；loop ≥ minLoops 时进入总结
    - **验证需求: 3.3, 3.4**

  - [ ]* 5.8 编写 DeepThinkEngine 属性测试 — Property 9
    - **Property 9: maxLoops 强制总结** — loop > maxLoops 且包含 THINK_MORE 时应强制进入总结
    - **验证需求: 3.5**

  - [ ]* 5.9 编写 DeepThinkEngine 属性测试 — Property 10
    - **Property 10: 缺失标记纠偏** — 不包含任何 Action Marker 的回复应触发纠偏 Prompt
    - **验证需求: 3.6**

  - [ ]* 5.10 编写 DeepThinkEngine 属性测试 — Property 11
    - **Property 11: 下一轮提示选择优先级** — 有 NEXT_PROMPT 时优先使用；无则按索引轮换 reviewPhases
    - **验证需求: 3.7**

  - [ ]* 5.11 编写 DeepThinkEngine 属性测试 — Property 12
    - **Property 12: 总结完成后状态重置** — isSummarizing=true 时总结完成后应重置为初始状态
    - **验证需求: 3.8**

  - [ ]* 5.12 编写 DeepThinkEngine 属性测试 — Property 13
    - **Property 13: 自动 Prompt 的 DT 标签前缀** — 自动发送的 Prompt 应以 ⟪DT:{dtLabel}⟫\n 开头
    - **验证需求: 3.9**

  - [ ]* 5.13 编写 DeepThinkEngine 属性测试 — Property 14
    - **Property 14: 中止操作重置状态** — abort() 后 userAborted=true、isAgentEnabled=false、currentLoop=0
    - **验证需求: 4.1, 4.2**

- [ ] 6. 检查点 - 引擎逻辑验证
  - 确保所有测试通过，如有问题请询问用户

- [ ] 7. DOM 美化处理模块
  - [ ] 7.1 实现 DOMBeautifier 类
    - 创建 src/core/dom-beautifier.ts
    - 构造函数接收 ISiteAdapter 和 StateStore
    - 实现 process()：设置 domBusy 标志，依次调用 processUserBubbles 和 processResponseMarkers
    - _需求: 5.7, 6.6_

  - [ ] 7.2 实现 processUserBubbles
    - 扫描用户消息气泡，检测 DT 标签前缀（⟪DT:...⟫）
    - 隐藏系统指令文本行，保留用户原始内容
    - 纯系统消息（无用户内容）折叠整个气泡
    - 根据标签内容创建彩色标签：默认绿色、"总结"蓝色、"纠偏/警告"橙色
    - 标记 dtDone 防止重复处理
    - _需求: 5.1, 5.2, 5.3_

  - [ ] 7.3 实现 processResponseMarkers
    - 跳过 isGenerating=true 时的处理
    - 遍历 AI 回复文本节点，移除 THINK_MORE / GOAL_REACHED 文本
    - 隐藏 NEXT_PROMPT 段落
    - 移除末尾空白段落
    - 注入可视化徽章（THINK_MORE → 绿色"继续深入思考"，GOAL_REACHED → 蓝色"深度思考完成"）
    - 标记 dtDone
    - _需求: 5.4, 5.5, 5.6, 5.8_

  - [ ]* 7.4 编写 DOMBeautifier 属性测试 — Property 15
    - **Property 15: 用户气泡 DT 标记隐藏** — 包含 DT 前缀的气泡处理后，DT 后文本行应有 dt-hidden class
    - **验证需求: 5.1**

  - [ ]* 7.5 编写 DOMBeautifier 属性测试 — Property 16
    - **Property 16: DT 标签颜色映射** — "总结"→ blue、"纠偏/警告"→ orange、其他 → green
    - **验证需求: 5.3**

  - [ ]* 7.6 编写 DOMBeautifier 属性测试 — Property 17
    - **Property 17: AI 回复标记移除与徽章注入** — 处理后可见文本不含标记，末尾有对应徽章
    - **验证需求: 5.4, 5.5**

  - [ ]* 7.7 编写 DOMBeautifier 属性测试 — Property 18
    - **Property 18: DOM 处理幂等性** — 已标记 dtDone 的元素再次 process() 不应产生修改
    - **验证需求: 5.7**

  - [ ]* 7.8 编写 DOMBeautifier 属性测试 — Property 19
    - **Property 19: 生成中跳过回复处理** — isGenerating=true 时不修改 AI 回复 DOM
    - **验证需求: 5.8**

- [ ] 8. DOM 观察者模块
  - [ ] 8.1 实现 DOMObserver 类
    - 创建 src/core/dom-observer.ts
    - 封装 MutationObserver，监听 document.body 的 childList、subtree、class 属性变化
    - 检测 send-button 的 stop class 变化，判定回复生成开始/完成
    - 回复完成时提取最后一条回复文本，触发 DeepThinkEngine.evaluateAndAct
    - 检测 UI 容器被移除（SPA 导航），触发 UI 重新注入
    - 实现 80ms 防抖调用 DOMBeautifier.process()
    - 实现 domBusy 标志防止反馈死循环
    - _需求: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ]* 8.2 编写 DOMObserver 属性测试 — Property 20
    - **Property 20: 防抖机制** — 80ms 内 N 次调用，process 仅执行一次
    - **验证需求: 6.5**

  - [ ]* 8.3 编写 DOMObserver 属性测试 — Property 21
    - **Property 21: domBusy 防重入** — domBusy=true 时 process() 应立即返回
    - **验证需求: 6.6**

- [ ] 9. 检查点 - 核心模块验证
  - 确保所有测试通过，如有问题请询问用户

- [ ] 10. UI 组件层
  - [ ] 10.1 注入 CSS 样式
    - 创建 src/styles/content-script.css
    - 迁移原 main.js 中的全部 CSS 动画和样式（dtSpin、dtPulse、dtFadeIn、dt-hidden、标签、徽章、状态药丸等）
    - 添加悬浮球和面板的 MUI 主题覆盖样式
    - _需求: 2.13_

  - [ ] 10.2 实现 FloatingBall 组件
    - 创建 src/components/FloatingBall.tsx
    - 实现拖拽移动功能（使用 pointer events 或 react-draggable）
    - 实现拖拽结束后的边缘吸附算法（吸附到最近的左/右边缘，Y 轴限制在可视区域内）
    - 根据 EnginePhase 显示不同视觉状态（idle 灰色、waiting 绿色、thinking 绿色旋转、summarizing 蓝色旋转）
    - 点击事件切换 Panel 显示
    - 使用 MobX observer 包裹组件
    - _需求: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 10.3 编写 FloatingBall 属性测试 — Property 2
    - **Property 2: 悬浮球边缘吸附** — 任意拖拽结束位置，最终 x 应为 0 或 viewportWidth-ballSize，y 限制在 [0, viewportHeight-ballSize]
    - **验证需求: 2.2**

  - [ ]* 10.4 编写 FloatingBall 属性测试 — Property 3
    - **Property 3: 悬浮球视觉状态映射** — 各 EngineState 组合应映射到正确的视觉状态
    - **验证需求: 2.3**

  - [ ] 10.5 实现 Panel 组件
    - 创建 src/components/Panel.tsx
    - 使用 MUI Drawer 或 Popover 实现弹出面板
    - 包含深度思考模式开关（MUI Switch）
    - 包含状态显示区域（当前轮次、运行状态文本）
    - 包含 maxLoops / minLoops / loopDelay 的 MUI TextField 输入控件
    - 包含 Review_Phase 列表编辑器（可增删改）
    - 包含 System_Prompt 模板编辑器（MUI 多行 TextField）
    - 配置修改时调用 store.updateConfig 实时更新
    - 点击面板外部区域关闭面板
    - _需求: 2.6, 2.7, 2.8, 2.9, 2.10, 2.13_

  - [ ] 10.6 实现状态药丸标签
    - 在 Panel 或 FloatingBall 中集成状态药丸显示
    - 思考中显示"🧠 第 N 轮深度思考中"（绿色脉冲动画）
    - 总结中显示"📋 正在生成最终总结"（蓝色脉冲动画）
    - 深度思考关闭或轮次为零时隐藏
    - _需求: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 10.7 编写状态药丸属性测试 — Property 4
    - **Property 4: 状态药丸可见性** — isAgentEnabled=true 且 currentLoop>0 时可见，否则隐藏
    - **验证需求: 7.1, 7.4**

  - [ ]* 10.8 编写状态药丸属性测试 — Property 5
    - **Property 5: 状态文本正确反映引擎阶段** — isSummarizing 时显示总结文本（蓝色），否则显示思考轮次文本（绿色）
    - **验证需求: 7.2, 7.3**

- [ ] 11. 集成与事件绑定
  - [ ] 11.1 在 Content Script 入口中组装所有模块
    - 实例化 GeminiAdapter、StateStore、DeepThinkEngine、DOMBeautifier、DOMObserver
    - 调用 store.loadConfig() 加载持久化配置
    - 启动 DOMObserver 监听
    - 挂载 React 应用（FloatingBall + Panel）
    - _需求: 1.2, 8.5_

  - [ ] 11.2 绑定用户交互事件
    - 拦截 Enter 键和发送按钮点击事件，调用 engine.interceptFirstSend
    - 拦截停止按钮点击事件，调用 engine.abort
    - Panel 开关切换调用 store.toggleAgent / engine.abort
    - 实现 SPA 导航场景下的 UI 重新注入（心跳 2 秒检查）
    - _需求: 3.1, 4.1, 4.2, 6.4_

- [ ] 12. 最终检查点 - 全量验证
  - 确保 vite build 构建成功，产物结构正确（manifest.json, content-script.js, content-script.css, background.js, icons/）
  - 确保所有 Vitest 测试通过
  - 确保 TypeScript 编译无错误
  - 如有问题请询问用户

## 备注

- 标记 `*` 的任务为可选测试任务，可跳过以加速 MVP 开发
- 每个任务引用了对应的需求编号，确保需求全覆盖
- 属性测试使用 fast-check 库，每个属性对应设计文档中的一个正确性属性
- 检查点任务用于阶段性验证，确保增量开发的正确性
