import { useCallback } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { HTTPError } from "ky"
import {
  cancelNewsletterIssue,
  createNewsletterIssue,
  deleteNewsletterIssue,
  fetchNewsletterIssue,
  fetchNewsletterIssues,
  fetchNewsletterSubscribers,
  presignNewsletterUpload,
  scheduleNewsletterIssue,
  sendNewsletterIssue,
  updateNewsletterIssue,
} from "../lib/api"
import { queryKeys } from "../lib/queryClient"
import { toaster } from "../components/ui/toaster"
import type {
  CreateNewsletterIssueRequest,
  ScheduleNewsletterIssueRequest,
  UpdateNewsletterIssueRequest,
} from "@repo/types"

async function errorBodyMessage(e: unknown): Promise<string> {
  if (e instanceof HTTPError) {
    try {
      const body = (await e.response.json()) as { error?: string }
      if (body.error) return body.error
    } catch {
      /* ignore */
    }
    return e.message
  }
  if (e instanceof Error) return e.message
  return "Request failed"
}

export function useNewsletterIssues() {
  return useQuery({
    queryKey: queryKeys.newsletter.issues(),
    queryFn: fetchNewsletterIssues,
  })
}

export function useNewsletterIssue(id: string) {
  return useQuery({
    queryKey: queryKeys.newsletter.issue(id),
    queryFn: () => fetchNewsletterIssue(id),
    enabled: !!id,
  })
}

export function useNewsletterSubscribers() {
  return useQuery({
    queryKey: queryKeys.newsletter.subscribers(),
    queryFn: fetchNewsletterSubscribers,
  })
}

export function useCreateNewsletterIssue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateNewsletterIssueRequest) => createNewsletterIssue(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.newsletter.issues() })
      toaster.create({ title: "Draft created", type: "success" })
    },
    onError: async (e) => {
      toaster.create({
        title: "Create failed",
        description: await errorBodyMessage(e),
        type: "error",
      })
    },
  })
}

export function useUpdateNewsletterIssue(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateNewsletterIssueRequest) => updateNewsletterIssue(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.newsletter.issues() })
      queryClient.invalidateQueries({ queryKey: queryKeys.newsletter.issue(id) })
      toaster.create({ title: "Draft saved", type: "success" })
    },
    onError: async (e) => {
      toaster.create({
        title: "Save failed",
        description: await errorBodyMessage(e),
        type: "error",
      })
    },
  })
}

export function useDeleteNewsletterIssue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteNewsletterIssue(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.newsletter.issues() })
      toaster.create({ title: "Issue deleted", type: "success" })
    },
    onError: async (e) => {
      toaster.create({
        title: "Delete failed",
        description: await errorBodyMessage(e),
        type: "error",
      })
    },
  })
}

export function useSendNewsletterIssue(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => sendNewsletterIssue(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.newsletter.issues() })
      queryClient.invalidateQueries({ queryKey: queryKeys.newsletter.issue(id) })
      toaster.create({ title: "Newsletter sent", type: "success" })
    },
    onError: async (e) => {
      toaster.create({
        title: "Send failed",
        description: await errorBodyMessage(e),
        type: "error",
      })
    },
  })
}

export function useScheduleNewsletterIssue(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ScheduleNewsletterIssueRequest) => scheduleNewsletterIssue(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.newsletter.issues() })
      queryClient.invalidateQueries({ queryKey: queryKeys.newsletter.issue(id) })
      toaster.create({ title: "Newsletter scheduled", type: "success" })
    },
    onError: async (e) => {
      toaster.create({
        title: "Schedule failed",
        description: await errorBodyMessage(e),
        type: "error",
      })
    },
  })
}

export function useCancelNewsletterIssue(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => cancelNewsletterIssue(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.newsletter.issues() })
      queryClient.invalidateQueries({ queryKey: queryKeys.newsletter.issue(id) })
      toaster.create({ title: "Schedule canceled", type: "success" })
    },
    onError: async (e) => {
      toaster.create({
        title: "Cancel failed",
        description: await errorBodyMessage(e),
        type: "error",
      })
    },
  })
}

/**
 * ByteMD `uploadImages` handler: presign via API, then PUT the file directly to S3
 * (no credentials — CORS + signature handle auth).
 */
export function useUploadNewsletterImage() {
  return useCallback(async (files: File[]) => {
    const uploaded: { url: string; alt?: string }[] = []

    for (const file of files) {
      const contentType = file.type || "image/png"
      try {
        const { uploadUrl, publicUrl } = await presignNewsletterUpload({
          filename: file.name || "image.png",
          contentType,
        })

        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: file,
        })
        if (!putRes.ok) {
          throw new Error(`S3 upload failed (${putRes.status})`)
        }

        const alt = file.name.replace(/\.[^.]+$/, "") || file.name
        uploaded.push({ url: publicUrl, alt })
      } catch (e) {
        toaster.create({
          title: "Image upload failed",
          description: await errorBodyMessage(e),
          type: "error",
        })
        throw e
      }
    }

    return uploaded
  }, [])
}
