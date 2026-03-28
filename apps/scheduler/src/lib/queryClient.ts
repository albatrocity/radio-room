import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

export const queryKeys = {
  shows: {
    all: ["shows"] as const,
    list: (filters?: Record<string, unknown>) => ["shows", "list", filters] as const,
    detail: (id: string) => ["shows", "detail", id] as const,
  },
  segments: {
    all: ["segments"] as const,
    list: (filters?: Record<string, unknown>) => ["segments", "list", filters] as const,
    detail: (id: string) => ["segments", "detail", id] as const,
  },
  tags: {
    all: ["tags"] as const,
    list: (type?: string) => ["tags", "list", type] as const,
  },
} as const
