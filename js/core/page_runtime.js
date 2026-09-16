(function () {
    function createPageRuntime({
        pageRegistry,
        defaultViewId = "view-welcome",
        hasCapability = () => false,
        debugLog = () => {},
    } = {}) {
        let activeViewId = defaultViewId;

        function bindMenuNavigation(root = document) {
            root.addEventListener("click", event => {
                const button = event.target.closest("[data-menu-toggle]");
                if (button && root.contains(button)) {
                    const targetId = button.getAttribute("aria-controls");
                    const targetMenu = targetId ? document.getElementById(targetId) : null;
                    if (!targetMenu) return;
                    const expanded = button.getAttribute("aria-expanded") !== "true";
                    button.setAttribute("aria-expanded", String(expanded));
                    targetMenu.hidden = !expanded;
                    return;
                }
                const item = event.target.closest(".menu-item[data-target]");
                if (!item || !root.contains(item)) return;
                event.preventDefault();
                const targetId = item.getAttribute("data-target");
                const feature = item.getAttribute("data-feature");
                if (feature && !hasCapability(feature)) return;
                switchView(targetId);
            });
        }

        function dispatchPageLifecycle(hookName, ...args) {
            pageRegistry.forEach(definition => {
                if (typeof definition[hookName] === "function") {
                    callPageHook(definition, hookName, ...args);
                }
            });
        }

        function updateFeatureVisibility() {
            document.querySelectorAll(".menu-item[data-feature]").forEach(item => {
                const feature = item.getAttribute("data-feature");
                const visible = hasCapability(feature);
                item.hidden = !visible;
                item.setAttribute("aria-hidden", visible ? "false" : "true");
            });

            const activeItem = document.querySelector(`.menu-item[data-target="${activeViewId}"]`);
            if (activeItem && activeItem.hidden) {
                switchView(defaultViewId, { reason: "unavailable" });
            }
        }

        function switchView(targetId, options = {}) {
            const previousViewId = activeViewId;

            if (previousViewId === targetId) {
                return;
            }

            const previousDefinition = pageRegistry.get(previousViewId);
            if (previousDefinition && typeof previousDefinition.onHide === "function") {
                callPageHook(previousDefinition, "onHide", targetId, options);
            }

            activeViewId = targetId;

            document.querySelectorAll(".menu-item").forEach(item => {
                item.classList.remove("active");
                item.removeAttribute("aria-current");
            });
            const activeItem = document.querySelector(`.menu-item[data-target="${targetId}"]`);
            if (activeItem && !activeItem.hidden) {
                activeItem.classList.add("active");
                activeItem.setAttribute("aria-current", "page");
            }

            document.querySelectorAll(".view-panel").forEach(view => view.classList.remove("active"));
            const targetView = document.getElementById(targetId);
            if (targetView) {
                targetView.classList.add("active");
            }

            const nextDefinition = pageRegistry.get(targetId);
            if (nextDefinition && typeof nextDefinition.onShow === "function") {
                callPageHook(nextDefinition, "onShow", options);
            }

            debugLog("view switched", { from: previousViewId, to: targetId });
        }

        function callPageHook(definition, hookName, ...args) {
            try {
                definition[hookName](definition.page, ...args);
            } catch (error) {
                debugLog(`${definition.key} ${hookName} failed`, error);
                console.error(`${definition.key} ${hookName} failed:`, error);
            }
        }

        return {
            bindMenuNavigation,
            dispatchPageLifecycle,
            getActiveViewId: () => activeViewId,
            switchView,
            updateFeatureVisibility,
        };
    }

    window.TermPWA = window.TermPWA || {};
    window.TermPWA.createPageRuntime = createPageRuntime;
})();
