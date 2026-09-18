# Documentation Maintenance

Documents are organized by device type. The application generates the Documentation device groups in the sidebar from `catalog.js`.

```text
docs/
├── catalog.js
├── help/
│   ├── README.md
│   └── assets/
├── WF88/
│   ├── README.md
│   └── wf88_bootloader_guide.md
└── LR71/
```

## Adding Documents

1. Place the Markdown file in the corresponding device directory, such as `LR71/bootloader-guide.md`.
2. Add an entry to the `documents` array for that device in `catalog.js`:

   ```javascript
   {
       id: "lr71-bootloader-guide",
       title: "Bootloader Guide",
       path: "LR71/bootloader-guide.md",
       assets: [],
   }
   ```

   `id` must be unique across the catalog; `path` is relative to `docs/`. The array order determines the display order in the sidebar.
3. Place images and other assets inside the device directory, such as `LR71/assets/bootloader.png`. In Markdown, reference them as `![Bootloader](assets/bootloader.png)`. Documents and assets are cached upon first opening for subsequent offline access.
4. When publishing or deploying changes, update the version string in `js/core/app_version.js`. Docker automatically copies the entire `docs/` directory.

No HTML modifications or frontend build steps are required. Empty device groups automatically display "No documents yet". The Help guide uses `help/README.md` and is registered under `DOCUMENTATION_HELP` in `catalog.js`.

Access the application via HTTP/HTTPS or a local static HTTP server; opening `index.html` directly via `file://` cannot fetch Markdown files.

## Current Documents

- WF88 release document retains its original filename, located at `WF88/README.md`.
- WF88 Bootloader Guide is located at `WF88/wf88_bootloader_guide.md`.
- LR71 currently has no documents; its directory is reserved.
