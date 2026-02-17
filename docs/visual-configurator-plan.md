# Visual Configurator — Implementation Plan

## Existing Foundation

| Asset | Details |
|---|---|
| Block types | 31 types, Zod schemas, 8 categories |
| Themes (structural) | 4: `clean`, `editorial`, `bold`, `minimal` — fonts, spacing, radius, shadows |
| Skins (color) | 6: `slate`, `ocean`, `forest`, `ember`, `midnight`, `coral` — 22 CSS vars each |
| Presets | 20 homepage + 15 article page presets |
| Preview API | `GET /api/pages/[id]/preview` — returns self-contained HTML with inline CSS |
| Block assembler | Outputs `data-block-id`, `data-block-type`, `data-block-variant` on every block |
| BlockEditor | Drag-drop, add/remove, variant select, JSON config/content editing, per-block regen |
| Block palette | 8 categories × typed block names |
| PATCH API | `PATCH /api/pages/[id]` accepts `{ blocks, theme, skin }` |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  VisualConfigurator (split-pane layout)                             │
│  ┌──────────────────────┐  ┌──────────────────────────────────────┐ │
│  │  Editor Panel (left)  │  │  Preview Panel (right)              │ │
│  │                       │  │                                      │ │
│  │  ┌─ToolbarRow ──────┐│  │  ┌─ ViewportToolbar ──────────────┐ │ │
│  │  │ Save │ Theme/Skin ││  │  │ Desktop │ Tablet │ Mobile      │ │ │
│  │  └──────────────────┘│  │  └────────────────────────────────┘ │ │
│  │                       │  │                                      │ │
│  │  ┌─ BlockList ──────┐│  │  ┌─ iframe ─────────────────────┐  │ │
│  │  │ [Header]  topbar  ││  │  │                               │  │ │
│  │  │ [Hero]  centered  ││  │  │  Live-rendered HTML page       │  │ │
│  │  │ [FAQ]             ││  │  │  (from /api/pages/[id]/preview)│  │ │
│  │  │ [Footer]  minimal ││  │  │                               │  │ │
│  │  │  + Add Block      ││  │  │  postMessage bridge:           │  │ │
│  │  └──────────────────┘│  │  │  click block → select in editor│  │ │
│  │                       │  │  └───────────────────────────────┘  │ │
│  │  ┌─ ConfigPanel ────┐│  │                                      │ │
│  │  │ (selected block)  ││  │                                      │ │
│  │  │ Variant: [v]      ││  │                                      │ │
│  │  │ Fields: ...       ││  │                                      │ │
│  │  │ [Regenerate]      ││  │                                      │ │
│  │  └──────────────────┘│  │                                      │ │
│  └──────────────────────┘  └──────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## Implementation Steps

### Step 1 — VisualConfigurator shell + live preview iframe
**File:** `src/components/dashboard/VisualConfigurator.tsx`

- Split-pane layout using CSS grid (`grid-template-columns: 380px 1fr`)
- Left panel: toolbar + block list + config panel
- Right panel: iframe pointing to `/api/pages/{pageId}/preview?format=html&t={cacheBreaker}`
- `refreshPreview()` function: saves blocks via PATCH, then reloads iframe `src` with new timestamp
- Auto-refresh on save, debounced

**Integration:** Replace `<BlockEditor>` usage in `DomainPagesClient.tsx` with `<VisualConfigurator>` when user clicks "Edit Blocks."

### Step 2 — Theme/skin picker
**Files:** `VisualConfigurator.tsx` (inline, not a separate component)

- Two dropdowns in the toolbar row: Theme (4 options) and Skin (6 options)
- On change: PATCH `/api/pages/[id]` with new `{ theme }` or `{ skin }`, then `refreshPreview()`
- Show a small color swatch preview next to each skin option (render the skin's `primary` color as a dot)
- Persist choice to DB — this is a real setting, not just cosmetic

### Step 3 — Responsive preview toggle
**In:** `VisualConfigurator.tsx` preview panel toolbar

- Three buttons: Desktop (100%), Tablet (768px), Mobile (375px)
- Apply `max-width` + centered to the iframe container
- Add transition for smooth resize
- Show current viewport label

### Step 4 — Click-to-select block via postMessage bridge
**Two sides:**

1. **Inject script into preview HTML** — New preview API query param `?configurator=true` that injects a small script into the rendered HTML. The script:
   - Adds click handlers on all `[data-block-id]` elements
   - Derives/validates `parentOrigin` first (for example from an `ALLOWED_PARENT_ORIGIN` constant or a validated runtime value)
   - On click: only sends when `parentOrigin` is trusted, then call `parent.postMessage({ type: 'block-select', blockId, blockType }, parentOrigin)`
   - Adds hover highlight (outline) on `[data-block-id]:hover`
   - Listens for `block-highlight` messages from parent to scroll-to and outline a specific block

2. **Parent listener in VisualConfigurator** —
   - `window.addEventListener('message', handler)` to receive `block-select` events
   - Sets `selectedBlockId` state → scrolls block list to that item, opens config panel
   - On block list click: posts `block-highlight` message to iframe to scroll there

**Modify:** `GET /api/pages/[id]/preview` to accept `?configurator=true` and inject the bridge script before `</body>`.

### Step 5 — Block config panel (structured fields)
**In:** `VisualConfigurator.tsx` bottom of left panel

- When a block is selected, show a typed config panel instead of raw JSON
- For each block type, define a `BLOCK_FIELD_SCHEMA` mapping that describes the editable fields:
  - `Hero`: heading (text), subheading (text), ctaText (text), ctaUrl (url), badge (text)
  - `FAQ`: items (array of {question, answer})
  - `CTABanner`: text (text), buttonLabel (text), buttonUrl (url), style (select: bar/card/banner)
  - etc.
- Fall back to JSON textarea for block types without a field schema (same as current behavior)
- Changes update blocks state → mark dirty → user saves → preview refreshes

### Step 6 — Visual block palette upgrade
**In:** `VisualConfigurator.tsx` palette modal

- Keep existing category grouping
- Add a one-line description per block type (from a static map)
- Add a small icon or emoji indicator per category (Layout 📐, Content 📝, Conversion 🎯, etc.)
- Search/filter field at top of palette

### Step 7 — Wire into DomainPagesClient
**File:** `src/app/dashboard/domains/[id]/pages/DomainPagesClient.tsx`

- Replace `<BlockEditor>` import/usage with `<VisualConfigurator>`
- Pass same props: `pageId`, `initialBlocks`, `onSave`, `onCancel`
- Additionally pass `theme`, `skin`, `domainId` for the theme/skin picker and preview URL

### Step 8 — Tests
**File:** `src/__tests__/components/visual-configurator.test.ts`

- Test preview URL construction with cache breaker
- Test theme/skin picker dispatches correct PATCH
- Test block selection via postMessage mock
- Test responsive viewport switching
- Test block config field schema mapping
- Test configurator bridge script injection in preview API

## File Summary

| File | Action |
|---|---|
| `src/components/dashboard/VisualConfigurator.tsx` | **CREATE** — main component |
| `src/app/api/pages/[id]/preview/route.ts` | **MODIFY** — add `?configurator=true` bridge script injection |
| `src/app/dashboard/domains/[id]/pages/DomainPagesClient.tsx` | **MODIFY** — swap BlockEditor → VisualConfigurator |
| `src/__tests__/components/visual-configurator.test.ts` | **CREATE** — tests |

## Non-goals (v1)
- Inline content editing (contentEditable in iframe) — complex, deferred to v2
- Undo/redo — deferred
- Multi-page preview navigation — deferred
- Template marketplace / sharing — already have block templates API, UI deferred

## Risk Mitigations
- **iframe CORS** — Preview API already sets `X-Frame-Options: SAMEORIGIN`, so same-origin iframe works
- **postMessage security** — Validate `event.origin` matches an expected origin on receive **and** always send with an explicit `targetOrigin` (never `'*'`)
- **Send-side origin enforcement** — Derive destination origin from a trusted source (validated iframe `src` origin or an `allowedOrigins` list), verify iframe `src` matches expected origin before sending via `iframe.contentWindow.postMessage` / `window.postMessage`, and reject sends when destination origin cannot be determined
- **Preview staleness** — Cache-busting via `?t=Date.now()` param on iframe src
- **Large pages** — Preview is server-rendered HTML, no client-side hydration needed
