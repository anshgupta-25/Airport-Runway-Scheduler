/**
 * Heap drawing.
 * Shows the same heap two ways:
 *   1. as a tree (SVG)  — first 4 levels (15 nodes)
 *   2. as the real array — every index
 *
 * `highlight` = { type, indices } comes from one step of MinHeap.trace,
 * e.g. { type: "swap", indices: [3, 1] }.
 */

const TREE_LEVELS = 4;
const NODE_W = 76;
const NODE_H = 36;
const SLOT_W = NODE_W + 12; // horizontal space per node on the bottom level
const LEVEL_H = 66;

function renderHeapTree(container, keys, flights, highlight) {
  if (keys.length === 0) {
    container.innerHTML = `<div class="heap-empty">Queue is empty</div>`;
    return;
  }

  const visible = Math.min(keys.length, 2 ** TREE_LEVELS - 1);
  const levels = Math.floor(Math.log2(visible)) + 1;
  const width = Math.max(2 ** (levels - 1), 2) * SLOT_W;
  const height = levels * LEVEL_H + 10;

  // Centre of node i: level = floor(log2(i+1)), spread evenly on that level.
  const position = (i) => {
    const level = Math.floor(Math.log2(i + 1));
    const indexInLevel = i - (2 ** level - 1);
    const x = ((indexInLevel + 0.5) * width) / 2 ** level;
    const y = 28 + level * LEVEL_H;
    return { x, y };
  };

  let edges = "";
  let nodes = "";

  for (let i = 0; i < visible; i++) {
    const { x, y } = position(i);

    if (i > 0) {
      const parent = position(Math.floor((i - 1) / 2));
      edges += `<line class="heap-edge" x1="${parent.x}" y1="${parent.y + NODE_H / 2}" x2="${x}" y2="${y - NODE_H / 2}"/>`;
    }

    nodes += drawNode(i, x, y, flights.get(keys[i]), highlight);
  }

  const hidden = keys.length - visible;
  const more = hidden > 0
    ? `<text class="heap-more" x="${width - 8}" y="${height - 4}" text-anchor="end">+${hidden} more in array ↓</text>`
    : "";

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" style="max-width:${width}px" role="img" aria-label="Heap tree">
      ${edges}${nodes}${more}
    </svg>`;
}

function drawNode(index, x, y, flight, highlight) {
  const left = x - NODE_W / 2;
  const top = y - NODE_H / 2;
  const meta = (flight.emergency ? "EMG" : "P" + flight.priority) + " · " + formatTime(flight.requestedTime);

  const classes = ["heap-node"];
  if (flight.emergency) classes.push("is-emergency");
  if (highlight && highlight.indices.includes(index)) classes.push("hl-" + highlight.type);

  return `
    <g class="${classes.join(" ")}">
      <text class="node-index" x="${left}" y="${top - 4}">${index}</text>
      <rect class="body" x="${left}" y="${top}" width="${NODE_W}" height="${NODE_H}" rx="4"/>
      <rect class="stripe-${flight.type}" x="${left}" y="${top}" width="4" height="${NODE_H}" rx="1"/>
      <text class="node-id" x="${x + 2}" y="${y - 2}" text-anchor="middle">${flight.id}</text>
      <text class="node-meta" x="${x + 2}" y="${y + 11}" text-anchor="middle">${meta}</text>
    </g>`;
}

function renderHeapArray(container, keys, flights, highlight) {
  container.innerHTML = keys
    .map((key, index) => {
      const flight = flights.get(key);
      const classes = ["cell"];
      if (flight.emergency) classes.push("is-emergency");
      if (highlight && highlight.indices.includes(index)) classes.push("hl-" + highlight.type);
      return `<div class="${classes.join(" ")}"><i>[${index}]</i><b>${key}</b></div>`;
    })
    .join("");

  // Keep the highlighted cell in view while animating (horizontal scroll only).
  const active = container.querySelector("[class*='hl-']");
  if (active) container.scrollLeft = active.offsetLeft - container.clientWidth / 2;
}
