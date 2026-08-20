const SHOW_TIME_ZONE = "America/Chicago"
const SHOW_WEEKDAY = 4 // Thursday
const SHOW_WEEK_OF_MONTH = 3

function zonedYmd(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date)
  const num = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value)
  return { year: num("year"), month: num("month") - 1, day: num("day") }
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number) {
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay()
  const daysUntilWeekday = (weekday - firstWeekday + 7) % 7
  return 1 + daysUntilWeekday + (n - 1) * 7
}

function ymdKey(year: number, month: number, day: number) {
  return year * 10000 + (month + 1) * 100 + day
}

function formatShowTime(year: number, month: number, day: number) {
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    dateStyle: "long",
  }).format(new Date(Date.UTC(year, month, day)))
  return `${dateLabel} at 8:00 PM`
}

// Third Thursday of the current month in America/Chicago, or next month if
// that calendar day has already passed there. Show night itself is included.
export function getNextShowTime(date: Date) {
  const today = zonedYmd(date, SHOW_TIME_ZONE)
  let year = today.year
  let month = today.month
  let day = nthWeekdayOfMonth(year, month, SHOW_WEEKDAY, SHOW_WEEK_OF_MONTH)

  if (ymdKey(today.year, today.month, today.day) > ymdKey(year, month, day)) {
    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
    day = nthWeekdayOfMonth(year, month, SHOW_WEEKDAY, SHOW_WEEK_OF_MONTH)
  }

  return formatShowTime(year, month, day)
}
