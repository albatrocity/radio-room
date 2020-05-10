import React from "react"
import { Layer, Box, Heading, Button } from "grommet"
import { Close } from "grommet-icons"

const Modal = ({
  children,
  responsive = false,
  onClose,
  heading,
  width = "300px",
}) => (
  <Layer
    responsive={responsive}
    onClickOutside={() => onClose()}
    onEsc={() => onClose()}
  >
    <Box
      fill="horizontal"
      direction="row"
      justify="between"
      align="center"
      pad={{ horizontal: "medium", vertical: "small" }}
      border={{ side: "bottom" }}
      flex={{ shrink: 0 }}
    >
      {heading && (
        <Heading margin="none" level={3}>
          {heading}
        </Heading>
      )}
      <Button onClick={() => onClose()} plain icon={<Close />} />
    </Box>
    <Box width={width} pad="medium" overflow="auto">
      {children}
    </Box>
  </Layer>
)

export default Modal
