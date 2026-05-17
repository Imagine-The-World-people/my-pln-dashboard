# 🧭 Kompass

A personal **Professional Learning Network** dashboard for tracking goals, resources, notes, reflections, and learning analytics — built with vanilla HTML, CSS, and JavaScript.

![Dark & Light themes](https://img.shields.io/badge/themes-dark%20%2F%20light-6366f1)
![i18n](https://img.shields.io/badge/languages-NO%20%2F%20EN-10b981)
![Responsive](https://img.shields.io/badge/responsive-mobile%20ready-f59e0b)

---

## ✨ Features

| Section | Highlights |
|---------|-----------|
| **Dashboard** | Stat cards with animated counters, progress ring, learning streak tracker, daily motivational quote, smart suggestions |
| **Goals** | Add/complete/delete goals, **deadline date picker** with overdue/soon/future badges, **search + status filter (All/Active/Done) + sort** (newest, deadline, A→Z, category), progress bar, inline edit, completion tracking |
| **Resources** | Add/search/filter resources, **star ratings (1–5)**, type badges (YouTube, Blog, Podcast), category system, topic-colored tags, combined filtering |
| **Notes** | Rich note cards with **pin to top**, **search filter**, drawing canvas, file attachments, inline edit, timestamps |
| **Reflections** | Timeline layout with expand/collapse, color-coded question blocks, relative timestamps |
| **Insights** | Analytics dashboard — **5 KPI cards** (goals, completed, notes, reflections, resources), **quick stats strip** (streak, best day, avg rating, overdue), goal progress bar, **goal category breakdown**, 7-day activity bar chart, GitHub-style streak calendar, top resource type, notes stats |

### General
- 🌗 **Dark / Light theme** — sophisticated color palette; toggle with persistence
- 🌐 **i18n** — Norwegian (default) and English
- ☁️ **Cloud sync** — Supabase auth (email/password) with real-time data sync
- 💾 **Offline-first** — localStorage fallback when not signed in
- 📱 **Fully responsive** — **iOS-style mobile bottom tab bar** (fixed glass nav), **tablet icon-only sidebar** (72px with hover tooltips), fluid clamp() typography; 5 breakpoints: 1024px, 769–1023px (tablet), 768px (mobile), 600px, 360px
- 🔑 **Forgot password** — send reset link via Supabase email
- 👤 **Profile management** — avatar dropdown with display name editor, avatar color picker, and change password — all saved to Supabase user metadata
- ⌨️ **Keyboard shortcuts panel** — press `?` to show all shortcuts; `Alt+1–6` for sections, `Ctrl+K` for search
- ⏱️ **Focus session counter** — tracks completed 25-min pomodoro sessions, shown as a dashboard stat card
- 🧭 **Onboarding tour** — 4-step welcome modal for new users (shown once)
- 📲 **PWA** — installable as standalone app, offline caching via service worker
- 🎨 **iOS-style Glassmorphism** — `blur(40px) saturate(200%)` glass tokens, vibrant radial-gradient body background, inner highlight (`inset 0 1px 0`) on every card, unified `--glass-*` variables across sidebar, header, cards, and modals
- 🎯 **Focus mode** — 25-minute focus session timer
- 📄 **PDF export** — generate a styled learning report
- 📦 **Import / Export** — download or upload all data as JSON
- ♿ **Accessible** — focus-visible outlines, `prefers-reduced-motion`, ARIA attributes
- 🔔 **Toast notifications** — contextual feedback for all actions

---

## 🎨 Design System

The dashboard features a **sophisticated, professional UI** with a focus on user delight:

### Color Palette
- **Warm & Creative**: Primary colors (`#6b7aff`, `#9d5bd2`, `#ff6b9d`) designed for inspiration
- **High Contrast**: WCAG AA compliant text and interactive elements
- **Adaptive**: Separate light mode with refined, professional appearance

### Interactions
- **Micro-animations**: Smooth state transitions, bounce effects, and entrance animations
- **Delightful Hover States**: Cards lift with per-card colored glow, icons rotate, buttons respond with polish
- **Touch-Friendly**: Tap feedback on mobile, smooth scrolling, accessible button sizes
- **Accessibility**: Global `:focus-visible` rings, `prefers-reduced-motion` support
- **Visual Polish**: Stat number count-up on load, progress bar animate-from-zero, scroll-faded container

### Components
- **Glass-morphism Cards**: Sophisticated backdrop blur with subtle gradient overlays
- **Animated Buttons**: Shine effect on hover, springy press feedback, smooth transitions
- **Icon System**: Consistent SVG icons with smooth transformations
- **Typography**: Clear hierarchy with weighted text, improved readability

---

## 🗂 Project Structure

```
PLN/
├── index.html          # Single-page app markup
├── style.css           # Main styles + design tokens
├── responsive.css      # Mobile/tablet media queries
├── script.js           # App logic (single IIFE)
├── supabase-config.js  # Supabase client setup
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
| Font | [Poppins](https://fonts.google.com/specimen/Poppins) via Google Fonts |
| Backend | [Supabase](https://supabase.com) v2 (auth + database) |

---

## 📐 Architecture

All JS lives inside a single **IIFE** (`PLNDashboard`) with isolated modules:

| Module | Responsibility |
|--------|---------------|
| `Sidebar` | Responsive sidebar toggle + overlay |
| `Theme` | Dark/light mode persistence |
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
