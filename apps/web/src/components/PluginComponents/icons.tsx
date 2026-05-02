import {
  LuAward,
  LuCoins,
  LuDisc2,
  LuHeart,
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
}

export function getIcon(iconName: string): React.ComponentType | undefined {
  return ICON_MAP[iconName.toLowerCase()]
}
