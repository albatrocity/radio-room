import { FaTrophy, FaStar, FaMedal, FaAward, FaHeart } from "react-icons/fa"
import { FiSkipForward } from "react-icons/fi"
import { LuSwords } from "react-icons/lu"

// ============================================================================
// Icon Mapping
// ============================================================================

export const ICON_MAP: Record<string, React.ComponentType> = {
  trophy: FaTrophy,
  star: FaStar,
  medal: FaMedal,
  award: FaAward,
  heart: FaHeart,
  "skip-forward": FiSkipForward,
  swords: LuSwords,
}

export function getIcon(iconName: string): React.ComponentType | undefined {
  return ICON_MAP[iconName.toLowerCase()]
}
