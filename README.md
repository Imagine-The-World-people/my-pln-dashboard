# 🧭 Kompass

A personal **Professional Learning Network** dashboard for tracking goals, resources, notes, reflections, and learning analytics — built with vanilla HTML, CSS, and JavaScript.

![Dark & Light themes](https://img.shields.io/badge/themes-dark%20%2F%20light-6366f1)
![i18n](https://img.shields.io/badge/languages-NO%20%2F%20EN-10b981)
![Responsive](https://img.shields.io/badge/responsive-mobile%20ready-f59e0b)

---

## ✨ Features

| Section | Highlights |
|---------|-----------|
| **Dashboard** | Stat cards with animated counters, progress ring, learning streak tracker, smart suggestions |
| **Goals** | Add/complete/delete goals, progress bar, inline edit, completion tracking |
| **Resources** | Add/search/filter resources, type badges (YouTube, Blog, Podcast), category system (Development, Driftstøtte, Brukerstøtte), topic-colored tags, category + tag + type + search combined filtering, active filter chips bar |
| **Notes** | Rich note cards with drawing canvas, file attachments, inline edit, timestamps |
| **Reflections** | Timeline layout with expand/collapse, color-coded question blocks (learned/worked/improve), relative timestamps |
| **Insights** | Analytics dashboard — KPI cards with spark bars, goal progress, top resource type, notes/drawings stats, deep dive metrics |

### General
- 🌗 **Dark / Light theme** — sophisticated color palette with warm, creative tones; toggle with persistence
- 🌐 **i18n** — Norwegian (default) and English
- ☁️ **Cloud sync** — Supabase auth (email/password) with real-time data sync
- 💾 **Offline-first** — localStorage fallback when not signed in
- 📱 **Fully responsive** — hamburger sidebar, touch-friendly inputs, mobile-optimized layout
- 🎨 **Professional Glassmorphism UI** — sophisticated backdrop blur, gradient accents, delightful micro-animations, smooth card transitions, elevated hover effects
- ✨ **Refined Animations** — smooth entrance animations, playful interactions, bounce effects, polished state transitions
- 🎯 **Focus mode** — 25-minute focus session timer with toast notification on completion
- 📄 **PDF export** — generate a styled learning report with all goals, notes, reflections, and stats
- 📦 **Import / Export** — download or upload all data as JSON
- ♿ **Accessible** — focus-visible outlines, `prefers-reduced-motion` support, ARIA attributes
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
- **Delightful Hover States**: Cards lift, icons rotate and glow, buttons respond with polish
- **Touch-Friendly**: Tap feedback on mobile, smooth scrolling, accessible button sizes

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
