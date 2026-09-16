# 文档维护

文档按设备类型存放，页面从 `catalog.js` 生成 Documentation 下的设备分组。

```text
docs/
├── catalog.js
├── WF88/
│   ├── README.md
│   └── wf88_bootloader_guide.md
└── LR71/
```

## 新增文档

1. 将 Markdown 文件放入对应设备目录，例如 `LR71/bootloader-guide.md`。
2. 在 `catalog.js` 对应设备的 `documents` 中添加一项：

   ```javascript
   {
       id: "lr71-bootloader-guide",
       title: "Bootloader Guide",
       path: "LR71/bootloader-guide.md",
       assets: [],
   }
   ```

   `id` 在整个目录中必须唯一；`path` 相对于 `docs/`。数组顺序就是侧边栏顺序。
3. 图片等附件放在设备目录内，例如 `LR71/assets/bootloader.png`。Markdown 可写 `![Bootloader](assets/bootloader.png)`。文档及图片首次打开后会写入运行时缓存，以便后续离线访问。
4. 发布时更新 `js/core/app_version.js` 中的版本号。Docker 会复制整个 `docs/`。

无需修改页面 HTML 或添加前端构建步骤。空设备分组显示 “No documents yet”。Help 继续作为通用使用说明保留。

使用 HTTP/HTTPS 或本地静态服务访问页面；不支持通过双击 HTML 自动读取 Markdown。

## 当前资料

- WF88 发布文档保留原文件名，存放于 `WF88/README.md`。
- WF88 Bootloader 使用说明存放于 `WF88/wf88_bootloader_guide.md`。
- LR71 暂无文档，目录已预留。
