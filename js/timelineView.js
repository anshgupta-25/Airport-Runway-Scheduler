/**
 * Runway timeline (Gantt chart).
 * One row per runway. Each booking is a block placed at
 *     left  = (start - rangeStart) * pxPerMinute
 *     width = duration * pxPerMinute
 * Hatched areas = runway closed. A thin line before a block = waiting time.
 */

function renderTimeline(container, runways, flights, pxPerMinute, focusFlightId) {
  if (runways.length === 0) {
    container.innerHTML = `<div class="tl-empty">No runways configured.</div>`;
    return;
  }

  // Remember horizontal scroll so re-rendering doesn't jump around.
  const oldScroll = container.querySelector(".tl-scroll");
  const scrollLeft = oldScroll ? oldScroll.scrollLeft : null;

  const { start: rangeStart, end: rangeEnd } = timelineRange(runways);
  const width = (rangeEnd - rangeStart) * pxPerMinute;
  const x = (minute) => (minute - rangeStart) * pxPerMinute;

  // Grid lines every 15 or 30 minutes depending on zoom.
  const step = pxPerMinute >= 6 ? 15 : 30;
  let ticks = "";
  let gridLines = "";
  for (let m = rangeStart; m < rangeEnd; m += step) {
    const isHour = m % 60 === 0 ? " is-hour" : "";
    ticks += `<div class="tl-tick${isHour}" style="left:${x(m)}px">${formatTime(m)}</div>`;
    gridLines += `<div class="tl-grid${isHour}" style="left:${x(m)}px"></div>`;
  }

  const labels = runways
    .map((r) => `<div class="tl-label"><b>${r.name}</b><small>${modeLabel(r.mode)}</small></div>`)
    .join("");

  const rows = runways
    .map((runway) => {
      const closed = closedPeriods(runway.windows, rangeStart, rangeEnd)
        .map((p) => `<div class="tl-closed" style="left:${x(p.start)}px;width:${(p.end - p.start) * pxPerMinute}px"></div>`)
        .join("");

      const blocks = runway.bookings
        .map((booking) => drawBlock(flights.get(booking.flightId), booking, x, pxPerMinute, focusFlightId))
        .join("");

      return `<div class="tl-row">${gridLines}${closed}${blocks}</div>`;
    })
    .join("");

  container.innerHTML = `
    <div class="tl-labels"><div class="tl-axis-spacer"></div>${labels}</div>
    <div class="tl-scroll">
      <div class="tl-canvas" style="width:${width}px">
        <div class="tl-axis">${ticks}</div>
        ${rows}
      </div>
    </div>`;

  // Scroll: to the newly scheduled flight, else keep the old position,
  // else start at the first booking.
  const scroller = container.querySelector(".tl-scroll");
  const focus = focusFlightId && container.querySelector(`[data-id="${focusFlightId}"]`);
  const firstBooking = Math.min(...runways.flatMap((r) => r.bookings.map((b) => b.start)));

  if (focus) {
    scroller.scrollLeft = focus.offsetLeft - scroller.clientWidth / 2;
  } else if (scrollLeft !== null) {
    scroller.scrollLeft = scrollLeft;
  } else if (Number.isFinite(firstBooking)) {
    scroller.scrollLeft = x(firstBooking) - 60;
  }
}

function drawBlock(flight, booking, x, pxPerMinute, focusFlightId) {
  const classes = ["tl-block", flight.type];
  if (flight.emergency) classes.push("emergency");
  if (flight.id === focusFlightId) classes.push("is-new");

  const delay = booking.start - flight.requestedTime;
  const tooltip =
    `${flight.id} · ${flight.type}\n` +
    `Requested ${formatTime(flight.requestedTime)}\n` +
    `Slot ${formatTime(booking.start)}–${formatTime(booking.end)}` +
    (delay > 0 ? `\nDelay ${delay} min` : "");

  const width = (booking.end - booking.start) * pxPerMinute;
  const block = `<div class="${classes.join(" ")}" data-id="${flight.id}" title="${tooltip}"
      style="left:${x(booking.start)}px;width:${width}px">${width >= 44 ? flight.id : ""}</div>`;

  const wait = delay > 0
    ? `<div class="tl-wait" style="left:${x(flight.requestedTime)}px;width:${delay * pxPerMinute}px"></div>`
    : "";

  return wait + block;
}

/** Whole hours covering every runway's open windows. */
function timelineRange(runways) {
  const windows = runways.flatMap((r) => r.windows);
  const start = Math.min(...windows.map((w) => w.start));
  const end = Math.max(...windows.map((w) => w.end));
  return {
    start: Math.floor(start / 60) * 60,
    end: Math.min(Math.ceil(end / 60) * 60, MINUTES_IN_DAY),
  };
}

/** The gaps between open windows = when the runway is closed. */
function closedPeriods(windows, rangeStart, rangeEnd) {
  const periods = [];
  let cursor = rangeStart;
  for (const w of windows) {
    if (w.start > cursor) periods.push({ start: cursor, end: w.start });
    cursor = Math.max(cursor, w.end);
  }
  if (cursor < rangeEnd) periods.push({ start: cursor, end: rangeEnd });
  return periods;
}

function modeLabel(mode) {
  return { mixed: "Mixed", arrival: "Arr only", departure: "Dep only" }[mode];
}
