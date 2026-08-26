import { z } from "zod"
import type { PluginComponentSchema, PluginConfigSchema } from "@repo/types"
import { musicUploadConfigSchema } from "./types"

export function getConfigSchema(): PluginConfigSchema {
  return {
    jsonSchema: z.toJSONSchema(musicUploadConfigSchema),
    layout: [
      { type: "heading", content: "Music Upload" },
      "enabled",
      "uploadButtonLabel",
    ],
    fieldMeta: {
      enabled: { type: "boolean", label: "Enable music uploads" },
      uploadButtonLabel: {
        type: "string",
        label: "Upload button label",
        showWhen: { field: "enabled", value: true },
      },
    },
  }
}

export function getComponentSchema(): PluginComponentSchema {
  return {
    storeKeys: ["uploaderUserIds", "uploadingUserIds"],
    components: [
      {
        id: "upload-button",
        type: "button",
        area: "aboveChat",
        label: "{{config.uploadButtonLabel}}",
        icon: "Upload",
        variant: "outline",
        size: "sm",
        opensModal: "upload-modal",
        showWhen: [
          { field: "enabled", value: true },
          { field: "uploaderUserIds", includes: "viewer.userId" },
        ],
      },
      {
        id: "upload-modal",
        type: "modal",
        area: "aboveChat",
        title: "Upload music",
        size: "md",
        children: [
          {
            id: "upload-modal-hint",
            type: "text-block",
            area: "aboveChat",
            content:
              "Select an audio file or archive (zip, rar, 7z). Maximum size 800 MB. Files are private and expire after 30 days.",
            variant: "info",
          },
        ],
      },
      {
        id: "uploading-badge",
        type: "badge",
        area: "userListItem",
        label: "Uploading",
        variant: "info",
        showWhen: [
          { field: "enabled", value: true },
          { field: "uploadingUserIds", includes: "item.userId" },
        ],
      },
    ],
  }
}
