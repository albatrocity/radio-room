export interface SystemMessage {
  type: "SETTINGS"
  data?: {
    settings?: {
      fetchMeta?: boolean
      password?: string
    }
  }
}
