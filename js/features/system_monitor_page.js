(function () {
const SVG_NS = "http://www.w3.org/2000/svg";
let nextTimeSeriesChartId = 0;
const TOPOLOGY_LAYOUT = {
    localRadius: 38,
    neighborRadius: 34,
    localCollideRadius: 54,
    neighborCollideRadius: 48,
    dragBoundsPadding: 48,
    localAnchorXRatio: 0.5,
    localAnchorYRatio: 0.5,
    orbitRadiusXRatio: 0.24,
    orbitRadiusYRatio: 0.3,
    orbitStartAngle: -Math.PI / 2,
    edgeLabelWidth: 36,
    edgeLabelHeight: 16,
    edgeLabelBiasSource: 0.46,
    edgeLabelBiasTarget: 0.54,
};
const MOCK_NEIGHBOR_TOPOLOGY = {
    localNode: {
        addr: "0071",
        type: "local",
    },
    neighbors: [
        { addr: "0072", type: "node", rssi: -56, direct: 1, relay: 0, ageMs: 4352, ttlMs: 55648 },
        { addr: "0075", type: "relay", rssi: -50, direct: 1, relay: 1, ageMs: 2953, ttlMs: 57047 },
        { addr: "0088", type: "node", rssi: -67, direct: 0, relay: 1, ageMs: 12853, ttlMs: 42147 },
        { addr: "0091", type: "relay", rssi: -61, direct: 1, relay: 1, ageMs: 5821, ttlMs: 49876 },
        { addr: "00A3", type: "node", rssi: -73, direct: 0, relay: 1, ageMs: 18764, ttlMs: 36214 },
        { addr: "00B4", type: "node", rssi: -48, direct: 1, relay: 0, ageMs: 2141, ttlMs: 58902 },
        { addr: "00C7", type: "relay", rssi: -65, direct: 0, relay: 1, ageMs: 9430, ttlMs: 44780 },
        { addr: "00D9", type: "node", rssi: -58, direct: 1, relay: 0, ageMs: 3674, ttlMs: 53128 },
    ],
};

function createSystemMonitorPage({
    rootSelector = "#view-system-monitor",
    debugLog = () => {},
} = {}) {
    const root = document.querySelector(rootSelector);
    if (!root) {
        return emptySystemMonitorPage();
    }

    const startButton = root.querySelector("#btnStartSystemMonitor");
    const stopButton = root.querySelector("#btnStopSystemMonitor");
    const clearButton = root.querySelector("#btnClearSystemMonitor");
    const intervalInput = root.querySelector("#systemMonitorInterval");
    const statusElement = root.querySelector("#systemMonitorStatus");
    const summaryRelayDelay = root.querySelector("#systemMonitorSummaryRelayDelay");
    const ewmaChartSvg = root.querySelector("#systemMonitorEwmaChart");
    const relayChartSvg = root.querySelector("#systemMonitorRelayChart");
    const topologyTag = root.querySelector("#systemMonitorTopologyTag");
    const topologySvg = root.querySelector("#systemMonitorTopology");
    const topologyTooltip = root.querySelector("#systemMonitorTopologyTooltip");

    const MAX_POINTS = 40;
    const EWMA_MAX = 160;
    const RELAY_MAX = 140;
    const DEFAULT_INTERVAL_MS = 2000;
    const MIN_INTERVAL_MS = 500;
    const MAX_INTERVAL_MS = 60000;

    let timerId = null;
    let retrySeries = [];
    let rxerrSeries = [];
    let relaySeries = [];
    let sampleIndex = 0;
    let retryValue = 18;
    let rxerrValue = 6;
    let relayValue = 42;
    const ewmaChart = createTimeSeriesChart(ewmaChartSvg, { maxValue: EWMA_MAX });
    const relayChart = createTimeSeriesChart(relayChartSvg, { maxValue: RELAY_MAX });
    const topologyRenderer = createNeighborTopologyRenderer({
        svg: topologySvg,
        tooltip: topologyTooltip,
        tag: topologyTag,
        debugLog,
    });
    const topologyData = createMockNeighborTopologyData();

    if (startButton) {
        startButton.disabled = false;
        startButton.addEventListener("click", start);
    }
    if (stopButton) {
        stopButton.disabled = true;
        stopButton.addEventListener("click", stop);
    }
    if (clearButton) {
        clearButton.addEventListener("click", clear);
    }
    if (intervalInput) {
        intervalInput.addEventListener("change", () => {
            intervalInput.value = String(normalizeInterval(intervalInput.value));
            if (isRunning()) {
                restartTimer();
            }
        });
    }

    clearSeries();
    renderCharts();
    topologyRenderer.setData(topologyData);
    updateStatus("Status: monitor is idle.");

    function emptySystemMonitorPage() {
        return {
            handleShown() {},
            handleHidden() {},
            start() {},
            stop() {},
            clear() {},
        };
    }

    function isRunning() {
        return timerId !== null;
    }

    function normalizeInterval(rawValue) {
        const parsed = Number(rawValue);
        if (!Number.isFinite(parsed)) {
            return DEFAULT_INTERVAL_MS;
        }
        return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.round(parsed)));
    }

    function currentIntervalMs() {
        const value = normalizeInterval(intervalInput ? intervalInput.value : DEFAULT_INTERVAL_MS);
        if (intervalInput) {
            intervalInput.value = String(value);
        }
        return value;
    }

    function clearSeries() {
        retrySeries = [];
        rxerrSeries = [];
        relaySeries = [];
    }

    function appendSample(sample) {
        retrySeries.push(sample.retry);
        rxerrSeries.push(sample.rxerr);
        relaySeries.push(sample.relay);
        trimSeries(retrySeries);
        trimSeries(rxerrSeries);
        trimSeries(relaySeries);
        updateSummary(sample.relay);
    }

    function trimSeries(series) {
        while (series.length > MAX_POINTS) {
            series.shift();
        }
    }

    function generateSample() {
        sampleIndex += 1;
        const burst = sampleIndex % 14 === 0 ? 18 : 0;
        retryValue = clamp(retryValue + oscillation(sampleIndex, 7) + randomDelta(10) + burst, 4, EWMA_MAX - 10);
        rxerrValue = clamp(rxerrValue + oscillation(sampleIndex, 5) + randomDelta(6) + (burst > 0 ? 4 : 0), 0, EWMA_MAX - 20);
        relayValue = clamp(
            28 + Math.round(retryValue * 0.42) + Math.round(rxerrValue * 0.18) + oscillation(sampleIndex, 11) + randomDelta(7),
            18,
            RELAY_MAX - 4
        );
        return {
            retry: retryValue,
            rxerr: rxerrValue,
            relay: relayValue,
        };
    }

    function oscillation(index, period) {
        return Math.round(Math.sin(index / period) * 6);
    }

    function randomDelta(span) {
        return Math.round((Math.random() - 0.5) * span);
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function renderCharts() {
        const intervalMs = currentIntervalMs();
        ewmaChart.setSeries([
            { values: retrySeries, className: "monitor-line-retry" },
            { values: rxerrSeries, className: "monitor-line-rxerr" },
        ], intervalMs);
        relayChart.setSeries([
            { values: relaySeries, className: "monitor-line-delay" },
        ], intervalMs);
    }

    function createTimeSeriesChart(svg, { maxValue }) {
        if (!svg) {
            return { setSeries() {} };
        }

        const chartId = `system-monitor-chart-${nextTimeSeriesChartId++}`;
        const plot = {
            left: 6,
            top: 6,
            rightAxisWidth: 34,
            bottomAxisHeight: 14,
        };
        const yTicks = [100, 80, 60, 40, 20, 0];

        let currentSeries = [];
        let currentIntervalMs = DEFAULT_INTERVAL_MS;
        let width = 1;
        let height = 1;
        let resizeFramePending = false;

        svg.setAttribute("preserveAspectRatio", "none");
        svg.replaceChildren();

        const defs = createSvgElement("defs");
        const clipPath = createSvgElement("clipPath", { id: `${chartId}-clip` });
        const clipRect = createSvgElement("rect");
        clipPath.appendChild(clipRect);
        defs.appendChild(clipPath);

        const gridGroup = createSvgElement("g");
        const axisGroup = createSvgElement("g");
        const lineGroup = createSvgElement("g", { "clip-path": `url(#${chartId}-clip)` });

        svg.append(defs, gridGroup, axisGroup, lineGroup);

        const resizeObserver = typeof ResizeObserver === "function"
            ? new ResizeObserver(scheduleRender)
            : null;
        if (resizeObserver) {
            resizeObserver.observe(svg);
        } else {
            window.addEventListener("resize", scheduleRender);
        }

        function setSeries(series, intervalMs) {
            currentSeries = series;
            currentIntervalMs = intervalMs;
            render();
        }

        function scheduleRender() {
            if (resizeFramePending) {
                return;
            }
            resizeFramePending = true;
            window.requestAnimationFrame(() => {
                resizeFramePending = false;
                render();
            });
        }

        function render() {
            const rect = svg.getBoundingClientRect();
            width = Math.max(120, Math.round(rect.width || svg.clientWidth || 1));
            height = Math.max(80, Math.round(rect.height || svg.clientHeight || 1));
            svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

            const bounds = getPlotBounds();
            clipRect.setAttribute("x", bounds.left);
            clipRect.setAttribute("y", bounds.top);
            clipRect.setAttribute("width", bounds.width);
            clipRect.setAttribute("height", bounds.height);

            renderGrid(bounds);
            renderAxis(bounds);
            renderLines(bounds);
        }

        function getPlotBounds() {
            const right = Math.max(plot.left + 10, width - plot.rightAxisWidth);
            const bottom = Math.max(plot.top + 10, height - plot.bottomAxisHeight);
            return {
                left: plot.left,
                top: plot.top,
                right,
                bottom,
                width: right - plot.left,
                height: bottom - plot.top,
            };
        }

        function renderGrid(bounds) {
            gridGroup.replaceChildren();

            yTicks.forEach(tick => {
                const y = yForPercent(tick, bounds);
                gridGroup.appendChild(createSvgElement("line", {
                    x1: bounds.left,
                    y1: y,
                    x2: bounds.right,
                    y2: y,
                    class: "monitor-grid-line",
                }));
            });

            getXAxisTicks(bounds).forEach(seconds => {
                const x = xForAgeSeconds(seconds, bounds);
                gridGroup.appendChild(createSvgElement("line", {
                    x1: x,
                    y1: bounds.top,
                    x2: x,
                    y2: bounds.bottom,
                    class: "monitor-grid-line monitor-grid-line-vertical",
                }));
            });
        }

        function renderAxis(bounds) {
            axisGroup.replaceChildren();

            yTicks.forEach(tick => {
                const y = yForPercent(tick, bounds);
                const label = createSvgElement("text", {
                    x: bounds.right + 5,
                    y: y + 3,
                    class: "monitor-axis-label",
                });
                label.textContent = `${tick}%`;
                axisGroup.appendChild(label);
            });

            getXAxisTicks(bounds).forEach(seconds => {
                const x = xForAgeSeconds(seconds, bounds);
                const label = createSvgElement("text", {
                    x,
                    y: height - 3,
                    class: "monitor-axis-label monitor-axis-label-x",
                    "text-anchor": x <= bounds.left + 14 ? "start" : "middle",
                });
                label.textContent = `${Math.round(seconds)}s`;
                axisGroup.appendChild(label);
            });
        }

        function renderLines(bounds) {
            lineGroup.replaceChildren();
            currentSeries.forEach(series => {
                const path = createSvgElement("path", {
                    d: pointsToSmoothPath(buildPoints(series.values, bounds)),
                    class: `monitor-line ${series.className}`,
                });
                lineGroup.appendChild(path);
            });
        }

        function buildPoints(values, bounds) {
            if (!values.length) {
                return [{ x: bounds.left, y: bounds.bottom }];
            }
            const stepX = values.length > 1 ? bounds.width / (values.length - 1) : 0;
            return values.map((value, index) => {
                const ratio = clamp(value / maxValue, 0, 1);
                return {
                    x: bounds.left + stepX * index,
                    y: bounds.bottom - ratio * bounds.height,
                };
            });
        }

        function yForPercent(percent, bounds) {
            return bounds.top + ((100 - percent) / 100) * bounds.height;
        }

        function getXAxisTicks(bounds) {
            const actualTotalSeconds = getActualTotalSeconds();
            if (actualTotalSeconds < 10) {
                return [];
            }

            const stepSeconds = pickXAxisStepSeconds(actualTotalSeconds, bounds.width);
            const ticks = [];
            for (let seconds = stepSeconds; seconds <= actualTotalSeconds + 0.001; seconds += stepSeconds) {
                ticks.push(seconds);
            }
            return ticks;
        }

        function getActualTotalSeconds() {
            const pointCount = currentSeries.reduce((max, series) => Math.max(max, series.values.length), 0);
            const visiblePoints = Math.max(2, pointCount);
            return ((visiblePoints - 1) * currentIntervalMs) / 1000;
        }

        function pickXAxisStepSeconds(actualTotalSeconds, widthPx) {
            const minLabelSpacingPx = 72;
            const maxTickCount = Math.max(1, Math.floor(widthPx / minLabelSpacingPx));
            const rawStepSeconds = actualTotalSeconds / maxTickCount;
            const preferredSteps = [10, 20, 30, 60, 120, 300, 600, 900, 1200, 1800, 3600];
            for (const step of preferredSteps) {
                if (rawStepSeconds <= step) {
                    return step;
                }
            }
            return Math.ceil(rawStepSeconds / 600) * 600;
        }

        function xForAgeSeconds(seconds, bounds) {
            const actualTotalSeconds = getActualTotalSeconds();
            if (actualTotalSeconds <= 0) {
                return bounds.right;
            }
            return bounds.right - (seconds / actualTotalSeconds) * bounds.width;
        }

        function pointsToSmoothPath(points) {
            if (!points.length) {
                return "";
            }
            if (points.length === 1) {
                return `M ${format(points[0].x)} ${format(points[0].y)}`;
            }

            let path = `M ${format(points[0].x)} ${format(points[0].y)}`;
            for (let i = 0; i < points.length - 1; i += 1) {
                const current = points[i];
                const next = points[i + 1];
                const midX = (current.x + next.x) / 2;
                path += ` C ${format(midX)} ${format(current.y)}, ${format(midX)} ${format(next.y)}, ${format(next.x)} ${format(next.y)}`;
            }
            return path;
        }

        function format(value) {
            return value.toFixed(1);
        }

        render();
        return { setSeries };
    }

    function createSvgElement(tagName, attrs = {}) {
        const element = document.createElementNS(SVG_NS, tagName);
        Object.entries(attrs).forEach(([name, value]) => {
            element.setAttribute(name, value);
        });
        return element;
    }

    function updateSummary(relayDelayMs) {
        if (!summaryRelayDelay) {
            return;
        }
        const upper = relayDelayMs + 18 + Math.max(0, Math.round(Math.sin(sampleIndex / 4) * 8));
        summaryRelayDelay.textContent = `t1 ${relayDelayMs}..${upper}`;
    }

    function updateButtons() {
        if (startButton) {
            startButton.disabled = isRunning();
        }
        if (stopButton) {
            stopButton.disabled = !isRunning();
        }
    }

    function updateStatus(text) {
        if (statusElement) {
            statusElement.textContent = text;
        }
    }

    function sampleOnce() {
        appendSample(generateSample());
        renderCharts();
        updateStatus(`Status: mock sampling every ${currentIntervalMs()} ms (${retrySeries.length}/${MAX_POINTS} points).`);
    }

    function restartTimer() {
        if (!isRunning()) {
            return;
        }
        clearInterval(timerId);
        timerId = window.setInterval(sampleOnce, currentIntervalMs());
        updateStatus(`Status: mock sampling every ${currentIntervalMs()} ms.`);
    }

    function start() {
        if (isRunning()) {
            return;
        }
        sampleOnce();
        timerId = window.setInterval(sampleOnce, currentIntervalMs());
        updateButtons();
        updateStatus(`Status: mock sampling every ${currentIntervalMs()} ms.`);
        debugLog("system monitor mock start", { intervalMs: currentIntervalMs() });
    }

    function stop() {
        if (timerId !== null) {
            clearInterval(timerId);
            timerId = null;
        }
        updateButtons();
        updateStatus(retrySeries.length
            ? "Status: mock sampling stopped. Showing latest history."
            : "Status: monitor is idle.");
        debugLog("system monitor mock stop");
    }

    function clear() {
        clearSeries();
        retryValue = 18;
        rxerrValue = 6;
        relayValue = 42;
        sampleIndex = 0;
        renderCharts();
        topologyRenderer.reset();
        updateSummary(40);
        updateStatus(isRunning()
            ? `Status: mock history cleared. Sampling every ${currentIntervalMs()} ms.`
            : "Status: monitor history cleared.");
        debugLog("system monitor mock clear");
    }

    function handleShown() {
        updateButtons();
        renderCharts();
        topologyRenderer.render();
    }

    function handleHidden() {
        stop();
        topologyRenderer.pause();
    }

    return {
        handleShown,
        handleHidden,
        start,
        stop,
        clear,
    };
}

function createNeighborTopologyRenderer({
    svg,
    tooltip,
    tag,
    debugLog = () => {},
} = {}) {
    if (!svg) {
        return {
            setData() {},
            render() {},
            reset() {},
            pause() {},
        };
    }

    const positionStore = new Map();
    const wrap = svg.parentElement;
    let topologyData = createMockNeighborTopologyData();
    let simulation = null;
    let resizeTimer = null;
    let activeLocalDragId = null;

    window.addEventListener("resize", scheduleRender);

    function setData(data) {
        topologyData = cloneTopologyData(data);
        render();
    }

    function reset() {
        positionStore.clear();
        hideTooltip();
        render();
    }

    function pause() {
        hideTooltip();
        activeLocalDragId = null;

        if (simulation) {
            simulation.stop();
        }
    }

    function scheduleRender() {
        clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(render, 120);
    }

    function render() {
        if (!svg) {
            return;
        }

        if (tag) {
            tag.textContent = `Neighbors ${topologyData.neighbors.length}`;
        }

        if (!window.d3) {
            renderFallback();
            debugLog("system monitor topology skipped: d3 unavailable");
            return;
        }

        const width = Math.max(280, Math.round(svg.clientWidth || wrap?.clientWidth || 520));
        const height = Math.max(220, Math.round(svg.clientHeight || wrap?.clientHeight || 280));
        const nodes = buildTopologyNodes(topologyData);
        const links = buildTopologyLinks(topologyData);
        seedTopologyPositions(nodes, width, height, positionStore);

        const d3 = window.d3;
        const selection = d3.select(svg);
        selection.selectAll("*").remove();
        selection.attr("viewBox", `0 0 ${width} ${height}`);

        const linkLayer = selection.append("g").attr("class", "monitor-topology-link-layer");
        const labelLayer = selection.append("g").attr("class", "monitor-topology-label-layer");
        const nodeLayer = selection.append("g").attr("class", "monitor-topology-node-layer");

        const linkSelection = linkLayer.selectAll("line")
            .data(links, d => d.key)
            .join("line")
            .attr("class", "monitor-topology-link")
            .attr("stroke", d => colorForRssi(d.rssi))
            .attr("stroke-width", d => widthForRssi(d.rssi));

        const edgeLabels = labelLayer.selectAll("g")
            .data(links, d => d.key)
            .join(enter => {
                const group = enter.append("g").attr("class", "monitor-topology-edge-label");
                group.append("rect")
                    .attr("x", -(TOPOLOGY_LAYOUT.edgeLabelWidth / 2))
                    .attr("y", -(TOPOLOGY_LAYOUT.edgeLabelHeight / 2))
                    .attr("width", TOPOLOGY_LAYOUT.edgeLabelWidth)
                    .attr("height", TOPOLOGY_LAYOUT.edgeLabelHeight);
                group.append("text").attr("text-anchor", "middle").attr("dominant-baseline", "central");
                return group;
            });
        edgeLabels.select("text").text(d => `${d.rssi}`);

        if (simulation) {
            simulation.stop();
        }

        simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(d => d.type === "relay" ? 165 : 188).strength(0.82))
            .force("charge", d3.forceManyBody().strength(-780))
            .force("x", d3.forceX(d => d.targetX).strength(d => d.role === "Local" ? 0.28 : 0.16))
            .force("y", d3.forceY(d => d.targetY).strength(0.22))
            .force("collide", d3.forceCollide(d => d.role === "Local"
                ? TOPOLOGY_LAYOUT.localCollideRadius
                : TOPOLOGY_LAYOUT.neighborCollideRadius))
            .alpha(0.55)
            .alphaDecay(0.06);

        const nodeSelection = nodeLayer.selectAll("g")
            .data(nodes, d => d.id)
            .join(enter => {
                const group = enter.append("g")
                    .attr("class", "monitor-topology-node-group")
                    .call(d3.drag()
                        .on("start", dragStarted)
                        .on("drag", dragged)
                        .on("end", dragEnded));
                group.append("circle");
                group.append("text").attr("class", "monitor-node-text").attr("text-anchor", "middle").attr("y", -4);
                group.append("text").attr("class", "monitor-node-role").attr("text-anchor", "middle").attr("y", 15);
                return group;
            })
            .on("mouseover", (event, datum) => showTooltip(event, datum))
            .on("mousemove", moveTooltip)
            .on("mouseout", hideTooltip);

        nodeSelection.select("circle")
            .attr("class", d => `monitor-node ${nodeClassForRole(d.role)}`)
            .attr("r", d => d.role === "Local" ? TOPOLOGY_LAYOUT.localRadius : TOPOLOGY_LAYOUT.neighborRadius);
        nodeSelection.select(".monitor-node-text").text(d => d.id);
        nodeSelection.select(".monitor-node-role").text(d => d.role);

        simulation.on("tick", ticked);
        ticked();

        function ticked() {
            for (const node of nodes) {
                if (node.role === "Local" && activeLocalDragId !== node.id) {
                    node.x = node.targetX;
                    node.y = node.targetY;
                }
                node.x = clampValue(node.x, TOPOLOGY_LAYOUT.dragBoundsPadding, width - TOPOLOGY_LAYOUT.dragBoundsPadding);
                node.y = clampValue(node.y, TOPOLOGY_LAYOUT.dragBoundsPadding, height - TOPOLOGY_LAYOUT.dragBoundsPadding);
            }

            for (const node of nodes) {
                positionStore.set(node.id, {
                    x: node.x,
                    y: node.y,
                    targetX: node.targetX,
                    targetY: node.targetY,
                });
            }

            linkSelection
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            edgeLabels.attr("transform", d => {
                const { x, y } = getEdgeLabelCenter(d);
                return `translate(${x},${y})`;
            });

            nodeSelection.attr("transform", d => `translate(${d.x},${d.y})`);
        }

        function dragStarted(event, datum) {
            if (!event.active && simulation) {
                simulation.alphaTarget(0.24).restart();
            }
            if (datum.role === "Local") {
                activeLocalDragId = datum.id;
            }
            datum.fx = datum.x;
            datum.fy = datum.y;
        }

        function dragged(event, datum) {
            datum.fx = clampValue(event.x, TOPOLOGY_LAYOUT.dragBoundsPadding, width - TOPOLOGY_LAYOUT.dragBoundsPadding);
            datum.fy = clampValue(event.y, TOPOLOGY_LAYOUT.dragBoundsPadding, height - TOPOLOGY_LAYOUT.dragBoundsPadding);
        }

        function dragEnded(event, datum) {
            if (!event.active && simulation) {
                simulation.alphaTarget(0);
            }
            datum.targetX = clampValue(event.x, TOPOLOGY_LAYOUT.dragBoundsPadding, width - TOPOLOGY_LAYOUT.dragBoundsPadding);
            datum.targetY = clampValue(event.y, TOPOLOGY_LAYOUT.dragBoundsPadding, height - TOPOLOGY_LAYOUT.dragBoundsPadding);
            if (datum.role === "Local") {
                activeLocalDragId = null;
            }
            datum.fx = null;
            datum.fy = null;
            positionStore.set(datum.id, {
                x: datum.targetX,
                y: datum.targetY,
                targetX: datum.targetX,
                targetY: datum.targetY,
            });
        }
    }

    function renderFallback() {
        const width = 520;
        const height = 260;
        svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        svg.replaceChildren();
        svg.appendChild(createSvgElement("text", {
            x: width / 2,
            y: height / 2,
            "text-anchor": "middle",
            fill: "#667085",
        }));
        svg.querySelector("text").textContent = "D3 unavailable";
    }

    function showTooltip(event, datum) {
        if (!tooltip) {
            return;
        }
        tooltip.hidden = false;
        tooltip.innerHTML = formatTooltipHtml(datum);
        moveTooltip(event);
    }

    function moveTooltip(event) {
        if (!tooltip || tooltip.hidden || !wrap || !window.d3) {
            return;
        }
        const [x, y] = window.d3.pointer(event, wrap);
        const maxLeft = Math.max(8, wrap.clientWidth - (tooltip.offsetWidth || 160) - 8);
        const maxTop = Math.max(8, wrap.clientHeight - (tooltip.offsetHeight || 96) - 8);
        tooltip.style.left = `${Math.min(maxLeft, x + 12)}px`;
        tooltip.style.top = `${Math.min(maxTop, y + 12)}px`;
    }

    function hideTooltip() {
        if (tooltip) {
            tooltip.hidden = true;
        }
    }

    return {
        setData,
        render,
        reset,
        pause,
    };
}

function createMockNeighborTopologyData() {
    return cloneTopologyData(MOCK_NEIGHBOR_TOPOLOGY);
}

function cloneTopologyData(data) {
    return {
        localNode: { ...(data.localNode || {}) },
        neighbors: (data.neighbors || []).map(neighbor => ({ ...neighbor })),
    };
}

function buildTopologyNodes(topologyData) {
    const localNode = {
        id: topologyData.localNode.addr,
        addr: topologyData.localNode.addr,
        role: "Local",
        type: "local",
    };
    const neighbors = topologyData.neighbors.map(neighbor => ({
        id: neighbor.addr,
        addr: neighbor.addr,
        role: neighbor.type === "relay" ? "Relay" : "Node",
        ...neighbor,
    }));
    return [localNode, ...neighbors];
}

function buildTopologyLinks(topologyData) {
    const localNodeId = topologyData.localNode.addr;
    return topologyData.neighbors.map(neighbor => ({
        key: `${localNodeId}->${neighbor.addr}`,
        source: localNodeId,
        target: neighbor.addr,
        rssi: neighbor.rssi,
        type: neighbor.type,
    }));
}

function seedTopologyPositions(nodes, width, height, positionStore) {
    const localIndex = nodes.findIndex(node => node.role === "Local");
    const neighbors = nodes.filter(node => node.role !== "Local");
    const localDefault = {
        x: width * TOPOLOGY_LAYOUT.localAnchorXRatio,
        y: height * TOPOLOGY_LAYOUT.localAnchorYRatio,
    };

    nodes.forEach(node => {
        const saved = positionStore.get(node.id);
        if (saved) {
            node.x = saved.x;
            node.y = saved.y;
            node.targetX = saved.targetX ?? saved.x;
            node.targetY = saved.targetY ?? saved.y;
            return;
        }

        if (node.role === "Local") {
            node.x = localDefault.x;
            node.y = localDefault.y;
            node.targetX = localDefault.x;
            node.targetY = localDefault.y;
            return;
        }

        const neighborIndex = neighbors.findIndex(entry => entry.id === node.id);
        const angle = TOPOLOGY_LAYOUT.orbitStartAngle + ((Math.PI * 2) / Math.max(1, neighbors.length)) * neighborIndex;
        const radiusX = width * TOPOLOGY_LAYOUT.orbitRadiusXRatio;
        const radiusY = height * TOPOLOGY_LAYOUT.orbitRadiusYRatio;
        node.x = localDefault.x + Math.cos(angle) * radiusX;
        node.y = localDefault.y + Math.sin(angle) * radiusY;
        node.targetX = node.x;
        node.targetY = node.y;
    });

    if (localIndex >= 0) {
        positionStore.set(nodes[localIndex].id, {
            x: nodes[localIndex].x,
            y: nodes[localIndex].y,
            targetX: nodes[localIndex].targetX,
            targetY: nodes[localIndex].targetY,
        });
    }
}

function getEdgeLabelCenter(link) {
    return {
        x: link.source.x * TOPOLOGY_LAYOUT.edgeLabelBiasSource + link.target.x * TOPOLOGY_LAYOUT.edgeLabelBiasTarget,
        y: link.source.y * TOPOLOGY_LAYOUT.edgeLabelBiasSource + link.target.y * TOPOLOGY_LAYOUT.edgeLabelBiasTarget,
    };
}

function nodeClassForRole(role) {
    if (role === "Local") {
        return "monitor-node-local";
    }
    if (role === "Relay") {
        return "monitor-node-relay";
    }
    return "monitor-node-normal";
}

function colorForRssi(rssi) {
    if (rssi >= -55) {
        return "#22c55e";
    }
    if (rssi >= -70) {
        return "#f97316";
    }
    return "#ef4444";
}

function widthForRssi(rssi) {
    return Math.max(1.4, Math.min(3.6, (rssi + 90) / 15 + 1)) * 1.2;
}

function clampValue(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function formatTooltipHtml(datum) {
    if (datum.type === "local") {
        return `<strong>${datum.addr}</strong>Type: local`;
    }

    return [
        `<strong>${datum.addr}</strong>`,
        `Type: ${datum.type}`,
        `RSSI: ${datum.rssi} dBm`,
        `Direct: ${datum.direct}`,
        `Relay: ${datum.relay}`,
        `Age: ${formatSeconds(datum.ageMs)}`,
        `TTL: ${formatSeconds(datum.ttlMs)}`,
    ].join("<br>");
}

function formatSeconds(milliseconds) {
    return `${Math.floor(Math.max(0, Number(milliseconds) || 0) / 1000)} s`;
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.createSystemMonitorPage = createSystemMonitorPage;
})();
