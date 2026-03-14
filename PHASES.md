# ScreenVault — Development Phases

**Goal**: Transform ScreenVault from a swipe-card prototype into a polished, production-ready screenshot organizer with multiple view types, multi-selection, enhanced folder management, and Play Store-ready builds.

---

## Phase 1: Index Layout Overhaul — Multiple View Types

> **Goal**: Replace the single swipe-card inbox with a flexible view system.

| Task | Description | Status |
|---|---|---|
| SV-1.1 | `ViewTypeSwitcher` component — Toggle group (Grid / List / Swipe) with AsyncStorage persistence | ✅ |
| SV-1.2 | **Grid View** — `FlashList` 3-column thumbnail grid with date section headers | ✅ |
| SV-1.3 | **List View** — Row layout with thumbnail, filename, date, source, quick-action buttons | ✅ |
| SV-1.4 | **Swipe View** — Extract existing `SwipeCard` as standalone view option | ✅ |
| SV-1.5 | **Header redesign** — Screenshot count, view toggle, select-all, sync indicator | ✅ |

**Milestone**: *"Users can browse their inbox in the view that suits them best."*

---

## Phase 2: Multi-Selection & Bulk Actions

> **Goal**: Select multiple screenshots for batch operations across any view.

| Task | Description | Status |
|---|---|---|
| SV-2.1 | `useMultiSelect` hook — Shared selection state: `toggleSelect`, `selectAll`, `deselectAll` | ✅ |
| SV-2.2 | **Selection UI per view** — Grid: checkmark overlay, List: checkbox column | ✅ |
| SV-2.3 | **Floating action toolbar** — Animated bottom bar: Delete, Favorite, Add to Folder, Tag + count badge | ✅ |
| SV-2.4 | **Batch folder assignment** — Reuse folder picker modal with bulk `assignToFolder` | ✅ |
| SV-2.5 | **Batch DB operations** — `batchAssignToFolder`, `batchMarkAsDeleted`, `batchToggleFavorite` in SQLite | ✅ |

**Milestone**: *"Users can select 50 screenshots and organize them with one tap."*

---

## Phase 3: Folder Organization Improvements

> **Goal**: Make organizing feel instant with smart suggestions and move-between-folders.

| Task | Description | Status |
|---|---|---|
| SV-3.1 | **Recently used folders** — Track last 3 used folders in Zustand store | ✅ |
| SV-3.2 | **Quick folder chip bar** — Horizontal row of recent folder chips for one-tap assignment on index | ✅ |
| SV-3.3 | **Move between folders** — Multi-select toolbar "Move to..." action in folder detail view | ✅ |
| SV-3.4 | **Unorganize action** — Send screenshots back to Inbox (`folderId = null, isProcessed = 0`) | ✅ |

**Milestone**: *"Organizing screenshots into folders is friction-free."*

---

## Phase 4: Full-Screen Gallery Viewer

> **Goal**: A premium image viewing experience with swipe navigation and actions.

| Task | Description | Status |
|---|---|---|
| SV-4.1 | `app/viewer.tsx` — Full-screen modal route (receives `screenshotId` or ID list) | ✅ |
| SV-4.2 | **Horizontal pager** — `PanGesture`-based swipe between images | ✅ |
| SV-4.3 | **Pinch-to-zoom** — `PinchGestureHandler` with animated scale/translate | ✅ |
| SV-4.4 | **Overlay actions** — Tap to toggle: Delete, Favorite, Edit, Share | ✅ |
| SV-4.5 | **Open from grids** — Tap thumbnail in Grid view (index or folder) to open viewer | ✅ |

**Milestone**: *"Users can browse their gallery photos-app style."*

---

## Phase 5: Search & Filter Module

> **Goal**: Find any screenshot instantly across the entire library.

| Task | Description | Status |
|---|---|---|
| SV-5.1 | **Search bar** — Debounced text input searching `filename` and `notes` | ✅ |
| SV-5.2 | **Filter chips** — Toggleable: All, Inbox, Organized, Favorites, Deleted | ✅ |
| SV-5.3 | **Sort options** — Newest, Oldest, Name A-Z, Name Z-A | ✅ |
| SV-5.4 | **Date range filter** — Optional date picker for creation date range | ✅ |
| SV-5.5 | **Tag filter** — Filter by applied tags | ✅ |
| SV-5.6 | **DB query** — `searchScreenshots(query, filters, sort)` in `database.ts` | ✅ |

**Milestone**: *"Users can find any screenshot from any screen."*

---

## Phase 6: Production Polish & Deployment

> **Goal**: Make the app production-ready with polished branding and existing build pipeline.

| Task | Description | Status |
|---|---|---|
| SV-6.1 | **App icon** — Verify adaptive icon layers render correctly | ✅ |
| SV-6.2 | **Splash screen** — Smooth animated transition | ✅ |
| SV-6.3 | **Performance audit** — Optimize re-renders and list perf | ✅ |
| SV-6.4 | **Play Store metadata** — Title, descriptions, feature graphic, screenshots | ✅ |
| SV-6.5 | **Privacy policy** — Expand for Play Store compliance | ✅ |
| SV-6.6 | **Release verification** — Test `build.bat --production` + `release.js` flow | ✅ |

**Milestone**: *"The app is production-ready and deployable via existing build scripts."*

---

## Architecture

```
screen-vault/
├── app/
│   ├── (tabs)/
│   │   ├── _layout.tsx          # Tab bar config
│   │   ├── index.tsx            # ← Phase 1-2: Multi-view inbox
│   │   ├── folders.tsx          # Folder grid
│   │   ├── stats.tsx            # Statistics
│   │   └── settings.tsx         # Settings
│   ├── folder/[id].tsx          # ← Phase 3: Move between folders
│   ├── editor.tsx               # Image editor
│   └── viewer.tsx               # ← Phase 4: NEW gallery viewer
├── components/
│   ├── ui/                      # Shared UI primitives
│   ├── view-type-switcher.tsx   # ← Phase 1: NEW
│   ├── selection-toolbar.tsx    # ← Phase 2: NEW
│   ├── folder-chip-bar.tsx      # ← Phase 3: NEW
│   └── search-bar.tsx           # ← Phase 5: NEW
├── hooks/
│   └── use-multi-select.ts     # ← Phase 2: NEW
├── lib/
│   ├── database.ts             # ← Phase 2, 5: batch ops + search
│   ├── screenshot-monitor.ts   # Sync engine
│   ├── store.ts                # ← Phase 3: recent folders
│   └── utils.ts                # Helpers
├── build.bat                   # Existing build pipeline
├── release.js                  # Existing release automation
└── PHASES.md                   # ← This file
```

---

## Status Legend

| Icon | Meaning |
|---|---|
| ⬜ | Not started |
| 🔄 | In progress |
| ✅ | Complete |
| ⏸️ | Paused |
