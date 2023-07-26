export type SocketCallback = ({
  type,
  data,
}: {
  type: string
  data: any
}) => void
