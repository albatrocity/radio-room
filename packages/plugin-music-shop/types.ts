import { z } from "zod"

export const musicShopConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /**
   * When false, the shop tab is hidden and purchases are blocked, but
   * users can still _use_ items they previously purchased. Toggle this to
   * close sales without disabling item effects.
   */
  isSellingItems: z.boolean().default(true),
  skipTokenPrice: z.number().int().min(1).default(100),
  skipTokenStock: z.number().int().min(0).default(3),
  skipTokenIcon: z.string().default("skip-forward"),
  sellBackRatio: z.number().min(0).max(1).default(0.5),
})

export type MusicShopConfig = z.infer<typeof musicShopConfigSchema>

export const defaultMusicShopConfig: MusicShopConfig = {
  enabled: false,
  isSellingItems: true,
  skipTokenPrice: 100,
  skipTokenStock: 3,
  skipTokenIcon: "skip-forward",
  sellBackRatio: 0.5,
}
