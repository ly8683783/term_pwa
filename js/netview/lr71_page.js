(function () {
const NETVIEW_RESPONSE_IDLE_MS = 1500;
const NETVIEW_REFRESH_DELAY_MS = 10000;
const NETVIEW_INFO_TIMEOUT_MS = 5000;
const NETVIEW_RESPONSE_TIMEOUT_MS = 20000;
const NETVIEW_DRAW_DEBOUNCE_MS = 500;
const NETVIEW_RESIZE_DEBOUNCE_MS = 120;
const parseATInfo = window.TermPWA.parseATInfo;
const createLoraNetResult = window.TermPWA.createLoraNetResult;
const parseLoraNet = window.TermPWA.parseLoraNet;
const createTopologyState = window.TermPWA.createTopologyState;
const mergeLoraNetTopology = window.TermPWA.mergeLoraNetTopology;
const toTopologyData = window.TermPWA.toTopologyData;
const clearTopology = window.TermPWA.clearTopology;
const renderTopology = window.TermPWA.renderTopology;

function createNetViewPage({
    serialManager,
    serialSession,
    writeTerminal = () => {},
    selectors = {},
} = {}) {
    const startButton = document.querySelector(selectors.startButton || "#btnStartNetView");
    const stopButton = document.querySelector(selectors.stopButton || "#btnStopNetView");
    const clearButton = document.querySelector(selectors.clearButton || "#btnClearNetView");
    const statusElement = document.querySelector(selectors.status || "#netViewStatus");
    const groupTag = document.querySelector(selectors.groupTag || "#netViewGroupTag");
    const svgSelector = selectors.topology || "#topology";

    let state = "idle";
    let infoBuffer = "";
    let cycleBuffer = "";
    let topologyState = createTopologyState();
    let topologyData = toTopologyData(topologyState);
    let localNode = null;
    let groupAddr = null;
    let drawTimer = null;
    let infoTimer = null;
    let responseIdleTimer = null;
    let responseTimeoutTimer = null;
    let refreshTimer = null;
    let sessionToken = null;
    let disposed = false;
    const handleStartClick = () => {
        start().catch(error => {
            console.error("Failed to start NetView", error);
            stop();
            setStatus(`Status: failed to start NetView - ${error.message}`);
        });
    };
    const handleStopClick = () => {
        stop();
        redraw();
        writeTerminal("> [NetView Stopped]\n");
    };
    const handleClearClick = () => {
        clear();
        writeTerminal("> [NetView Cleared]\n");
    };
    const handleWindowResize = () => {
        clearTimeout(drawTimer);
        drawTimer = setTimeout(redraw, NETVIEW_RESIZE_DEBOUNCE_MS);
    };

    startButton.addEventListener("click", handleStartClick);
    stopButton.addEventListener("click", handleStopClick);
    clearButton.addEventListener("click", handleClearClick);
    window.addEventListener("resize", handleWindowResize);

    function isCollecting() {
        return state !== "idle";
    }

    function handleSerialData(data) {
        if (disposed) {
            return;
        }
        if (!isCollecting()) {
            return;
        }

        if (state === "reading_info") {
            infoBuffer += data;
            const info = parseATInfo(infoBuffer);
            if (info) {
                startTopology(info).catch(error => {
                    console.error("Failed to start topology collection", error);
                    stop(`Status: failed to start loranet - ${error.message}`);
                });
            }
            return;
        }

        if (state === "collecting_topology" || state === "waiting_refresh") {
            if (state === "waiting_refresh") {
                clearTimeout(refreshTimer);
                refreshTimer = null;
                state = "collecting_topology";
            }
            cycleBuffer += data;
            clearTimeout(drawTimer);
            drawTimer = setTimeout(mergeAndRedraw, NETVIEW_DRAW_DEBOUNCE_MS);
            armResponseIdleTimer();
        }
    }

    function handleConnected() {
        if (disposed) {
            return;
        }
        if (!isCollecting()) {
            startButton.disabled = !canStart();
            stopButton.disabled = true;
            setStatus(canStart() ? "Status: ready." : `Status: ${serialSession.getStatusText()}.`);
        }
    }

    function handleDisconnected(message = "Status: connect a serial device to start NetView.") {
        if (disposed) {
            return;
        }
        state = "idle";
        clearAllTimers();
        releaseSession();
        startButton.disabled = true;
        stopButton.disabled = true;
        setStatus(message);
    }

    function handleUnavailable(message) {
        if (disposed) {
            return;
        }
        handleDisconnected(message);
    }

    async function start() {
        if (disposed) {
            return;
        }
        if (!serialManager.isConnected()) {
            setStatus("Status: connect a serial device before starting NetView.");
            return;
        }
        sessionToken = serialSession.acquire("netview", "NetView");

        state = "reading_info";
        infoBuffer = "";
        cycleBuffer = "";
        topologyState = createTopologyState();
        topologyData = toTopologyData(topologyState);
        localNode = null;
        groupAddr = null;
        clearAllTimers();

        startButton.disabled = true;
        stopButton.disabled = false;
        groupTag.innerText = "Group --";
        setStatus("Status: reading device info...");
        clearTopology(svgSelector);

        await serialSession.writeATCommand("netview", "at+ab info");
        infoTimer = setTimeout(() => {
            if (isCollecting() && state === "reading_info") {
                stop("Status: failed to parse at+ab info; missing Node Addr or Publish Addr.");
            }
        }, NETVIEW_INFO_TIMEOUT_MS);
        writeTerminal("> [NetView Started] at+ab info\n");
    }

    function stop(message = null) {
        if (disposed) {
            return;
        }
        state = "idle";
        clearAllTimers();
        releaseSession();
        if (serialManager.isConnected()) {
            startButton.disabled = false;
        }
        stopButton.disabled = true;
        setStatus(message || (topologyData.nodes.length > 0
            ? "Status: stopped. Showing latest topology data."
            : "Status: stopped. No topology rows received."));
    }

    function clear() {
        if (disposed) {
            return;
        }
        state = "idle";
        infoBuffer = "";
        cycleBuffer = "";
        topologyState = createTopologyState();
        topologyData = toTopologyData(topologyState);
        localNode = null;
        groupAddr = null;
        clearAllTimers();
        releaseSession();
        groupTag.innerText = "Group --";
        clearTopology(svgSelector);
        if (serialManager.isConnected()) {
            startButton.disabled = false;
        }
        stopButton.disabled = true;
        setStatus("Status: topology cleared.");
    }

    async function startTopology(info) {
        if (disposed) {
            return;
        }
        if (state !== "reading_info") {
            return;
        }

        localNode = info.localNode;
        groupAddr = info.groupAddr;
        state = "collecting_topology";
        clearTimeout(infoTimer);
        infoTimer = null;
        groupTag.innerText = `Group ${groupAddr}`;
        setStatus(`Status: Local ${localNode}, starting group ${groupAddr} refresh...`);

        writeTerminal(`> [NetView] Local=${localNode} Group=${groupAddr}\n`);
        await sendLoraNetCommand();
    }

    async function sendLoraNetCommand() {
        if (disposed) {
            return;
        }
        if (!isCollecting() || !serialManager.isConnected() || !groupAddr) {
            return;
        }

        clearCycleTimers();
        state = "collecting_topology";
        cycleBuffer = "";
        setStatus(`Status: collecting group ${groupAddr} from Local ${localNode}...`);

        const cmd = `at+ab loranet ${groupAddr}`;
        await serialSession.writeATCommand("netview", cmd);
        responseTimeoutTimer = setTimeout(() => {
            if (isCollecting() && state === "collecting_topology") {
                stop(formatLoraNetResultStatus(createLoraNetResult("no_response", {
                    localNode: localNode || "----",
                    message: "No response from at+ab loranet.",
                })));
            }
        }, NETVIEW_RESPONSE_TIMEOUT_MS);
        writeTerminal(`> [NetView Refresh] ${cmd}\n`);
    }

    function armResponseIdleTimer() {
        if (disposed) {
            return;
        }
        clearTimeout(responseIdleTimer);
        responseIdleTimer = setTimeout(() => {
            finishResponseCycle();
        }, NETVIEW_RESPONSE_IDLE_MS);
    }

    function finishResponseCycle() {
        if (disposed) {
            return;
        }
        if (state !== "collecting_topology") {
            return;
        }

        clearTimeout(responseIdleTimer);
        responseIdleTimer = null;
        clearTimeout(responseTimeoutTimer);
        responseTimeoutTimer = null;
        state = "waiting_refresh";
        applyLoraNetResult(parseCurrentCycleResult(), { nextRefreshDelayMs: NETVIEW_REFRESH_DELAY_MS });

        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
            sendLoraNetCommand().catch(error => {
                console.error("NetView refresh failed", error);
                stop(`Status: refresh failed - ${error.message}`);
            });
        }, NETVIEW_REFRESH_DELAY_MS);
    }

    function mergeAndRedraw() {
        if (disposed) {
            return;
        }
        const result = parseCurrentCycleResult();
        if (result.status === "data") {
            topologyData = mergeLoraNetTopology(topologyState, result);
        }
        return redraw();
    }

    function redraw() {
        if (disposed) {
            return { d3Ready: true, visible: false, empty: true, nodesCount: 0, linksCount: 0, localNode };
        }
        const result = renderTopology({
            svgSelector,
            topology: topologyData,
            localNode,
        });

        if (!result.d3Ready) {
            setStatus("Status: D3 failed to load; topology cannot be drawn.");
            return result;
        }

        if (!result.visible) {
            return result;
        }

        if (result.empty) {
            if (isCollecting()) {
                setStatus(state === "reading_info"
                    ? "Status: reading device info..."
                    : `Status: collecting group ${groupAddr || "--"} from Local ${localNode || "--"}...`);
            }
            return result;
        }

        setStatus(isCollecting()
            ? `Status: collecting group ${groupAddr || "--"} from Local ${result.localNode}. Parsed ${result.nodesCount} nodes and ${result.linksCount} links.`
            : `Status: showing group ${groupAddr || "--"} from Local ${result.localNode}. ${result.nodesCount} nodes and ${result.linksCount} links.`);
        return result;
    }

    function clearCycleTimers() {
        clearTimeout(responseIdleTimer);
        clearTimeout(responseTimeoutTimer);
        clearTimeout(refreshTimer);
        responseIdleTimer = null;
        responseTimeoutTimer = null;
        refreshTimer = null;
    }

    function clearAllTimers() {
        clearTimeout(drawTimer);
        clearTimeout(infoTimer);
        clearCycleTimers();
        drawTimer = null;
        infoTimer = null;
    }

    function setStatus(message) {
        if (disposed) {
            return;
        }
        statusElement.innerText = message;
    }

    function parseCurrentCycleResult() {
        if (!cycleBuffer.trim()) {
            return createLoraNetResult("invalid", {
                localNode: localNode || "----",
                message: "Empty loranet response.",
                rawText: cycleBuffer,
            });
        }
        return parseLoraNet(cycleBuffer, localNode);
    }

    function applyLoraNetResult(result, { nextRefreshDelayMs = null } = {}) {
        if (disposed) {
            return null;
        }

        let redrawResult = null;
        if (result.status === "data") {
            topologyData = mergeLoraNetTopology(topologyState, result);
            redrawResult = redraw();
        } else if (!hasTopologyData()) {
            redrawResult = redraw();
        }

        setStatus(formatLoraNetResultStatus(result, {
            nextRefreshDelayMs,
            redrawResult,
        }));
        return redrawResult;
    }

    function formatLoraNetResultStatus(result, {
        nextRefreshDelayMs = null,
        redrawResult = null,
    } = {}) {
        const refreshText = nextRefreshDelayMs ? ` Next refresh in ${nextRefreshDelayMs / 1000}s.` : "";
        const effectiveLocalNode = result.localNode || localNode || "--";
        const effectiveGroupAddr = groupAddr || "--";
        const showingLatestText = hasTopologyData()
            ? " Showing latest topology data."
            : "";

        switch (result.status) {
        case "data": {
            const nodeCount = redrawResult ? redrawResult.nodesCount : topologyData.nodes.length;
            const linkCount = redrawResult ? redrawResult.linksCount : topologyData.links.length;
            return `Status: refresh complete. Group ${effectiveGroupAddr} from Local ${effectiveLocalNode}. Parsed ${nodeCount} nodes and ${linkCount} links.${refreshText}`;
        }
        case "empty":
            return `Status: group ${effectiveGroupAddr} from Local ${effectiveLocalNode} returned no nodes.${showingLatestText}${refreshText}`;
        case "pending":
            return `Status: device reported previous loranet action is still pending.${showingLatestText}${refreshText}`;
        case "syntax_error":
            return `Status: device rejected at+ab loranet syntax.${showingLatestText}${refreshText}`;
        case "invalid":
            return `Status: received unrecognized loranet response.${showingLatestText}${refreshText}`;
        case "no_response":
            return "Status: no response from at+ab loranet. Please check whether the device is normal.";
        default:
            return `Status: received unsupported loranet result.${showingLatestText}${refreshText}`;
        }
    }

    function hasTopologyData() {
        return topologyData.nodes.length > 0;
    }

    function handleSessionChanged() {
        if (disposed) {
            return;
        }
        if (isCollecting()) {
            return;
        }
        startButton.disabled = !canStart();
        if (serialManager.isConnected() && !canStart()) {
            setStatus(`Status: ${serialSession.getStatusText()}.`);
        } else if (serialManager.isConnected()) {
            setStatus("Status: ready.");
        }
    }

    function canStart() {
        return serialManager.isConnected() && serialSession.canWrite("netview");
    }

    function releaseSession() {
        if (!sessionToken) {
            return;
        }
        sessionToken.release();
        sessionToken = null;
    }

    function dispose() {
        if (disposed) {
            return;
        }
        disposed = true;
        startButton.removeEventListener("click", handleStartClick);
        stopButton.removeEventListener("click", handleStopClick);
        clearButton.removeEventListener("click", handleClearClick);
        window.removeEventListener("resize", handleWindowResize);
        clearAllTimers();
        releaseSession();
        state = "idle";
        infoBuffer = "";
        cycleBuffer = "";
        topologyState = createTopologyState();
        topologyData = toTopologyData(topologyState);
        localNode = null;
        groupAddr = null;
        clearTopology(svgSelector);
    }

    return {
        handleSerialData,
        handleConnected,
        handleDisconnected,
        handleUnavailable,
        handleSessionChanged,
        redraw,
        stop,
        clear,
        isCollecting,
        dispose,
    };
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.createNetViewPage = createNetViewPage;
})();
