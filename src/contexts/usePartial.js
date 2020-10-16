import { useState, useEffect } from "react"

export const usePartial = (service, selector) => {
  const [partialContext, setPartialContext] = useState(
    service.state ? selector(service.state.context) : {}
  )

  useEffect(() => {
    const { unsubscribe } = service.subscribe(state => {
      if (!state.changed) return

      setPartialContext(selector(state.context))
    })

    return () => unsubscribe()
  }, [])

  return partialContext
}
