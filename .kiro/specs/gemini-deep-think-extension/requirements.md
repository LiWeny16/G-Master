# 需求文档

## 简介

将现有的 Gemini 深度思考 UserScript（main.js）的全部功能迁移为正式的 Chrome/Edge 浏览器扩展插件。扩展以 Content Script 形式注入 Gemini 网页，通过悬浮球（Floating Ball）+ 面板（Panel）提供可视化配置与状态展示。技术栈采用 Vite（Rolldown 引擎）+ React 18 + TypeScript + MUI + MobX。架构上预留 Skills 扩展空间和多 AI 站点支持能力。

## 术语表

- **Extension**：基于 Manifest V3 的 Chrome/Edge 浏览器扩展插件
- **Content_Script**：由 Extension 注入到目标网页中运行的脚本
- **Floating_Ball**：注入到 Gemini 页面中的可拖拽悬浮球控件，作为 Panel 的入口
- **Panel**：点击 Floating_Ball 后展开的配置与状态面板
- **Deep_Think_Engine**：深度思考核心引擎，负责多轮自我审查循环的调度与控制
- **DOM_Beautifier**：DOM 美化处理模块，负责隐藏系统标记、注入可视化徽章与标签
- **State_Store**：基于 MobX 的全局响应式状态管理仓库
- **Config**：用户可调的运行时配置参数集合（maxLoops、minLoops、loopDelay、reviewPhases 等）
- **Review_Phase**：轮换式审查视角，每轮从不同维度挑战 AI 回答
- **Action_Marker**：AI 回复中的动作标记，包括 THINK_MORE（继续思考）和 GOAL_REACHED（目标达成）
- **System_Prompt**：注入到用户首次提问末尾的系统指令文本，对用户不可见
- **Send_Button**：Gemini 页面中的发送按钮 DOM 元素
- **Site_Adapter**：针对特定 AI 网站的适配器接口，封装 DOM 选择器与交互逻辑

## 需求

### 需求 1：扩展基础架构

**用户故事：** 作为开发者，我希望项目采用 Manifest V3 + Vite + React + TypeScript 的现代扩展架构，以便获得良好的开发体验和可维护性。

#### 验收标准

1. THE Extension SHALL 使用 Manifest V3 规范，声明对 `https://gemini.google.com/app/*` 的 Content_Script 注入权限
2. THE Extension SHALL 使用 Vite（Rolldown 引擎）构建，生成 Content_Script 入口文件和 Panel 的 React 应用包
3. THE Extension SHALL 使用 React 18 + TypeScript 实现 Panel 界面
4. THE Extension SHALL 使用 MUI（Material UI）作为 Panel 的 UI 组件库
5. THE Extension SHALL 使用 MobX 作为全局状态管理方案
6. THE Extension SHALL 在架构上定义 Site_Adapter 接口，当前仅实现 Gemini 适配器，预留对其他 AI 站点的扩展能力
7. THE Extension SHALL 在模块结构上预留 Skills 功能的扩展入口，当前阶段不实现 Skills 具体逻辑

### 需求 2：悬浮球与面板 UI

**用户故事：** 作为用户，我希望在 Gemini 页面上看到一个悬浮球，点击后展开配置面板，以便方便地控制深度思考功能。

#### 验收标准

1. WHEN Gemini 页面加载完成, THE Content_Script SHALL 在页面中注入一个 Floating_Ball
2. THE Floating_Ball SHALL 支持鼠标拖拽改变位置，拖拽结束后吸附到最近的屏幕边缘
3. THE Floating_Ball SHALL 通过视觉状态（颜色或图标变化）反映 Deep_Think_Engine 的当前运行状态（关闭、等待中、思考中、总结中）
4. WHEN 用户点击 Floating_Ball, THE Panel SHALL 以弹出方式展开显示
5. WHEN 用户再次点击 Floating_Ball 或点击 Panel 外部区域, THE Panel SHALL 收起隐藏
6. THE Panel SHALL 包含深度思考模式的开关控件
7. THE Panel SHALL 显示当前思考轮次编号和运行状态文本
8. THE Panel SHALL 提供 Config 中 maxLoops、minLoops、loopDelay 参数的可编辑输入控件
9. THE Panel SHALL 提供 Review_Phase 列表的查看与自定义编辑功能
10. THE Panel SHALL 提供 System_Prompt 模板的查看与编辑功能
11. WHEN 用户在 Panel 中修改 Config 参数, THE State_Store SHALL 立即更新对应配置值，并持久化到 chrome.storage.local
12. WHEN Extension 启动时, THE State_Store SHALL 从 chrome.storage.local 读取已保存的 Config，恢复用户上次的配置
13. THE Panel SHALL 使用 MUI 组件渲染，视觉风格与 Gemini 页面协调

### 需求 3：深度思考引擎核心逻辑

**用户故事：** 作为用户，我希望扩展能自动驱动 Gemini 进行多轮自我审查式深度思考，以便获得更高质量的回答。

#### 验收标准

1. WHEN 用户开启深度思考模式并发送第一条消息, THE Deep_Think_Engine SHALL 拦截发送操作，将 System_Prompt 追加到用户输入末尾，记录原始问题，然后触发实际发送
2. WHEN Gemini 完成一轮回复且回复文本包含 THINK_MORE Action_Marker, THE Deep_Think_Engine SHALL 将当前轮次加一，构造包含审查任务和锚定提醒的下一轮 Prompt，延迟 loopDelay 毫秒后自动发送
3. WHEN 当前轮次未达到 minLoops 且回复文本包含 GOAL_REACHED Action_Marker, THE Deep_Think_Engine SHALL 拦截结束信号，注入强制深化审查 Prompt 继续下一轮思考
4. WHEN 当前轮次已达到或超过 minLoops 且回复文本包含 GOAL_REACHED Action_Marker, THE Deep_Think_Engine SHALL 进入总结阶段，发送最终总结 Prompt
5. WHEN 当前轮次超过 maxLoops, THE Deep_Think_Engine SHALL 强制进入总结阶段，发送最终总结 Prompt
6. WHEN 回复文本不包含任何 Action_Marker, THE Deep_Think_Engine SHALL 发送系统纠偏 Prompt，要求 AI 补充动作标记
7. THE Deep_Think_Engine SHALL 优先使用 AI 回复中的 NEXT_PROMPT 内容作为下一轮审查问题；WHEN 回复中不包含 NEXT_PROMPT, THE Deep_Think_Engine SHALL 从 Review_Phase 列表中按轮次索引轮换选取审查视角
8. WHEN 最终总结回复完成, THE Deep_Think_Engine SHALL 重置状态（轮次归零、关闭深度思考模式）并执行一次 DOM 美化处理
9. THE Deep_Think_Engine SHALL 在发送的每条自动 Prompt 前添加 DT 标签前缀（如 `⟪DT:🔄 第N轮 · 自我审查⟫`），用于 DOM_Beautifier 识别和美化

### 需求 4：用户手动停止拦截

**用户故事：** 作为用户，我希望随时能手动停止深度思考循环，以便在不需要继续时中断流程。

#### 验收标准

1. WHEN 深度思考模式开启期间用户点击 Gemini 页面的停止按钮, THE Deep_Think_Engine SHALL 立即设置中止标志，停止后续自动发送，并关闭深度思考模式
2. WHEN 用户通过 Panel 中的开关关闭深度思考模式, THE Deep_Think_Engine SHALL 立即设置中止标志，停止后续自动发送，并重置轮次状态

### 需求 5：DOM 美化处理

**用户故事：** 作为用户，我希望系统注入的提示词和动作标记在页面上不可见，取而代之的是美观的可视化徽章，以便获得清爽的阅读体验。

#### 验收标准

1. THE DOM_Beautifier SHALL 扫描用户消息气泡，检测包含 DT 标签前缀的消息，将系统指令文本行隐藏，仅显示用户原始内容和可视化标签
2. WHEN 用户消息气泡中不包含用户原始内容（纯系统自动发送）, THE DOM_Beautifier SHALL 隐藏全部文本行，折叠气泡展开按钮，仅显示 DT 标签
3. THE DOM_Beautifier SHALL 根据 DT 标签内容应用不同颜色样式：默认绿色、包含"总结"字样为蓝色、包含"纠偏"或"警告"字样为橙色
4. THE DOM_Beautifier SHALL 扫描 AI 回复内容，移除 THINK_MORE 和 GOAL_REACHED Action_Marker 的文本，隐藏 NEXT_PROMPT 段落
5. THE DOM_Beautifier SHALL 在 AI 回复末尾注入可视化徽章：THINK_MORE 显示"继续深入思考 · 第 N 轮"（绿色），GOAL_REACHED 显示"深度思考完成 · 正在生成最终总结"（蓝色）
6. THE DOM_Beautifier SHALL 移除 AI 回复末尾的空白段落元素
7. THE DOM_Beautifier SHALL 对已处理过的 DOM 元素做标记，避免重复处理导致的闪烁或性能问题
8. WHILE Gemini 正在生成回复（Send_Button 处于 stop 状态）, THE DOM_Beautifier SHALL 跳过 AI 回复内容的标记处理，避免干扰流式输出

### 需求 6：状态监听与 DOM 变化响应

**用户故事：** 作为开发者，我希望扩展能可靠地监听 Gemini 页面的 DOM 变化，以便准确检测回复完成事件和 UI 重渲染。

#### 验收标准

1. THE Content_Script SHALL 使用 MutationObserver 监听 document.body 的子节点变化、属性变化（class 属性）
2. WHEN Send_Button 的 class 从包含 "stop" 变为不包含 "stop", THE Content_Script SHALL 判定当前回复生成完成，提取最后一条 AI 回复的文本内容，触发 Deep_Think_Engine 的评估逻辑
3. WHEN Send_Button 的 class 从不包含 "stop" 变为包含 "stop", THE Content_Script SHALL 将生成状态标记为正在生成
4. WHEN DOM 中有节点新增或 Floating_Ball 所在容器被移除（SPA 导航场景）, THE Content_Script SHALL 重新检查并注入 Floating_Ball 和状态栏
5. THE Content_Script SHALL 使用防抖机制（80ms）调用 DOM_Beautifier，避免高频 DOM 变化导致的性能问题
6. THE Content_Script SHALL 在自身执行 DOM 修改期间设置忙碌标志，忽略由自身修改触发的 MutationObserver 回调，防止反馈死循环

### 需求 7：状态栏显示

**用户故事：** 作为用户，我希望在 Gemini 输入区域附近看到当前深度思考的状态信息，以便实时了解进度。

#### 验收标准

1. WHILE 深度思考模式开启且轮次大于零, THE Content_Script SHALL 在 Floating_Ball 或 Panel 中显示当前状态药丸标签
2. WHILE Deep_Think_Engine 处于思考循环阶段, THE 状态药丸标签 SHALL 显示"🧠 第 N 轮深度思考中"（绿色脉冲动画）
3. WHILE Deep_Think_Engine 处于总结阶段, THE 状态药丸标签 SHALL 显示"📋 正在生成最终总结"（蓝色脉冲动画）
4. WHEN 深度思考模式关闭或轮次为零, THE 状态药丸标签 SHALL 隐藏

### 需求 8：配置持久化与默认值

**用户故事：** 作为用户，我希望我的配置修改在浏览器重启后仍然保留，同时首次使用时有合理的默认值。

#### 验收标准

1. THE State_Store SHALL 提供以下默认 Config 值：maxLoops 为 10、minLoops 为 3、loopDelay 为 1500 毫秒
2. THE State_Store SHALL 提供默认的 Review_Phase 列表，包含逻辑结构、反驳视角、边界情况、事实核查、可行性五个审查维度
3. THE State_Store SHALL 提供默认的 System_Prompt 模板，内容与原 UserScript 中的 SYSTEM_TAIL 等效
4. WHEN 用户修改任意 Config 参数, THE State_Store SHALL 在 500 毫秒内将完整配置写入 chrome.storage.local
5. WHEN Extension 的 Content_Script 初始化时, THE State_Store SHALL 从 chrome.storage.local 异步读取配置；IF 读取失败或无已保存配置, THEN THE State_Store SHALL 使用默认值

### 需求 9：Gemini 站点适配器

**用户故事：** 作为开发者，我希望 Gemini 特有的 DOM 操作逻辑被封装在适配器中，以便未来添加其他 AI 站点支持时不影响核心引擎。

#### 验收标准

1. THE Site_Adapter 接口 SHALL 定义以下抽象方法：获取编辑器元素、获取发送按钮、判断是否正在生成、获取最后一条回复文本、向编辑器插入文本并触发发送、获取用户消息气泡列表、获取 AI 回复消息列表
2. THE Gemini Site_Adapter SHALL 实现 Site_Adapter 接口，封装所有 Gemini 页面特有的 DOM 选择器（如 `.ql-editor`、`.send-button`、`message-content`、`.query-text` 等）
3. THE Deep_Think_Engine SHALL 通过 Site_Adapter 接口与页面交互，不直接引用任何 Gemini 特有的 DOM 选择器
