(function () {
    const scriptLoads = new Map();
    const stylesheetLoads = new Map();

    function loadScript(path) {
        if (!scriptLoads.has(path)) {
            const promise = new Promise((resolve, reject) => {
                const script = document.createElement("script");
                script.src = path;
                script.onload = resolve;
                script.onerror = () => {
                    script.remove();
                    scriptLoads.delete(path);
                    reject(new Error(`Unable to load ${path}`));
                };
                document.head.appendChild(script);
            });
            scriptLoads.set(path, promise);
        }
        return scriptLoads.get(path);
    }

    function loadStylesheet(path, media = "all") {
        const key = `${path}|${media}`;
        if (!stylesheetLoads.has(key)) {
            const promise = new Promise((resolve, reject) => {
                const link = document.createElement("link");
                link.rel = "stylesheet";
                link.href = path;
                link.media = media;
                link.onload = resolve;
                link.onerror = () => {
                    link.remove();
                    stylesheetLoads.delete(key);
                    reject(new Error(`Unable to load ${path}`));
                };
                document.head.appendChild(link);
            });
            stylesheetLoads.set(key, promise);
        }
        return stylesheetLoads.get(key);
    }

    function createDocumentationPage({
        rootSelector = "#view-api-guide",
        groups = [],
        debugLog = () => {},
        createResizeController = null,
    } = {}) {
        if (!Array.isArray(groups)) {
            throw new Error("Documentation groups must be an array");
        }
        const documents = new Map(groups.flatMap(group => group.documents.map(doc => [doc.id, { ...doc, device: group.title }])));
        const root = document.querySelector(rootSelector);
        if (!root) {
            throw new Error(`Documentation page root not found: ${rootSelector}`);
        }
        const article = root.querySelector("#apiArticle");
        const scroll = root.querySelector("#apiArticleScroll");
        const navigationBack = root.querySelector("#apiNavigationBack");
        const layout = root.querySelector(".api-layout");
        const status = root.querySelector("#apiGuideStatus");
        const statusText = root.querySelector("#apiGuideStatusText");
        const retry = root.querySelector("#apiGuideRetry");
        const toc = root.querySelector("#apiToc");
        const tocPanel = root.querySelector("#apiTocPanel");
        const tocToggle = root.querySelector("#apiTocToggle");
        const tocResizer = root.querySelector("#apiTocResizer");
        let currentDocument = documents.values().next().value || null;
        let documentUrl = null;
        let requestId = 0;
        let loadAbort = null;
        const scrollPositions = new Map();
        const navigationHistory = [];
        const events = new AbortController();
        let active = false;
        let disposed = false;
        let loaded = false;
        let loading = null;
        let tocActive = false;
        let hasTocHeadings = false;
        let savedScroll = 0;
        let refreshFrame = 0;
        const resizeController = typeof createResizeController === "function"
            ? createResizeController({
                container: layout,
                handle: tocResizer,
                cssProperty: "--api-toc-width",
                side: "right",
                defaultSize: 240,
                minSize: 180,
                maxSize: 480,
                maxRatio: 0.4,
                step: 16,
                storageKey: "termPwa.documentation.tocWidth",
            })
            : { dispose() {} };

        const tocObserver = new MutationObserver(() => {
            toc.querySelectorAll("a").forEach(link => {
                if (link.classList.contains("is-active-link")) {
                    link.setAttribute("aria-current", "location");
                } else {
                    link.removeAttribute("aria-current");
                }
            });
        });
        const resizeObserver = new ResizeObserver(() => {
            if (active && loaded) {
                article.style.setProperty("--api-scroll-height", `${scroll.clientHeight}px`);
                cancelAnimationFrame(refreshFrame);
                refreshFrame = requestAnimationFrame(() => {
                    if (tocActive) withPreservedWindowHandlers(() => window.tocbot.refresh());
                });
            }
        });

        function closeMobileToc() {
            layout.classList.remove("toc-open");
            tocToggle.setAttribute("aria-expanded", "false");
        }

        function updateTocAvailability() {
            hasTocHeadings = Boolean(article.querySelector("h1:not(.api-document-title), h2, h3, h4, h5, h6"));
            layout.classList.toggle("api-toc-empty", !hasTocHeadings);
            tocPanel.hidden = !hasTocHeadings;
            tocToggle.hidden = !hasTocHeadings;
            tocResizer.hidden = !hasTocHeadings;
            if (!hasTocHeadings) closeMobileToc();
        }

        function updateDocumentMetadata() {
            scroll.setAttribute("aria-label", `${currentDocument?.title || "Documentation"} content`);
            toc.setAttribute("aria-label", `${currentDocument?.title || "Documentation"} chapters`);
        }

        function updateNavigationBack() {
            navigationBack.hidden = navigationHistory.length === 0;
        }

        function clearNavigationHistory() {
            navigationHistory.length = 0;
            updateNavigationBack();
        }

        function rememberNavigationPosition(source) {
            navigationHistory.push({
                documentId: currentDocument?.id,
                scrollTop: scroll.scrollTop,
                source,
                sourceOffset: source.getBoundingClientRect().top - scroll.getBoundingClientRect().top,
            });
            updateNavigationBack();
        }

        function returnToPreviousPosition() {
            const previous = navigationHistory.pop();
            updateNavigationBack();
            if (!previous || previous.documentId !== currentDocument?.id) {
                clearNavigationHistory();
                return;
            }
            scroll.scrollTo({ top: previous.scrollTop, behavior: "instant" });
            requestAnimationFrame(() => {
                if (!previous.source.isConnected || !article.contains(previous.source)) return;
                const restoredOffset = previous.source.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
                scroll.scrollTop += restoredOffset - previous.sourceOffset;
                previous.source.focus({ preventScroll: true });
            });
        }

        function stopDocumentView() {
            savedScroll = scroll.scrollTop;
            if (currentDocument) scrollPositions.set(currentDocument.id, savedScroll);
            closeMobileToc();
            cancelAnimationFrame(refreshFrame);
            tocObserver.disconnect();
            resizeObserver.disconnect();
            if (tocActive) window.tocbot.destroy();
            tocActive = false;
        }

        function changeCurrentDocument(documentId) {
            const nextDocument = documents.get(documentId);
            if (!nextDocument || nextDocument.id === currentDocument?.id) return false;
            stopDocumentView();
            clearNavigationHistory();
            ++requestId;
            if (loadAbort) loadAbort.abort();
            currentDocument = nextDocument;
            documentUrl = null;
            loading = null;
            loaded = false;
            savedScroll = scrollPositions.get(documentId) || 0;
            article.replaceChildren();
            updateTocAvailability();
            layout.hidden = true;
            status.hidden = true;
            root.removeAttribute("aria-busy");
            return true;
        }

        // Tocbot also installs window handlers; this page uses its own scroll container.
        function withPreservedWindowHandlers(callback) {
            const hashChange = window.onhashchange;
            const scrollEnd = window.onscrollend;
            try {
                callback();
            } finally {
                window.onhashchange = hashChange;
                window.onscrollend = scrollEnd;
            }
        }

        function navigateToHeading(event) {
            const link = event.target.closest("a[href]");
            if (!link || !link.hash || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            const url = new URL(link.href);
            if (url.origin !== location.origin || url.pathname !== location.pathname) return;
            let target;
            try {
                target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
            } catch (_) {
                return;
            }
            if (!target || !article.contains(target)) return;
            event.preventDefault();
            closeMobileToc();
            if (article.contains(link)) rememberNavigationPosition(link);
            const top = target.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop - 16;
            scroll.scrollTo({ top, behavior: "instant" });
            target.focus({ preventScroll: true });
        }

        function startToc() {
            if (!active || !loaded || disposed) return;
            article.style.setProperty("--api-scroll-height", `${scroll.clientHeight}px`);
            resizeObserver.observe(scroll);
            resizeObserver.observe(article);
            if (!hasTocHeadings) return;
            if (tocActive) window.tocbot.destroy();
            withPreservedWindowHandlers(() => window.tocbot.init({
                tocSelector: "#apiToc",
                contentSelector: "#apiArticle",
                headingSelector: "h1, h2, h3, h4, h5, h6",
                ignoreSelector: ".api-document-title",
                scrollContainer: "#apiArticleScroll",
                // All headings are positioned relative to apiArticleScroll.
                hasInnerContainers: false,
                collapseDepth: 2,
                orderedList: false,
                scrollSmooth: false,
                headingsOffset: 20,
                tocScrollingWrapper: tocPanel,
                disableTocScrollSync: false,
            }));
            tocActive = true;
            tocObserver.observe(toc, { subtree: true, attributes: true, attributeFilter: ["class"], childList: true });
            // Trigger the initial aria-current update, including when restoring a chapter.
            scroll.dispatchEvent(new Event("scroll"));
        }

        async function loadDependencies() {
            const [, , , , , slugger] = await Promise.all([
                loadScript("./js/vendor/marked/marked.umd.js"),
                loadScript("./js/vendor/dompurify/purify.min.js"),
                loadScript("./js/vendor/tocbot/tocbot.min.js"),
                loadScript("./js/vendor/highlightjs/highlight.min.js").then(() => loadScript("./js/vendor/highlightjs/c.min.js")),
                loadScript("./js/vendor/mermaid/mermaid.min.js"),
                // Cross-origin classic scripts can have an about:blank import base.
                // Resolve against the page, like the other local document assets.
                import(new URL("./js/vendor/github-slugger/index.js", document.baseURI).href),
                loadStylesheet("./js/vendor/tocbot/tocbot.css"),
                loadStylesheet("./js/vendor/highlightjs/github.min.css"),
                loadStylesheet("./js/vendor/highlightjs/github-dark.min.css", "(prefers-color-scheme: dark)"),
            ]);
            return slugger.default;
        }

        function prepareContent(Slugger) {
            const slugger = new Slugger();
            let documentTitle = article.querySelector("h1");
            if (!documentTitle) {
                documentTitle = document.createElement("h1");
                documentTitle.textContent = currentDocument?.title || "Documentation";
                article.prepend(documentTitle);
            }
            documentTitle.classList.add("api-document-title");
            const headings = article.querySelectorAll("h1, h2, h3, h4, h5, h6");
            const targets = new Map();
            headings.forEach(heading => {
                const slug = slugger.slug(heading.textContent);
                heading.id = `api-heading-${slug}`;
                heading.tabIndex = -1;
                targets.set(slug, heading.id);
            });

            const missing = new Set();
            article.querySelectorAll("a[href]").forEach(link => {
                const href = link.getAttribute("href");
                if (href.startsWith("#")) {
                    let slug;
                    try { slug = decodeURIComponent(href.slice(1)); } catch (_) { slug = href.slice(1); }
                    const id = targets.get(slug);
                    if (id) {
                        link.setAttribute("href", `#${id}`);
                    } else {
                        missing.add(href);
                        link.title = "Chapter not found in this document";
                    }
                } else {
                    link.href = new URL(href, documentUrl).href;
                    if (link.origin !== location.origin) {
                        link.target = "_blank";
                        link.rel = "noopener noreferrer";
                    }
                }
            });
            if (missing.size) {
                const note = document.createElement("p");
                note.className = "api-content-note";
                note.textContent = `Unresolved chapter links in the source document: ${Array.from(missing).join(", ")}`;
                article.prepend(note);
                debugLog("documentation unresolved chapter links", Array.from(missing));
            }
            article.querySelectorAll("table").forEach(table => {
                const wrapper = document.createElement("div");
                wrapper.className = "api-table-scroll";
                wrapper.tabIndex = 0;
                wrapper.setAttribute("role", "region");
                wrapper.setAttribute("aria-label", "API reference table");
                table.replaceWith(wrapper);
                wrapper.appendChild(table);
            });
            article.querySelectorAll("img").forEach(img => {
                const originalSrc = img.getAttribute("src") || "";
                img.addEventListener("error", () => {
                    const note = document.createElement("p");
                    note.className = "api-content-note";
                    note.textContent = `Image unavailable: ${img.alt || "Image"} (${originalSrc})`;
                    img.replaceWith(note);
                }, { once: true });
                img.src = new URL(originalSrc, documentUrl).href;
            });
            article.querySelectorAll("pre code:not(.language-mermaid)").forEach(code => {
                window.hljs.highlightElement(code);
            });
        }

        async function renderDiagrams(loadId) {
            window.mermaid.initialize({
                startOnLoad: false,
                securityLevel: "strict",
                suppressErrorRendering: true,
                theme: "neutral",
            });
            let index = 0;
            for (const code of article.querySelectorAll("pre code.language-mermaid")) {
                if (disposed || loadId !== requestId) return;
                const host = document.createElement("div");
                host.className = "api-diagram-measure";
                document.body.appendChild(host);
                try {
                    const { svg } = await window.mermaid.render(`api-sequence-${loadId}-${index++}`, code.textContent, host);
                    if (disposed || loadId !== requestId) return;
                    const figure = document.createElement("figure");
                    figure.className = "api-diagram";
                    figure.setAttribute("aria-label", "API sequence diagram");
                    figure.innerHTML = window.DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
                    code.parentElement.replaceWith(figure);
                } catch (error) {
                    if (disposed || loadId !== requestId) return;
                    const note = document.createElement("p");
                    note.className = "api-content-note";
                    note.textContent = "Diagram unavailable. The diagram source is shown below.";
                    code.parentElement.before(note);
                    debugLog("documentation diagram failed", String(error));
                } finally {
                    host.remove();
                }
            }
        }

        async function loadDocument() {
            const loadId = ++requestId;
            loadAbort = new AbortController();
            status.hidden = false;
            statusText.textContent = "Loading document…";
            retry.hidden = true;
            root.setAttribute("aria-busy", "true");
            try {
                if (location.protocol === "file:") {
                    statusText.textContent = "Documentation cannot read Markdown files when index.html is opened directly (file://). In the app folder, run: python3 -m http.server 8000 --bind 127.0.0.1, then open http://127.0.0.1:8000/ in your browser.";
                    return;
                }
                if (!currentDocument) throw new Error("No documents are available yet");
                documentUrl = new URL(`./docs/${currentDocument.path}`, document.baseURI);
                const [Slugger, response] = await Promise.all([
                    loadDependencies(),
                    fetch(documentUrl, { signal: loadAbort.signal }),
                ]);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const source = (await response.text()).replace(/^\uFEFF/, "");
                if (/text\/html/i.test(response.headers.get("content-type") || "") || /^\s*(?:<!doctype\s+html|<html[\s>])/i.test(source)) {
                    throw new Error("The server returned an HTML page instead of Markdown");
                }
                if (disposed || loadId !== requestId) return;
                article.innerHTML = window.DOMPurify.sanitize(window.marked.parse(source, { gfm: true }), {
                    USE_PROFILES: { html: true },
                    FORBID_TAGS: ["style", "form", "input", "button"],
                    FORBID_ATTR: ["style"],
                });
                prepareContent(Slugger);
                updateTocAvailability();
                layout.hidden = false;
                statusText.textContent = "Rendering diagrams…";
                await renderDiagrams(loadId);
                if (disposed || loadId !== requestId) return;
                loaded = true;
                status.hidden = true;
            } catch (error) {
                if (disposed || loadId !== requestId) return;
                layout.hidden = true;
                statusText.textContent = `Unable to load ${currentDocument?.title || "document"}. ${error.message}`;
                retry.hidden = false;
                debugLog("documentation load failed", String(error));
            } finally {
                if (loadId === requestId) root.removeAttribute("aria-busy");
            }
        }

        async function showCurrentDocument() {
            active = true;
            const shownId = currentDocument?.id;
            updateDocumentMetadata();
            if (!loaded) {
                if (!loading) {
                    const pending = loadDocument();
                    loading = pending;
                    pending.finally(() => { if (loading === pending) loading = null; });
                }
                await loading;
            }
            if (!active || !loaded || disposed || shownId !== currentDocument?.id) return;
            scroll.scrollTop = savedScroll;
            startToc();
        }

        function handleShown() {
            return showCurrentDocument();
        }

        function handleHidden() {
            active = false;
            stopDocumentView();
        }

        function selectDocument(documentId) {
            if (disposed || !documents.has(documentId)) return false;
            const changed = changeCurrentDocument(documentId);
            if (changed && active) showCurrentDocument();
            return true;
        }

        tocToggle.addEventListener("click", () => {
            const expanded = !layout.classList.contains("toc-open");
            layout.classList.toggle("toc-open", expanded);
            tocToggle.setAttribute("aria-expanded", String(expanded));
        }, { signal: events.signal });
        root.addEventListener("click", navigateToHeading, { signal: events.signal });
        navigationBack.addEventListener("click", returnToPreviousPosition, { signal: events.signal });
        retry.addEventListener("click", handleShown, { signal: events.signal });

        return {
            selectDocument,
            getCurrentDocumentId: () => currentDocument?.id || null,
            isAvailable: () => !disposed,
            handleShown,
            handleHidden,
            dispose() {
                disposed = true;
                ++requestId;
                if (loadAbort) loadAbort.abort();
                handleHidden();
                clearNavigationHistory();
                resizeController.dispose();
                events.abort();
            },
        };
    }

    window.TermPWA = window.TermPWA || {};
    window.TermPWA.createDocumentationPage = createDocumentationPage;
})();
