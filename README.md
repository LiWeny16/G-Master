# G-Master 深度思考浏览器插件

G-Master 是一个基于 Manifest V3 的 Gemini 增强插件，提供多轮深度思考、审查视角、工具链扩展（如 Tavily）和本地工作区能力。

## 技术栈

- React + TypeScript
- Vite + CRXJS
- MUI
- MobX

## 本地开发

1. 安装依赖

```bash
pnpm install
```

2. 启动开发模式

```bash
pnpm dev
```

3. 生产构建

```bash
pnpm build
```

构建后产物位于 dist 目录。

## 图标配置

项目已配置扩展图标并接入 manifest：

- public/icons/icon-16.png
- public/icons/icon-32.png
- public/icons/icon-48.png
- public/icons/icon-128.png

如需替换图标，建议保持同名与同尺寸，避免商店审核或浏览器显示异常。

## Edge 商店自动化发布（GitHub Actions）

仓库已包含工作流：.github/workflows/publish-edge.yml

支持两种触发方式：

1. 手动触发（Actions 页面点击 Run workflow）
2. 推送版本标签触发（例如 v1.0.1）

工作流会自动执行：

1. 安装依赖
2. 构建扩展
3. 打包 dist 为 zip
4. 调用 Edge Add-ons API 上传并提交审核

### 需要配置的 GitHub Secrets

在仓库 Settings -> Secrets and variables -> Actions 中新增：

- EDGE_PRODUCT_ID：Edge Partner Center 中的扩展 Product ID
- EDGE_API_KEY：Edge Add-ons Publish API 的 API key
- EDGE_CLIENT_ID：Edge Add-ons Publish API 的 Client ID
- EDGE_NOTES_FOR_CERTIFICATION（可选）：给审核员的说明

### 手动发布步骤

1. 打开 Actions
2. 选择 Publish Edge Add-on
3. 点击 Run workflow
4. 可选填写：
   - upload_only: true 表示仅上传草稿，不自动提交发布
   - notes_for_certification: 本次审核备注

### Tag 自动发布

推送 v 前缀标签即可触发自动发布：

```bash
git tag v1.0.1
git push origin v1.0.1
```

## 常见问题

1. 上传成功但未发布
   - 检查是否使用了 upload_only=true。

2. API 鉴权失败
   - 检查 EDGE_API_KEY 与 EDGE_CLIENT_ID 是否来自同一组 Publish API 凭据。

3. 商店提示图标问题
   - 确认 manifest 已声明 16/32/48/128 图标，并确保对应文件存在。

## License

[MIT](LICENSE)

