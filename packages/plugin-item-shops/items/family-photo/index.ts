import { createItem } from "../shared/types"
import { FAMILY_PHOTO_SHORT_ID } from "./constants"

export { FAMILY_PHOTO_SHORT_ID } from "./constants"
export { sonUsernameFor, sonDepthFromUsername } from "./sonUsername"

export const familyPhoto = createItem({
  shortId: FAMILY_PHOTO_SHORT_ID,
  definition: {
    name: "Family Photo",
    description:
      "A keepsake from home. Use it to bring your son into the picture — he does everything you do. Earnings find their way home.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "self",
    coinValue: 100,
    icon: "Users",
    rarity: "legendary",
  },
  use: async (deps, userId) => {
    if (!deps.sonAccess) {
      return { success: false, consumed: false, message: "Family Photo is unavailable." }
    }
    return deps.sonAccess.spawnSonForUser(userId)
  },
})
