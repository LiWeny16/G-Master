## ✨ v1.3.1 — Workspace Tools Upgrade & File Attachment

### 🆕 Highlights | 重点更新

#### 📁 Smarter Workspace Search | 更智能的工作区搜索
- `search_files` now supports two modes automatically:
  smart keyword search and classic glob matching.
  `search_files` 现已支持自动双模式：智能关键词检索 + 传统 glob 匹配。
- Smart mode supports multi-term AND matching, separator tolerance (`-`, `_`, `.`),
  case-insensitive ranking, and filenames with spaces.
  智能模式支持多关键词 AND、分隔符容错（`-`、`_`、`.`）、忽略大小写排序，并兼容带空格文件名。
- Glob mode remains backward compatible (`*.ts`, `src/**/*.ts`, etc.).
  Glob 模式完全向后兼容（如 `*.ts`、`src/**/*.ts`）。

#### 📎 File-to-Chat Attachment | 文件直接粘贴到聊天输入框
- Added `attach_file_to_chat` local tool: attach workspace files directly to AI web input via paste event.
  新增 `attach_file_to_chat` 本地工具：通过粘贴事件将工作区文件直接附加到 AI 网页输入框。
- Supports broad binary upload scenarios (images / PDF / docs / media / archives),
  and works with custom `targetSelector`.
  支持广泛二进制文件上传场景（图片 / PDF / 文档 / 媒体 / 压缩包），并支持自定义 `targetSelector`。

#### 🔁 Better Workspace Restore UX | 工作区恢复体验优化
- Restores previously authorized workspace handle earlier during app initialization,
  reducing the need to manually open the Workspace tab first.
  在应用初始化阶段更早恢复已授权工作区句柄，减少必须先手动打开工作区页签的问题。

---

### 🛠️ Tooling & Prompt Updates | 工具与提示词更新

- Local tool registry now includes `grep_files` and `attach_file_to_chat`.
  本地工具注册新增 `grep_files` 与 `attach_file_to_chat`。
- `read_file` supports optional line-range reads (`startLine` / `endLine`).
  `read_file` 支持按行范围读取（`startLine` / `endLine`）。
- Skills prompt docs were updated in both Chinese and English for the new capabilities.
  中英文 skills 提示词已同步更新，覆盖新工具能力与使用方式。

---

### 📦 Release Asset | 发布产物

- `G-Master-v1.3.1.zip` is generated and uploaded automatically by GitHub Actions.
  `G-Master-v1.3.1.zip` 由 GitHub Actions 自动构建并上传到 Release 资产。
