/**
 * RunwayTimeline — the schedule of ONE runway.
 *
 *   windows  : times the runway is open, e.g. [06:00–12:00, 13:00–22:00]
 *   bookings : slots already given to flights, kept SORTED by start time
 *
 * Because bookings never overlap and are sorted by start, they are also
 * sorted by end. So we can use binary search to jump straight to the first
 * booking that could clash with a new slot, instead of scanning from the start.
 *
 *   Operation               Time
 *   ----------------------  --------------------------------------------
 *   findEarliestSlot        O(log k + g)   k = bookings, g = gaps skipped
 *   book                    O(log k + k)   binary search + array insert
 */
class RunwayTimeline {
  /**
   * @param {string} name     e.g. "09L"
   * @param {Array<{start:number,end:number}>} windows  open intervals (minutes)
   * @param {"mixed"|"arrival"|"departure"} mode  which operations it accepts
   */
  constructor(name, windows, mode = "mixed") {
    this.name = name;
    this.mode = mode;
    this.windows = [...windows].sort((a, b) => a.start - b.start);
    this.bookings = [];
  }

  /** Can this runway handle an arrival / departure? */
  accepts(flightType) {
    return this.mode === "mixed" || this.mode === flightType;
  }

  /**
   * Binary search: index of the first booking whose end is AFTER `time`.
   * Bookings before this index finish before `time`, so they can't clash.
   */
  firstBookingEndingAfter(time) {
    let low = 0;
    let high = this.bookings.length;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (this.bookings[mid].end <= time) low = mid + 1;
      else high = mid;
    }
    return low;
  }

  /**
   * Earliest start >= `earliest` where a slot of `duration` minutes fits
   * inside an open window without touching another booking.
   *
   * @returns {{start:number, blockedBy:string|null} | null}
   *          blockedBy = the flight we had to wait for (null if on time)
   */
  findEarliestSlot(earliest, duration) {
    for (const window of this.windows) {
      let blockedBy = null;
      let start = Math.max(earliest, window.start);
      if (start + duration > window.end) continue; // window too short / already past

      let i = this.firstBookingEndingAfter(start);

      // Walk forward while the next booking overlaps [start, start + duration).
      while (i < this.bookings.length && this.bookings[i].start < start + duration) {
        start = this.bookings[i].end; // wait until that booking is finished
        blockedBy = this.bookings[i].flightId;
        i++;
      }

      if (start + duration <= window.end) {
        return { start, blockedBy };
      }
      // Didn't fit before this window closed — try the next window.
    }

    return null; // no space anywhere today
  }

  /** Reserve [start, end) for a flight, keeping bookings sorted. */
  book(flightId, start, end) {
    // Binary search for the insert position (first booking that starts later).
    let low = 0;
    let high = this.bookings.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (this.bookings[mid].start < start) low = mid + 1;
      else high = mid;
    }

    // Safety check: the slot must not overlap its neighbours.
    const before = this.bookings[low - 1];
    const after = this.bookings[low];
    if ((before && before.end > start) || (after && after.start < end)) {
      throw new Error(`Overlap on runway ${this.name} at ${formatTime(start)}`);
    }

    this.bookings.splice(low, 0, { flightId, start, end });
  }

  clearBookings() {
    this.bookings = [];
  }
}
