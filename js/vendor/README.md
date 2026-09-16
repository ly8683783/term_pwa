# Documentation dependencies

Pinned official npm release files, copied without modification. Release archives were verified against npm SHA-512 integrity metadata. Loaded locally on first opening API Guide; no CDN or frontend build is required.

- marked 18.0.13 — license included in its folder.
- dompurify 3.4.15 — license included in its folder.
- tocbot 4.36.8 — license included in its folder.
- highlight.js (@highlightjs/cdn-assets) 11.12.0 — license included in its folder.
- mermaid 12.0.0 — license included in its folder.
- github-slugger 2.0.0 — license included in its folder.

Mermaid uses the self-contained browser bundle so offline diagrams do not require dynamic chunks. github-slugger uses its original ES module and regex file. Highlight.js ships the browser common bundle plus the C language. On upgrade, copy the official distribution and license, update this record and the service-worker asset list if files change, and bump the app cache version.
