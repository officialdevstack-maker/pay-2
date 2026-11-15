const TZ = 'Africa/Lagos';
const day = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
const year = new Intl.DateTimeFormat('en-NG', { timeZone: TZ, year: 'numeric' });
const time = new Intl.DateTimeFormat('en-NG', {
  timeZone: TZ,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});
const short = new Intl.DateTimeFormat('en-NG', { timeZone: TZ, day: 'numeric', month: 'short' });
const long = new Intl.DateTimeFormat('en-NG', {
  timeZone: TZ,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const weekday = new Intl.DateTimeFormat('en-NG', {
  timeZone: TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

const DAY_MS = 86_400_000;

export const lagosDayKey = (date: Date) => day.format(date);

export function formatTime(date: Date): string {
  return time.format(date).replace(/\s+/g, ' ').replace(/am|pm/i, (m) => m.toUpperCase());
}

/** "2:14 PM" today, "Yesterday", "10 Nov", or "10 Nov 2025". */
export function formatActivityTime(date: Date, now = new Date()): string {
  const d = day.format(date);
  if (d === day.format(now)) return formatTime(date);
  if (d === day.format(new Date(now.getTime() - DAY_MS))) return 'Yesterday';
  return year.format(date) === year.format(now) ? short.format(date) : long.format(date);
}

/** Day group heading: "Today", "Yesterday", "Mon 10 Nov", "10 Nov 2025". */
export function formatDayHeading(date: Date, now = new Date()): string {
  const d = day.format(date);
  if (d === day.format(now)) return 'Today';
  if (d === day.format(new Date(now.getTime() - DAY_MS))) return 'Yesterday';
  return year.format(date) === year.format(now) ? weekday.format(date).replace(',', '') : long.format(date);
}

/** "14 Nov 2026, 2:14 PM" */
export const formatReceiptDate = (date: Date) => `${long.format(date)}, ${formatTime(date)}`;
