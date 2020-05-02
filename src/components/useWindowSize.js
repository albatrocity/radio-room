import { useLayoutEffect, useState } from "react"
import { throttle } from "lodash"
const useWindowSize = () => {
  let [size, setSize] = useState([0, 0])
  useLayoutEffect(() => {
    function updateSize() {
      setSize([window.innerWidth, window.innerHeight])
    }
    const throttled = throttle(updateSize, 800)
    window.addEventListener("resize", throttled)
    updateSize()
    return () => window.removeEventListener("resize", throttled)
  }, [])
  return size
}

export default useWindowSize
