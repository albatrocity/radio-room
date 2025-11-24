import { parse, format } from "date-fns"

function safeDate(date: string) {
  let dateString
  try {
    dateString = date
      ? format(parse(date, "yyyy-MM-dd", new Date()), "M/d/yyyy")
      : ""
  } catch (e) {
    dateString = date
  }
  return dateString
}

export default safeDate
