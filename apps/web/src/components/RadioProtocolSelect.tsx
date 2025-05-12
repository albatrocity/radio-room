import React from "react"
import FieldSelect from "./Fields/FieldSelect"

type Props = {
  value: string
}

export default function RadioProtocolSelect({ value, ...rest }: Props) {
  return (
    <FieldSelect name="radioProtocol" value={value} {...rest}>
      <option value="shoutcastv1">Shoutcast v1</option>
      <option value="shoutcastv2">Shoutcast v2</option>
      <option value="icecast">Icecast</option>
      <option value="raw">Raw Stream (icy data)</option>
    </FieldSelect>
  )
}
