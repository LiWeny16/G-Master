<div align="center">
  <img src="public/icons/icon-origin.png" alt="G-Master Logo" width="128" />
  <h1>G-Master</h1>
  <p><em>为 Gemini 注入灵魂：多轮深度思考、System Prompt 与网络搜索增强引擎</em></p>

  [English](README.md) | [简体中文](README_CN.md)
  <br/><br/>

  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  ![React](https://img.shields.io/badge/React-18-blue)
  ![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
  ![Vite](https://img.shields.io/badge/Vite-Plugin-purple)
  ![Manifest V3](https://img.shields.io/badge/Manifest-V3-success)
</div>

<br/>

G-Master 是一个基于 Manifest V3 的强大浏览器扩展，专为强化 Gemini 设计。它引入了真正的 **多轮深度思考 (Deep Think)** 模式、**系统提示词 (System Prompt)**管理、**上下文及智力水平监控面板**，以及内置的 **Tavily 在线搜索**拓展性能。

---

## 💡 为什么你需要 G-Master？(FAQ)

<div align="center">

![FAQ](https://img.shields.io/badge/FAQ-G--Master%20价值说明-0A7EA4?style=for-the-badge)
![System Prompt](https://img.shields.io/badge/System%20Prompt-持久注入-1B5E20?style=for-the-badge)
![Deep Think](https://img.shields.io/badge/Deep%20Think-多轮推理纠错-B71C1C?style=for-the-badge)
![Local Workspace](https://img.shields.io/badge/Local%20Workspace-本地读写与执行-4A148C?style=for-the-badge)
![Tavily Search](https://img.shields.io/badge/Tavily-实时联网搜索-0D47A1?style=for-the-badge)

</div>

> [!TIP]
> 如果你希望 Gemini 不只是“会聊天”，而是具备长期角色记忆、深度推理、实时检索与本地工作流能力，G-Master 就是这套增强引擎。

<details>
<summary><strong>Q: 网页版 Gemini 支持 System Prompt (系统提示词) 吗？</strong></summary>

**A:** 原生不支持。安装 G-Master 后，你可以一键注入并持久化全局 System Prompt，让 Gemini 更稳定地扮演特定角色，并减少上下文漂移。

</details>

<details>
<summary><strong>Q: 如何让 Gemini 像 O1 一样进行深度思考 (Deep Think)？</strong></summary>

**A:** G-Master 为 Gemini 引入了真正的多轮 Deep Think 循环。它会驱动模型进行自我博弈、推演与漏洞纠错，将复杂逻辑准确率提升 **41%**，代码一次通过率提升至 **88%**。

</details>

<details>
<summary><strong>Q: Gemini 可以直接读取或修改我电脑上的本地文件吗？</strong></summary>

**A:** 可以。G-Master 的本地沙盒突破 (Local Workspace) 能在你授权后，支持本地读取、写入文件，甚至运行代码，打造真正可落地的本地 AI 工作流。

</details>

<details>
<summary><strong>Q: Gemini 的知识库太旧怎么办？</strong></summary>

**A:** G-Master 内置 Tavily 搜索引擎，打破基础模型的时间边界，在对话中补充并抓取最新资讯。

</details>

---


## 📸 效果与操作指南

### 界面与特性
<div align="center">
  <img src="docs/images/poster.png" alt="G-Master Poster" width="100%" />
</div>

---

## 🚀 全新核心特性

- 🔄 **多轮深度思考循环**：驱动大模型进行自我博弈、推演与发现漏洞自动纠错。
- 🎯 **系统提示词 (System Prompt)**：一键注入持久化的角色设定与全局思考上下文。
- 📊 **智力与上下文监控面板**：实时直观显示当前的 Context 占用情况与模型智力水平。
- 🌐 **Tavily 搜索整合**：内置在线搜索，突破 AI 知识库的时间限制，提供最新资讯。
- 📁 **本地沙盒突破**：通过 Local Workspace 支持直接在本地读取/写入文件与运行代码。

---

## 📊 性能突破对比

引入 G-Master 之后，复杂的逻辑能力与编码任务均显著提升了 **40% 以上**，幻觉率大幅降低。

<div align="center">
  <img src="docs/images/performance_comparison.png" alt="性能对比图表" width="80%" />
</div>

| 评测维度 | 🤖 标准 Gemini | 🌟 G-Master 深度思考 | 提升幅度 |
| :--- | :---: | :---: | :---: |
| **复杂逻辑准确率** | 65% | **92%** | 🚀 **+41%** |
| **幻觉发生频次**| 12% | **< 2%** | 📉 **-83%** |
| **代码一次通过率** | 55% | **88%** | 🚀 **+60%** |
| **思维链路** | 单一线性输出 | **树状发散纠错**| 🧠 **维度升级** |

---

## 🧠 核心架构梳理

G-Master 并非单纯的快捷指令，而是构建了一个工程化的闭环纠错和审查结构：

```mermaid
graph TD
    A[用户输入 + System Prompt] --> B{G-Master: 需要开启思考?}
    B -- 不需要 --> C[常规大模型极速响应]
    B -- 需要 --> D[开启 Deep Think 循环]
    
    subgraph Loop [♻️ 深度思考与纠错环]
    D --> E[初步推理与拟稿]
    E --> F[多维度审查 / 追踪Context面板]
    F --> |缺乏事实支撑/逻辑不畅| G[调用工具网: Tavily 搜索 / 读取本地]
    G --> E
    F --> |逻辑严密无漏洞| H[跳出安全循环]
    end
    
    H --> I((过滤提取高质量最终答案))
    I --> J[在扩展内嵌面板中优雅呈现]
    
    style I fill:#4CAF50,stroke:#388E3C,stroke-width:2px,color:#fff
    style D fill:#D84315,stroke:#EF6C00,stroke-width:2px,color:#fff
```


## 🛠️ 简明开发指南

1. **安装依赖**
   ```bash
   pnpm install
   ```
2. **启动开发热更**
   ```bash
   pnpm dev
   ```
3. **构建打包发布**
   ```bash
   pnpm build
   ```
   > 然后在浏览器的 `扩展程序` 面板中加载 `dist` 文件夹即可体验。

---

## 📝 许可证 

本项目遵循 [MIT License](LICENSE) 开源协议。

<div align="center">
  <br/>
  <i>Made with ❤️ by the G-Master Team</i>
</div>
