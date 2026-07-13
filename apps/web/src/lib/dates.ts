// Compute the date for the third Thursday of the current month,
// or next month if today is after that date.
export function getNextShowTime(date: Date) {
  const year = date.getFullYear()
  let month = date.getMonth()
  // Find the first day of the current month
  let firstOfMonth = new Date(year, month, 1)

  // Day of the week for the 1st: 0 = Sunday, ... 4 = Thursday
  const firstDayOfWeek = firstOfMonth.getDay()

  // 4 is Thursday
  const daysUntilThursday = (4 - firstDayOfWeek + 7) % 7
  // 3rd Thursday is the first Thursday + 14 days
  const thirdThursdayDate = 1 + daysUntilThursday + 14
  let thirdThursday = new Date(year, month, thirdThursdayDate)

  // If today is after the third Thursday, get next month's third Thursday
  if (date > thirdThursday) {
    // Go to next month
    month += 1
    if (month > 11) {
      month = 0
      firstOfMonth = new Date(year + 1, 0, 1)
    } else {
      firstOfMonth = new Date(year, month, 1)
    }
    // Recalculate
    const firstDayOfWeekNext = firstOfMonth.getDay()
    const daysUntilThursdayNext = (4 - firstDayOfWeekNext + 7) % 7
    const thirdThursdayDateNext = 1 + daysUntilThursdayNext + 14
    thirdThursday = new Date(firstOfMonth.getFullYear(), month, thirdThursdayDateNext)
  }
  // Set time to 8:00pm Central Time (America/Chicago)
  // First, create an ISO date string for the date at 20:00:00 in America/Chicago
  const centralDateLocal = new Date(
    // Get yyyy-mm-dd part for central time
    thirdThursday.toLocaleDateString("en-CA", { timeZone: "America/Chicago" }) + "T20:00:00",
  )
  // Now, treat that local time as America/Chicago and output localized string
  return centralDateLocal.toLocaleString("en-US", {
    timeZone: "America/Chicago",
    dateStyle: "long",
    timeStyle: "short",
  })
}
