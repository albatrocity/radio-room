import { isBefore } from "date-fns"
import { WithTimestamp } from "../types/Utility"

export function sortByTimestamp(a: WithTimestamp<any>, b: WithTimestamp<any>) {
  return isBefore(new Date(b.timestamp), new Date(a.timestamp)) ? 1 : -1
}
