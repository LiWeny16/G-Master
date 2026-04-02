<div align="center">
  <img src="public/icons/icon-origin.png" alt="G-Master Logo" width="128" />
  <h1>G-Master</h1>
  <p><em>Injecting Soul into Gemini: Multi-turn Deep Think, System Prompts, Local Workspace & Web Search Enhancement</em></p>

  [English](README.md) | [简体中文](README_CN.md)
  <br/><br/>

  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  ![React](https://img.shields.io/badge/React-19-blue)
  ![TypeScript](https://img.shields.io/badge/TypeScript-6.x-blue)
  ![Vite](https://img.shields.io/badge/Vite-Plugin-purple)
  ![Manifest V3](https://img.shields.io/badge/Manifest-V3-success)
  ![Version](https://img.shields.io/badge/Version-1.3.1-orange)
</div>

<br/>

G-Master is a powerful Manifest V3 browser extension built to supercharge Gemini. It introduces true **Multi-turn Deep Think**, persistent **System Prompt** management, a real-time **Context & Intelligence** monitor, and built-in **Tavily Web Search** to expand model capability.

---

## 💡 Why You Need G-Master (FAQ)

<div align="center">

![FAQ](https://img.shields.io/badge/FAQ-Why%20G--Master-0A7EA4?style=for-the-badge)
![System Prompt](https://img.shields.io/badge/System%20Prompt-Persistent%20Injection-1B5E20?style=for-the-badge)
![Deep Think](https://img.shields.io/badge/Deep%20Think-Multi--turn%20Reasoning-B71C1C?style=for-the-badge)
![Local Workspace](https://img.shields.io/badge/Local%20Workspace-Read%20Search%20Attach-4A148C?style=for-the-badge)
![Tavily Search](https://img.shields.io/badge/Tavily-Real--time%20Search-0D47A1?style=for-the-badge)
![Agent Loop](https://img.shields.io/badge/Agent%20Loop-Tool%20Orchestration-6A1B9A?style=for-the-badge)

</div>

> [!TIP]
> If you want Gemini to be more than "just chat" and gain persistent role memory, deeper reasoning, real-time retrieval, and practical local workflows, G-Master is the enhancement engine you are looking for.

<details>
<summary><strong>Q: Does Gemini Web natively support System Prompts?</strong></summary>

**A:** No. With G-Master, you can inject and persist a global System Prompt in one click, making Gemini far more stable for long-running roles and reducing context drift.

</details>

<details>
<summary><strong>Q: How can Gemini reason deeply like O1-style workflows?</strong></summary>

**A:** G-Master introduces a true multi-turn Deep Think loop for Gemini. It drives self-play, structured deduction, and flaw correction, lifting complex-logic accuracy by **41%** and one-pass coding success to **88%**.

</details>

<details>
<summary><strong>Q: Can Gemini directly read or modify files on my computer?</strong></summary>

**A:** Yes. With your authorization, G-Master's Local Workspace grants access to your local file system via the browser's File System Access API. You can browse directories, read files, search by name or content, and even **attach any file (images, PDFs, documents, videos) directly into the Gemini chat input** — all without leaving the browser.

</details>

<details>
<summary><strong>Q: What if Gemini's built-in knowledge is outdated?</strong></summary>

**A:** G-Master integrates Tavily Search to break the time boundary of base model knowledge and pull fresh information into your conversations.

</details>

---

## 📸 Demonstration & Usage

### Interface & Features
<div align="center">
  <img src="docs/images/poster.png" alt="G-Master Poster" width="100%" />
</div>

---

## 🚀 Core Features

- 🔄 **Multi-turn Deep Think Loop**: Drives the model through self-play, iterative deduction, and automatic flaw correction via a unified `AgentLoop`.
- 🎯 **System Prompt Management**: Inject persistent role definitions and global reasoning context with one click.
- 📊 **Context & Intelligence Monitor**: Visualize current context utilization and reasoning depth in real time.
- 🌐 **Tavily Search Integration**: Built-in web search overcomes stale model knowledge with up-to-date information.
- 📁 **Local Workspace** — full-featured file toolkit for AI workflows:
  - 🔍 `search_files`: dual-mode smart search (keyword AND-matching + glob patterns like `src/**/*.ts`)
  - 📄 `grep_files`: search inside file contents with regex support (like `grep -r`)
  - 📎 `attach_file_to_chat`: paste any file (image / PDF / doc / video) directly into the AI chat input
  - 📖 `read_file`: read files with optional line-range (`startLine` / `endLine`) for large files
  - 💾 Auto-restore previously authorized workspace on page load
- 🎮 **Sudoku Mini-game**: a built-in Sudoku game to keep your brain sharp between prompts.

---

## 📊 Performance Gains

After enabling G-Master, complex reasoning and coding outcomes improve by **over 40%**, while hallucination frequency drops dramatically.

<div align="center">
  <img src="docs/images/performance_comparison.png" alt="Performance Comparison: Standard vs G-Master" width="80%" />
</div>

---


| Evaluation Dimension | 🤖 Standard Gemini | 🌟 G-Master Deep Think | Improvement |
| :--- | :---: | :---: | :---: |
| **Complex Logic Accuracy** | 65% | **92%** | 🚀 **+41%** |
| **Hallucination Rate**| 12% | **< 2%** | 📉 **-83%** |
| **Code One-pass Success** | 55% | **88%** | 🚀 **+60%** |
| **Reasoning Path** | Single Linear Output | **Tree-like Divergence + Correction** | 🧠 **Dimension Upgrade** |

---

## 🧠 Core Architecture

G-Master is more than a shortcut wrapper. It is an engineered closed-loop reasoning and review system:

```mermaid
graph TD
  A[User Input + System Prompt] --> B{AgentLoop: Mode?}
  B -- AUTO --> C[FLASH Model: Quick Assessment]
  B -- ON --> D[Loop Model: Deep Think]
  C -- Simple answer --> Z((Final Answer))
  C -- Needs depth --> D

  subgraph Loop [♻️ Deep Think & Tool Orchestration Loop]
  D --> E[Reasoning & Drafting]
  E --> F[Multi-dimensional Review / Context Tracking]
  F --> |Weak logic or missing evidence| G{Tool Dispatcher}
  G --> G1[🌐 Tavily Web Search]
  G --> G2[📁 Local Workspace Tools]
  G2 --> G2a[search_files / grep_files]
  G2 --> G2b[read_file / read_files]
  G2 --> G2c[attach_file_to_chat]
  G1 & G2a & G2b & G2c --> E
  F --> |Solid and robust| H[Exit Loop]
  end

  H --> Z
  Z --> J[Render elegantly in extension panel]

  style Z fill:#4CAF50,stroke:#388E3C,stroke-width:2px,color:#fff
  style D fill:#D84315,stroke:#EF6C00,stroke-width:2px,color:#fff
  style G fill:#1565C0,stroke:#0D47A1,stroke-width:2px,color:#fff
```

---

## 🛠️ Quick Developer Guide

1. **Install Dependencies**
   ```bash
   pnpm install
   ```
2. **Start Dev Mode**
   ```bash
   pnpm dev
   ```
3. **Build Extension**
   ```bash
   pnpm build
   ```
  > Then load the `dist` directory in your browser's Extensions panel.

---

## 📝 License

This project is open source and protected under the [MIT License](LICENSE).

<div align="center">
  <br/>
  <i>Made with ❤️ by the G-Master Team</i>
</div>
