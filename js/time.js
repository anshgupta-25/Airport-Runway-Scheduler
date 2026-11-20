/**
 * Time helpers.
 * All times inside the scheduler are stored as "minutes since midnight"
 * (0 … 1440). Integers are easy to compare, add and sort.
 *   "06:30"  ->  390
 *    390     ->  "06:30"
 */

const MINUTES_IN_DAY = 24 * 60;

/** "HH:MM" -> minutes. Returns NaN when the text is not a valid time. */
function toMinutes(text) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(text).trim());
  if (!match) return NaN;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes > 59) return NaN;
  if (hours > 24 || (hours === 24 && minutes > 0)) return NaN;

  return hours * 60 + minutes;
}

/** minutes -> "HH:MM" */
function formatTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0");
}
