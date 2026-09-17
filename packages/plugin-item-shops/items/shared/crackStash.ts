import type { ArtifactsPluginAPI } from "@repo/types"

export type CrackAttemptOutcome =
  | { status: "cracked" }
  | { status: "failed" }
  | { status: "deferred"; message: string }

export type CrackAttemptContext = {
  successChance: number
}

export type CrackResolver = (
  ctx: CrackAttemptContext,
  random?: () => number,
) => Promise<CrackAttemptOutcome>

/** Default coin-flip resolver; clamped so invalid config cannot exceed certainty. */
export const rollCrackAttempt: CrackResolver = async (ctx, random = Math.random) => {
  const chance = Math.min(1, Math.max(0, ctx.successChance))
  if (random() < chance) {
    return { status: "cracked" }
  }
  return { status: "failed" }
}

export type IssueStashPickGrantParams = {
  artifactId: string
  userId: string
  source: string
}

export type IssueStashPickGrantDeps = {
  artifacts: ArtifactsPluginAPI
  roomId: string
}

/** Mint a short-lived retrieve grant after a successful crack (ADR 0184). */
export async function issueStashPickGrant(
  deps: IssueStashPickGrantDeps,
  params: IssueStashPickGrantParams,
): Promise<{ ok: true; expiresAt: number } | { ok: false; message: string }> {
  const grant = await deps.artifacts.grantAccess({
    artifactId: params.artifactId,
    userId: params.userId,
    source: params.source,
    roomId: deps.roomId,
  })
  if (!grant) {
    return { ok: false, message: "That stash couldn't be cracked open." }
  }
  return { ok: true, expiresAt: grant.expiresAt }
}
