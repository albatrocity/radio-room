export interface SystemMessage {
  type: "SETTINGS";
  data?: {
    settings?: JSON
  }
}
