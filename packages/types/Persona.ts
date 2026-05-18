import { z } from "zod"

// =============================================================================
// Persona definitions & assignments
// =============================================================================

/** Platform-level persona id for session VIPs (admins designate). */
export const PLATFORM_VIP_PERSONA_ID = "vip"

export const personaDefinitionSchema = z.object({
  id: z.string(),
  label: z.string(),
  icon: z.string().optional(),
  source: z.union([z.literal("platform"), z.string()]),
  /** When true, at most one user in the room may hold this persona at a time. */
  exclusive: z.boolean().optional(),
  /** Room admins may assign/remove via the listener ellipsis menu. */
  assignableByAdmin: z.boolean().optional(),
  /** Show icon badge in the listener list when assigned. */
  decoratesUser: z.boolean().optional(),
  /** Show icon badge next to username in chat when assigned. */
  decoratesChatMessage: z.boolean().optional(),
})

export type PersonaDefinition = z.infer<typeof personaDefinitionSchema>

/** Stored in Redis per user assignment. */
export const userPersonaAssignmentSchema = z.object({
  personaId: z.string(),
  assignedBy: z.string(),
  assignedAt: z.string(),
})

export type UserPersonaAssignment = z.infer<typeof userPersonaAssignmentSchema>

/** Hydrated persona on the wire (User.personas). */
export const userPersonaSchema = z.object({
  personaId: z.string(),
  label: z.string(),
  icon: z.string().optional(),
  decoratesUser: z.boolean().optional(),
  decoratesChatMessage: z.boolean().optional(),
})

export type UserPersona = z.infer<typeof userPersonaSchema>

/** Slim shape for admin assign menu (INIT + PERSONA_DEFINITIONS_UPDATED). */
export const adminAssignablePersonaSchema = z.object({
  personaId: z.string(),
  label: z.string(),
  icon: z.string().optional(),
})

export type AdminAssignablePersona = z.infer<typeof adminAssignablePersonaSchema>

export function toAdminAssignablePersonas(
  definitions: readonly PersonaDefinition[],
): AdminAssignablePersona[] {
  return definitions
    .filter((d) => d.assignableByAdmin)
    .map(({ id, label, icon }) => ({ personaId: id, label, icon }))
}

export const PLATFORM_PERSONA_DEFINITIONS: readonly PersonaDefinition[] = [
  {
    id: PLATFORM_VIP_PERSONA_ID,
    label: "VIP",
    icon: "Star",
    source: "platform",
    assignableByAdmin: true,
    decoratesUser: true,
    decoratesChatMessage: true,
  },
]
