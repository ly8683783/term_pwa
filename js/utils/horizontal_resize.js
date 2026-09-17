(function () {
    function createHorizontalResizeController({
        container,
        constraintContainer = container,
        handle,
        cssProperty,
        side = "right",
        defaultSize = 240,
        minSize = 180,
        maxSize = 480,
        maxRatio = 0.4,
        step = 16,
        storageKey = "",
        isInteractionEnabled = () => true,
    } = {}) {
        if (!container || !constraintContainer || !handle || !cssProperty) {
            throw new Error("Horizontal resize controller requires a container, constraint container, handle and CSS property");
        }

        const events = new AbortController();
        let preferredSize = readStoredSize();
        let resizeState = null;
        let disposed = false;

        const resizeObserver = new ResizeObserver(applySize);
        resizeObserver.observe(constraintContainer);
        handle.addEventListener("pointerdown", startResize, { signal: events.signal });
        handle.addEventListener("pointermove", resize, { signal: events.signal });
        handle.addEventListener("pointerup", stopResize, { signal: events.signal });
        handle.addEventListener("pointercancel", stopResize, { signal: events.signal });
        handle.addEventListener("lostpointercapture", stopResize, { signal: events.signal });
        handle.addEventListener("keydown", handleKeydown, { signal: events.signal });
        applySize();

        function readStoredSize() {
            if (!storageKey) return null;
            try {
                const stored = localStorage.getItem(storageKey);
                if (stored === null) return null;
                const value = Number(stored);
                return Number.isFinite(value) && value > 0 ? clampAbsolute(value) : null;
            } catch (_) {
                return null;
            }
        }

        function storeSize() {
            if (!storageKey) return;
            try {
                localStorage.setItem(storageKey, String(Math.round(preferredSize)));
            } catch (_) {
                // Resizing remains available when storage is blocked or full.
            }
        }

        function getLimits() {
            const containerWidth = constraintContainer.getBoundingClientRect().width;
            const ratioLimit = containerWidth > 0 ? Math.floor(containerWidth * maxRatio) : maxSize;
            return {
                min: minSize,
                max: Math.max(minSize, Math.min(maxSize, ratioLimit)),
            };
        }

        function clampAbsolute(size) {
            const value = Number(size);
            const normalized = Number.isFinite(value) && value > 0 ? value : minSize;
            return Math.min(maxSize, Math.max(minSize, Math.round(normalized)));
        }

        function resolveDefaultSize() {
            const containerWidth = constraintContainer.getBoundingClientRect().width;
            const value = typeof defaultSize === "function"
                ? defaultSize(containerWidth)
                : defaultSize;
            return clampAbsolute(value);
        }

        function clampVisible(size) {
            const limits = getLimits();
            const value = Number(size);
            const normalized = Number.isFinite(value) && value > 0 ? value : resolveDefaultSize();
            return Math.min(limits.max, Math.max(limits.min, Math.round(normalized)));
        }

        function applySize() {
            if (disposed) return;
            const limits = getLimits();
            const visibleSize = clampVisible(preferredSize ?? resolveDefaultSize());
            container.style.setProperty(cssProperty, `${visibleSize}px`);
            handle.setAttribute("aria-valuemin", String(limits.min));
            handle.setAttribute("aria-valuemax", String(limits.max));
            handle.setAttribute("aria-valuenow", String(visibleSize));
        }

        function canResize() {
            // Layout and ARIA stay synchronized while user interaction is disabled.
            return !disposed &&
                Boolean(isInteractionEnabled()) &&
                !handle.hidden &&
                getComputedStyle(handle).display !== "none";
        }

        function startResize(event) {
            if (event.button !== 0 || !canResize()) return;
            event.preventDefault();
            const currentSize = Number(handle.getAttribute("aria-valuenow")) || clampVisible(preferredSize);
            resizeState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startSize: currentSize,
                changed: false,
            };
            handle.setPointerCapture(event.pointerId);
            container.classList.add("is-resizing");
        }

        function resize(event) {
            if (!resizeState || event.pointerId !== resizeState.pointerId) return;
            const movement = side === "right"
                ? resizeState.startX - event.clientX
                : event.clientX - resizeState.startX;
            resizeState.changed = true;
            preferredSize = clampVisible(resizeState.startSize + movement);
            applySize();
        }

        function stopResize(event) {
            if (!resizeState || (event.pointerId !== undefined && event.pointerId !== resizeState.pointerId)) return;
            const pointerId = resizeState.pointerId;
            const changed = resizeState.changed;
            resizeState = null;
            container.classList.remove("is-resizing");
            if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
            if (changed) storeSize();
        }

        function handleKeydown(event) {
            if (!canResize()) return;
            const limits = getLimits();
            const currentSize = Number(handle.getAttribute("aria-valuenow")) || clampVisible(preferredSize ?? resolveDefaultSize());
            let nextSize = null;
            if (event.key === "ArrowLeft") nextSize = side === "right" ? currentSize + step : currentSize - step;
            if (event.key === "ArrowRight") nextSize = side === "right" ? currentSize - step : currentSize + step;
            if (event.key === "Home") nextSize = limits.min;
            if (event.key === "End") nextSize = limits.max;
            if (nextSize === null) return;
            event.preventDefault();
            preferredSize = clampVisible(nextSize);
            applySize();
            storeSize();
        }

        return {
            refresh: applySize,
            dispose() {
                if (disposed) return;
                disposed = true;
                resizeState = null;
                container.classList.remove("is-resizing");
                container.style.removeProperty(cssProperty);
                resizeObserver.disconnect();
                events.abort();
            },
        };
    }

    window.TermPWA = window.TermPWA || {};
    window.TermPWA.createHorizontalResizeController = createHorizontalResizeController;
})();
