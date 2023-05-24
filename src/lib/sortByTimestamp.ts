import { WithTimestamp } from "../types/Utility"

export function sortByTimestamp(a: WithTimestamp<any>, b: WithTimestamp<any>) {
  return b.timestamp - a.timestamp
}
