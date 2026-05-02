import {
  LuAward,
  LuCoins,
  LuDisc2,
  LuHeart,
  LuMedal,
  LuPackage,
  LuShoppingCart,
  LuSkipForward,
  LuStar,
  LuSwords,
  LuTrophy,
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
}

export function getIcon(iconName: string): React.ComponentType | undefined {
  return ICON_MAP[iconName.toLowerCase()]
}
