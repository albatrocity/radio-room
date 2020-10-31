import React from "react"
import { Layer, Box, Heading, Button } from "grommet"
import { Close } from "grommet-icons"

const Modal = ({
  children,
  responsive = false,
  onClose,
  heading,
  width = "300px",
  contentPad,
  ...rest
}) => (
  <Layer
    responsive={responsive}
    onClickOutside={() => (onClose ? onClose() : null)}
    onEsc={() => (onClose ? onClose() : null)}
    {...rest}
  >
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
      {onClose && (
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

export default Modal
