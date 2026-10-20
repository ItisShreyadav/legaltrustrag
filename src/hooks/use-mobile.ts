import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * True below the md breakpoint. The first client render returns false so it
 * matches the server HTML (the server has no viewport); the real value is
 * applied after hydration. Reading matchMedia during render, even through
 * useSyncExternalStore, makes the streamed sidebar boundary mismatch on phones.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => setIsMobile(mql.matches)
    mql.addEventListener("change", onChange)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional post-hydration sync with the viewport
    setIsMobile(mql.matches)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
