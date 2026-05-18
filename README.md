# 🧭 Kompass

A personal **Professional Learning Network** dashboard for tracking goals, resources, notes, reflections, and learning analytics — built with vanilla HTML, CSS, and JavaScript.

![Dark & Light themes](https://img.shields.io/badge/themes-dark%20%2F%20light-5B9FD4)
![i18n](https://img.shields.io/badge/languages-NO%20%2F%20EN-10b981)
![Responsive](https://img.shields.io/badge/responsive-mobile%20ready-f59e0b)

---

## ✨ Features

| Section | Highlights |
|---------|-----------|
| **Dashboard** | Stat cards with animated counters, progress ring, learning streak tracker, daily motivational quote, smart suggestions |
| **Goals** | Add/complete/delete goals, **drag-and-drop reordering**, **deadline date picker** with overdue/soon/future badges, **search + status filter** + sort, progress bar, inline edit, **milestone/step tracking** (collapsible per-goal step list with progress bar), **goal detail drawer** (open side panel with meta, milestones, linked notes) |
| **Resources** | Add/search/filter resources, **star ratings (1–5)**, type/category filters, topic-colored tags, **Collections/Folders** (create colour-coded groups, filter by collection, assign resource to collection) |
| **Notes** | Rich note cards with **pin to top**, **search filter**, drawing canvas, file attachments, inline edit, timestamps |
| **Reflections** | Timeline layout with expand/collapse, color-coded question blocks, **weekly prompt banner** (auto-suggest a reflection prompt every Monday / 7 days) |
| **Insights** | Analytics — 5 KPI cards, quick stats, goal progress bar, category breakdown, 7-day activity bar chart, GitHub-style streak calendar |

### General
- 🌗 **Dark / Light theme** — sophisticated color palette; toggle with persistence
- 🌐 **i18n** — Norwegian (default) and English; **full login/modal translation** — login hero, feature list, sign-in form, forgot-password and registration modals all translated via `data-i18n` attributes
- ☁️ **Cloud sync** — Supabase auth (email/password) + **real-time cross-device sync** (Postgres CDC subscription; changes from other devices apply instantly)
- 💾 **Offline-first** — localStorage fallback when not signed in
- 📱 **Fully responsive** — iOS-style mobile bottom tab bar, tablet icon-only sidebar, fluid clamp() typography, safe-area insets for notched phones, dedicated ≤360px micro breakpoints for login and app shell
- 🔑 **Forgot password** — send reset link via Supabase email
- 👤 **Profile management** — avatar dropdown with display name, avatar colour picker, change password
- ⌨️ **Keyboard shortcuts** — `?` for shortcut panel, `Alt+1–6` for sections, `Ctrl+K` for command palette
- 🔍 **Command palette** (`Ctrl+K`) — fuzzy-search goals, notes, resources, navigate sections; **full keyboard focus trap** (Tab wraps), **focus restored** on close
- 🗑️ **Undo delete** — 5-second undo toast for all deletes
- 📡 **Offline banner** — red status banner on network drop
- 🗂️ **Sidebar rail mode** — collapse to 68px icon rail; state persisted
- ⏱️ **Pomodoro focus timer** — 25-min timer with **header mini ring** (live countdown ring shown in header while session is active; click to cancel)
- 🔔 **Smart deadline notifications** — browser `Notification` API alerts for overdue/due-soon goals (once per day, requests permission only when needed)
- 🗃️ **Supabase Storage utility** — `StorageSync` module for uploading/deleting images in a `drawings` bucket (requires manual bucket creation)
- 🧭 **Onboarding tour** — 4-step welcome modal for new users
- 📲 **PWA** — installable, offline caching via service worker
- 🎨 **iOS-style Glassmorphism** — blur/saturate glass tokens, vibrant radial-gradient background
- 🧪 **Playwright E2E tests** — `tests/app.spec.js` covers goals CRUD + undo, milestones, notes, resources, collections, command palette, sidebar, reflection prompt

---

## 🎨 Design System

The dashboard features a **sophisticated, professional UI** with a focus on user delight:

### Color Palette
- **Warm & Creative**: Primary colors (`#6b7aff`, `#9d5bd2`, `#ff6b9d`) designed for inspiration
- **High Contrast**: WCAG AA compliant text and interactive elements
- **Adaptive**: Separate light mode with refined, professional appearance

### Interactions
- **Micro-animations**: Smooth state transitions, bounce effects, entrance animations, and **progress ring re-animation on every Goals visit**
- **Scroll memory**: Each section remembers scroll position when navigating away and back
- **Scroll-aware header**: Subtle shadow appears when content is scrolled, disappears at top
- **Delightful Hover States**: Cards lift with per-card colored glow, icons rotate, buttons respond with polish
- **Touch-Friendly**: Tap feedback on mobile, smooth scrolling, accessible button sizes
- **Accessibility**: Global `:focus-visible` rings, `prefers-reduced-motion` support
- **Visual Polish**: Stat number count-up on load, progress bar animate-from-zero, scroll-faded container
- **Drawing Canvas**: Stylus/finger drawing in notes — canvas sized on-demand to avoid 0×0 initialization bug when section is hidden at startup

### Components
- **Glass-morphism Cards**: Sophisticated backdrop blur with subtle gradient overlays
- **Animated Buttons**: Shine effect on hover, springy press feedback, smooth transitions
- **Icon System**: Consistent SVG icons with smooth transformations
- **Typography**: Clear hierarchy with weighted text, improved readability

---

## 🗂 Project Structure

```
PLN/
├── index.html              # Single-page app markup
├── style.css               # Main styles + design tokens
├── responsive.css          # Mobile/tablet media queries
├── script.js               # App logic (ES module)
├── supabase-config.js      # Supabase client setup
├── package.json            # Node / Vite build config
├── playwright.config.js    # Playwright E2E test config
├── public/
│   ├── sw.js               # Service worker (PWA offline support)
│   └── manifest.json       # Web app manifest (install prompt, icons)
├── tests/
│   └── app.spec.js         # E2E tests (goals, notes, resources, …)
└── README.md
```

---

## 🚀 Getting Started

1. **Clone or download** this folder.
2. Open `index.html` with a local server (e.g. VS Code Live Server / Five Server).
3. The app works immediately with localStorage — no backend required.

### Optional: Enable cloud sync

1. Create a free project at [supabase.com](https://supabase.com).
2. Update `supabase-config.js` with your project URL and anon key.
3. Sign in via the login overlay to sync data across devices.

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Markup | HTML5 |
| Styling | CSS3 (custom properties, `backdrop-filter`, CSS Grid, keyframe animations) |
| Logic | Vanilla JavaScript (ES6+ IIFE, no framework) |
| Font | [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) via Google Fonts |
| Backend | [Supabase](https://supabase.com) v2 (auth + database + real-time + storage) |
| Testing | [Playwright](https://playwright.dev) (E2E, Chromium) |
| Build | [Vite](https://vitejs.dev) |

---

## 📐 Architecture

All JS lives inside a single **IIFE** (`PLNDashboard`) with isolated modules:

| Module | Responsibility |
|--------|---------------|
| `Sidebar` | Responsive sidebar toggle + overlay |
| `Theme` | Dark/light mode persistence |
| `ResourceGroups` | Resource collections/folders CRUD, filter bar, colour picker dialog |
| `GoalDetailDrawer` | Side-panel with goal meta, milestones, linked notes, quick actions |
| `DeadlineNotifier` | Browser Notification API for overdue/due-soon goals |
| `ReflectionPrompts` | Weekly rotating reflection prompt banner |
| `RealtimeSync` | Supabase Postgres CDC subscription for cross-device updates |
| `StorageSync` | Supabase Storage helpers (upload/delete images in `drawings` bucket) |
| `Dashboard` | Stat rendering, countUp animations, learning streak, smart suggestions |
| `Goals` | CRUD, progress ring, completion tracking |
| `Resources` | CRUD, search, type/category/tag combined filtering, active filter chips |
| `Notes` | CRUD, drawing canvas, file attachments |
| `Reflections` | CRUD, timeline, expand/collapse |
| `Insights` | Analytics dashboard — KPI spark bars, goal progress, deep dive stats |
| `I18n` | Norwegian ↔ English translation with `data-i18n` attribute binding |
| `Auth` | Supabase email/password authentication + cloud sync |
| `Focus` | 25-minute focus session timer |
| `PDF` | Export styled learning report as PDF |

Data is stored under `localStorage` keys prefixed with `pln_` and optionally synced to Supabase when authenticated.

---

## 📱 Responsive Breakpoints

| Breakpoint | Behavior |
|-----------|----------|
| `> 1200px` | Full desktop layout |
| `≤ 1200px` | Compact grids, reduced padding |
| `≤ 768px` | Sidebar collapses to slide-out menu with overlay, single-column grids |
| `≤ 480px` | Narrow sidebar, hidden search, full-width buttons, iOS zoom prevention |

---

## 📄 License

This project is for personal/educational use.
