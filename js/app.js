/**
 * app.js — connects the web page to RunwayScheduler.
 *
 * Every user action follows the same pattern:
 *     1. call a scheduler method
 *     2. replay the heap's trace as an animation (optional)
 *     3. render() the whole page from the scheduler's state
 */

const scheduler = new RunwayScheduler();
const $ = (id) => document.getElementById(id);

const ui = {
  animating: false,
  filter: "all",
  log: [], // newest first
  logNumber: 0,
};

const SPARE_RUNWAY_NAMES = ["27L", "27R", "04", "22", "13", "31", "18", "36", "09C", "27C"];

// =====================================================================
//  Runway editor
// =====================================================================

function addRunwayRow({ name, mode, windows }) {
  const row = document.createElement("div");
  row.className = "runway-row";
  row.innerHTML = `
    <input class="rw-name" value="${esc(name)}" maxlength="5" aria-label="Runway name">
    <select class="rw-mode" aria-label="Runway use">
      <option value="mixed">Mixed</option>
      <option value="arrival">Arrivals only</option>
      <option value="departure">Departures only</option>
    </select>
    <input class="rw-windows" value="${esc(windows)}" aria-label="Open intervals">
    <button class="rw-remove" title="Remove runway" aria-label="Remove runway">×</button>`;
  row.querySelector(".rw-mode").value = mode;
  row.querySelector(".rw-remove").onclick = () => row.remove();
  $("runway-list").append(row);
}

/** "06:00-12:00, 13:00-22:00"  ->  [{start:360,end:720}, {start:780,end:1320}] */
function parseWindows(text, runwayName) {
  return text.split(",").map((part) => {
    const [from, to] = part.split("-").map((s) => s.trim());
    const start = toMinutes(from);
    const end = toMinutes(to);
    if (Number.isNaN(start) || Number.isNaN(end)) {
      throw new Error(`Runway ${runwayName}: "${part.trim()}" is not HH:MM-HH:MM.`);
    }
    return { start, end };
  });
}

function readRunwayRows() {
  return [...document.querySelectorAll(".runway-row")].map((row) => {
    const name = row.querySelector(".rw-name").value.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,5}$/.test(name)) throw new Error("Runway names: 1–5 letters or digits.");
    return {
      name,
      mode: row.querySelector(".rw-mode").value,
      windows: parseWindows(row.querySelector(".rw-windows").value, name),
    };
  });
}

function applyRunways() {
  $("runway-error").textContent = "";
  try {
    const hadSchedule = scheduler.stats().scheduled > 0;
    scheduler.setRunways(readRunwayRows());
    addLog(`Runways updated: <b>${scheduler.runways.map((r) => r.name).join(", ")}</b>`);
    if (hadSchedule) replan();
    else render();
  } catch (error) {
    $("runway-error").textContent = error.message;
  }
}

// =====================================================================
//  Actions
// =====================================================================

async function addFlightFromForm(event) {
  event.preventDefault();
  if (ui.animating) return;

  const fields = event.target.elements;
  $("form-error").textContent = "";

  try {
    const flight = scheduler.addFlight({
      id: fields.flightId.value,
      type: fields.type.value,
      requestedTime: toMinutes(fields.time.value),
      priority: Number(fields.priority.value),
      emergency: fields.emergency.checked,
    });
    addLog(`Insert <b>${flight.id}</b> into heap (${flight.emergency ? "EMERGENCY" : "P" + flight.priority})`);
    fields.flightId.value = "";
    fields.emergency.checked = false;
    await playTrace(scheduler.queue.trace);
    render();
  } catch (error) {
    $("form-error").textContent = error.message;
  }
}

async function scheduleNext() {
  if (ui.animating || scheduler.queue.isEmpty()) return;

  const flight = scheduler.scheduleNext();
  await playTrace(scheduler.queue.trace);

  logScheduled(flight);
  render(flight.id);
}

function scheduleAll() {
  if (ui.animating || scheduler.queue.isEmpty()) return;

  const done = scheduler.scheduleAll();
  const delayed = done.filter((f) => f.slot && f.slot.delay > 0).length;
  const failed = done.filter((f) => !f.slot).length;
  addLog(`Scheduled <b>${done.length}</b> flights · ${delayed} delayed · ${failed} unscheduled`, failed ? "warn" : "ok");
  setCaption(`Heap emptied with ${done.length} extract-min operations.`);
  render();
}

/** Throw away all slots, rebuild the heap in O(n), and schedule again. */
function replan() {
  if (ui.animating) return;
  scheduler.requeueAll();
  addLog(`Re-plan: heap rebuilt from <b>${scheduler.flights.size}</b> flights (heapify)`);
  scheduleAll();
}

function loadSample() {
  if (ui.animating) return;
  scheduler.clearFlights();
  for (const [id, type, time, priority, emergency] of SAMPLE_FLIGHTS) {
    scheduler.addFlight({ id, type, requestedTime: toMinutes(time), priority, emergency });
  }
  addLog(`Loaded <b>${SAMPLE_FLIGHTS.length}</b> sample requests`);
  setCaption("Sample loaded. Press “Schedule next” to watch extract-min.");
  render();
}

function addRandom() {
  if (ui.animating) return;
  const room = LIMITS.maxFlights - scheduler.flights.size;
  if (room <= 0) {
    addLog(`Limit of ${LIMITS.maxFlights} flights reached`, "warn");
    return render();
  }
  const flights = randomFlights(Math.min(25, room), new Set(scheduler.flights.keys()));
  flights.forEach((f) => scheduler.addFlight(f));
  addLog(`Added <b>${flights.length}</b> random requests`);
  render();
}

function clearAll() {
  if (ui.animating) return;
  scheduler.clearFlights();
  addLog("Cleared all flights", "warn");
  setCaption("Queue is empty.");
  render();
}

function applyDurations() {
  try {
    const hadSchedule = scheduler.stats().scheduled > 0;
    scheduler.setDurations(Number($("dur-arrival").value), Number($("dur-departure").value));
    addLog(`Occupancy: landing ${scheduler.durations.arrival} min, takeoff ${scheduler.durations.departure} min`);
    if (hadSchedule) replan();
    else render();
  } catch (error) {
    addLog(esc(error.message), "warn");
    render();
  }
}

// ----- actions on a waiting flight (dynamic priority updates) -----

async function changePriority(id, priority) {
  scheduler.updateFlight(id, { priority });
  addLog(`Update <b>${id}</b> → P${priority} (decrease/increase-key)`);
  await playTrace(scheduler.queue.trace);
  render();
}

async function toggleEmergency(id) {
  const emergency = !scheduler.flights.get(id).emergency;
  scheduler.updateFlight(id, { emergency });
  addLog(`<b>${id}</b> ${emergency ? "declared EMERGENCY" : "emergency cancelled"}`, emergency ? "warn" : "");
  await playTrace(scheduler.queue.trace);
  render();
}

async function removeFlight(id) {
  const lookup = new Map(scheduler.flights); // keep the flight so the animation can draw it
  scheduler.removeFlight(id);
  addLog(`Removed <b>${id}</b> from heap`);
  await playTrace(scheduler.queue.trace, lookup);
  render();
}

function logScheduled(flight) {
  if (!flight.slot) {
    addLog(`<b>${flight.id}</b> could not be scheduled — no free slot`, "warn");
    return;
  }
  const { runway, start, end, delay } = flight.slot;
  const timing = delay > 0 ? `+${delay} min` : "on time";
  addLog(`<b>${flight.id}</b> → RWY ${runway} ${formatTime(start)}–${formatTime(end)} (${timing})`, delay > 0 ? "" : "ok");
}

// =====================================================================
//  Heap animation
// =====================================================================

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Replay MinHeap.trace step by step. */
async function playTrace(trace, lookup = scheduler.flights) {
  if (!$("animate").checked || trace.length === 0) return;

  setBusy(true);
  for (const step of trace) {
    renderHeapTree($("heap-tree"), step.keys, lookup, step);
    renderHeapArray($("heap-array"), step.keys, lookup, step);
    setCaption(step.message);
    await sleep(980 - Number($("speed").value)); // slider right = faster
  }
  setBusy(false);
}

function setBusy(busy) {
  ui.animating = busy;
  document.querySelectorAll("button, .strip select, #flight-form input, #flight-form select")
    .forEach((el) => (el.disabled = busy));
}

// =====================================================================
//  Rendering
// =====================================================================

function render(focusFlightId = null) {
  const heapKeys = scheduler.queue.toArray().map((f) => f.id);

  renderStats();
  renderHeapTree($("heap-tree"), heapKeys, scheduler.flights, null);
  renderHeapArray($("heap-array"), heapKeys, scheduler.flights, null);
  renderPending();
  renderTimeline($("timeline"), scheduler.runways, scheduler.flights, Number($("zoom").value), focusFlightId);
  renderTable();
  renderLog();
  $("btn-next").disabled = $("btn-all").disabled = scheduler.queue.isEmpty();
}

function renderStats() {
  const s = scheduler.stats();
  const cells = [
    ["Flights", s.total],
    ["Waiting", s.pending],
    ["Scheduled", s.scheduled],
    ["Delayed", s.delayed],
    ["Avg delay", s.averageDelay.toFixed(1) + "m"],
    ["Max delay", s.maxDelay + "m"],
    ["Unsched.", s.unscheduled, s.unscheduled > 0],
  ];
  $("stats").innerHTML = cells
    .map(([label, value, alert]) => `<div><dt>${label}</dt><dd class="${alert ? "is-alert" : ""}">${value}</dd></div>`)
    .join("");
}

function renderPending() {
  const pending = scheduler.pendingInOrder();
  $("pending-count").textContent = pending.length;

  if (pending.length === 0) {
    $("pending-list").innerHTML = `<li class="empty">No flights waiting</li>`;
    return;
  }

  $("pending-list").innerHTML = pending
    .map((f, i) => {
      const options = [1, 2, 3, 4, 5]
        .map((p) => `<option value="${p}" ${p === f.priority ? "selected" : ""}>P${p}</option>`)
        .join("");
      return `
        <li class="strip ${f.type} ${f.emergency ? "emergency" : ""}" data-id="${f.id}">
          <span class="strip-rank">${i + 1}</span>
          <div>
            <div class="strip-id">${f.id}</div>
            <div class="strip-meta">${f.type === "arrival" ? "Arrival" : "Departure"} · ${formatTime(f.requestedTime)}</div>
          </div>
          <div class="strip-controls">
            <select data-action="priority" aria-label="Priority of ${f.id}">${options}</select>
            <button class="icon-btn ${f.emergency ? "is-on" : ""}" data-action="emergency" title="Toggle emergency">EMG</button>
            <button class="icon-btn remove" data-action="remove" title="Remove request" aria-label="Remove ${f.id}">×</button>
          </div>
        </li>`;
    })
    .join("");
}

function renderTable() {
  const rows = scheduler.scheduledByTime().filter((f) => {
    if (ui.filter === "delayed") return f.slot && f.slot.delay > 0;
    if (ui.filter === "emergency") return f.emergency;
    if (ui.filter === "unscheduled") return !f.slot;
    return true;
  });

  if (rows.length === 0) {
    $("schedule-body").innerHTML = `<tr><td colspan="8" class="empty">Nothing here yet</td></tr>`;
    return;
  }

  $("schedule-body").innerHTML = rows
    .map((f) => {
      const slot = f.slot;
      const delayClass = !slot ? "" : slot.delay === 0 ? "delay-0" : slot.delay <= 10 ? "delay-some" : "delay-big";
      return `
        <tr class="${slot ? "" : "is-unscheduled"}">
          <td class="flight">${f.id}${f.emergency ? `<span class="pill pill-emg">EMG</span>` : ""}</td>
          <td><span class="pill pill-${f.type}">${f.type === "arrival" ? "ARR" : "DEP"}</span></td>
          <td class="mono">P${f.priority}</td>
          <td class="mono">${formatTime(f.requestedTime)}</td>
          <td class="mono">${slot ? slot.runway : "—"}</td>
          <td class="mono">${slot ? formatTime(slot.start) + "–" + formatTime(slot.end) : "—"}</td>
          <td class="mono ${delayClass}">${slot ? (slot.delay ? "+" + slot.delay + "m" : "0") : "—"}</td>
          <td class="note">${slotNote(f)}</td>
        </tr>`;
    })
    .join("");
}

/** Short human explanation of why a flight got its slot. */
function slotNote(flight) {
  const slot = flight.slot;
  if (!slot) {
    const anyRunway = scheduler.runways.some((r) => r.accepts(flight.type));
    return anyRunway ? "No free slot in open hours" : `No runway accepts ${flight.type}s`;
  }
  if (slot.delay === 0) return "On time";
  if (slot.blockedBy) return `Conflict — waited for ${slot.blockedBy}`;
  return `Runway closed until ${formatTime(slot.start)}`;
}

function addLog(html, kind = "") {
  ui.logNumber++;
  ui.log.unshift({ number: ui.logNumber, html, kind });
  ui.log.length = Math.min(ui.log.length, 150);
}

function renderLog() {
  $("log").innerHTML = ui.log.length
    ? ui.log.map((e) => `<li class="${e.kind}"><span>${String(e.number).padStart(3, "0")}</span><div>${e.html}</div></li>`).join("")
    : `<li class="empty">No operations yet</li>`;
}

function setCaption(text) {
  $("heap-caption").textContent = text;
}

/** Escape text before putting it inside HTML. */
function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// =====================================================================
//  Event wiring + start-up
// =====================================================================

$("flight-form").addEventListener("submit", addFlightFromForm);
$("btn-next").onclick = scheduleNext;
$("btn-all").onclick = scheduleAll;
$("btn-replan").onclick = replan;
$("btn-sample").onclick = loadSample;
$("btn-random").onclick = addRandom;
$("btn-clear").onclick = clearAll;
$("btn-apply-runways").onclick = applyRunways;
$("dur-arrival").onchange = applyDurations;
$("dur-departure").onchange = applyDurations;
$("zoom").onchange = () => render();

$("btn-add-runway").onclick = () => {
  if (document.querySelectorAll(".runway-row").length >= LIMITS.maxRunways) {
    $("runway-error").textContent = `Max ${LIMITS.maxRunways} runways.`;
    return;
  }
  const used = new Set([...document.querySelectorAll(".rw-name")].map((input) => input.value.trim().toUpperCase()));
  const name = SPARE_RUNWAY_NAMES.find((n) => !used.has(n)) ?? "";
  addRunwayRow({ name, mode: "mixed", windows: "06:00-22:00" });
};

// Waiting list: one listener for all strips (event delegation).
$("pending-list").addEventListener("change", (event) => {
  const select = event.target.closest("[data-action='priority']");
  if (select && !ui.animating) changePriority(select.closest(".strip").dataset.id, Number(select.value));
});
$("pending-list").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button || ui.animating) return;
  const id = button.closest(".strip").dataset.id;
  if (button.dataset.action === "emergency") toggleEmergency(id);
  if (button.dataset.action === "remove") removeFlight(id);
});

$("filters").addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) return;
  ui.filter = chip.dataset.filter;
  document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c === chip));
  renderTable();
});

// Start with the demo airport and the sample morning rush.
DEFAULT_RUNWAYS.forEach(addRunwayRow);
scheduler.setRunways(readRunwayRows());
loadSample();
