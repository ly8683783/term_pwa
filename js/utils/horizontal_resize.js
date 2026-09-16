(function () {
    function createHorizontalResizeController({
        container,
        handle,
        cssProperty,
        side = "right",
        defaultSize = 240,
        minSize = 180,
        maxSize = 480,
        maxRatio = 0.4,
        step = 16,
        storageKey = "",
    } = {}) {
        if (!container || !handle || !cssProperty) {
            throw new Error("Horizontal resize controller requires a container, handle and CSS property");
        }

        const events = new AbortController();
        let preferredSize = readStoredSize();
        let resizeState = null;
        let disposed = false;

        const resizeObserver = new ResizeObserver(applySize);
        resizeObserver.observe(container);
        handle.addEventListener("pointerdown", startResize, { signal: events.signal });
        handle.addEventListener("pointermove", resize, { signal: events.signal });
        handle.addEventListener("pointerup", stopResize, { signal: events.signal });
        handle.addEventListener("pointercancel", stopResize, { signal: events.signal });
        handle.addEventListener("lostpointercapture", stopResize, { signal: events.signal });
        handle.addEventListener("keydown", handleKeydown, { signal: events.signal });
        applySize();

        function readStoredSize() {
            if (!storageKey) return defaultSize;
            try {
                const value = Number(localStorage.getItem(storageKey));
                return Number.isFinite(value) && value > 0 ? clampAbsolute(value) : defaultSize;
            } catch (_) {
                return defaultSize;
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
            const containerWidth = container.getBoundingClientRect().width;
            const ratioLimit = containerWidth > 0 ? Math.floor(containerWidth * maxRatio) : maxSize;
            return {
                min: minSize,
                max: Math.max(minSize, Math.min(maxSize, ratioLimit)),
            };
        }

        function clampAbsolute(size) {
            return Math.min(maxSize, Math.max(minSize, Math.round(Number(size) || defaultSize)));
        }

        function clampVisible(size) {
            const limits = getLimits();
            return Math.min(limits.max, Math.max(limits.min, Math.round(Number(size) || defaultSize)));
        }

        function applySize() {
            if (disposed) return;
            const limits = getLimits();
            const visibleSize = clampVisible(preferredSize);
            container.style.setProperty(cssProperty, `${visibleSize}px`);
            handle.setAttribute("aria-valuemin", String(limits.min));
            handle.setAttribute("aria-valuemax", String(limits.max));
            handle.setAttribute("aria-valuenow", String(visibleSize));
        }

        function canResize() {
            return !disposed && !handle.hidden && getComputedStyle(handle).display !== "none";
        }

        function startResize(event) {
            if (event.button !== 0 || !canResize()) return;
            event.preventDefault();
            const currentSize = Number(handle.getAttribute("aria-valuenow")) || clampVisible(preferredSize);
            resizeState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startSize: currentSize,
            };
            handle.setPointerCapture(event.pointerId);
            container.classList.add("is-resizing");
        }

        function resize(event) {
            if (!resizeState || event.pointerId !== resizeState.pointerId) return;
            const movement = side === "right"
                ? resizeState.startX - event.clientX
                : event.clientX - resizeState.startX;
            preferredSize = clampVisible(resizeState.startSize + movement);
            applySize();
        }

        function stopResize(event) {
            if (!resizeState || (event.pointerId !== undefined && event.pointerId !== resizeState.pointerId)) return;
            const pointerId = resizeState.pointerId;
            resizeState = null;
            container.classList.remove("is-resizing");
            if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
            storeSize();
        }

        function handleKeydown(event) {
            if (!canResize()) return;
            const limits = getLimits();
            let nextSize = null;
            if (event.key === "ArrowLeft") nextSize = side === "right" ? preferredSize + step : preferredSize - step;
            if (event.key === "ArrowRight") nextSize = side === "right" ? preferredSize - step : preferredSize + step;
            if (event.key === "Home") nextSize = limits.min;
            if (event.key === "End") nextSize = limits.max;
            if (nextSize === null) return;
            event.preventDefault();
            preferredSize = clampVisible(nextSize);
            applySize();
            storeSize();
        }

        return {
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
