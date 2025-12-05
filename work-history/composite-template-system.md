# Composite Template System Implementation

## Overview

Implemented a lightweight, framework-agnostic JSON specification for mixing static text with dynamic component references in plugin templates. This enables plugins to define templates that can include components requiring runtime lookups (e.g., username from userId) without coupling to React.

All component types are strongly typed and registered in a central component map. **Plugin components are simply template components with placement metadata** (where to render, when to show), eliminating the need for separate plugin component renderers.

## Key Architectural Insight

**There is only one set of components.**

- **Template components** define HOW things render (username, text, button, etc.)
- **Plugin components** are template components + WHERE/WHEN metadata (area, enabledWhen)
- **Composite templates** reference template components for inline composition

This means:
1. A `button` template component can be used as a plugin component (`type: "button"`)
2. The same `button` can be used within a composite template (`name: "button"`)
3. All components share the same props interface from `TemplateComponentPropsMap`
4. No duplicate renderer logic - just extract props and look up in the map

## Architecture

### Backend (Framework-Agnostic)

**Type Definitions** (`packages/types/PluginComponent.ts`):
```typescript
// All supported template component names
type TemplateComponentName =
  | "username"
  | "text"
  | "emoji"
  | "icon"
  | "button"
  | "leaderboard"

// Type-safe props for each component
interface TemplateComponentPropsMap {
  username: UsernameComponentProps
  text: TextComponentProps
  emoji: EmojiComponentProps
  icon: IconComponentProps
  button: ButtonComponentProps
  leaderboard: LeaderboardComponentProps
}

// Placement metadata that plugins add to template components
interface PluginComponentMetadata {
  id: string
  area: PluginComponentArea
  enabledWhen?: string
  subscribeTo?: string[]
}

// Plugin components = template components + metadata
type PluginComponentDefinition =
  | (PluginComponentMetadata & { type: "username" } & UsernameComponentProps)
  | (PluginComponentMetadata & { type: "text" } & TextComponentProps)
  | (PluginComponentMetadata & { type: "emoji" } & EmojiComponentProps)
  | (PluginComponentMetadata & { type: "icon" } & IconComponentProps)
  | (PluginComponentMetadata & { type: "button" } & ButtonComponentProps)
  | (PluginComponentMetadata & { type: "leaderboard" } & LeaderboardComponentProps)
  | PluginModalComponent

// Template part types (for composite templates)
interface TemplateTextPart {
  type: "text"
  content: string
}

interface TemplateComponentPart {
  type: "component"
  name: TemplateComponentName
  props: Record<string, string>
}

type CompositeTemplate = (TemplateTextPart | TemplateComponentPart)[]
```

**Template Utilities** (`packages/utils/templateInterpolation.ts`):
- `interpolateTemplate(content, values)` - String interpolation with {{placeholders}}
- `interpolateCompositeTemplate(template, values)` - Interpolates variables in composite templates
- Uses types from `@repo/types` to maintain type safety

### Frontend (React Implementation)

**Strongly-Typed Component Map** (`apps/web/src/components/PluginComponents/PluginComponentRenderer.tsx`):
```typescript
const TEMPLATE_COMPONENT_MAP: {
  [K in TemplateComponentName]: React.ComponentType<TemplateComponentPropsMap[K]>
} = {
  username: UsernameTemplateComponent,
  text: TextTemplateComponent,
  emoji: EmojiTemplateComponent,
  icon: IconTemplateComponent,
  button: ButtonTemplateComponent,
  leaderboard: LeaderboardTemplateComponent,
}
```

**Built-in Template Components**:
- `UsernameTemplateComponent` - Looks up username from userId via `useListeners()` hook
- `TextTemplateComponent` - Renders text with styling variants
- `EmojiTemplateComponent` - Renders emojis with size options
- `IconTemplateComponent` - Renders icons with color and size
- `ButtonTemplateComponent` - Interactive buttons that can open modals
- `LeaderboardTemplateComponent` - Displays sorted lists with scores

**Unified Rendering**:
- `renderPluginComponent()` - Extracts template props from plugin components and delegates to template component map
- No separate plugin component renderers needed - plugin components ARE template components with metadata
- `CompositeTemplateRenderer` - Interprets composite templates within row templates
- All template components can be used both as plugin components AND within composite templates

## Usage Example

### Plugin Definition (special-words)

Plugin components are just template components with placement metadata. Component props can reference plugin config using `{{config.fieldName}}` syntax:

```typescript
// Button component = button template + metadata
{
  id: "leaderboard-button",
  type: "button",                      // Template component type
  area: "userList",                    // Where to render (metadata)
  enabledWhen: "enabled",              // When to show (metadata)
  label: "{{config.wordLabel}} Leaderboard", // Config interpolation!
  icon: "trophy",
  opensModal: "leaderboard-modal",
  variant: "ghost",
  size: "sm"
}

// Modal component with config interpolation in title
{
  id: "leaderboard-modal",
  type: "modal",
  area: "userList",
  title: "{{config.wordLabel}} Leaderboard", // Config interpolation!
  size: "md",
  children: [...]
}

// Leaderboard component = leaderboard template + metadata
{
  id: "users-leaderboard",
  type: "leaderboard",                 // Template component type
  area: "userList",                    // Where to render (metadata)
  dataKey: "usersLeaderboard",         // Leaderboard props
  title: "Top {{config.wordLabel}} Users", // Config interpolation!
  rowTemplate: [
    { type: "component", name: "username", props: { userId: "{{value}}" } },
    { type: "text", content: ": {{score}} {{config.wordLabel}}s" } // Config + data!
  ],
  maxItems: 10,
  showRank: true
}
```

**Key Features:**
- `{{config.fieldName}}` - Access plugin config values
- `{{value}}`, `{{score}}`, `{{rank}}` - Access leaderboard data
- `{{field:formatter}}` - Format values (duration, percentage, pluralize)
- `{{field:pluralize:count}}` - Smart pluralization based on count
- Both config and data can be mixed in the same template
- All values are interpolated at render time with actual room config

**Examples:**
```typescript
// Simple config access
"{{config.wordLabel}} Leaderboard"

// Pluralize based on score
"{{score}} {{config.wordLabel:pluralize:score}}"
// score=1 → "1 word", score=5 → "5 words"

// Pluralize with literal count (force plural in titles)
"Top {{config.wordLabel:pluralize:2}} Users"
// Always shows plural: "Top words Users", "Top emojis Users", etc.
```

### Rendered Output

For entry `{ value: "user-123", score: 42 }`:
1. Variables interpolated: `userId="user-123"`, content=": 42 words"
2. Components resolved: `<UsernameComponent userId="user-123" />`
3. Username looked up from user list
4. Final render: "John Doe: 42 words"

## Framework Portability

### Svelte Migration Path

The JSON spec and type definitions remain identical - they're defined in `@repo/types` which has no framework dependencies. Only the component implementations change:

```typescript
// React implementation
const TEMPLATE_COMPONENT_MAP: {
  [K in TemplateComponentName]: React.ComponentType<TemplateComponentPropsMap[K]>
} = {
  username: UsernameReactComponent,
  text: TextReactComponent,
  // ... etc
}

// Svelte implementation (same types, different framework)
const TEMPLATE_COMPONENT_MAP: {
  [K in TemplateComponentName]: SvelteComponent<TemplateComponentPropsMap[K]>
} = {
  username: UsernameSvelteComponent,
  text: TextSvelteComponent,
  // ... etc
}
```

**Migration Checklist**:
1. Implement Svelte versions of all components in `TemplateComponentName`
2. Create Svelte-specific `CompositeTemplateRenderer`
3. All plugin definitions work unchanged
4. Type safety maintained via `@repo/types`

## Benefits

1. **No Duplication** - Plugin components ARE template components (with metadata), not separate wrappers
2. **Dynamic Lookups** - Components can access stores/context for runtime data
3. **Config Interpolation** - Use `{{config.fieldName}}` in any component prop to access plugin config at render time
4. **Framework Agnostic** - Pure JSON, no React coupling in plugin definitions
5. **Strongly Typed** - 
   - Component names are typed enums (`TemplateComponentName`)
   - Props are type-checked via `TemplateComponentPropsMap`
   - `PluginComponentDefinition` is a discriminated union ensuring correct props per type
   - TypeScript catches invalid component names at compile time
   - IDE autocomplete for available components and their props
6. **Single Rendering Path** - `renderPluginComponent()` extracts props and delegates to template map
7. **Extensible** - Adding new components requires:
   - Add name to `TemplateComponentName` enum
   - Define props interface and add to `TemplateComponentPropsMap`
   - Add to `PluginComponentDefinition` union type
   - Implement component in frontend
   - TypeScript ensures completeness
8. **Backward Compatible** - String templates still work (`rowTemplate: "{{value}}: {{score}}"`)

## Future Enhancements

### Potential New Template Components

To add a new template component (e.g., `avatar`):

1. **Update types** (`packages/types/PluginComponent.ts`):
```typescript
type TemplateComponentName =
  | "username"
  | "avatar"  // NEW
  | "text"
  // ... etc

interface AvatarComponentProps {
  userId: string
  size?: "sm" | "md" | "lg"
}

interface TemplateComponentPropsMap {
  avatar: AvatarComponentProps,  // NEW
  username: UsernameComponentProps,
  // ... etc
}
```

2. **Implement component** (frontend):
```typescript
function AvatarTemplateComponent({ userId, size = "md" }: AvatarComponentProps) {
  // Implementation
}

const TEMPLATE_COMPONENT_MAP = {
  avatar: AvatarTemplateComponent,  // NEW
  username: UsernameTemplateComponent,
  // ... etc
}
```

TypeScript will enforce that all components are implemented correctly.

### Other Potential Components
- `Badge` - Status badges (admin, DJ, etc.)
- `Link` - External links with proper formatting
- `Timestamp` - Relative time display
- `UserAvatar` - Combined avatar + username
- `ProgressBar` - Visual progress indicators

## Files Modified

### Backend (Type Definitions & Utilities)
- `packages/types/PluginComponent.ts` - **Complete rewrite** for unified component system:
  - `TemplateComponentName` enum defines all supported components
  - Props interfaces for all template components
  - `TemplateComponentPropsMap` for type-safe lookups
  - `PluginComponentMetadata` interface for placement data (id, area, enabledWhen, subscribeTo)
  - `PluginComponentDefinition` discriminated union = metadata + template props
  - `TemplateTextPart` and `TemplateComponentPart` for composite templates
  - `CompositeTemplate` type for mixed text/component templates
- `packages/utils/templateInterpolation.ts` - Updated to use types from `@repo/types`:
  - Imports `CompositeTemplate` from `@repo/types`
  - `interpolateCompositeTemplate` preserves strong typing
- `packages/plugin-special-words/index.ts` - Updated users leaderboard to use composite template

### Frontend (React Implementation)
- `apps/web/src/types/PluginComponent.ts` - **Simplified to pure re-exports** from `@repo/types`
- `apps/web/src/components/PluginComponents/PluginComponentRenderer.tsx` - **Major simplification**:
  - Implemented all 6 template components (username, text, emoji, icon, button, leaderboard)
  - Created strongly-typed `TEMPLATE_COMPONENT_MAP`
  - **Eliminated separate plugin component renderers** (PluginTextRenderer, PluginButtonRenderer, etc.)
  - Added single `renderPluginComponent()` function that extracts props and delegates to template map
  - `PluginComponentRenderer` now just checks enabledWhen and calls `renderPluginComponent()`
  - Implemented `CompositeTemplateRenderer` for row template support

## Notes

- No breaking changes - string templates remain fully supported
- Leaderboard renderer automatically detects template type (string vs array)
- Username lookups are reactive - updates when user list changes
- Type definitions prevent runtime errors with compile-time checks

### Config Interpolation

Component props support `{{config.fieldName}}` syntax for accessing plugin configuration at render time:

```typescript
// Plugin defines config schema with 'wordLabel' field
getConfigSchema() {
  return {
    fields: [
      { type: "text", name: "wordLabel", label: "Word Label", defaultValue: "Special Word" }
    ]
  }
}

// Component definitions can reference config
getComponentSchema() {
  return {
    components: [
      {
        type: "button",
        label: "{{config.wordLabel}} Leaderboard"  // Interpolated at render time
      }
    ]
  }
}

// If wordLabel = "Emoji", button shows "Emoji Leaderboard"
// If wordLabel = "Banned Word", button shows "Banned Word Leaderboard"
```

**How it works:**
1. Plugin defines component schema statically (no per-room fetching)
2. Frontend receives room-specific config when rendering
3. `interpolateConfigInProps()` replaces `{{config.fieldName}}` with actual config values
4. Works in any string prop: `label`, `title`, `content`, `rowTemplate` parts, etc.
5. Works recursively in nested objects and arrays (e.g., composite templates)

This allows plugins to be highly customizable without requiring code changes or per-room schemas.

### Pluralize Formatter

The `pluralize` formatter intelligently pluralizes words based on English grammar rules:

**Syntax:** `{{word:pluralize:count}}`

Where:
- `word` - The word to pluralize (can be a field or `config.fieldName`)
- `count` - Either a field name or a literal number

**Pluralization Rules:**
- `count === 1` → singular (e.g., "word")
- Consonant + "y" → "ies" (e.g., "category" → "categories")
- Ends in s, ss, sh, ch, x, z → add "es" (e.g., "box" → "boxes")
- Ends in "f" or "fe" → "ves" (e.g., "leaf" → "leaves")
- Default → add "s" (e.g., "word" → "words")

**Examples:**
```typescript
// Dynamic based on score
"{{score}} {{config.wordLabel:pluralize:score}}"
// If wordLabel="emoji", score=1 → "1 emoji"
// If wordLabel="emoji", score=5 → "5 emojis"
// If wordLabel="category", score=5 → "5 categories"

// Force plural with literal number
"Top {{config.wordLabel:pluralize:2}} Users"
// Always plural for titles/headers
```

