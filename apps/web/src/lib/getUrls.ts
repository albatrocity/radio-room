function getUrlsFromQueryParameters(url: string) {
  const returnValue: Set<string> = new Set()
  const { searchParams } = new URL(
    url.replace(/^(?:\/\/|(?:www\.))/i, "http://$2"),
  )

  searchParams.forEach(function (_i, value: string) {
    if (/\bhttps?::\/\/\S+/gi.test(value)) {
      returnValue.add(value)
    }
  })

  return returnValue
}

function getUrls(
  text: string,
  options: { exclude: []; extractFromQueryString: boolean } = {
    exclude: [],
    extractFromQueryString: false,
  },
) {
  if (typeof text !== "string") {
    throw new TypeError(
      `The \`text\` argument should be a string, got ${typeof text}`,
    )
  }

  if (
    typeof options.exclude !== "undefined" &&
    !Array.isArray(options.exclude)
  ) {
    throw new TypeError("The `exclude` option must be an array")
  }

  const returnValue: Set<string> = new Set()

  const add = (url: string) => {
    try {
      returnValue.add(url.trim().replace(/\.+$/, ""))
    } catch {}
  }

  const urls = text.match(/\bhttps?:\/\/\S+/gi) || []

  for (const url of urls) {
    add(url)

    if (options.extractFromQueryString) {
      const qsUrls = getUrlsFromQueryParameters(url)
      qsUrls.forEach(function (qsUrl) {
        add(qsUrl)
      })
    }
  }

  options.exclude.forEach(function (excludedItem) {
    returnValue.forEach(function (item) {
      const regex = new RegExp(excludedItem)
      if (regex.test(item)) {
        returnValue.delete(item)
      }
    })
  })

  return Array.from(returnValue)
}

export default getUrls
