export const APP_SPLASH_ID = "app-splash"
export const LAUNCH_SPLASH_ATTR = "data-launch-splash"

/** Remove the index.html launch placeholder after React's first commit. */
export function dismissLaunchSplash(root: ParentNode = document): void {
  root.querySelector(`#${APP_SPLASH_ID}`)?.remove()
  const doc = "documentElement" in root ? (root as Document) : undefined
  doc?.documentElement.removeAttribute(LAUNCH_SPLASH_ATTR)
}
