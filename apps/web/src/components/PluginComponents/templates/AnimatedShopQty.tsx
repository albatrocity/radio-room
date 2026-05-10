import { Box, Text } from "@chakra-ui/react"
import { ClassNames, css, keyframes } from "@emotion/react"
import { useMachine } from "@xstate/react"
import { useEffect } from "react"
import { useAnimationsEnabled } from "../../../hooks/useReducedMotion"
import { QTY_ANIM_MS, shopQtyAnimationMachine } from "../../../machines/shopQtyAnimationMachine"

/**
 * Emotion `keyframes` so injected `@keyframes` names match `animation:` references.
 * Chakra’s plain-object `@keyframes` + string animation name often produces broken refs under v3.
 */

/** Decrease: old falls + CW + out; new from above + CCW + in */
const kfExitDecrease = keyframes`
  from {
    opacity: 1;
    transform: translateY(0) rotate(0deg);
  }
  to {
    opacity: 0;
    transform: translateY(0.7em) rotate(14deg);
  }
`

const kfEnterDecrease = keyframes`
  from {
    opacity: 0;
    transform: translateY(-0.75em) rotate(-14deg);
  }
  to {
    opacity: 1;
    transform: translateY(0) rotate(0deg);
  }
`

/** Increase: reverse — old rises + CCW + out; new from below + CW + in */
const kfExitIncrease = keyframes`
  from {
    opacity: 1;
    transform: translateY(0) rotate(0deg);
  }
  to {
    opacity: 0;
    transform: translateY(-0.7em) rotate(-14deg);
  }
`

const kfEnterIncrease = keyframes`
  from {
    opacity: 0;
    transform: translateY(0.75em) rotate(14deg);
  }
  to {
    opacity: 1;
    transform: translateY(0) rotate(0deg);
  }
`

const qtyExitDecreaseAnim = css`
  animation: ${kfExitDecrease} ${QTY_ANIM_MS}ms cubic-bezier(0.4, 0, 1, 1) forwards;
  display: inline-block;
  will-change: transform, opacity;
`

const qtyEnterDecreaseAnim = css`
  animation: ${kfEnterDecrease} ${QTY_ANIM_MS}ms cubic-bezier(0, 0, 0.2, 1) forwards;
  display: inline-block;
  will-change: transform, opacity;
`

const qtyExitIncreaseAnim = css`
  animation: ${kfExitIncrease} ${QTY_ANIM_MS}ms cubic-bezier(0.4, 0, 1, 1) forwards;
  display: inline-block;
  will-change: transform, opacity;
`

const qtyEnterIncreaseAnim = css`
  animation: ${kfEnterIncrease} ${QTY_ANIM_MS}ms cubic-bezier(0, 0, 0.2, 1) forwards;
  display: inline-block;
  will-change: transform, opacity;
`

export function AnimatedShopQty({ qty }: { qty: number }) {
  const animationsEnabled = useAnimationsEnabled()
  const [state, send] = useMachine(shopQtyAnimationMachine, {
    input: { initialQty: qty, animationsEnabled },
  })

  useEffect(() => {
    send({ type: "SET_ANIMATIONS_ENABLED", enabled: animationsEnabled })
    send({ type: "SYNC_QTY", qty })
  }, [qty, animationsEnabled, send])

  if (state.matches("animating")) {
    const { out, incoming, dir } = state.context
    const isDecrease = dir === "down"
    return (
      <Box display="grid" placeItems="center" minW="2.25ch" minH="1.35em">
        <ClassNames>
          {({ css: emotionCss }) => (
            <>
              <span
                className={emotionCss`
                  ${isDecrease ? qtyExitDecreaseAnim : qtyExitIncreaseAnim}
                  grid-row: 1;
                  grid-column: 1;
                `}
                aria-hidden
              >
                {out}
              </span>
              <span
                className={emotionCss`
                  ${isDecrease ? qtyEnterDecreaseAnim : qtyEnterIncreaseAnim}
                  grid-row: 1;
                  grid-column: 1;
                `}
              >
                {incoming}
              </span>
            </>
          )}
        </ClassNames>
      </Box>
    )
  }

  return <Text as="span">{state.context.displayedQty}</Text>
}
