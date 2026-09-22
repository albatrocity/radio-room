import type { ItemDefinition, ItemUseResult } from "@repo/types"
import {
  resolveItemUseActorDisplayName,
  sendAttributedSystemMessage,
} from "../shared/resolveItemUseActorDisplayName"
import { createItem, type ItemShopsBehaviorDeps } from "../shared/types"

async function useKickstarterAccount(
  deps: ItemShopsBehaviorDeps,
  userId: string,
  _definition: ItemDefinition,
  callContext?: unknown,
): Promise<ItemUseResult> {
  const { campaignAccess } = deps
  if (!campaignAccess) {
    return { success: false, consumed: false, message: "Could not launch a campaign." }
  }

  const formValues =
    callContext && typeof callContext === "object" && !Array.isArray(callContext)
      ? ((callContext as { formValues?: Record<string, string | number> }).formValues ?? {})
      : {}

  const title = typeof formValues.title === "string" ? formValues.title : ""
  const rewards = typeof formValues.rewards === "string" ? formValues.rewards : ""
  const goal = typeof formValues.goal === "number" ? formValues.goal : Number(formValues.goal)

  const actor = await resolveItemUseActorDisplayName(deps, userId)
  const result = await campaignAccess.startCampaign({
    ownerUserId: userId,
    ownerName: actor.label,
    title,
    rewards,
    goal,
  })

  if (!result.ok) {
    return { success: false, consumed: false, message: result.message }
  }

  await sendAttributedSystemMessage(
    deps,
    `${actor.label} launched a Kickstarter: “${result.campaign.title}” (goal ${result.campaign.goal} coin).`,
    actor,
  )

  return {
    success: true,
    consumed: true,
    message: "Your campaign is live. Make those rewards count.",
  }
}

export const kickstarterAccount = createItem({
  shortId: "kickstarter-account",
  definition: {
    name: "Kickstarter Account",
    description:
      "Raise funds for your project. Set a goal, promise backer rewards, and cross your fingers. Deliver on your campaign promises or face the consequences.",
    stackable: true,
    maxStack: 2,
    tradeable: true,
    consumable: true,
    requiresTarget: "self",
    coinValue: 40,
    icon: "Rocket",
    rarity: "rare",
    useForm: [
      {
        name: "title",
        label: "Campaign title",
        type: "string",
        required: true,
        placeholder: "My amazing project",
      },
      {
        name: "goal",
        label: "Goal (coin)",
        type: "number",
        required: true,
        integer: true,
        min: 1,
        placeholder: "50",
      },
      {
        name: "rewards",
        label: "Backer rewards",
        type: "textarea",
        required: true,
        rows: 3,
        placeholder: "What you promise if the goal is met…",
        helperText: "Markdown supported (lists, bold, links).",
      },
    ],
  },
  use: useKickstarterAccount,
})
