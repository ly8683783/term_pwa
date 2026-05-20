(function () {
let simulation = null;
const parseLoraNet = window.TermPWA.parseLoraNet;
const formatRssi = window.TermPWA.formatRssi;

function clearTopology(svgSelector = "#topology") {
    if (simulation) {
        simulation.stop();
        simulation = null;
    }

    if (window.d3) {
        d3.select(svgSelector).selectAll("*").remove();
    }
}

function renderTopology({
    svgSelector = "#topology",
    buffer = "",
    localNode = null,
} = {}) {
    if (!window.d3) {
        return {
            rendered: false,
            d3Ready: false,
            visible: true,
            empty: true,
            nodesCount: 0,
            linksCount: 0,
            localNode: localNode || "----",
        };
    }

    const svg = d3.select(svgSelector);
    const root = svg.node();
    if (!root || root.clientWidth === 0) {
        return {
            rendered: false,
            d3Ready: true,
            visible: false,
            empty: true,
            nodesCount: 0,
            linksCount: 0,
            localNode: localNode || "----",
        };
    }

    const width = root.clientWidth;
    const height = root.clientHeight;
    const parsed = parseLoraNet(buffer, localNode);
    const { nodes, links } = parsed;

    svg.selectAll("*").remove();
    if (simulation) {
        simulation.stop();
    }

    svg.attr("viewBox", `0 0 ${width} ${height}`);

    if (nodes.length === 0) {
        svg.append("text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "#667085")
            .text("Waiting for data...");

        return {
            rendered: true,
            d3Ready: true,
            visible: true,
            empty: true,
            nodesCount: 0,
            linksCount: 0,
            localNode: parsed.localNode,
        };
    }

    const depthCounts = new Map();
    for (const n of nodes) {
        const index = depthCounts.get(n.depth) || 0;
        depthCounts.set(n.depth, index + 1);
        n.x = 110 + n.depth * 230;
        n.y = height / 2 + (index - 0.5) * 120;
    }

    simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(d => d.hop === 0 ? 260 : 220).strength(0.85))
        .force("charge", d3.forceManyBody().strength(-950))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("x", d3.forceX(d => 110 + d.depth * 230).strength(0.12))
        .force("y", d3.forceY(height / 2).strength(0.08))
        .force("collide", d3.forceCollide(58));

    const link = svg.append("g")
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("stroke", d => d.kind === "primary" ? "#30313f" : "#8b95a7")
        .attr("stroke-width", d => d.kind === "primary" ? 1.5 : 1.2)
        .attr("opacity", d => d.kind === "primary" ? 1 : 0.72);

    const edgeLabel = svg.append("g").selectAll("g").data(links).join("g").attr("class", "edge-label");
    edgeLabel.append("rect").attr("x", -23).attr("y", -9).attr("width", 46).attr("height", 18);
    edgeLabel.append("text").attr("text-anchor", "middle").attr("dominant-baseline", "central").text(d => formatRssi(d.forwardRssi));

    const reverseLabel = svg.append("g").selectAll("g").data(links.filter(d => d.reverseRssi !== undefined)).join("g").attr("class", "edge-label");
    reverseLabel.append("rect").attr("x", -23).attr("y", -9).attr("width", 46).attr("height", 18);
    reverseLabel.append("text").attr("text-anchor", "middle").attr("dominant-baseline", "central").text(d => formatRssi(d.reverseRssi));

    const node = svg.append("g").selectAll("g").data(nodes).join("g").attr("class", "node")
        .call(d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended));

    node.append("circle").attr("r", 40)
        .attr("fill", d => d.role === "Local" ? "var(--nv-local)" : d.role === "Relay" ? "var(--nv-relay)" : "var(--nv-node)")
        .attr("stroke", "#2a2c35").attr("stroke-width", 1.5);

    node.append("text").attr("class", "addr").attr("text-anchor", "middle").attr("y", -4).text(d => d.id);
    node.append("text").attr("class", "role").attr("text-anchor", "middle").attr("y", 15).text(d => d.role);

    simulation.on("tick", () => {
        for (const n of nodes) {
            n.x = Math.max(55, Math.min(width - 55, n.x));
            n.y = Math.max(55, Math.min(height - 55, n.y));
        }
        link.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
        edgeLabel.attr("transform", d => `translate(${d.source.x * 0.58 + d.target.x * 0.42},${d.source.y * 0.58 + d.target.y * 0.42})`);
        reverseLabel.attr("transform", d => `translate(${d.source.x * 0.42 + d.target.x * 0.58},${d.source.y * 0.42 + d.target.y * 0.58})`);
        node.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    function dragended(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }

    return {
        rendered: true,
        d3Ready: true,
        visible: true,
        empty: false,
        nodesCount: nodes.length,
        linksCount: links.length,
        localNode: parsed.localNode,
    };
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.clearTopology = clearTopology;
window.TermPWA.renderTopology = renderTopology;
})();
