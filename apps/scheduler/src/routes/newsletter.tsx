import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/newsletter")({
  component: () => <Outlet />,
})
