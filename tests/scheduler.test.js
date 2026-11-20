/**
 * Tests for the core logic. Run with:   node tests/scheduler.test.js
 * (The JS files are written for the browser, so we load them into one
 *  shared context here instead of using require.)
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const files = ["time.js", "minHeap.js", "runwayTimeline.js", "scheduler.js", "sampleData.js"];
const context = vm.createContext({});
for (const file of files) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"), context);
}
const run = (code) => vm.runInContext(code, context);

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("  ✓ " + name);
}

function makeScheduler() {
  return run(`(() => {
    const s = new RunwayScheduler();
    s.setRunways(DEFAULT_RUNWAYS.map(r => ({
      name: r.name, mode: r.mode,
      windows: r.windows.split(",").map(w => {
        const [a, b] = w.trim().split("-");
        return { start: toMinutes(a), end: toMinutes(b) };
      }),
    })));
    return s;
  })()`);
}

console.log("Runway Scheduler tests");

test("heap always returns items in sorted order", () => {
  const heap = run("new MinHeap((a, b) => a - b, (x) => String(x))");
  const values = Array.from({ length: 200 }, (_, i) => (i * 7919) % 1000);
  values.forEach((v, i) => heap.insert(v + i / 1000));
  const out = [];
  while (!heap.isEmpty()) out.push(heap.extractMin());
  assert.deepStrictEqual(out, [...out].sort((a, b) => a - b));
});

test("emergency flights are always served first", () => {
  const s = makeScheduler();
  s.addFlight({ id: "LOW1", type: "arrival", requestedTime: 400, priority: 1, emergency: false });
  s.addFlight({ id: "EMG1", type: "arrival", requestedTime: 500, priority: 5, emergency: true });
  assert.strictEqual(s.scheduleNext().id, "EMG1");
});

test("dynamic priority update re-orders the heap", () => {
  const s = makeScheduler();
  s.addFlight({ id: "A1", type: "arrival", requestedTime: 400, priority: 2, emergency: false });
  s.addFlight({ id: "B1", type: "arrival", requestedTime: 400, priority: 3, emergency: false });
  s.updateFlight("B1", { priority: 1 });
  assert.strictEqual(s.queue.peek().id, "B1");
});

test("no two slots overlap on any runway (sample + 400 random)", () => {
  const s = makeScheduler();
  run("SAMPLE_FLIGHTS").forEach(([id, type, time, priority, emergency]) =>
    s.addFlight({ id, type, requestedTime: run(`toMinutes("${time}")`), priority, emergency }));
  const taken = new Set(s.flights.keys());
  run("randomFlights").call(null, 400, taken).forEach((f) => s.addFlight(f));
  s.scheduleAll();

  for (const runway of s.runways) {
    for (let i = 1; i < runway.bookings.length; i++) {
      assert.ok(runway.bookings[i - 1].end <= runway.bookings[i].start, "overlap on " + runway.name);
    }
    for (const b of runway.bookings) {
      assert.ok(runway.windows.some((w) => b.start >= w.start && b.end <= w.end), "outside window");
    }
  }
  for (const f of s.flights.values()) {
    if (f.slot) assert.ok(f.slot.start >= f.requestedTime, "scheduled before request");
  }
});

test("departure-only runway never gets an arrival", () => {
  const s = makeScheduler();
  for (let i = 0; i < 50; i++) {
    s.addFlight({ id: "AR" + i, type: "arrival", requestedTime: 400, priority: 3, emergency: false });
  }
  s.scheduleAll();
  const rw27 = s.runways.find((r) => r.name === "27");
  assert.strictEqual(rw27.bookings.length, 0);
});

test("same input gives the same schedule (deterministic)", () => {
  const build = () => {
    const s = makeScheduler();
    run("SAMPLE_FLIGHTS").forEach(([id, type, time, priority, emergency]) =>
      s.addFlight({ id, type, requestedTime: run(`toMinutes("${time}")`), priority, emergency }));
    s.scheduleAll();
    return JSON.stringify([...s.flights.values()].map((f) => [f.id, f.slot]));
  };
  assert.strictEqual(build(), build());
});

test("invalid input is rejected", () => {
  const s = makeScheduler();
  assert.throws(() => s.addFlight({ id: "!!", type: "arrival", requestedTime: 400, priority: 3 }));
  assert.throws(() => s.addFlight({ id: "OK1", type: "arrival", requestedTime: 400, priority: 9 }));
  assert.throws(() => s.setRunways([{ name: "X", mode: "mixed", windows: [{ start: 600, end: 500 }] }]));
  assert.throws(() => s.setRunways([{ name: "X", mode: "mixed",
    windows: [{ start: 100, end: 300 }, { start: 200, end: 400 }] }]));
});

console.log(`\n${passed} tests passed`);
