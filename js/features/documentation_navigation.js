(function () {
    function createDocumentationNavigation({
        rootSelector = "#documentationGroups",
        groups = [],
        onSelect = () => {},
        debugLog = () => {},
    } = {}) {
        const root = document.querySelector(rootSelector);
        if (!root) {
            throw new Error(`Documentation navigation root not found: ${rootSelector}`);
        }
        if (!Array.isArray(groups)) {
            throw new Error("Documentation groups must be an array");
        }

        const fragment = document.createDocumentFragment();
        groups.forEach((group, index) => {
            if (!group || !Array.isArray(group.documents)) {
                throw new Error(`Documentation group ${index} must contain a documents array`);
            }

            const section = document.createElement("div");
            section.className = "docs-device-group";

            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "menu-item docs-menu-toggle";
            toggle.dataset.documentationGroupToggle = "";
            toggle.setAttribute("aria-expanded", "false");
            toggle.setAttribute("aria-controls", `documentationGroup-${index}`);
            toggle.textContent = group.title || group.id || `Group ${index + 1}`;

            const chevron = document.createElement("span");
            chevron.className = "docs-menu-chevron";
            chevron.setAttribute("aria-hidden", "true");
            chevron.textContent = "▾";
            toggle.appendChild(chevron);

            const entries = document.createElement("div");
            entries.id = `documentationGroup-${index}`;
            entries.className = "docs-submenu";
            entries.hidden = true;

            group.documents.forEach(doc => {
                if (!doc || typeof doc.id !== "string" || !doc.id) {
                    throw new Error(`Documentation group ${index} contains a document without an id`);
                }
                const link = document.createElement("a");
                link.href = "#";
                link.className = "menu-item";
                link.dataset.documentId = doc.id;
                link.textContent = doc.title || doc.id;
                entries.appendChild(link);
            });

            if (!group.documents.length) {
                const empty = document.createElement("p");
                empty.className = "docs-empty";
                empty.textContent = "No documents yet";
                entries.appendChild(empty);
            }

            section.append(toggle, entries);
            fragment.appendChild(section);
        });

        const ownedNodes = Array.from(fragment.childNodes);
        const events = new AbortController();
        let disposed = false;

        root.replaceChildren(fragment);
        root.addEventListener("click", event => {
            const toggle = event.target.closest("[data-documentation-group-toggle]");
            if (toggle && root.contains(toggle)) {
                const targetId = toggle.getAttribute("aria-controls");
                const target = targetId ? document.getElementById(targetId) : null;
                if (!target || !root.contains(target)) return;
                const expanded = toggle.getAttribute("aria-expanded") !== "true";
                toggle.setAttribute("aria-expanded", String(expanded));
                target.hidden = !expanded;
                return;
            }

            const link = event.target.closest("[data-document-id]");
            if (!link || !root.contains(link)) return;
            event.preventDefault();
            try {
                onSelect(link.dataset.documentId);
            } catch (error) {
                debugLog("documentation selection failed", error);
                console.error("Documentation selection failed:", error);
            }
        }, { signal: events.signal });

        function setSelection(documentId, viewActive) {
            if (disposed) return;
            root.querySelectorAll("[data-document-id]").forEach(link => {
                const selected = Boolean(viewActive) && link.dataset.documentId === documentId;
                link.classList.toggle("active", selected);
                if (selected) {
                    link.setAttribute("aria-current", "page");
                } else {
                    link.removeAttribute("aria-current");
                }
            });
        }

        return {
            setSelection,
            dispose() {
                if (disposed) return;
                disposed = true;
                events.abort();
                ownedNodes.forEach(node => {
                    if (node.parentNode === root) node.remove();
                });
            },
        };
    }

    window.TermPWA = window.TermPWA || {};
    window.TermPWA.createDocumentationNavigation = createDocumentationNavigation;
})();
