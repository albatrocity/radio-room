import {
  LuAward,
  LuChevronsUp,
  LuFence,
  LuDices,
  LuCoins,
  LuDisc2,
  LuExpand,
  LuHeart,
  LuLaugh,
  LuMedal,
  LuPackage,
  LuShoppingCart,
  LuShrink,
  LuSkipForward,
  LuSquareStack,
  LuStar,
  LuSwords,
  LuTrophy,
  LuWaves,
  LuSalad,
  LuFrown,
  LuShield,
  LuAnchor,
  LuBadgeCheck,
  LuRefrigerator,
  LuChefHat,
} from "react-icons/lu"

// ============================================================================
// Icon Mapping
// ============================================================================

export const ICON_MAP: Record<string, React.ComponentType> = {
  trophy: LuTrophy,
  star: LuStar,
  medal: LuMedal,
  award: LuAward,
  heart: LuHeart,
  "skip-forward": LuSkipForward,
  swords: LuSwords,
  coins: LuCoins,
  "shopping-cart": LuShoppingCart,
  package: LuPackage,
  "disc-2": LuDisc2,
  "square-stack": LuSquareStack,
  waves: LuWaves,
  shrink: LuShrink,
  expand: LuExpand,
  "chevrons-up": LuChevronsUp,
  fence: LuFence,
  dices: LuDices,
  laugh: LuLaugh,
  salad: LuSalad,
  frown: LuFrown,
  shield: LuShield,
  anchor: LuAnchor,
  "badge-check": LuBadgeCheck,
  refrigerator: LuRefrigerator,
  "chef-hat": LuChefHat,
}

export function getIcon(iconName: string): React.ComponentType | undefined {
  return ICON_MAP[iconName.toLowerCase()]
}
