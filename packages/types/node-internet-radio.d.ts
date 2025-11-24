declare module 'node-internet-radio' {
  export function getStationInfo(url: string, callback: (error: Error | null, station: any) => void): void
  export function getStationInfoAsync(url: string): Promise<any>
}
