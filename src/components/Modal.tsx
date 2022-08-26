import React from "react"
import { Box, Heading, Button, Layer } from "grommet"
import { Close } from "grommet-icons"

interface Props {
  children: JSX.Element
  responsive: boolean
  onClose: () => void
  heading: string
  canClose: boolean
  width: string
  contentPad: {} | string
}

const Modal = ({
  children,
  onClose,
  heading,
  canClose = true,
  width = "medium",
  contentPad,
  responsive = false,
}: Props) => {
  return (
    <Layer>
      <Box
        fill="horizontal"
        direction="row"
        justify="end"
        align="center"
        pad={{ horizontal: "medium", vertical: "small" }}
        border={{ side: "bottom" }}
        flex={{ shrink: 0 }}
      >
        {heading && (
          <Box flex={{ grow: 1, shrink: 1 }} pad="small">
            <Heading margin="none" level={3}>
              {heading}
            </Heading>
          </Box>
        )}
        {onClose && canClose && (
          <Box>
            <Button onClick={() => onClose()} plain icon={<Close />} />
          </Box>
        )}
      </Box>
      <Box width={width} pad={contentPad || "medium"} overflow="auto">
        {children}
      </Box>
    </Layer>
  )
}

export default Modal
