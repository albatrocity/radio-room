import { useEffect, useRef } from "react"
import { Button, HStack, Text } from "@chakra-ui/react"
import { useAnimationsEnabled } from "../../hooks/useReducedMotion"
import { runVoteConfirmAnimation } from "../../animations/voteConfirmAnimation"

type Props = {
  label: string
  selected: boolean
  disabled: boolean
  onClick: () => void
  showConfirmAnimation?: boolean
}

export function PollOptionButton({
  label,
  selected,
  disabled,
  onClick,
  showConfirmAnimation = false,
}: Props) {
  const animationsEnabled = useAnimationsEnabled()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const checkRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!showConfirmAnimation || !animationsEnabled || !buttonRef.current) return
    return runVoteConfirmAnimation(buttonRef.current, checkRef.current, () => {})
  }, [showConfirmAnimation, animationsEnabled])

  return (
    <Button
      ref={buttonRef}
      variant="outline"
      justifyContent="flex-start"
      w="100%"
      h="auto"
      py={3}
      px={4}
      disabled={disabled}
      onClick={onClick}
      borderColor={selected ? "colorPalette.emphasized" : "border"}
      colorPalette={selected ? "blue" : "gray"}
      bg={selected ? "colorPalette.subtle" : "bg"}
      backgroundImage={
        selected
          ? "linear-gradient(90deg, var(--chakra-colors-colorPalette-subtle) 0%, var(--chakra-colors-colorPalette-subtle) 100%)"
          : undefined
      }
      backgroundSize="0% 100%"
      backgroundRepeat="no-repeat"
      _hover={disabled ? undefined : { transform: "translateY(-1px)", borderColor: "colorPalette.emphasized" }}
      _active={disabled ? undefined : { transform: "scale(0.97)" }}
      transition="transform 120ms ease, border-color 120ms ease"
    >
      <HStack w="100%" justify="space-between">
        <Text textAlign="left">{label}</Text>
        {selected && (
          <Text as="span" ref={checkRef} aria-hidden fontSize="sm" opacity={showConfirmAnimation ? 0 : 1}>
            ✓
          </Text>
        )}
      </HStack>
    </Button>
  )
}
