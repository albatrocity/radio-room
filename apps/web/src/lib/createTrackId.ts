export default function createTrackId({
  track,
  artist,
  album,
}: {
  track?: string
  artist?: string
  album?: string
}) {
  return `${track}-${artist}-${album}`
}
