# DESIGN SYSTEM — Noto

> Derived from `docs/PRD.md`. A practical visual foundation for the MVP. It favors
> clarity and speed over decoration and avoids trends that do not serve capture and
> retrieval. Concrete values are **Implementation Decision** unless tied to a PRD rule.

## 0. Principles

- **Content first** (PRD §6.3): type and interface recede; the note is the focus.
- **Capture fast** (PRD §5.1): primary actions are obvious and reachable with one hand.
- **Calm by default**: few colors, generous spacing, no decorative animation beyond
  feedback.
- **Consistent, not clever**: one component per job.
- **Accessible**: usable with screen readers, large text, and without color alone.

The design system is token-based so light/dark modes and future platforms share one
source of truth. No visual style is added that cannot be justified by a PRD feature.

## 1. Design Tokens

### 1.1 Spacing

4-point base scale:

| Token | Value |
| --- | --- |
| `space.1` | 4 |
| `space.2` | 8 |
| `space.3` | 12 |
| `space.4` | 16 |
| `space.5` | 24 |
| `space.6` | 32 |
| `space.7` | 48 |

- Screen horizontal padding: `space.4` (16).
- Gap between list items: `space.2`–`space.3`.
- Section separation: `space.5`.

### 1.2 Radius and Borders

| Token | Value |
| --- | --- |
| `radius.sm` | 6 |
| `radius.md` | 10 |
| `radius.lg` | 16 |
| `border.hairline` | 1 |

Use hairlines for separation; avoid heavy shadows.

### 1.3 Typography

System font stack (platform default) to stay native and cross-platform.
Monospace for code content only.

| Token | Size | Line height | Weight | Use |
| --- | --- | --- | --- | --- |
| `type.display` | 28 | 34 | 700 | Screen titles |
| `type.title` | 22 | 28 | 600 | Note title |
| `type.heading` | 18 | 24 | 600 | Section headings |
| `type.body` | 16 | 24 | 400 | Note content, main text |
| `type.callout` | 15 | 20 | 400 | Secondary labels |
| `type.caption` | 13 | 18 | 400 | Metadata, timestamps |
| `type.mono` | 15 | 22 | 400 | Code blocks, inline code |

Rules:

- Support the OS text-size setting (Dynamic Type / font scale); layout must not clip.
- Never use type size alone to convey meaning.
- Title may be empty; the editor placeholder uses `type.title` in a muted color.

### 1.4 Color

A near-neutral base with one accent. Semantic tokens, not raw hex, are referenced by
components.

**Light**

| Token | Value | Use |
| --- | --- | --- |
| `color.background` | `#FFFFFF` | App background |
| `color.surface` | `#F7F7F8` | Cards, grouped sections |
| `color.surfaceRaised` | `#FFFFFF` | Modals, sheets |
| `color.border` | `#E2E2E5` | Dividers, input borders |
| `color.text` | `#1C1C1E` | Primary text |
| `color.textMuted` | `#6B6B70` | Metadata, hints |
| `color.accent` | `#2F6FED` | Primary actions, links |
| `color.accentMuted` | `#E7EFFD` | Selected states, tags |
| `color.danger` | `#D92D20` | Destructive actions, errors |
| `color.success` | `#1F8A4C` | Saved confirmation |
| `color.warning` | `#B25E00` | Partial/degraded states |

**Dark**

| Token | Value | Use |
| --- | --- | --- |
| `color.background` | `#121214` | App background |
| `color.surface` | `#1C1C1F` | Cards, grouped sections |
| `color.surfaceRaised` | `#232327` | Modals, sheets |
| `color.border` | `#333338` | Dividers, input borders |
| `color.text` | `#F2F2F4` | Primary text |
| `color.textMuted` | `#9A9AA2` | Metadata, hints |
| `color.accent` | `#6E9BFF` | Primary actions, links |
| `color.accentMuted` | `#22304F` | Selected states, tags |
| `color.danger` | `#F97066` | Destructive actions, errors |
| `color.success` | `#4CC38A` | Saved confirmation |
| `color.warning` | `#E0A458` | Partial/degraded states |

Rules:

- Links use `accent`; unresolved links use `textMuted` + underline (not color alone).
- Errors, warnings, and success always pair color with an icon or text.
- Contrast targets in §5.

### 1.5 Surfaces and Elevation

- `background` is the page; `surface` groups related content; `surfaceRaised` is for
  overlays (modals, bottom sheets, FAB).
- Prefer spacing + hairlines over shadows. A single soft shadow is allowed for raised
  overlays only.

## 2. Components

### 2.1 Buttons

| Variant | Use | Style |
| --- | --- | --- |
| Primary | Save, capture, confirm | `accent` fill, white text |
| Secondary | Cancel-adjacent, secondary action | transparent, `border`, `text` |
| Ghost | Inline, low emphasis | text only, `accent` or `textMuted` |
| Destructive | Delete | `danger` text or fill, requires confirmation |

- Minimum height 44 (Android: 48 preferred).
- Labels are verbs ("Save note", "Delete"), short and specific.
- Disabled state must be visually distinct; but Save in capture is disabled only when
  there is genuinely nothing to save (FEATURES.md §1.1).

### 2.2 Inputs

- Text fields: `surface` fill or transparent with `border`, `radius.md`.
- Focus: `accent` border; never remove focus indication.
- Labels and hints use `type.callout` / `type.caption`.
- Error text uses `danger` and sits below the field.
- Multiline editor field grows with content; no fixed-height clipping.

### 2.3 Tags

- Tag chip: `accentMuted` background, `accent` text, `radius.sm`, `type.caption`.
- Removable chips show an `x` with an accessible label.
- Selected filter chips use a stronger `accent` outline/fill.
- Tag display preserves first-seen casing (DATABASE.md §4.3).

### 2.4 List Items

- Standard row: leading optional icon, title (`type.body`/`type.heading`), one line of
  metadata (`type.caption`, `textMuted`), optional trailing chevron.
- Note rows show title (or "Untitled"), a content snippet, and a timestamp.
- Separated by `border` hairlines, not cards, for density.
- Whole row is tappable with a minimum 44 height.
- Swipe actions are optional and must have an accessible alternative (long-press menu).

### 2.5 Editor

- Title field at the top using `type.title`; content below using `type.body`.
- Content is Markdown; code uses `type.mono` on `surface`.
- Wikilinks render in `accent`; unresolved links in `textMuted` with underline; ambiguous
  links use a distinct marker (icon/text) and never rely on color alone.
- Tag tokens render as inline chips.
- A small save-status indicator (saving / saved / failed) lives near the top; it is
  textual + iconic, never color-only.
- Toolbar keeps only essential actions: tag, attachment, link, more.

### 2.6 Attachment Presentation

- **Images**: inline thumbnail or full width, `radius.md`, tap to view full screen.
- **Audio**: compact player with play/pause, duration, and a progress bar.
- **Files**: row with file icon, original name, size, and an open/share action.
- **Missing file**: muted placeholder card reading "This attachment is no longer
  available." (PRD §18); the note remains readable.

### 2.7 Navigation

- Bottom tab bar with four destinations: Home, Search, Notebooks, Settings (PRD §16).
- Active tab uses `accent`; inactive uses `textMuted`; labels are always visible.
- Quick Capture is a prominent action on Home and may also be a FAB; it is never hidden
  behind a menu.
- Top-level screens use `type.display` titles; detail screens use a back affordance and
  the note title.
- Safe areas and system gesture insets are respected.

### 2.8 Feedback

- Save confirmation is subtle and non-blocking (toast or inline status).
- Destructive actions require an explicit confirmation dialog naming the item.
- Errors appear inline where the action happened, with a next step when available
  (UX_FLOW.md §9.3).
- Loading uses skeletons for lists and a spinner for short operations; never a blank
  screen.

## 3. Dark Mode

- Both palettes in §1.4 are first-class; the app follows the OS setting by default.
- Tokens are semantic, so components do not branch on theme.
- Avoid pure black backgrounds and pure white text to reduce eye strain (`#121214` /
  `#F2F2F4`).
- Images/attachments keep natural colors; only the chrome changes.
- Contrast must hold in both modes (§5).

## 4. Responsive / Cross-platform Principles

- Mobile-first; Android is the first target but layouts are not Android-specific
  (ARCHITECTURE.md §9).
- Use flex layouts and relative sizing; avoid hardcoded device dimensions.
- On wider surfaces (future tablet/desktop/web), center content with a readable max
  width and optionally use a two-pane layout (list + note). This is a future adaptation,
  not MVP scope.
- Touch, mouse, and keyboard inputs are handled by standard platform controls; no
  gesture is the only way to perform a critical action.
- Text remains readable under OS font scaling and at large sizes.

## 5. Accessibility

- **Contrast**: body text and meaningful icons meet at least 4.5:1; large text at least
  3:1.
- **Touch targets**: at least 44×44 (Android: 48×48 recommended), with adequate spacing.
- **Screen readers**: every interactive control has a label; note rows announce title,
  snippet, and timestamp; attachments announce type and availability.
- **No color-only meaning**: states (unresolved link, error, selected) use text, icon, or
  shape as well.
- **Font scaling**: layouts reflow without clipping or overlap.
- **Motion**: respect the OS "reduce motion" setting; keep transitions short and
  functional.
- **Focus**: web/desktop keyboard focus is visible and ordered; not an MVP target but not
  blocked by the design.

## 6. Content Style

- UI copy is short, concrete, and human; no raw technical error text (PRD §18).
- Use sentence case for buttons and labels.
- **Default language is Indonesian** for the MVP. Whether additional languages are a
  product goal is an open product question (`ROADMAP.md` → Open Product Questions).
- **i18n-ready from the start:** all user-facing strings live in a single strings layer
  (`src/ui/i18n`, ARCHITECTURE.md §5) and are referenced by key. Components must not
  hardcode user-facing text; this is required even though only Indonesian ships in MVP.
  - **Implementation Decision:** the strings layer uses a simple key → Indonesian-string
    map (no heavy i18n framework) so localization can be added later without touching
    components.
