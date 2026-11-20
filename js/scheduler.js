/**
 * RunwayScheduler — the core logic. No UI code in this file.
 *
 * Data structures used:
 *   flights  : Map  (hash map)       flightId -> flight     O(1) lookup
 *   queue    : MinHeap (priority q.) waiting flights        O(log n) push/pop
 *   runways  : RunwayTimeline[]      sorted bookings        binary search
 *
 * Scheduling algorithm (greedy):
 *   1. Pop the most important flight from the heap.
 *   2. On every runway that accepts its type, find the earliest free slot
 *      at or after the requested time.
 *   3. Take the runway with the earliest slot (ties -> first runway).
 *   4. Delay = slot start - requested time.
 */

const LIMITS = {
  maxFlights: 500,
  maxRunways: 10,
  minPriority: 1, // 1 = most important
  maxPriority: 5,
};

/**
 * Who goes first? Returns a negative number if `a` goes before `b`.
 * The order is a TOTAL order, so the result is always deterministic:
 *   1. Emergency flights first
 *   2. Lower priority number first (1 beats 5)
 *   3. Earlier requested time first
 *   4. Flight ID alphabetically (IDs are unique, so no two flights tie)
 */
function compareFlights(a, b) {
  if (a.emergency !== b.emergency) return a.emergency ? -1 : 1;
  if (a.priority !== b.priority) return a.priority - b.priority;
  if (a.requestedTime !== b.requestedTime) return a.requestedTime - b.requestedTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

class RunwayScheduler {
  constructor() {
    this.flights = new Map();
    this.queue = new MinHeap(compareFlights, (flight) => flight.id);
    this.runways = [];
    this.durations = { arrival: 4, departure: 3 }; // minutes a runway is occupied
  }

  // =============== Flights ===============

  /** Validate and add a new request to the priority queue. */
  addFlight({ id, type, requestedTime, priority, emergency }) {
    id = String(id).trim().toUpperCase();

    if (!/^[A-Z0-9]{2,8}$/.test(id)) throw new Error("Flight ID must be 2–8 letters or digits.");
    if (this.flights.has(id)) throw new Error(`Flight ${id} already exists.`);
    if (this.flights.size >= LIMITS.maxFlights) throw new Error(`Limit reached: max ${LIMITS.maxFlights} flights.`);
    if (type !== "arrival" && type !== "departure") throw new Error("Type must be arrival or departure.");
    if (!Number.isInteger(requestedTime) || requestedTime < 0 || requestedTime >= MINUTES_IN_DAY) {
      throw new Error("Requested time must be between 00:00 and 23:59.");
    }
    this.checkPriority(priority);

    const flight = {
      id,
      type,
      requestedTime,
      priority,
      emergency: Boolean(emergency),
      status: "pending", // pending -> scheduled | unscheduled
      slot: null,
    };

    this.flights.set(id, flight);
    this.queue.insert(flight);
    return flight;
  }

  /** Change priority / emergency flag of a waiting flight (heap update). */
  updateFlight(id, { priority, emergency }) {
    const flight = this.getPendingFlight(id);
    if (priority !== undefined) {
      this.checkPriority(priority);
      flight.priority = priority;
    }
    if (emergency !== undefined) flight.emergency = Boolean(emergency);

    this.queue.update(id);
  }

  removeFlight(id) {
    this.getPendingFlight(id);
    this.queue.remove(id);
    this.flights.delete(id);
  }

  clearFlights() {
    this.flights.clear();
    this.queue.clear();
    this.runways.forEach((runway) => runway.clearBookings());
  }

  // =============== Runways ===============

  /**
   * Replace runway configuration. Every flight goes back into the queue,
   * because old slots may not be valid any more.
   * @param {Array<{name:string, mode:string, windows:Array<{start,end}>}>} configs
   */
  setRunways(configs) {
    if (configs.length < 1) throw new Error("At least one runway is required.");
    if (configs.length > LIMITS.maxRunways) throw new Error(`Max ${LIMITS.maxRunways} runways.`);

    const names = new Set();
    for (const config of configs) {
      if (!config.name) throw new Error("Every runway needs a name.");
      if (names.has(config.name)) throw new Error(`Duplicate runway name ${config.name}.`);
      names.add(config.name);
      validateWindows(config.name, config.windows);
    }

    this.runways = configs.map((c) => new RunwayTimeline(c.name, c.windows, c.mode));
    this.requeueAll();
  }

  setDurations(arrival, departure) {
    for (const value of [arrival, departure]) {
      if (!Number.isInteger(value) || value < 1 || value > 60) {
        throw new Error("Runway occupancy must be 1–60 minutes.");
      }
    }
    this.durations = { arrival, departure };
    this.requeueAll();
  }

  // =============== Scheduling ===============

  /** Pop the top flight from the heap and give it a runway slot. */
  scheduleNext() {
    const flight = this.queue.extractMin();
    if (!flight) return null;

    const duration = this.durations[flight.type];
    let best = null; // { runway, start, blockedBy }

    for (const runway of this.runways) {
      if (!runway.accepts(flight.type)) continue;

      const slot = runway.findEarliestSlot(flight.requestedTime, duration);
      if (slot && (!best || slot.start < best.start)) {
        best = { runway, ...slot };
      }
    }

    if (!best) {
      flight.status = "unscheduled";
      flight.slot = null;
      return flight;
    }

    const end = best.start + duration;
    best.runway.book(flight.id, best.start, end);

    flight.status = "scheduled";
    flight.slot = {
      runway: best.runway.name,
      start: best.start,
      end,
      delay: best.start - flight.requestedTime,
      blockedBy: best.blockedBy,
    };
    return flight;
  }

  scheduleAll() {
    const done = [];
    while (!this.queue.isEmpty()) done.push(this.scheduleNext());
    return done;
  }

  /** Cancel all slots and put every flight back in the queue (O(n) heapify). */
  requeueAll() {
    this.runways.forEach((runway) => runway.clearBookings());
    for (const flight of this.flights.values()) {
      flight.status = "pending";
      flight.slot = null;
    }
    this.queue.buildFrom([...this.flights.values()]);
  }

  // =============== Read-only views ===============

  /** Waiting flights in the exact order they will be served. */
  pendingInOrder() {
    return this.queue.toArray().sort(compareFlights);
  }

  /** Finished flights sorted by slot time (unscheduled ones last). */
  scheduledByTime() {
    return [...this.flights.values()]
      .filter((f) => f.status !== "pending")
      .sort((a, b) => {
        if (a.slot && b.slot) return a.slot.start - b.slot.start || a.slot.runway.localeCompare(b.slot.runway);
        if (a.slot) return -1; // scheduled before unscheduled
        if (b.slot) return 1;
        return compareFlights(a, b);
      });
  }

  stats() {
    const all = [...this.flights.values()];
    const scheduled = all.filter((f) => f.status === "scheduled");
    const delays = scheduled.map((f) => f.slot.delay);
    const totalDelay = delays.reduce((sum, d) => sum + d, 0);

    return {
      total: all.length,
      pending: this.queue.size,
      scheduled: scheduled.length,
      unscheduled: all.filter((f) => f.status === "unscheduled").length,
      delayed: delays.filter((d) => d > 0).length,
      totalDelay,
      averageDelay: scheduled.length ? totalDelay / scheduled.length : 0,
      maxDelay: delays.length ? Math.max(...delays) : 0,
    };
  }

  // =============== Helpers ===============

  getPendingFlight(id) {
    const flight = this.flights.get(id);
    if (!flight) throw new Error(`Flight ${id} not found.`);
    if (flight.status !== "pending") throw new Error(`Flight ${id} is already scheduled. Re-plan first.`);
    return flight;
  }

  checkPriority(priority) {
    if (!Number.isInteger(priority) || priority < LIMITS.minPriority || priority > LIMITS.maxPriority) {
      throw new Error(`Priority must be ${LIMITS.minPriority}–${LIMITS.maxPriority}.`);
    }
  }
}

/** Windows must be inside the day, start < end, and must not overlap. */
function validateWindows(runwayName, windows) {
  if (windows.length === 0) throw new Error(`Runway ${runwayName} has no open time.`);

  const sorted = [...windows].sort((a, b) => a.start - b.start);
  sorted.forEach((w, i) => {
    if (!(w.start >= 0 && w.end <= MINUTES_IN_DAY && w.start < w.end)) {
      throw new Error(`Runway ${runwayName}: invalid interval ${formatTime(w.start)}–${formatTime(w.end)}.`);
    }
    if (i > 0 && w.start < sorted[i - 1].end) {
      throw new Error(`Runway ${runwayName}: intervals overlap.`);
    }
  });
}
