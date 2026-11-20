/**
 * Demo data: three runways and a busy morning rush, so conflicts and
 * delays actually happen.
 */

const DEFAULT_RUNWAYS = [
  { name: "09L", mode: "mixed", windows: "06:00-22:00" },
  { name: "09R", mode: "mixed", windows: "06:00-06:20, 06:40-22:00" }, // closed for inspection
  { name: "27", mode: "departure", windows: "06:15-21:00" },
];

// [id, type, requested time, priority (1 = highest), emergency]
const SAMPLE_FLIGHTS = [
  ["AI101", "arrival", "06:10", 3, false],
  ["6E204", "departure", "06:10", 3, false],
  ["EK500", "arrival", "06:10", 1, false],
  ["UK811", "arrival", "06:12", 2, false],
  ["SG330", "departure", "06:12", 4, false],
  ["QR570", "arrival", "06:14", 2, false],
  ["BA138", "arrival", "06:15", 3, false],
  ["LH760", "departure", "06:15", 2, false],
  ["6E512", "arrival", "06:16", 5, false],
  ["AI865", "departure", "06:18", 3, false],
  ["UK945", "departure", "06:18", 4, false],
  ["AI2020", "arrival", "06:20", 3, true],
  ["SQ423", "arrival", "06:20", 2, false],
  ["6E677", "departure", "06:22", 4, false],
  ["AI439", "arrival", "06:22", 3, false],
  ["EY217", "departure", "06:25", 3, false],
  ["SG160", "arrival", "06:25", 5, false],
  ["TK716", "arrival", "06:28", 2, false],
  ["6E911", "arrival", "06:30", 4, true],
  ["UK707", "departure", "06:30", 5, false],
];

const AIRLINE_CODES = ["AI", "6E", "UK", "SG", "QP", "EK", "QR", "BA", "LH", "SQ", "EY", "TK"];

/**
 * Make `count` random flight requests between `fromMinute` and `toMinute`.
 * `takenIds` is a Set of IDs already in use, so we never create duplicates.
 */
function randomFlights(count, takenIds, fromMinute = 6 * 60, toMinute = 9 * 60) {
  const flights = [];
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  while (flights.length < count) {
    const id = pick(AIRLINE_CODES) + (100 + Math.floor(Math.random() * 900));
    if (takenIds.has(id)) continue;
    takenIds.add(id);

    flights.push({
      id,
      type: Math.random() < 0.5 ? "arrival" : "departure",
      requestedTime: fromMinute + Math.floor(Math.random() * (toMinute - fromMinute)),
      priority: 1 + Math.floor(Math.random() * 5),
      emergency: Math.random() < 0.05,
    });
  }
  return flights;
}
