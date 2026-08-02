# Metadata Source Access

On Media Bridge rooms, each enabled metadata service can be **open** (anyone who can Add to Queue) or **restricted** (room admins plus plugin grants). See [ADR 0088](../adrs/0088-metadata-source-access-grants.md).

This is separate from:

- **Availability** ([ADR 0087](../adrs/0087-room-bridge-media-source-policy.md)): `metadataSourceIds` ∩ bridge CAPABILITIES
- **Personas** ([ADR 0057](../adrs/0057-user-personas-system.md)): identity labels only — not privileges in core

## Discovering services

Do not hardcode source ids as the only discovery path. Query the room catalog:

```typescript
const sources = await this.context!.api.listMetadataSources(this.context!.roomId)
// [{ id: "spotify", label: "Spotify" }, { id: "youtube", label: "YouTube" }, ...]
```

Use returned `id` values in config schemas (admin picks a service) and in grant checks.

## Granting access

Implement `grantMetadataSourceAccess` on your plugin:

```typescript
async grantMetadataSourceAccess(params: {
  roomId: string
  userId: string
  sourceId: string
  action: "search" | "queue"
}): Promise<"grant" | "abstain"> {
  // Return "grant" to unlock a restricted source for this user/action.
  // Return "abstain" if this plugin does not apply.
  return "abstain"
}
```

**Semantics (fail-closed for grants):**

| Plugin behavior | Result |
| --------------- | ------ |
| Returns `"grant"` | Access allowed (any grant wins) |
| Returns `"abstain"` | No grant from this plugin |
| Throws / times out | Treated as abstain |
| Not implemented | Skipped |

Room admins always bypass restrictions. Open sources never need grants.

Access is evaluated **before** [`validateQueueRequest`](queue-validation.md). Queue validation still runs afterward and receives `mediaSourceType`.

## Recipe: persona unlocks YouTube

Personas stay labels; your plugin owns the privilege:

```typescript
async onRoomReady() {
  await this.personas.registerPersonas([
    {
      id: "youtube-access", // becomes plugin:{name}:youtube-access
      label: "YouTube Access",
      assignableByAdmin: true,
      decoratesUser: true,
    },
  ])
}

async grantMetadataSourceAccess(params) {
  const config = await this.getConfig()
  const sourceId = config?.sourceId // set via admin config from listMetadataSources()
  if (params.sourceId !== sourceId) return "abstain"

  const personas = await this.personas.getUserPersonas(params.roomId, params.userId)
  const mine = `plugin:${this.name}:youtube-access`
  return personas.some((p) => p.personaId === mine) ? "grant" : "abstain"
}
```

## Recipe: one-shot local library queue

1. Sell/give a consumable inventory item that records a charge in plugin storage (or rely on inventory quantity).
2. `grantMetadataSourceAccess`: if user has a charge and `sourceId` is the configured local/library id → `"grant"` for `search` and `queue`.
3. `validateQueueRequest`: when `params.mediaSourceType` matches and the queue is allowed by access, consume the charge (decrement storage / `onItemUsed` pattern). Prefer consuming only after you would allow the request so failed hygiene checks do not spend the pass.

```typescript
async validateQueueRequest(params: QueueValidationParams) {
  if (params.mediaSourceType !== "local") return allowQueueRequest()
  const charges = Number((await this.storage.get(`localPass:${params.userId}`)) ?? 0)
  if (charges < 1) return allowQueueRequest() // access layer already denied if restricted
  await this.storage.set(`localPass:${params.userId}`, String(charges - 1))
  return allowQueueRequest()
}
```

(Adjust so you only decrement when the user actually needed the grant; e.g. check restricted mode via room settings if needed.)

## Room admin UI

Admins set **Admins + plugin grants only** per enabled source under Content → Media sources (bridge playback controller). That writes `metadataSourceAccess` on the room.
