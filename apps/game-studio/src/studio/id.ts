export function newId(): string {
  return crypto.randomUUID().replace(/-/g, "")
}
