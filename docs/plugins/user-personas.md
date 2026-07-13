# User Personas

Personas are **identity labels** ("who is this person?") — not gameplay modifiers. Platform **VIP** is assigned by room admins; plugins register and assign their own labels. See [ADR 0057](../adrs/0057-user-personas-system.md).

Access via **`this.personas`** on `BasePlugin` (alias for `this.context!.personas`). Personas are room-scoped.

**Personas vs modifiers:** use a persona for roles like Judge or Host; use `this.game.applyModifier` for timed effects like Cursed or Double Points.

Register definitions when your plugin is enabled (`register()`). `cleanup()` automatically unregisters your definitions and removes active assignments.

```typescript
await super.register(context)

await this.personas.registerPersonas([
  {
    id: "judge",
    label: "Judge",
    icon: "Gavel",
    exclusive: true, // at most one judge in the room
    decoratesUser: true, // adds icon next to name in user list
    decoratesChatMessage: true, // adds icon next to name in chat message
    assignableByAdmin: true, // ability to toggle via admin listener ellipsis menu
  },
])

this.on("MESSAGE_RECEIVED", async ({ message }) => {
  const judges = await this.personas.getUsersWithPersona("judge")
  // ...
})
```

| Method                                   | Description                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| `registerPersonas(defs)`                 | Register definitions for this plugin (`id` is short; stored as `plugin:{pluginName}:{id}`). |
| `unregisterPersonas()`                   | Called automatically from `BasePlugin.cleanup()`; removes definitions and assignments.      |
| `getRoomPersonas()`                      | All definitions in the room (platform + every plugin).                                      |
| `assign(userId, personaId, assignedBy?)` | Assign **your** persona to a user.                                                          |
| `remove(userId, personaId)`              | Remove **your** persona from a user.                                                        |
| `getUserPersonas(userId)`                | Raw assignments (any source).                                                               |
| `getUserPersonasHydrated(userId)`        | Assignments with `label` / `icon` for UI.                                                   |
| `getUsersWithPersona(personaId)`         | Online user ids holding the persona (short or full id).                                     |

**Definition flags (optional):**

| Flag                   | Description                                                                       |
| ---------------------- | --------------------------------------------------------------------------------- |
| `assignableByAdmin`    | Room admins can assign/remove from the listener ellipsis menu (`TOGGLE_PERSONA`). |
| `decoratesUser`        | Show an icon badge in the listener list when assigned.                            |
| `decoratesChatMessage` | Show an icon badge next to the username in chat when assigned.                    |

Decoration is independent of `assignableByAdmin` — a plugin can show badges for personas it assigns itself without exposing them in the admin menu.

Clients receive `user.personas` (including decoration flags when hydrated) on the listener list and via `PERSONA_ASSIGNED` / `PERSONA_REMOVED`. Assignable definitions are sent on login `INIT` as `assignablePersonas` and refreshed via `PERSONA_DEFINITIONS_UPDATED` when plugins enable/disable.
