(function () {
const LORANET_EMPTY_RE = /info:\s*No nodes found in LoraNet topology/i;
const LORANET_PENDING_RE = /err1:\s*previous action is still pending/i;
const LORANET_SYNTAX_RE = /^\s*Syntax:\s*at\+ab\s+loranet\b/im;

function parseATInfo(text) {
    const nodeMatch = text.match(/^\s*Node\s+Addr\s+([0-9A-Fa-f]{4})\s*$/m);
    const groupMatch = text.match(/^\s*Publish\s+Addr\s+([0-9A-Fa-f]{4})\s*$/m);

    if (!nodeMatch || !groupMatch) {
        return null;
    }

    return {
        localNode: nodeMatch[1].toUpperCase(),
        groupAddr: groupMatch[1].toUpperCase(),
    };
}

function createLoraNetResult(status, {
    localNode = "----",
    nodes = [],
    links = [],
    message = "",
    matchedRows = 0,
    rawText = "",
} = {}) {
    return {
        status,
        localNode: (localNode || "----").toUpperCase(),
        nodes,
        links,
        message,
        matchedRows,
        rawText,
    };
}

function parseLoraNet(text, localNode) {
    const rawText = String(text || "");
    const normalizedText = rawText.replace(/\r/g, "");
    const normalizedLocalNode = (localNode || "----").toUpperCase();

    if (!localNode) {
        return createLoraNetResult("invalid", {
            localNode: "----",
            message: "Missing local node context.",
            rawText,
        });
    }

    const rows = [];
    const lineRe = /^(\d+):([0-9A-Fa-f]{4})\s+(-?\d+)\s+([0-9A-Fa-f]{4})$/;

    for (const line of normalizedText.split("\n")) {
        const match = line.trim().match(lineRe);
        if (!match) continue;
        rows.push({
            hop: Number(match[1]),
            relay: match[2].toUpperCase(),
            rssi: Number(match[3]),
            node: match[4].toUpperCase(),
        });
    }

    if (rows.length === 0) {
        if (LORANET_EMPTY_RE.test(normalizedText)) {
            return createLoraNetResult("empty", {
                localNode: normalizedLocalNode,
                message: "No nodes found in LoraNet topology.",
                rawText,
            });
        }
        if (LORANET_PENDING_RE.test(normalizedText)) {
            return createLoraNetResult("pending", {
                localNode: normalizedLocalNode,
                message: "Previous action is still pending.",
                rawText,
            });
        }
        if (LORANET_SYNTAX_RE.test(normalizedText)) {
            return createLoraNetResult("syntax_error", {
                localNode: normalizedLocalNode,
                message: "Device rejected at+ab loranet syntax.",
                rawText,
            });
        }
        return createLoraNetResult("invalid", {
            localNode: normalizedLocalNode,
            message: firstMeaningfulLine(normalizedText) || "Unrecognized loranet response.",
            rawText,
        });
    }

    const bestByNode = new Map();
    const reverseRssiByEdge = new Map();
    const inferredRelays = new Set();

    for (const row of rows) {
        const old = bestByNode.get(row.node);
        if (!old || row.hop < old.hop || (row.hop === old.hop && isBetterRssi(row.rssi, old.rssi))) {
            bestByNode.set(row.node, row);
        }
        if (row.relay !== normalizedLocalNode) {
            inferredRelays.add(row.relay);
        }
        const edgeKey = `${row.node}->${row.relay}`;
        const oldReverse = reverseRssiByEdge.get(edgeKey);
        if (oldReverse === undefined || isBetterRssi(row.rssi, oldReverse)) {
            reverseRssiByEdge.set(edgeKey, row.rssi);
        }
    }

    const nodes = new Map();
    const links = [];
    const linkKeys = new Set();

    function addNode(id, role, depth) {
        const old = nodes.get(id);
        if (!old) {
            nodes.set(id, { id, role, depth });
            return;
        }
        if (old.role !== "Local" && role === "Relay") old.role = "Relay";
        if (depth < old.depth) old.depth = depth;
    }

    addNode(normalizedLocalNode, "Local", 0);

    for (const row of bestByNode.values()) {
        if (row.node === normalizedLocalNode) continue;
        addNode(row.relay, row.relay === normalizedLocalNode ? "Local" : "Relay", row.hop);
        addNode(row.node, inferredRelays.has(row.node) ? "Relay" : "Node", row.hop + 1);

        linkKeys.add(`${row.relay}->${row.node}`);
        links.push({
            key: `${row.relay}->${row.node}`,
            source: row.relay,
            target: row.node,
            forwardRssi: row.rssi,
            reverseRssi: reverseRssiByEdge.get(`${row.relay}->${row.node}`),
            hop: row.hop,
            kind: "primary",
        });
    }

    for (const row of rows) {
        if (row.node === normalizedLocalNode) continue;
        const linkKey = `${row.relay}->${row.node}`;
        if (linkKeys.has(linkKey)) continue;

        addNode(row.relay, row.relay === normalizedLocalNode ? "Local" : "Relay", row.hop);
        addNode(row.node, inferredRelays.has(row.node) ? "Relay" : "Node", row.hop + 1);
        linkKeys.add(linkKey);

        links.push({
            key: linkKey,
            source: row.relay,
            target: row.node,
            forwardRssi: row.rssi,
            reverseRssi: undefined,
            hop: row.hop,
            kind: "observed",
        });
    }

    return createLoraNetResult("data", {
        localNode: normalizedLocalNode,
        nodes: Array.from(nodes.values()),
        links,
        matchedRows: rows.length,
        rawText,
    });
}

function createTopologyState() {
    return {
        nodes: new Map(),
        links: new Map(),
    };
}

function mergeLoraNetTopology(state, parsed) {
    const target = state || createTopologyState();

    if (!parsed || !parsed.localNode) {
        return toTopologyData(target, "----");
    }

    for (const node of parsed.nodes || []) {
        const old = target.nodes.get(node.id);
        if (!old) {
            target.nodes.set(node.id, {
                ...node,
                lastSeen: Date.now(),
            });
            continue;
        }

        old.role = mergeRole(old.role, node.role);
        old.depth = node.depth;
        old.lastSeen = Date.now();
    }

    for (const link of parsed.links || []) {
        const key = link.key || `${link.source}->${link.target}`;
        const old = target.links.get(key);
        if (!old) {
            target.links.set(key, {
                ...link,
                key,
                lastSeen: Date.now(),
            });
            continue;
        }

        old.source = link.source;
        old.target = link.target;
        old.forwardRssi = link.forwardRssi !== undefined ? link.forwardRssi : old.forwardRssi;
        old.reverseRssi = link.reverseRssi !== undefined ? link.reverseRssi : old.reverseRssi;
        old.hop = link.hop;
        old.kind = link.kind;
        old.lastSeen = Date.now();
    }

    return toTopologyData(target, parsed.localNode);
}

function toTopologyData(state, localNode = "----") {
    return {
        nodes: Array.from(state.nodes.values()),
        links: Array.from(state.links.values()),
        localNode,
    };
}

function mergeRole(oldRole, newRole) {
    return roleRank(newRole) > roleRank(oldRole) ? newRole : oldRole;
}

function roleRank(role) {
    if (role === "Local") return 3;
    if (role === "Relay") return 2;
    return 1;
}

function formatRssi(rssi) {
    return isValidRssi(rssi) ? `${rssi} dB` : "-- dB";
}

function isValidRssi(rssi) {
    return rssi !== 0;
}

function isBetterRssi(candidate, current) {
    if (isValidRssi(candidate) && !isValidRssi(current)) {
        return true;
    }
    if (!isValidRssi(candidate) && isValidRssi(current)) {
        return false;
    }
    return candidate > current;
}

function firstMeaningfulLine(text) {
    for (const line of String(text || "").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) {
            continue;
        }
        return trimmed;
    }
    return "";
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.parseATInfo = parseATInfo;
window.TermPWA.createLoraNetResult = createLoraNetResult;
window.TermPWA.parseLoraNet = parseLoraNet;
window.TermPWA.createTopologyState = createTopologyState;
window.TermPWA.mergeLoraNetTopology = mergeLoraNetTopology;
window.TermPWA.toTopologyData = toTopologyData;
window.TermPWA.formatRssi = formatRssi;
})();
