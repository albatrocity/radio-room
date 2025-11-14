import { useEffect } from "react"
import { useLocation } from "@reach/router"
import { useAuthStore } from "../state/authStore"

/**
 * Hook to handle OAuth callback redirects
 * When the API redirects back after OAuth with ?userId=... parameter,
 * this triggers the auth machine to recheck the session
 */
export function useOAuthCallback() {
  const location = useLocation()
  const { send } = useAuthStore()
  
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const userId = params.get("userId")
    const toastMessage = params.get("toast")
    
    if (userId) {
      console.log("OAuth callback detected, rechecking session for user:", userId)
      
      // Force auth machine to recheck session by calling /me endpoint
      send("GET_SESSION_USER")
      
      // Clean up URL parameters after a short delay
      setTimeout(() => {
        const cleanUrl = `${location.pathname}${location.hash}`
        window.history.replaceState({}, document.title, cleanUrl)
      }, 1000)
    }
  }, [location.search, send])
}

