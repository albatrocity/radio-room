const getUrlsFromQueryParameters = url => {
  const returnValue = new Set()
  const { searchParams } = new URL(
    url.replace(/^(?:\/\/|(?:www\.))/i, "http://$2")
  )

  for (const [, value] of searchParams) {
    if (/\bhttps?::\/\/\S+/gi.test(value)) {
      returnValue.add(value)
    }
  }

  return returnValue
}

const getUrls = (text, options = {}) => {
  if (typeof text !== "string") {
    throw new TypeError(
      `The \`text\` argument should be a string, got ${typeof text}`
    )
  }

  if (
    typeof options.exclude !== "undefined" &&
    !Array.isArray(options.exclude)
  ) {
    throw new TypeError("The `exclude` option must be an array")
  }

  const returnValue = new Set()

  const add = url => {
    try {
      returnValue.add(url.trim().replace(/\.+$/, ""))
    } catch {}
  }

  const urls = text.match(/\bhttps?:\/\/\S+/gi) || []

  for (const url of urls) {
    add(url)

    if (options.extractFromQueryString) {
      const qsUrls = getUrlsFromQueryParameters(url)
      for (const qsUrl of qsUrls) {
        add(qsUrl)
      }
    }
  }

  for (const excludedItem of options.exclude || []) {
    for (const item of returnValue) {
      const regex = new RegExp(excludedItem)
      if (regex.test(item)) {
        returnValue.delete(item)
      }
    }
  }

  return Array.from(returnValue)
}

export default getUrls
