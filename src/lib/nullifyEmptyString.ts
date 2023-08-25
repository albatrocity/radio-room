export default function nullifyEmptyString(value?: string) {
  if (!value) {
    return null
  }
  return value === "" ? null : value
}
