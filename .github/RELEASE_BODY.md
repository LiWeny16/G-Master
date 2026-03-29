## ✨ v1.2.0 — Multi-Site Support & Per-Site Toggle

### 🆕 What's New | 新功能

#### 🌐 Multi-Site Support | 多站点支持
- **ChatGPT** (`chatgpt.com`) and **Doubao / 豆包** (`doubao.com`) are now fully supported alongside Gemini.  
  在 Gemini 的基础上，正式支持 **ChatGPT** 和**豆包**，深度思考与 Agent 能力可跨站点使用。

#### 🔘 Per-Site Enable/Disable Toggle | 网站开关
- A new **"Active Sites"** section appears at the top of the Settings panel.  
  设置面板顶部新增「**启用网站**」区域。
- Toggle Gemini / Doubao / ChatGPT individually with branded pill buttons — active sites are highlighted.  
  通过带品牌图标的胶囊按钮，可单独控制每个网站的插件开关，已启用的站点高亮显示。
- Preference is persisted to `chrome.storage.local` and survives browser restarts.  
  开关状态持久化到 `chrome.storage.local`，重启浏览器后保留。

#### 🏗️ Adapter Architecture | 适配器架构
- Introduced a clean `ISiteAdapter` interface + factory pattern (`adapter-factory.ts`).  
  引入统一的 `ISiteAdapter` 接口与工厂模式，新增站点只需实现接口即可接入。
- Independent adapters: `GeminiAdapter`, `ChatGPTAdapter`, `DoubaoAdapter`.  
  各站点独立适配器，互不干扰。

---

### 🔧 Improvements | 改进

- Settings UI now uses **Google brand-color SVG** icon for Gemini entry.  
  设置界面 Gemini 按钮换用 Google 官方四色品牌 SVG 图标。
- `ContentApp` early-returns when the current site's toggle is off — zero performance cost on disabled sites.  
  关闭某站点开关后，`ContentApp` 直接跳过渲染，完全不注入 UI，性能开销为零。

---

### 📦 Technical | 技术细节

- `DeepThinkConfig.siteEnabled` field added (defaults: all enabled).  
  `DeepThinkConfig` 新增 `siteEnabled` 字段，默认全部启用。
- `StateStore.loadConfig` deep-merges `siteEnabled` from saved config.  
  `StateStore.loadConfig` 正确深度合并历史存档中的 `siteEnabled`。
- i18n keys added: `settings_site_section`, `settings_site_gemini`, `settings_site_doubao`, `settings_site_chatgpt`.  
  中英文 i18n 翻译键已同步更新。
