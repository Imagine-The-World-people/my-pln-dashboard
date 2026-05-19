// =============================================
// Kompass – Main Application
// =============================================

import { supabaseClient } from './supabase-config.js';
import Sortable from 'sortablejs';
// ES modules are always in strict mode — no 'use strict' needed

// =========================================
// Utilities
// =========================================

    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => root.querySelectorAll(sel);

    function escapeHtml(text) {
        const el = document.createElement('span');
        el.textContent = text;
        return el.innerHTML;
    }

    function formatDate(opts) {
        return new Date().toLocaleDateString('en-US', opts);
    }

    function formatDateTime(opts) {
        return new Date().toLocaleString('en-US', opts);
    }

    /** Returns a debounced version of fn — calls fire after ms ms of silence. */
    function debounce(fn, ms) {
        let t;
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), ms);
        };
    }

    /** Safe JSON wrapper around localStorage */
    const Store = {
        _onWrite: null,

        get(key, fallback = null) {
            try {
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : fallback;
            } catch { return fallback; }
        },
        set(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                if (this._onWrite) this._onWrite();
            }
            catch (e) { console.error(`Store.set("${key}") failed:`, e); }
        },
        getRaw(key) { return localStorage.getItem(key); },
        setRaw(key, value) { localStorage.setItem(key, value); }
    };

    // =========================================
    // Application State
    // =========================================

    const state = {
        goals: [],
        notes: [],
        reflections: [],
        dashboard: { totalGoals: 0, completedGoals: 0, notesCount: 0 }
    };

    const SECTION_ORDER = ['dashboard', 'goals', 'resources', 'notes', 'reflection', 'insights'];

    const SECTION_TITLES = {
        dashboard: 'Dashboard',
        goals: 'Learning Goals',
        resources: 'Resources',
        notes: 'Notes',
        reflection: 'Reflection',
        insights: 'Insights'
    };

    // =========================================
    // Toast Notification System
    // =========================================

    const Toast = {
        ICONS: { success: '\u2713', info: '\u2139', warning: '\u26A0', error: '\u2715' },
        DURATION: 3500,

        _detectType(title) {
            if (/delete|remove/i.test(title)) return 'info';
            if (/oops|empty|error|fail/i.test(title)) return 'warning';
            if (/save|add|complete|success/i.test(title)) return 'success';
            return 'info';
        },

        show(title, message, type) {
            const container = $('#notification-container');
            if (!container) return;

            type = type || this._detectType(title);
            const icon = this.ICONS[type] || this.ICONS.info;

            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.innerHTML = `
                <div class="toast-icon">${icon}</div>
                <div class="toast-body">
                    <div class="toast-title">${escapeHtml(title)}</div>
                    <div class="toast-message">${escapeHtml(message)}</div>
                </div>
                <button class="toast-close" aria-label="Dismiss">&times;</button>
                <div class="toast-progress"></div>
            `;

            container.appendChild(toast);
            requestAnimationFrame(() =>
                requestAnimationFrame(() => toast.classList.add('toast-visible'))
            );

            const dismiss = () => {
                if (toast.classList.contains('toast-exiting')) return;
                toast.classList.add('toast-exiting');
                toast.addEventListener('animationend', () => toast.remove(), { once: true });
            };

            toast.querySelector('.toast-close').addEventListener('click', dismiss);
            setTimeout(dismiss, this.DURATION);
        }
    };

    function notify(title, message, type) {
        Toast.show(title, message, type);
    }

    // =========================================
    // Undo Queue — soft-delete with 5s undo
    // =========================================

    const UndoQueue = {
        _pending: null,
        _timer: null,
        _toast: null,

        push(label, restoreFn, commitFn) {
            this._commit(); // flush any previous pending delete
            const container = document.getElementById('notification-container');
            if (!container) { commitFn(); return; }

            const toast = document.createElement('div');
            toast.className = 'toast toast-info toast-undo';
            toast.innerHTML = `
                <span class="toast-undo-label">${escapeHtml(label)}</span>
                <button class="toast-undo-btn" type="button">Undo</button>
            `;
            container.appendChild(toast);

            toast.querySelector('.toast-undo-btn').addEventListener('click', () => {
                clearTimeout(this._timer);
                toast.remove();
                this._pending = null;
                restoreFn();
            });

            // Fade out toast near end
            setTimeout(() => toast.classList.add('toast-exit'), 4500);
            this._timer = setTimeout(() => { toast.remove(); this._commit(); }, 5000);
            this._pending = { commitFn };
            this._toast = toast;
        },

        _commit() {
            if (!this._pending) return;
            clearTimeout(this._timer);
            this._pending.commitFn();
            this._pending = null;
            this._toast?.remove();
            this._toast = null;
        }
    };

    // =========================================
    // Navigation
    // =========================================

    const Navigation = {
        _scrollPositions: {},

        init() {
            const navMenu = $('.nav-menu');
            if (!navMenu) return;

            navMenu.addEventListener('click', (e) => {
                const item = e.target.closest('.nav-item');
                if (!item) return;
                this.switchTo(item.dataset.section, item);
            });

            // Bottom tab bar click handler
            const bottomNav = document.getElementById('mobile-bottom-nav');
            if (bottomNav) {
                bottomNav.addEventListener('click', (e) => {
                    const tab = e.target.closest('.mob-tab');
                    if (!tab) return;
                    this.switchTo(tab.dataset.section);
                });
            }

            // Scroll-aware header shadow
            const scrollCtr = $('.sections-container');
            const header = $('.header');
            if (scrollCtr && header) {
                scrollCtr.addEventListener('scroll', () => {
                    header.classList.toggle('scrolled', scrollCtr.scrollTop > 8);
                }, { passive: true });
            }
        },

        switchTo(sectionId, clickedItem) {
            const pageTitle = $('.page-title');
            const skeleton = document.getElementById('section-skeleton');

            // Determine slide direction based on nav order
            const currentSection = document.querySelector('.content-section.active');
            const oldId = currentSection?.id;

            // Save scroll position of the leaving section
            const _scrollCtr = $('.sections-container');
            if (oldId && _scrollCtr) {
                this._scrollPositions[oldId] = _scrollCtr.scrollTop;
            }

            const oldIdx = SECTION_ORDER.indexOf(oldId);
            const newIdx = SECTION_ORDER.indexOf(sectionId);
            const goingForward = oldIdx < 0 || newIdx > oldIdx;

            // Update nav items
            $$('.nav-item').forEach(n => n.classList.remove('active'));
            if (clickedItem) clickedItem.classList.add('active');
            // Sync sidebar nav item active state even when triggered from bottom bar
            const sidebarItem = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
            if (sidebarItem) sidebarItem.classList.add('active');
            // Sync bottom tab bar active state
            $$('.mob-tab').forEach(t => t.classList.remove('active'));
            const activeTab = document.querySelector(`.mob-tab[data-section="${sectionId}"]`);
            if (activeTab) activeTab.classList.add('active');

            // Show skeleton loader during transition
            if (skeleton) skeleton.classList.add('visible');

            // Exit current section
            if (currentSection) {
                currentSection.classList.add(goingForward ? 'leave-left' : 'leave-right');
                currentSection.classList.remove('active');
            }

            // Fade page title out
            if (pageTitle) {
                pageTitle.style.opacity = '0';
                pageTitle.style.transform = 'translateY(-4px)';
            }

            setTimeout(() => {
                // Clean up leave classes
                $$('.leave-left, .leave-right').forEach(s => {
                    s.classList.remove('leave-left', 'leave-right');
                });

                // Hide skeleton
                if (skeleton) skeleton.classList.remove('visible');

                // Enter new section
                const section = document.getElementById(sectionId);
                if (section) {
                    section.classList.add('active');
                    Navigation._staggerCards(section);
                }

                // Animate page title in
                if (pageTitle) {
                    pageTitle.textContent = SECTION_TITLES[sectionId] || 'Dashboard';
                    pageTitle.style.opacity = '1';
                    pageTitle.style.transform = 'translateY(0)';
                }

                // Refresh insights data when navigating to insights section
                if (sectionId === 'insights') {
                    Insights.refresh();
                    ActivityChart.render();
                    StreakCalendar.render();
                }

                const container = $('.sections-container');
                if (container) container.scrollTop = Navigation._scrollPositions[sectionId] || 0;

                // Progress ring entrance animation when visiting Goals
                if (sectionId === 'goals') {
                    const ring = document.getElementById('progress-ring-fill');
                    if (ring) {
                        const circumference = 2 * Math.PI * 52;
                        const savedOffset = ring.style.strokeDashoffset || String(circumference);
                        ring.style.transition = 'none';
                        ring.style.strokeDashoffset = String(circumference);
                        requestAnimationFrame(() => requestAnimationFrame(() => {
                            ring.style.transition = '';
                            ring.style.strokeDashoffset = savedOffset;
                        }));
                    }
                }
            }, 160);
        },

        updateBadges() {            const goals  = document.getElementById('badge-goals');
            const notes  = document.getElementById('badge-notes');
            const refls  = document.getElementById('badge-reflections');

            const activeGoals = state.goals.filter(g => !g.completed).length;
            const noteCount   = state.notes.length;
            const reflCount   = state.reflections.length;

            const set = (el, count) => {
                if (!el) return;
                if (count > 0) {
                    el.textContent = count > 99 ? '99+' : count;
                    el.classList.add('has-count');
                } else {
                    el.textContent = '';
                    el.classList.remove('has-count');
                }
            };

            set(goals, activeGoals);
            set(notes, noteCount);
            set(refls, reflCount);

            // Sync bottom tab bar badges
            const mobGoals = document.getElementById('mob-badge-goals');
            const mobNotes = document.getElementById('mob-badge-notes');
            const mobRefls = document.getElementById('mob-badge-reflections');

            const setMob = (el, count) => {
                if (!el) return;
                if (count > 0) {
                    el.textContent = count > 99 ? '99+' : count;
                    el.hidden = false;
                } else {
                    el.hidden = true;
                }
            };

            setMob(mobGoals, activeGoals);
            setMob(mobNotes, noteCount);
            setMob(mobRefls, reflCount);
        },

        /**
         * Stagger-animate individual cards within the newly active section.
         * Grid containers are excluded from childSlideUp (via CSS override) so their
         * children can each reveal independently with a cascading delay.
         */
        _staggerCards(section) {
            const sel = [
                '.stat-card', '.chart-card', '.summary-card',
                '.goal-item', '.note-card',
                '.resource-card:not(.hidden)', '.reflection-card',
                '.insights-kpi', '.insight-card', '.insights-progress-card'
            ].join(',');
            const cards = Array.from(section.querySelectorAll(sel));
            cards.forEach((card, i) => {
                const idx = Math.min(i, 10);
                const delay = Math.round(idx * 30 + (idx * idx * 1.2)) + 20;
                card.style.setProperty('--card-delay', `${delay}ms`);
                card.classList.remove('card-animate-in');
                void card.offsetWidth; // force reflow so re-triggering works
                card.classList.add('card-animate-in');
                card.addEventListener('animationend', () => {
                    card.classList.remove('card-animate-in');
                    card.style.removeProperty('--card-delay');
                }, { once: true });
            });
        }
    };

    // =========================================
    // Sidebar (responsive toggle)
    // =========================================

    const Sidebar = {
        init() {
            const toggle = $('#sidebar-toggle');
            const sidebar = $('.sidebar');
            const overlay = $('#sidebar-overlay');
            if (!toggle || !sidebar) return;

            const isMobile = () => window.innerWidth <= 768;

            // Desktop icon-rail collapse
            const collapseBtn = document.getElementById('sidebar-collapse-btn');
            if (collapseBtn) {
                if (!isMobile() && Store.getRaw('pln_sidebar_collapsed') === 'true') {
                    sidebar.classList.add('collapsed');
                }
                collapseBtn.addEventListener('click', () => {
                    const isCollapsed = sidebar.classList.toggle('collapsed');
                    Store.setRaw('pln_sidebar_collapsed', String(isCollapsed));
                });
            }

            const openSidebar = () => {
                sidebar.classList.remove('hidden');
                if (overlay) overlay.classList.add('active');
                toggle.setAttribute('aria-expanded', 'true');
            };

            const closeSidebar = () => {
                sidebar.classList.add('hidden');
                if (overlay) overlay.classList.remove('active');
                toggle.setAttribute('aria-expanded', 'false');
            };

            // Start hidden on mobile
            if (isMobile()) closeSidebar();

            toggle.addEventListener('click', () => {
                if (sidebar.classList.contains('hidden')) openSidebar();
                else closeSidebar();
            });

            // Close on overlay click
            if (overlay) overlay.addEventListener('click', closeSidebar);

            document.addEventListener('click', (e) => {
                if (!isMobile()) return;
                if (sidebar.contains(e.target) || toggle.contains(e.target)) return;
                if (!sidebar.classList.contains('hidden')) closeSidebar();
            });

            $('.nav-menu')?.addEventListener('click', (e) => {
                if (isMobile() && e.target.closest('.nav-item')) closeSidebar();
            });

            window.addEventListener('resize', () => {
                if (!isMobile()) {
                    sidebar.classList.remove('hidden');
                    if (overlay) overlay.classList.remove('active');
                    toggle.setAttribute('aria-expanded', 'true');
                } else {
                    sidebar.classList.remove('collapsed');
                }
            });
        }
    };

    // =========================================
    // Theme Toggle
    // =========================================

    const Theme = {
        init() {
            const btn = $('#theme-toggle-btn');
            const html = document.documentElement;

            const saved = Store.getRaw('pln_theme');
            const initial = saved || 'dark';
            html.setAttribute('data-theme', initial);
            this._updateButton(initial, btn);

            if (btn) {
                btn.addEventListener('click', () => {
                    const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
                    html.setAttribute('data-theme', next);
                    Store.setRaw('pln_theme', next);
                    this._updateButton(next, btn);
                    btn.style.transform = 'rotate(20deg)';
                    setTimeout(() => { btn.style.transform = ''; }, 300);
                });
            }

            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                if (!Store.getRaw('pln_theme')) {
                    const t = e.matches ? 'dark' : 'light';
                    html.setAttribute('data-theme', t);
                    this._updateButton(t, btn);
                }
            });
        },

        _updateButton(theme, btn) {
            if (!btn) return;
            btn.textContent = theme === 'dark' ? '🌙' : '☀️';
            btn.title = theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
        }
    };

    // =========================================
    // Dashboard
    // =========================================

    const Dashboard = {
        init() {
            this.refresh();
        },

        // Debounced: multiple rapid calls (from Goals + Notes on the same tick) coalesce into one.
        refresh: debounce(function () {
            const d = state.dashboard;
            // Summary cards stagger: 0 → 110 → 220 ms
            Dashboard.countUp('total-goals',      d.totalGoals,              700,   0);
            Dashboard.countUp('completed-goals',  d.completedGoals,          700, 110);
            Dashboard.countUp('notes-count',       d.notesCount,             700, 220);
            // Top stat row: slight offset so they don't all fire at once
            Dashboard.countUp('stat-goals',        d.totalGoals,             700,  40);
            Dashboard.countUp('stat-notes',        d.notesCount,             700, 160);
            Dashboard.countUp('stat-reflections',  state.reflections.length, 700, 280);
            Navigation.updateBadges();
            Insights.refresh();
            Suggestions.refresh();
            Dashboard._updateActivity();
        }, 50),

        _updateActivity() {
            const list = document.getElementById('activity-list');
            const empty = document.getElementById('activity-empty');
            if (!list) return;

            const ICONS = { goal: '🎯', note: '📝', reflection: '💬', complete: '✅' };
            const items = [];

            state.goals.slice(0, 8).forEach(g => {
                if (g.completed) {
                    items.push({ id: g.id, icon: ICONS.complete, text: `Completed: ${g.text}` });
                } else {
                    items.push({ id: g.id, icon: ICONS.goal, text: `Goal added: ${g.text}` });
                }
            });
            state.notes.slice(0, 8).forEach(n => {
                const preview = (n.content || '').replace(/\s+/g, ' ').trim().slice(0, 60);
                items.push({ id: n.id, icon: ICONS.note, text: `Note: ${preview || '(drawing)'}` });
            });
            state.reflections.slice(0, 8).forEach(r => {
                const preview = (r.content || r.text || '').replace(/\s+/g, ' ').trim().slice(0, 60);
                items.push({ id: r.id, icon: ICONS.reflection, text: `Reflection: ${preview || '…'}` });
            });

            items.sort((a, b) => b.id - a.id);
            const recent = items.slice(0, 5);

            if (recent.length === 0) {
                list.innerHTML = '';
                if (empty) empty.style.display = '';
            } else {
                if (empty) empty.style.display = 'none';
                list.innerHTML = recent.map(item =>
                    `<li><span class="activity-icon">${item.icon}</span><span class="activity-text">${escapeHtml(item.text)}</span></li>`
                ).join('');
            }
        },

        countUp(elementId, target, duration = 700, delay = 0) {
            const el = document.getElementById(elementId);
            if (!el) return;
            // Cancel any in-flight rAF loop or pending delayed start
            if (el._countRaf)   { cancelAnimationFrame(el._countRaf); el._countRaf = null; }
            if (el._countDelay) { clearTimeout(el._countDelay);        el._countDelay = null; }

            const run = () => {
                const start = parseInt(el.textContent, 10) || 0;
                const pop = () => {
                    el.classList.remove('stat-pop');
                    void el.offsetWidth;
                    el.classList.add('stat-pop');
                };
                if (start === target) { pop(); return; }
                const t0 = performance.now();
                const tick = (now) => {
                    const p = Math.min((now - t0) / duration, 1);
                    const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
                    el.textContent = Math.round(start + (target - start) * eased);
                    if (p < 1) {
                        el._countRaf = requestAnimationFrame(tick);
                    } else {
                        el._countRaf = null;
                        el.textContent = target;
                        pop();
                    }
                };
                el._countRaf = requestAnimationFrame(tick);
            };

            if (delay > 0) {
                el._countDelay = setTimeout(() => { el._countDelay = null; run(); }, delay);
            } else {
                run();
            }
        }
    };

    // =========================================
    // Smart Suggestions
    // =========================================

    const Suggestions = {
        refresh() {
            const container = document.getElementById('suggestions-list');
            if (!container) return;

            const items = this._gather();
            container.innerHTML = '';

            if (items.length === 0) {
                container.closest('.suggestions-section').classList.add('hidden');
                return;
            }

            container.closest('.suggestions-section').classList.remove('hidden');

            items.forEach((item, i) => {
                const li = document.createElement('li');
                li.className = 'suggestion-item';
                li.style.animationDelay = (i * 60) + 'ms';
                li.innerHTML = `
                    <span class="suggestion-icon">${item.icon}</span>
                    <span class="suggestion-text">${escapeHtml(item.text)}</span>
                    <button class="suggestion-action" data-section="${item.section}">${escapeHtml(item.action)}</button>
                `;
                li.querySelector('.suggestion-action').addEventListener('click', () => {
                    Navigation.switchTo(item.section);
                });
                container.appendChild(li);
            });
        },

        _gather() {
            const suggestions = [];
            const goals = state.goals;
            const notes = state.notes;
            const reflections = state.reflections;
            const resources = Store.get('pln_user_resources', []);

            if (goals.length === 0) {
                suggestions.push({
                    icon: '🎯',
                    text: I18n.t('suggestAddGoal'),
                    action: I18n.t('suggestGoToGoals'),
                    section: 'goals'
                });
            } else {
                const incomplete = goals.filter(g => !g.completed).length;
                if (incomplete > 0) {
                    suggestions.push({
                        icon: '⏳',
                        text: I18n.t('suggestIncompleteGoals').replace('{n}', incomplete),
                        action: I18n.t('suggestGoToGoals'),
                        section: 'goals'
                    });
                }
            }

            if (notes.length === 0) {
                suggestions.push({
                    icon: '📝',
                    text: I18n.t('suggestAddNote'),
                    action: I18n.t('suggestGoToNotes'),
                    section: 'notes'
                });
            }

            if (reflections.length === 0) {
                suggestions.push({
                    icon: '💭',
                    text: I18n.t('suggestAddReflection'),
                    action: I18n.t('suggestGoToReflection'),
                    section: 'reflection'
                });
            }

            if (resources.length === 0) {
                suggestions.push({
                    icon: '📚',
                    text: I18n.t('suggestAddResource'),
                    action: I18n.t('suggestGoToResources'),
                    section: 'resources'
                });
            }

            return suggestions;
        }
    };

    // =========================================
    // Learning Streak
    // =========================================

    const Streak = {
        _key: 'pln_streak',

        init() {
            const data = this._load();
            // Check if streak is still valid (today or yesterday)
            const today = this._today();
            if (data.lastDate && data.lastDate !== today) {
                const yesterday = this._dateStr(new Date(Date.now() - 86400000));
                if (data.lastDate !== yesterday) {
                    // Streak broken — reset
                    data.count = 0;
                    data.lastDate = null;
                    this._persist(data);
                }
            }
            this.render();
        },

        recordActivity() {
            const data = this._load();
            const today = this._today();
            if (data.lastDate === today) return; // Already recorded today

            const yesterday = this._dateStr(new Date(Date.now() - 86400000));
            if (data.lastDate === yesterday || data.count === 0) {
                data.count += 1;
            } else if (data.lastDate !== today) {
                data.count = 1; // Gap > 1 day — restart
            }
            data.lastDate = today;
            this._persist(data);
            this.render();
        },

        render() {
            const el = document.getElementById('streak-display');
            if (!el) return;
            const data = this._load();
            if (data.count > 0) {
                const dayLabel = data.count === 1 ? I18n.t('streakDay') : I18n.t('streakDays');
                el.textContent = `🔥 ${data.count}-${dayLabel}`;
                el.classList.add('visible');
            } else {
                el.classList.remove('visible');
            }
        },

        _today() {
            return this._dateStr(new Date());
        },

        _dateStr(d) {
            return d.getFullYear() + '-' +
                String(d.getMonth() + 1).padStart(2, '0') + '-' +
                String(d.getDate()).padStart(2, '0');
        },

        _load() {
            return Store.get(this._key, { count: 0, lastDate: null });
        },

        _persist(data) {
            Store.set(this._key, data);
        }
    };

    // =========================================
    // Learning Insights
    // =========================================

    const Insights = {
        refresh() {
            this._kpiCards();
            this._weeklyGoals();
            this._topResource();
            this._notesStats();
            this._quickStats();
            this._categoryBreakdown();
        },

        /** Update KPI hero cards + goal progress bar + spark bars */
        _kpiCards() {
            const total = state.goals.length;
            const completed = state.goals.filter(g => g.completed).length;
            const pct = total ? Math.round((completed / total) * 100) : 0;
            const resources = Store.get('pln_user_resources', []);
            const reflections = state.reflections ? state.reflections.length : 0;
            const notesLen = state.notes.length;

            Dashboard.countUp('kpi-total-goals', total, 600, 0);
            Dashboard.countUp('kpi-completed-goals', completed, 600, 60);
            Dashboard.countUp('kpi-total-notes', notesLen, 600, 120);
            Dashboard.countUp('kpi-total-reflections', reflections, 600, 180);
            Dashboard.countUp('kpi-total-resources', resources.length, 600, 240);

            const pctEl = document.getElementById('kpi-goal-pct');
            if (pctEl) pctEl.textContent = pct + '%';

            const bar = document.getElementById('kpi-goal-bar');
            if (bar) requestAnimationFrame(() => { bar.style.width = pct + '%'; });

            const detail = document.getElementById('kpi-goal-detail');
            if (detail) detail.textContent = `${completed} / ${total}`;

            // Spark bars — show proportional fill per KPI
            const maxItems = Math.max(total, notesLen, reflections, resources.length, 1);
            this._setSpark('kpi-spark-goals', total, maxItems);
            this._setSpark('kpi-spark-completed', completed, maxItems);
            this._setSpark('kpi-spark-notes', notesLen, maxItems);
            this._setSpark('kpi-spark-reflections', reflections, maxItems);
            this._setSpark('kpi-spark-resources', resources.length, maxItems);
        },

        /** Quick Stats: streak, best day, avg rating, overdue */
        _quickStats() {
            const data = ActivityTracker.getLast(84);
            // Current streak — consecutive days with activity, skipping today if no activity yet
            let streak = 0;
            let startIdx = data.length - 1;
            if (startIdx >= 0 && data[startIdx].count === 0) startIdx--;
            for (let i = startIdx; i >= 0; i--) {
                if (data[i].count > 0) streak++;
                else break;
            }
            const streakEl = $('#qs-streak');
            if (streakEl) Dashboard.countUp('qs-streak', streak, 600, 0);

            // Best day of week
            const dayTotals = [0, 0, 0, 0, 0, 0, 0];
            data.forEach(d => { dayTotals[d.day.getDay()] += d.count; });
            const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const bestDayIdx = dayTotals.indexOf(Math.max(...dayTotals));
            const bestDayEl = $('#qs-best-day');
            if (bestDayEl) bestDayEl.textContent = dayTotals[bestDayIdx] > 0 ? DAY_NAMES[bestDayIdx] : '—';

            // Avg resource rating
            const resources = Store.get('pln_user_resources', []);
            const rated = resources.filter(r => r.rating && r.rating > 0);
            const avg = rated.length
                ? (rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(1)
                : null;
            const ratingEl = $('#qs-avg-rating');
            if (ratingEl) ratingEl.textContent = avg ? `${avg} ★` : '—';

            // Overdue goals
            const todayStr = new Date().toISOString().slice(0, 10);
            const overdue = state.goals.filter(g => !g.completed && g.deadline && g.deadline < todayStr).length;
            const overdueEl = $('#qs-overdue');
            if (overdueEl) overdueEl.textContent = overdue;
            const overdueCard = $('#qs-overdue-card');
            if (overdueCard) overdueCard.classList.toggle('quick-stat--has-overdue', overdue > 0);
        },

        /** Goal category breakdown horizontal bars */
        _categoryBreakdown() {
            const container = $('#insights-category-bars');
            if (!container) return;
            const CATS = {
                coding:   { label: '💻 Coding',    color: '#7c8fff' },
                school:   { label: '📚 School',    color: '#a78bfa' },
                personal: { label: '⭐ Personal',  color: '#f59e0b' },
                reading:  { label: '📖 Reading',   color: '#34d399' },
                health:   { label: '💪 Health',    color: '#f87171' },
                other:    { label: '· Other',      color: '#94a3b8' },
            };
            const counts = {}, done = {};
            state.goals.forEach(g => {
                const c = g.category || 'other';
                counts[c] = (counts[c] || 0) + 1;
                if (g.completed) done[c] = (done[c] || 0) + 1;
            });
            const maxCount = Math.max(...Object.values(counts), 1);
            container.innerHTML = '';
            if (!Object.keys(counts).length) {
                container.innerHTML = '<span style="font-size:13px;color:var(--text-tertiary)">No goals yet.</span>';
                return;
            }
            Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
                const cfg = CATS[cat] || CATS.other;
                const pct = Math.round((count / maxCount) * 100);
                const doneCnt = done[cat] || 0;
                const row = document.createElement('div');
                row.className = 'cat-breakdown-row';
                row.innerHTML = `
                    <span class="cat-breakdown-label">${cfg.label}</span>
                    <div class="cat-breakdown-track">
                        <div class="cat-breakdown-bar" style="background:${cfg.color};width:0%"></div>
                    </div>
                    <span class="cat-breakdown-count">${doneCnt}/${count}</span>
                `;
                container.appendChild(row);
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    row.querySelector('.cat-breakdown-bar').style.width = pct + '%';
                }));
            });
        },

        /** Animate a spark bar pseudo-element by setting a CSS custom property */
        _setSpark(id, value, max) {
            const el = document.getElementById(id);
            if (!el) return;
            const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0;
            // Use ::after width via inline style on the container
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    el.style.setProperty('--spark-w', pct + '%');
                });
            });
        },

        /** Count goals completed in the last 7 days */
        _weeklyGoals() {
            const now = Date.now();
            const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
            // Goals use `id: Date.now()` at creation, so we can approximate timing
            const completed = state.goals.filter(g => g.completed && g.id >= weekAgo);
            const count = completed.length;
            const total = state.goals.filter(g => g.completed).length || 1;

            const el = document.getElementById('insight-weekly-goals');
            if (el) Dashboard.countUp('insight-weekly-goals', count, 600, 60);

            const bar = document.getElementById('insight-weekly-bar');
            if (bar) {
                const pct = Math.min(Math.round((count / Math.max(state.goals.length, 1)) * 100), 100);
                requestAnimationFrame(() => { bar.style.width = pct + '%'; });
            }
        },

        /** Find the most-used resource type and build breakdown bars */
        _topResource() {
            const resources = Store.get('pln_user_resources', []);
            const counts = {};
            resources.forEach(r => {
                const t = (r.type || 'other').toLowerCase();
                counts[t] = (counts[t] || 0) + 1;
            });

            const types = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            const top = types[0];
            const totalRes = resources.length || 1;

            const TYPE_LABELS = { youtube: 'YouTube', blog: 'Blog', podcast: 'Podcast' };

            const el = document.getElementById('insight-top-resource');
            if (el) el.textContent = top ? (TYPE_LABELS[top[0]] || top[0]) : '—';

            const breakdown = document.getElementById('insight-resource-breakdown');
            if (!breakdown) return;
            breakdown.innerHTML = '';

            types.forEach(([type, count]) => {
                const pct = Math.round((count / totalRes) * 100);
                const label = TYPE_LABELS[type] || type;
                const validType = ['youtube', 'blog', 'podcast'].includes(type) ? type : 'other';
                const row = document.createElement('div');
                row.className = 'insight-breakdown-row';
                row.innerHTML = `
                    <span class="insight-breakdown-label">${escapeHtml(label)}</span>
                    <div class="insight-breakdown-track">
                        <div class="insight-breakdown-bar insight-breakdown-bar--${validType}" style="width: 0%"></div>
                    </div>
                    <span class="insight-breakdown-count">${count}</span>
                `;
                breakdown.appendChild(row);
                // Animate bar after paint
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        row.querySelector('.insight-breakdown-bar').style.width = pct + '%';
                    });
                });
            });

            if (types.length === 0) {
                breakdown.innerHTML = '<span style="font-size:12px;color:var(--text-tertiary)">—</span>';
            }
        },

        /** Notes count + total words + drawings count */
        _notesStats() {
            const notes = state.notes;
            Dashboard.countUp('insight-notes-count', notes.length, 600, 120);

            const totalWords = notes.reduce((sum, n) => sum + (n.wordCount || 0), 0);
            Dashboard.countUp('insight-words-value', totalWords, 800, 200);

            const drawings = notes.filter(n => n.drawing).length;
            Dashboard.countUp('insight-drawings-value', drawings, 600, 260);
        }
    };

    // =========================================
    // Goals Module
    // =========================================

    const GOAL_CATEGORIES = {
        coding:   '💻 Coding',
        school:   '📚 School',
        personal: '⭐ Personal',
        reading:  '📖 Reading',
        health:   '💪 Health',
        other:    '• Other'
    };

    const Goals = {
        STORE_KEY: 'pln_goals',
        _filter: { search: '', status: 'all', sort: 'newest' },

        init() {
            state.goals = Store.get(this.STORE_KEY, []);
            this._bindEvents();
            this.render();
            this.updateProgress();
        },

        _bindEvents() {
            const input = $('#goal-input');
            const btn = $('#add-goal-btn');
            const list = $('#goals-list');
            const picker = $('#goal-category-picker');

            btn?.addEventListener('click', () => this.add());
            input?.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.add();
            });

            // Category picker pill selection
            picker?.addEventListener('click', (e) => {
                const pill = e.target.closest('.cat-pill');
                if (!pill) return;
                picker.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
            });

            // Goal item actions: delete, edit, save, cancel, milestones, details
            list?.addEventListener('click', (e) => {
                const deleteBtn   = e.target.closest('.goal-delete-btn');
                const editBtn     = e.target.closest('.goal-edit-btn');
                const saveBtn     = e.target.closest('.goal-save-btn');
                const cancelBtn   = e.target.closest('.goal-cancel-btn');
                const msToggle    = e.target.closest('.milestones-toggle-btn');
                const msCb        = e.target.closest('.milestone-checkbox');
                const msDelBtn    = e.target.closest('.milestone-delete-btn');
                const msAddBtn    = e.target.closest('.milestone-add-btn');
                const goalTextEl  = e.target.closest('.goal-text');

                if (deleteBtn) this.delete(parseInt(deleteBtn.dataset.goalId));
                if (editBtn)   this.edit(parseInt(editBtn.dataset.goalId));
                if (saveBtn)   this._saveEdit(parseInt(saveBtn.dataset.goalId));
                if (cancelBtn) this._cancelEdit(parseInt(cancelBtn.dataset.goalId));

                if (msToggle) {
                    const gId = msToggle.dataset.goalId;
                    const body = list.querySelector(`.milestone-list-body[data-goal-id="${gId}"]`);
                    if (body) {
                        body.classList.toggle('open');
                        msToggle.classList.toggle('open', body.classList.contains('open'));
                        msToggle.setAttribute('aria-expanded', String(body.classList.contains('open')));
                    }
                    return;
                }

                if (msCb) {
                    this._toggleMilestone(Number(msCb.dataset.goalId), msCb.dataset.milestoneId);
                    return;
                }

                if (msDelBtn) {
                    this._deleteMilestone(Number(msDelBtn.dataset.goalId), msDelBtn.dataset.milestoneId);
                    return;
                }

                if (msAddBtn) {
                    const gId = Number(msAddBtn.dataset.goalId);
                    const inp = list.querySelector(`.milestone-add-input[data-goal-id="${gId}"]`);
                    if (inp?.value.trim()) {
                        const wasOpen = list.querySelector(`.milestone-list-body[data-goal-id="${gId}"]`)?.classList.contains('open');
                        this._addMilestone(gId, inp.value.trim());
                        inp.value = '';
                        // Re-open the list after add
                        if (wasOpen) {
                            const newBody = list.querySelector(`.milestone-list-body[data-goal-id="${gId}"]`);
                            if (newBody) { newBody.classList.add('open'); }
                        }
                    } else { inp?.focus(); }
                    return;
                }

                if (goalTextEl && !e.target.closest('.goal-edit-btn') && !e.target.closest('.goal-delete-btn')) {
                    const gId = Number(goalTextEl.dataset.goalId);
                    if (!isNaN(gId)) GoalDetailDrawer.open(gId);
                    return;
                }
            });

            // Milestone add on Enter key
            list?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.target.classList.contains('milestone-add-input')) {
                    e.preventDefault();
                    const gId = Number(e.target.dataset.goalId);
                    if (e.target.value.trim()) {
                        const wasOpen = list.querySelector(`.milestone-list-body[data-goal-id="${gId}"]`)?.classList.contains('open');
                        this._addMilestone(gId, e.target.value.trim());
                        e.target.value = '';
                        if (wasOpen) {
                            const newBody = list.querySelector(`.milestone-list-body[data-goal-id="${gId}"]`);
                            if (newBody) newBody.classList.add('open');
                        }
                    }
                    return;
                }
            });

            // Keyboard shortcuts inside inline edit
            list?.addEventListener('keydown', (e) => {
                const inp = e.target.closest('.goal-edit-input');
                if (!inp) return;
                const id = parseInt(inp.closest('.goal-item')?.id?.replace('goal-', ''));
                if (!id) return;
                if (e.key === 'Enter')  { e.preventDefault(); this._saveEdit(id); }
                if (e.key === 'Escape') this._cancelEdit(id);
            });

            list?.addEventListener('change', (e) => {
                if (e.target.matches('.goal-checkbox')) {
                    this.toggleComplete(parseInt(e.target.dataset.goalId));
                }
            });

            // --- Filter bar ---
            $('#goals-search')?.addEventListener('input', e => {
                this._filter.search = e.target.value.trim().toLowerCase();
                this.render();
            });

            $$('.gstab').forEach(tab => {
                tab.addEventListener('click', () => {
                    $$('.gstab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    this._filter.status = tab.dataset.status;
                    this.render();
                });
            });

            $('#goals-sort')?.addEventListener('change', e => {
                this._filter.sort = e.target.value;
                this.render();
            });
        },

        _applyFilter(goals) {
            let list = [...goals];
            const { search, status, sort } = this._filter;

            if (search) {
                list = list.filter(g => g.text.toLowerCase().includes(search));
            }
            if (status === 'active') list = list.filter(g => !g.completed);
            if (status === 'done')   list = list.filter(g => g.completed);

            if (sort === 'deadline') {
                list.sort((a, b) => {
                    if (!a.deadline && !b.deadline) return 0;
                    if (!a.deadline) return 1;
                    if (!b.deadline) return -1;
                    return a.deadline.localeCompare(b.deadline);
                });
            } else if (sort === 'az') {
                list.sort((a, b) => a.text.localeCompare(b.text));
            } else if (sort === 'category') {
                list.sort((a, b) => (a.category || '').localeCompare(b.category || ''));
            }
            // 'newest' keeps insertion order (goals are unshifted on add)
            return list;
        },

        add() {
            const input = $('#goal-input');
            const text = input?.value.trim();
            if (!text) {
                notify('Oops!', 'Please enter a goal before adding');
                return;
            }

            const activePill = document.querySelector('#goal-category-picker .cat-pill.active');
            const category = activePill?.dataset.cat || 'coding';

            const deadlineInput = $('#goal-deadline');
            const deadline = deadlineInput?.value || null;

            const goal = {
                id: Date.now(),
                text,
                category,
                deadline,
                completed: false,
                createdAt: formatDate({ month: 'short', day: 'numeric', year: 'numeric' })
            };

            state.goals.unshift(goal);
            this._save();
            this.render();
            this.updateProgress();
            Streak.recordActivity();
            ActivityTracker.record();
            ActivityChart.render();
            StreakCalendar.render();
            input.value = '';
            if (deadlineInput) deadlineInput.value = '';
            input.focus();
            notify('Goal Added! 🎯', `"${goal.text}" has been added to your learning goals`);
            // Animate only the new item
            const first = $('#goals-list')?.firstElementChild;
            if (first) {
                first.classList.add('new-item');
                first.addEventListener('animationend', () => first.classList.remove('new-item'), { once: true });
            }
        },

        delete(id) {
            const goal = state.goals.find(g => g.id === id);
            if (!goal) return;
            const idx = state.goals.indexOf(goal);
            const el = document.getElementById(`goal-${id}`);

            const doDelete = () => {
                state.goals = state.goals.filter(g => g.id !== id);
                this.render();
                this.updateProgress();
                const label = `"${goal.text.slice(0, 40)}${goal.text.length > 40 ? '…' : ''}" deleted`;
                UndoQueue.push(
                    label,
                    () => {
                        state.goals.splice(idx, 0, goal);
                        this._save();
                        this.render();
                        this.updateProgress();
                        notify('↩ Restored', `Goal restored successfully`, 'success');
                    },
                    () => { this._save(); Dashboard.refresh(); }
                );
            };

            if (el) {
                el.classList.add('deleting');
                setTimeout(doDelete, 280);
            } else {
                doDelete();
            }
        },

        toggleComplete(id) {
            const goal = state.goals.find(g => g.id === id);
            if (!goal) return;
            goal.completed = !goal.completed;
            this._save();

            // Patch the existing DOM element — no full re-render needed for a toggle
            const el = document.getElementById(`goal-${id}`);
            if (el) {
                el.classList.toggle('completed', goal.completed);
                const cb = el.querySelector('.goal-checkbox');
                if (cb) cb.checked = goal.completed;
                el.classList.add('completing');
                el.addEventListener('animationend', () => el.classList.remove('completing'), { once: true });
            } else {
                this.render(); // fallback if element is somehow missing
            }

            this.updateProgress();
            if (goal.completed) {
                notify('Goal Completed! 🎉', `Great job completing "${goal.text}"`);
            }
        },

        render() {
            const list = $('#goals-list');
            const empty = $('#empty-state');
            if (!list) return;

            if (state.goals.length === 0) {
                list.innerHTML = '';
                empty?.classList.add('show');
                return;
            }

            const filtered = this._applyFilter(state.goals);

            if (filtered.length === 0) {
                empty?.classList.add('show');
                list.innerHTML = `
                    <div class="goals-filter-empty">
                        <span>🔍</span>
                        <p>No goals match your filter.</p>
                        <button class="goals-filter-clear-btn" id="goals-filter-clear">Clear filters</button>
                    </div>`;
                // clear button
                $('#goals-filter-clear')?.addEventListener('click', () => {
                    this._filter = { search: '', status: 'all', sort: 'newest' };
                    const searchEl = $('#goals-search');
                    if (searchEl) searchEl.value = '';
                    $$('.gstab').forEach(t => t.classList.toggle('active', t.dataset.status === 'all'));
                    const sortEl = $('#goals-sort');
                    if (sortEl) sortEl.value = 'newest';
                    this.render();
                });
                return;
            }

            empty?.classList.remove('show');
            list.innerHTML = filtered.map(g => `
                <div class="goal-item ${g.completed ? 'completed' : ''}" id="goal-${g.id}">
                    <div class="goal-drag-handle" style="cursor: grab; color: var(--text-tertiary); padding: 0 10px 0 0; display: flex; align-items: center;" aria-label="Drag to reorder">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>
                    </div>
                    <input type="checkbox" class="goal-checkbox"
                        ${g.completed ? 'checked' : ''} data-goal-id="${g.id}">
                    <div class="goal-content">${this._contentHtml(g)}</div>
                    <div class="goal-actions">${this._actionsHtml(g.id)}</div>
                </div>
            `).join('');
            
            if (this._sortable) { this._sortable.destroy(); this._sortable = null; }
            
            // Only allow dragging when viewing all goals in newest order to prevent data corruption
            const canDrag = this._filter.status === 'all' && this._filter.sort === 'newest';
            
            if (canDrag) {
                this._sortable = Sortable.create(list, {
                    animation: 200, // Smoother glide animation
                    handle: '.goal-drag-handle',
                    easing: "cubic-bezier(0.25, 1, 0.5, 1)",
                    ghostClass: "sortable-ghost",
                    dragClass: "sortable-drag",
                    onEnd: (evt) => {
                        const goalIdsInDom = Array.from(list.children).map(el => Number(el.id.replace('goal-', '')));
                        const newGoals = [];
                        
                        goalIdsInDom.forEach(id => {
                            const goal = state.goals.find(g => g.id === id);
                            if (goal) newGoals.push(goal);
                        });
                        
                        state.goals.forEach(goal => {
                            if (!goalIdsInDom.includes(goal.id)) {
                                newGoals.push(goal);
                            }
                        });
                        
                        state.goals = newGoals;
                        this._save();
                        // Force immediate sync to Supabase so it does not get overwritten by premature reloads
                        if (typeof CloudSync !== 'undefined') CloudSync.scheduleSave(true);
                    }
                });
            }
        },

        _tagHtml(category) {
            if (!category) return '';
            const label = GOAL_CATEGORIES[category];
            if (!label) return '';
            return `<span class="goal-tag goal-tag--${category}">${label}</span>`;
        },

        _contentHtml(goal) {
            return `
                <div class="goal-top-row">
                    <p class="goal-text" data-goal-id="${goal.id}" style="cursor:pointer" title="Open details">${escapeHtml(goal.text)}</p>
                    ${this._tagHtml(goal.category)}
                    ${this._deadlineBadge(goal.deadline)}
                </div>
                <span class="goal-date">📅 ${goal.createdAt}</span>
                ${this._milestonesHtml(goal)}
            `;
        },

        _milestonesHtml(goal) {
            const ms = goal.milestones || [];
            const done = ms.filter(m => m.done).length;
            const pct  = ms.length ? Math.round(done / ms.length * 100) : 0;
            const msListHtml = ms.map(m => `
                <div class="milestone-item${m.done ? ' done' : ''}" data-milestone-id="${m.id}">
                    <input type="checkbox" class="milestone-checkbox" ${m.done ? 'checked' : ''} data-goal-id="${goal.id}" data-milestone-id="${m.id}" aria-label="${escapeHtml(m.text)}">
                    <span class="milestone-text">${escapeHtml(m.text)}</span>
                    <button class="milestone-delete-btn" data-goal-id="${goal.id}" data-milestone-id="${m.id}" aria-label="Delete step">&times;</button>
                </div>`).join('');
            return `
                <div class="goal-milestones" data-goal-id="${goal.id}">
                    <div class="milestone-header-row">
                        <button class="milestones-toggle-btn" data-goal-id="${goal.id}" aria-expanded="false">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
                            ${ms.length ? `${done}/${ms.length} steps` : 'Add steps'}
                        </button>
                        ${ms.length ? `
                        <div class="milestone-progress-bar-wrap">
                            <div class="milestone-progress-fill" style="width:${pct}%"></div>
                        </div>
                        <span class="milestone-progress-mini">${pct}%</span>` : ''}
                    </div>
                    <div class="milestone-list-body" data-goal-id="${goal.id}">
                        ${msListHtml}
                        <div class="milestone-add-row">
                            <input type="text" class="milestone-add-input" placeholder="Add a step…" maxlength="80" data-goal-id="${goal.id}">
                            <button class="milestone-add-btn" data-goal-id="${goal.id}">+ Add</button>
                        </div>
                    </div>
                </div>`;
        },

        _addMilestone(goalId, text) {
            const goal = state.goals.find(g => g.id === goalId);
            if (!goal) return;
            if (!goal.milestones) goal.milestones = [];
            goal.milestones.push({ id: String(Date.now()), text, done: false });
            this._save();
            this._rerenderContent(goalId);
        },

        _toggleMilestone(goalId, milestoneId) {
            const goal = state.goals.find(g => g.id === goalId);
            if (!goal?.milestones) return;
            const ms = goal.milestones.find(m => m.id === milestoneId);
            if (ms) { ms.done = !ms.done; this._save(); this._rerenderContent(goalId); }
        },

        _deleteMilestone(goalId, milestoneId) {
            const goal = state.goals.find(g => g.id === goalId);
            if (!goal?.milestones) return;
            goal.milestones = goal.milestones.filter(m => m.id !== milestoneId);
            this._save();
            this._rerenderContent(goalId);
        },

        _rerenderContent(goalId) {
            // Partial DOM update: only replace goal-content without a full list re-render
            const el = document.getElementById(`goal-${goalId}`);
            const goal = state.goals.find(g => g.id === goalId);
            if (!el || !goal) return;
            // Preserve open state of milestone body
            const wasOpen = el.querySelector('.milestone-list-body')?.classList.contains('open');
            const contentEl = el.querySelector('.goal-content');
            if (contentEl) contentEl.innerHTML = this._contentHtml(goal);
            if (wasOpen) {
                const body = el.querySelector('.milestone-list-body');
                const toggle = el.querySelector('.milestones-toggle-btn');
                if (body) { body.classList.add('open'); }
                if (toggle) { toggle.classList.add('open'); toggle.setAttribute('aria-expanded', 'true'); }
            }
        },

        _deadlineBadge(deadline) {
            if (!deadline) return '';
            const today = new Date().toISOString().slice(0, 10);
            const isOverdue = deadline < today;
            const isSoon = !isOverdue && deadline <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
            const label = new Date(deadline + 'T00:00:00').toLocaleDateString('no-NO', { day: 'numeric', month: 'short' });
            const cls = isOverdue ? 'goal-deadline-badge--overdue' : isSoon ? 'goal-deadline-badge--soon' : '';
            const icon = isOverdue ? '⚠️' : isSoon ? '⏰' : '📅';
            return `<span class="goal-deadline-badge ${cls}">${icon} ${label}</span>`;
        },

        _actionsHtml(id) {
            return `
                <button class="goal-edit-btn" data-goal-id="${id}" aria-label="Edit goal">Edit</button>
                <button class="goal-delete-btn" data-goal-id="${id}">Delete</button>
            `;
        },

        _renderItem(el, goal) {
            el.querySelector('.goal-content').innerHTML = this._contentHtml(goal);
            el.querySelector('.goal-actions').innerHTML = this._actionsHtml(goal.id);
        },

        edit(id) {
            const goal = state.goals.find(g => g.id === id);
            if (!goal) return;
            const el = document.getElementById(`goal-${id}`);
            if (!el) return;

            // Cancel any other open inline edits first
            document.querySelectorAll('.goal-item.editing').forEach(other => {
                const otherId = parseInt(other.id.replace('goal-', ''));
                if (otherId !== id) this._cancelEdit(otherId);
            });

            el.classList.add('editing');

            const catOptions = Object.entries(GOAL_CATEGORIES)
                .map(([val, label]) =>
                    `<option value="${val}"${val === (goal.category || 'coding') ? ' selected' : ''}>${label}</option>`)
                .join('');

            el.querySelector('.goal-content').innerHTML = `
                <div class="goal-edit-row">
                    <input type="text" class="goal-edit-input" value="${escapeHtml(goal.text)}" maxlength="120" aria-label="Edit goal text">
                    <select class="goal-edit-category" aria-label="Goal category">${catOptions}</select>
                </div>
            `;
            el.querySelector('.goal-actions').innerHTML = `
                <button class="goal-save-btn" data-goal-id="${id}">Save</button>
                <button class="goal-cancel-btn" data-goal-id="${id}">Cancel</button>
            `;
            el.querySelector('.goal-edit-input')?.focus();
        },

        _saveEdit(id) {
            const el = document.getElementById(`goal-${id}`);
            if (!el) return;
            const input = el.querySelector('.goal-edit-input');
            const catSelect = el.querySelector('.goal-edit-category');
            const newText = input?.value.trim();
            if (!newText) { input?.focus(); return; }

            const goal = state.goals.find(g => g.id === id);
            if (!goal) return;
            goal.text = newText;
            goal.category = catSelect?.value || goal.category || 'other';
            this._save();

            el.classList.remove('editing');
            this._renderItem(el, goal);
            el.classList.add('completing');
            el.addEventListener('animationend', () => el.classList.remove('completing'), { once: true });
            notify('Goal Updated ✏️', 'Your goal has been updated');
        },

        _cancelEdit(id) {
            const el = document.getElementById(`goal-${id}`);
            if (!el) return;
            const goal = state.goals.find(g => g.id === id);
            if (!goal) return;
            el.classList.remove('editing');
            this._renderItem(el, goal);
        },

        updateProgress() {
            const total = state.goals.length;
            const done = state.goals.filter(g => g.completed).length;
            const pct = total === 0 ? 0 : Math.round((done / total) * 100);

            const fill = $('#progress-fill-large');
            const pctEl = $('#progress-percentage');
            const doneEl = $('#completed-count');
            const totalEl = $('#total-count');

            if (fill) fill.style.width = pct + '%';
            if (pctEl) pctEl.textContent = pct + '%';
            if (doneEl) doneEl.textContent = done;
            if (totalEl) totalEl.textContent = total;

            // SVG progress ring — color shifts at milestones
            const ring = document.getElementById('progress-ring-fill');
            const wrap = document.querySelector('.progress-circle-wrap');
            if (ring) {
                const circumference = 2 * Math.PI * 52; // 326.73
                ring.style.strokeDashoffset = circumference * (1 - pct / 100);

                if (pct === 100 && total > 0) {
                    ring.style.stroke = '#10b981';
                    if (wrap && !wrap.classList.contains('ring-at-100')) {
                        wrap.classList.add('ring-at-100');
                        wrap.addEventListener('animationend', () => wrap.classList.remove('ring-at-100'), { once: true });
                    }
                } else {
                    ring.style.stroke = pct >= 70 ? '#a855f7' : '';
                    wrap?.classList.remove('ring-at-100');
                }
            }

            // Dashboard progress bar
            const dashFill = document.getElementById('dash-progress-fill');
            const dashText = document.getElementById('dash-progress-text');
            if (dashFill) dashFill.style.width = pct + '%';
            if (dashText) dashText.textContent = pct;

            state.dashboard.totalGoals = total;
            state.dashboard.completedGoals = done;
            Dashboard.refresh();
        },

        _save() {
            Store.set(this.STORE_KEY, state.goals);
        }
    };

    // =========================================
    // Resources Filtering Module
    // =========================================

    const Resources = {
        STORE_KEY: 'pln_user_resources',
        _searchTerm: '',
        _activeTag: null,
        _activeCat: 'all',

        init() {
            const filterContainer = $('.filter-section');
            if (!filterContainer) return;

            // Initialize resource groups (collections) first
            ResourceGroups.init();

            // Load user-added resources from localStorage
            const saved = Store.get(this.STORE_KEY, []);
            saved.forEach(r => this._appendCard(r));

            // Initialize resource count from actual DOM
            this._updateCount();

            // Initialize stat card
            const resCount = $$('.resource-card').length;
            const statRes = document.getElementById('stat-resources');
            if (statRes) Dashboard.countUp('stat-resources', resCount);

            // Filter buttons
            filterContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.filter-btn');
                if (!btn) return;
                $$('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._applyFilters(btn.dataset.filter);
            });

            // Category filter buttons
            const catBtnContainer = $('#filter-cat-buttons');
            catBtnContainer?.addEventListener('click', (e) => {
                const btn = e.target.closest('.cat-filter-btn');
                if (!btn) return;
                $$('.cat-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._activeCat = btn.dataset.cat || 'all';
                this._applyFilters();
            });

            // Search
            const searchInput = $('#resource-search');
            searchInput?.addEventListener('input', debounce(() => {
                this._searchTerm = searchInput.value.trim().toLowerCase();
                this._applyFilters();
            }, 200));

            // Tag click (event delegation on grid)
            const grid = $('#resources-grid');
            grid?.addEventListener('click', (e) => {
                // Open detail modal when clicking the card body (not on interactive elements)
                const card = e.target.closest('.resource-card');
                if (card && !e.target.closest('.resource-delete-btn, .resource-edit-btn, .resource-link, .resource-tag')) {
                    this._openModal(card.dataset.id);
                    return;
                }

                // Tag toggle
                const tag = e.target.closest('.resource-tag');
                if (tag) {
                    const tagVal = tag.dataset.tag?.toLowerCase();
                    if (this._activeTag === tagVal) {
                        this._activeTag = null;
                        $$('.resource-tag.active-tag').forEach(t => t.classList.remove('active-tag'));
                    } else {
                        this._activeTag = tagVal;
                        $$('.resource-tag.active-tag').forEach(t => t.classList.remove('active-tag'));
                        $$('.resource-tag').forEach(t => {
                            if (t.dataset.tag?.toLowerCase() === tagVal) t.classList.add('active-tag');
                        });
                    }
                    this._applyFilters();
                    return;
                }

                // Resource link
                const link = e.target.closest('.resource-link');
                if (link) {
                    const card = link.closest('.resource-card');
                    const url = card?.dataset.url;
                    if (url) { window.open(url, '_blank', 'noopener'); return; }
                    e.preventDefault();
                    const title = card?.querySelector('h3')?.textContent;
                    notify('Open Resource', `Opening: ${title}`);
                    return;
                }

                // Delete any resource card
                const delBtn = e.target.closest('.resource-delete-btn');
                if (delBtn) {
                    const card = delBtn.closest('.resource-card');
                    if (!card) return;
                    const id = card.dataset.id;
                    const list = Store.get(this.STORE_KEY, []);
                    const resource = id ? list.find(r => String(r.id) === id) : null;
                    const idx = resource ? list.indexOf(resource) : -1;
                    card.classList.add('card-out');
                    setTimeout(() => {
                        card.remove();
                        Store.set(this.STORE_KEY, list.filter(r => String(r.id) !== id));
                        this._updateCount();
                        this._toggleEmpty();
                        if (resource) {
                            UndoQueue.push(
                                `"${(resource.title || resource.url || 'Resource').slice(0, 40)}" deleted`,
                                () => {
                                    const cur = Store.get(this.STORE_KEY, []);
                                    cur.splice(Math.min(idx, cur.length), 0, resource);
                                    Store.set(this.STORE_KEY, cur);
                                    this.render();
                                    notify('↩ Restored', `Resource restored successfully`, 'success');
                                },
                                () => {}
                            );
                        }
                    }, 280);
                    return;
                }

                // Edit resource card
                const editBtn = e.target.closest('.resource-edit-btn');
                if (editBtn) {
                    const card = editBtn.closest('.resource-card');
                    if (!card) return;
                    this._editResource(card.dataset.id);
                    return;
                }
            });

            // Add Resource – inline collapsible panel
            const panel = $('#resource-add-panel');
            const openBtn = $('#add-resource-btn');
            const closeBtn = $('#resource-panel-close');
            const cancelBtn = $('#resource-panel-cancel');
            const saveBtn = $('#resource-panel-save');
            const typePicker = $('#res-type-picker');

            const togglePanel = (open) => {
                if (open) {
                    panel?.classList.add('open');
                    setTimeout(() => $('#res-title')?.focus(), 350);
                } else {
                    panel?.classList.remove('open');
                }
            };

            openBtn?.addEventListener('click', () => togglePanel(!panel?.classList.contains('open')));
            closeBtn?.addEventListener('click', () => togglePanel(false));
            cancelBtn?.addEventListener('click', () => togglePanel(false));

            typePicker?.addEventListener('click', (e) => {
                const pill = e.target.closest('.res-type-pill');
                if (!pill) return;
                typePicker.querySelectorAll('.res-type-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
            });

            const catPicker = $('#res-category-picker');
            catPicker?.addEventListener('click', (e) => {
                const pill = e.target.closest('.res-cat-pill');
                if (!pill) return;
                catPicker.querySelectorAll('.res-cat-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
            });

            // Star rating picker
            const starPicker = $('#res-star-picker');
            starPicker?.addEventListener('click', (e) => {
                const btn = e.target.closest('.star-pick-btn');
                if (!btn) return;
                const val = parseInt(btn.dataset.star);
                // Toggle off if clicking the same star
                const isActive = btn.classList.contains('active');
                starPicker.querySelectorAll('.star-pick-btn').forEach((b, i) => {
                    b.classList.toggle('active', !isActive && (i + 1) <= val);
                });
            });

            saveBtn?.addEventListener('click', () => this._addResource());

            // Show/hide empty state on load
            this._toggleEmpty();
        },

        _closePanel() {
            const panel = $('#resource-add-panel');
            panel?.classList.remove('open');
            this._resetEditMode();
        },

        _toggleEmpty() {
            const empty = $('#resource-empty-state');
            const count = $$('.resource-card').length;
            if (empty) {
                if (count === 0) empty.classList.remove('hidden');
                else empty.classList.add('hidden');
            }
        },

        _editingId: null,

        _editResource(id) {
            const list = Store.get(this.STORE_KEY, []);
            const resource = list.find(r => String(r.id) === String(id));
            if (!resource) return;

            this._editingId = String(id);

            // Populate form
            const titleEl = $('#res-title');
            const descEl = $('#res-desc');
            const urlEl = $('#res-url');
            const tagsEl = $('#res-tags');
            if (titleEl) titleEl.value = resource.title || '';
            if (descEl) descEl.value = resource.desc === 'No description provided.' ? '' : (resource.desc || '');
            if (urlEl) urlEl.value = resource.url === '#' ? '' : (resource.url || '');
            if (tagsEl) tagsEl.value = (resource.tags || []).join(', ');

            // Set type picker
            $$('#res-type-picker .res-type-pill').forEach(p => {
                p.classList.toggle('active', p.dataset.type === resource.type);
            });

            // Set category picker
            $$('#res-category-picker .res-cat-pill').forEach(p => {
                p.classList.toggle('active', p.dataset.category === (resource.category || 'development'));
            });

            // Set star rating
            const rating = resource.rating || 0;
            $$('#res-star-picker .star-pick-btn').forEach(b => {
                b.classList.toggle('active', parseInt(b.dataset.star) <= rating && rating > 0);
            });

            // Update save button text
            const saveBtn = $('#resource-panel-save');
            if (saveBtn) saveBtn.textContent = I18n.t('resUpdateBtn');

            // Update header text
            const header = document.querySelector('.resource-add-panel-header h3');
            if (header) header.textContent = I18n.t('resEditTitle');

            // Open panel
            const panel = $('#resource-add-panel');
            panel?.classList.add('open');
            setTimeout(() => titleEl?.focus(), 350);
        },

        _resetEditMode() {
            this._editingId = null;
            const saveBtn = $('#resource-panel-save');
            if (saveBtn) saveBtn.textContent = I18n.t('resAddBtn');
            const header = document.querySelector('.resource-add-panel-header h3');
            if (header) header.textContent = I18n.t('resAddTitle');
        },

        _addResource() {
            const title = $('#res-title')?.value.trim();
            const desc = $('#res-desc')?.value.trim();
            const url = $('#res-url')?.value.trim();
            const type = document.querySelector('#res-type-picker .res-type-pill.active')?.dataset.type || 'blog';
            const category = document.querySelector('#res-category-picker .res-cat-pill.active')?.dataset.category || 'development';
            const tagsRaw = $('#res-tags')?.value.trim();
            const rating = parseInt(document.querySelector('#res-star-picker .star-pick-btn.active')?.dataset.star || '0');

            if (!title) { notify('Missing Title', 'Please enter a resource title'); return; }

            const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean).slice(0, 5) : [];
            const groupId = $('#res-group')?.value || '';
            const isEdit = !!this._editingId;

            if (isEdit) {
                // Update existing resource
                const list = Store.get(this.STORE_KEY, []);
                const idx = list.findIndex(r => String(r.id) === this._editingId);
                if (idx !== -1) {
                    list[idx] = { ...list[idx], title, desc: desc || 'No description provided.', url: url || '#', type, category, tags, rating, groupId: groupId || list[idx].groupId || '' };
                    Store.set(this.STORE_KEY, list);

                    // Remove old card and re-append
                    const oldCard = document.querySelector(`.resource-card[data-id="${this._editingId}"]`);
                    if (oldCard) oldCard.remove();
                    this._appendCard(list[idx]);

                    // Animate updated card
                    const updatedCard = document.querySelector(`.resource-card[data-id="${this._editingId}"]`);
                    if (updatedCard) {
                        updatedCard.classList.add('new-item');
                        updatedCard.addEventListener('animationend', () => updatedCard.classList.remove('new-item'), { once: true });
                    }

                    notify('Resource Updated! ✏️', `"${title}" has been updated`);
                }
                this._resetEditMode();
            } else {
                // Create new resource
                const resource = {
                    id: Date.now(),
                    title,
                    desc: desc || 'No description provided.',
                    url: url || '#',
                    type,
                    category,
                    tags,
                    rating,
                    groupId: groupId || '',
                    createdAt: new Date().toISOString()
                };

                const list = Store.get(this.STORE_KEY, []);
                list.push(resource);
                Store.set(this.STORE_KEY, list);

                this._appendCard(resource);
                this._updateCount();
                ActivityTracker.record();
                ActivityChart.render();
                StreakCalendar.render();
                notify('Resource Added! 📚', `"${title}" has been added to your resources`);

                // Animate new card
                const grid = $('#resources-grid');
                const last = grid?.lastElementChild;
                if (last) {
                    last.classList.add('new-item');
                    last.addEventListener('animationend', () => last.classList.remove('new-item'), { once: true });
                }
            }

            // Clear & close
            ['#res-title', '#res-desc', '#res-url', '#res-tags'].forEach(sel => {
                const el = $(sel); if (el) el.value = '';
            });
            // Reset star picker
            $$('#res-star-picker .star-pick-btn').forEach(b => b.classList.remove('active'));
            const catPills = $$('#res-category-picker .res-cat-pill');
            catPills.forEach((p, i) => p.classList.toggle('active', i === 0));
            const typePills = $$('#res-type-picker .res-type-pill');
            typePills.forEach((p, i) => p.classList.toggle('active', i === 0));
            this._closePanel();
            this._toggleEmpty();
            this._applyFilters();
        },

        _openModal(id) {
            const list = Store.get(this.STORE_KEY, []);
            const r = list.find(res => String(res.id) === String(id));
            if (!r) return;

            const TYPE_ICONS = {
                youtube: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.19a3 3 0 0 0-2.11-2.13C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.39.56A3 3 0 0 0 .5 6.19 31.2 31.2 0 0 0 0 12a31.2 31.2 0 0 0 .5 5.81 3 3 0 0 0 2.11 2.13c1.89.56 9.39.56 9.39.56s7.5 0 9.39-.56a3 3 0 0 0 2.11-2.13A31.2 31.2 0 0 0 24 12a31.2 31.2 0 0 0-.5-5.81zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/></svg>',
                blog: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
                podcast: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>'
            };
            const TYPE_LABELS = { youtube: 'YouTube', blog: 'Blog', podcast: 'Podcast' };
            const LINK_LABELS = { youtube: 'Watch Video', blog: 'Read Article', podcast: 'Listen Now' };
            const CAT_LABELS  = { development: 'Development', driftsstotte: 'Driftstøtte', brukerstotte: 'Brukerstøtte' };
            const CAT_ICONS   = {
                development:  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
                driftsstotte: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
                brukerstotte: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
            };
            const TAG_COLORS = {
                javascript: 'tag--yellow', js: 'tag--yellow', typescript: 'tag--blue', ts: 'tag--blue',
                react: 'tag--cyan', vue: 'tag--green', angular: 'tag--red', svelte: 'tag--orange',
                python: 'tag--blue', ai: 'tag--purple', 'machine learning': 'tag--purple', ml: 'tag--purple',
                networking: 'tag--teal', css: 'tag--pink', html: 'tag--orange', 'web dev': 'tag--indigo',
                design: 'tag--pink', node: 'tag--green', nodejs: 'tag--green', database: 'tag--yellow',
                security: 'tag--red', devops: 'tag--teal', cloud: 'tag--blue', data: 'tag--purple'
            };

            const cat      = r.category || 'development';
            const tagsHtml = (r.tags || []).map(t => {
                const key = t.toLowerCase().trim();
                return `<span class="resource-tag ${TAG_COLORS[key] || 'tag--default'}">${escapeHtml(t)}</span>`;
            }).join('');

            // Populate modal
            const header = $('#resource-modal-header');
            if (header) {
                header.className = `resource-modal-header resource-modal-header--${r.type}`;
            }
            const typeIcon = $('#resource-modal-type-icon');
            if (typeIcon) {
                typeIcon.className = `resource-modal-type-icon resource-card-header--${r.type}`;
                typeIcon.innerHTML = TYPE_ICONS[r.type] || TYPE_ICONS.blog;
            }
            const typeLabel = $('#resource-modal-type-label');
            if (typeLabel) {
                typeLabel.className = `resource-modal-type-label resource-card-header--${r.type}`;
                typeLabel.textContent = TYPE_LABELS[r.type] || 'Blog';
            }
            const meta = $('#resource-modal-meta');
            if (meta) {
                meta.innerHTML = `<span class="resource-cat-badge resource-cat--${cat}">${CAT_ICONS[cat] || ''} ${escapeHtml(CAT_LABELS[cat] || cat)}</span>${tagsHtml}`;
            }
            const title = $('#resource-modal-title');
            if (title) title.textContent = r.title || '';
            const desc = $('#resource-modal-desc');
            if (desc) desc.textContent = r.desc || '';
            const link = $('#resource-modal-link');
            if (link) {
                link.href = r.url || '#';
                link.textContent = (LINK_LABELS[r.type] || 'Open') + ' →';
                link.style.display = (r.url && r.url !== '#') ? '' : 'none';
            }

            const overlay = $('#resource-modal-overlay');
            overlay?.classList.add('open');
            document.body.style.overflow = 'hidden';

            // Close handlers (set once per open)
            const close = () => this._closeModal();
            const onKey = (ev) => { if (ev.key === 'Escape') close(); };
            overlay._closeHandler = close;
            overlay._keyHandler = onKey;
            overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); }, { once: true });
            document.addEventListener('keydown', onKey, { once: true });

            $('#resource-modal-close')?.addEventListener('click', close, { once: true });
        },

        _closeModal() {
            const overlay = $('#resource-modal-overlay');
            overlay?.classList.remove('open');
            document.body.style.overflow = '';
            if (overlay?._keyHandler) {
                document.removeEventListener('keydown', overlay._keyHandler);
            }
        },

        _appendCard(r) {
            const grid = $('#resources-grid');
            if (!grid) return;

            const TYPE_ICONS = {
                youtube: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.19a3 3 0 0 0-2.11-2.13C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.39.56A3 3 0 0 0 .5 6.19 31.2 31.2 0 0 0 0 12a31.2 31.2 0 0 0 .5 5.81 3 3 0 0 0 2.11 2.13c1.89.56 9.39.56 9.39.56s7.5 0 9.39-.56a3 3 0 0 0 2.11-2.13A31.2 31.2 0 0 0 24 12a31.2 31.2 0 0 0-.5-5.81zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/></svg>',
                blog: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
                podcast: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>'
            };
            const TYPE_LABELS = { youtube: 'YouTube', blog: 'Blog', podcast: 'Podcast' };
            const LINK_LABELS = { youtube: 'Watch Video →', blog: 'Read Article →', podcast: 'Listen Now →' };
            const CAT_LABELS = { development: 'Development', driftsstotte: 'Driftstøtte', brukerstotte: 'Brukerstøtte' };
            const CAT_ICONS = {
                development: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
                driftsstotte: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
                brukerstotte: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
            };

            // Topic-based tag color mapping
            const TAG_COLORS = {
                javascript: 'tag--yellow', js: 'tag--yellow', typescript: 'tag--blue', ts: 'tag--blue',
                react: 'tag--cyan', vue: 'tag--green', angular: 'tag--red', svelte: 'tag--orange',
                python: 'tag--blue', ai: 'tag--purple', 'machine learning': 'tag--purple', ml: 'tag--purple',
                networking: 'tag--teal', css: 'tag--pink', html: 'tag--orange', 'web dev': 'tag--indigo',
                design: 'tag--pink', node: 'tag--green', nodejs: 'tag--green', database: 'tag--yellow',
                security: 'tag--red', devops: 'tag--teal', cloud: 'tag--blue', data: 'tag--purple'
            };

            const tagsArr = r.tags || [];
            const tagsHtml = tagsArr.map(t => {
                const key = t.toLowerCase().trim();
                const colorCls = TAG_COLORS[key] || 'tag--default';
                return `<span class="resource-tag ${colorCls}" data-tag="${escapeHtml(key)}">${escapeHtml(t)}</span>`;
            }).join('');

            const starsHtml = r.rating && r.rating > 0
                ? `<div class="resource-stars">${[1,2,3,4,5].map(s => `<span class="resource-star ${s <= r.rating ? 'filled' : ''}">★</span>`).join('')}</div>`
                : '';

            const card = document.createElement('div');
            card.className = 'resource-card user-added';
            card.dataset.type = r.type;
            card.dataset.category = r.category || 'development';
            card.dataset.tags = tagsArr.join(',').toLowerCase();
            card.dataset.id = r.id;
            card.dataset.groupId = r.groupId || '';
            if (r.url && r.url !== '#') card.dataset.url = r.url;

            const cat = r.category || 'development';
            const catLabel = CAT_LABELS[cat] || cat;
            const catIcon = CAT_ICONS[cat] || CAT_ICONS.development;

            card.innerHTML = `
                <div class="resource-card-actions">
                    <button class="resource-edit-btn" aria-label="Edit resource">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="resource-delete-btn" aria-label="Delete resource">&times;</button>
                </div>
                <div class="resource-card-header resource-card-header--${r.type}">
                    <div class="resource-type-icon">${TYPE_ICONS[r.type] || TYPE_ICONS.blog}</div>
                    <span class="resource-type-label">${TYPE_LABELS[r.type] || 'Blog'}</span>
                </div>
                <div class="resource-card-body">
                    <h3>${escapeHtml(r.title)}</h3>
                    ${starsHtml}
                    <p>${escapeHtml(r.desc)}</p>
                    <div class="resource-badges-row">
                        <span class="resource-cat-badge resource-cat--${cat}">${catIcon} ${escapeHtml(catLabel)}</span>
                        ${tagsHtml ? tagsHtml : ''}
                        ${(() => {
                            if (!r.groupId) return '';
                            const grp = ResourceGroups.getById(r.groupId);
                            if (!grp) return '';
                            return `<span class="resource-group-chip" style="background:${escapeHtml(grp.color)}22;color:${escapeHtml(grp.color)}"><span class="group-dot" style="background:${escapeHtml(grp.color)}"></span>${escapeHtml(grp.name)}</span>`;
                        })()}
                    </div>
                </div>
                <a href="${escapeHtml(r.url || '#')}" target="_blank" rel="noopener" class="resource-link">
                    ${TYPE_ICONS[r.type] ? `<span class="resource-link-icon">${TYPE_ICONS[r.type]}</span>` : ''}
                    ${LINK_LABELS[r.type] || 'Open →'}
                </a>
            `;
            grid.appendChild(card);
        },

        _applyFilters(typeOverride) {
            const activeFilter = typeOverride || document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
            const activeCat    = this._activeCat || 'all';
            const activeGroup  = ResourceGroups._activeGroupId || 'all';
            const cards        = Array.from($$('.resource-card'));
            const search       = this._searchTerm;
            const tag          = this._activeTag;

            cards.forEach(card => {
                card.classList.remove('card-animate-in', 'card-out');
                card.style.removeProperty('--card-delay');
            });

            // Remove stale "no results" message
            const oldMsg = document.querySelector('.resource-no-results');
            if (oldMsg) oldMsg.remove();

            let showCount = 0;
            requestAnimationFrame(() => {
                cards.forEach(card => {
                    const typeMatch   = activeFilter === 'all' || card.dataset.type === activeFilter;
                    const catMatch    = activeCat === 'all' || card.dataset.category === activeCat;
                    const groupMatch  = activeGroup === 'all' || card.dataset.groupId === activeGroup;
                    const searchMatch = !search || card.textContent.toLowerCase().includes(search);
                    const tagMatch    = !tag || (card.dataset.tags || '').toLowerCase().split(',').some(t => t.trim() === tag);
                    const match = typeMatch && catMatch && groupMatch && searchMatch && tagMatch;

                    if (match) {
                        showCount++;
                        if (card.classList.contains('hidden')) {
                            card.classList.remove('hidden');
                            const delay = (showCount - 1) * 45;
                            card.style.setProperty('--card-delay', `${delay}ms`);
                            card.classList.add('card-animate-in');
                            card.addEventListener('animationend', () => {
                                card.classList.remove('card-animate-in');
                                card.style.removeProperty('--card-delay');
                            }, { once: true });
                        }
                    } else {
                        if (!card.classList.contains('hidden')) {
                            card.classList.add('card-out');
                            setTimeout(() => {
                                card.classList.remove('card-out');
                                card.classList.add('hidden');
                            }, 290);
                        }
                    }
                });

                if (showCount === 0) {
                    const grid = $('#resources-grid');
                    if (grid && !grid.querySelector('.resource-no-results')) {
                        const msg = document.createElement('div');
                        msg.className = 'resource-no-results';
                        msg.textContent = 'No resources found.';
                        grid.appendChild(msg);
                    }
                }

                const countEl = $('#resource-count');
                if (countEl) countEl.textContent = showCount;
            });

            this._renderActiveFilters(activeFilter, activeCat, tag, search);
        },

        _renderActiveFilters(type, cat, tag, search) {
            const bar = $('#active-filters-bar');
            if (!bar) return;
            bar.innerHTML = '';

            const CAT_LABELS = { development: 'Development', driftsstotte: 'Driftstøtte', brukerstotte: 'Brukerstøtte' };
            const TYPE_LABELS = { youtube: 'YouTube', blog: 'Blog', podcast: 'Podcast' };
            const chips = [];

            if (type && type !== 'all') {
                chips.push({ label: TYPE_LABELS[type] || type, kind: 'type', value: type });
            }
            if (cat && cat !== 'all') {
                chips.push({ label: CAT_LABELS[cat] || cat, kind: 'cat', value: cat });
            }
            if (tag) {
                chips.push({ label: `#${tag}`, kind: 'tag', value: tag });
            }
            if (search) {
                chips.push({ label: `"${search}"`, kind: 'search', value: search });
            }

            if (chips.length === 0) { bar.classList.remove('visible'); return; }
            bar.classList.add('visible');

            chips.forEach(c => {
                const chip = document.createElement('button');
                chip.className = `active-filter-chip active-filter-chip--${c.kind}`;
                chip.innerHTML = `${escapeHtml(c.label)} <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
                chip.addEventListener('click', () => this._clearFilter(c.kind));
                bar.appendChild(chip);
            });

            if (chips.length > 1) {
                const clearAll = document.createElement('button');
                clearAll.className = 'active-filter-clear-all';
                clearAll.textContent = I18n.t('filterClearAll');
                clearAll.addEventListener('click', () => this._clearAllFilters());
                bar.appendChild(clearAll);
            }
        },

        _clearFilter(kind) {
            if (kind === 'type') {
                $$('.filter-btn').forEach(b => b.classList.remove('active'));
                document.querySelector('.filter-btn[data-filter="all"]')?.classList.add('active');
            } else if (kind === 'cat') {
                this._activeCat = 'all';
                $$('.cat-filter-btn').forEach(b => b.classList.remove('active'));
                document.querySelector('.cat-filter-btn[data-cat="all"]')?.classList.add('active');
            } else if (kind === 'tag') {
                this._activeTag = null;
                $$('.resource-tag.active-tag').forEach(t => t.classList.remove('active-tag'));
            } else if (kind === 'search') {
                this._searchTerm = '';
                const input = $('#resource-search');
                if (input) input.value = '';
            }
            this._applyFilters();
        },

        _clearAllFilters() {
            $$('.filter-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('.filter-btn[data-filter="all"]')?.classList.add('active');
            this._activeCat = 'all';
            $$('.cat-filter-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('.cat-filter-btn[data-cat="all"]')?.classList.add('active');
            this._activeTag = null;
            $$('.resource-tag.active-tag').forEach(t => t.classList.remove('active-tag'));
            this._searchTerm = '';
            const input = $('#resource-search');
            if (input) input.value = '';
            this._applyFilters();
        },

        _updateCount() {
            const total = $$('.resource-card').length;
            const countEl = $('#resource-count');
            if (countEl) countEl.textContent = total;
            Dashboard.countUp('stat-resources', total);
            Insights._topResource();
        },

        // Keep legacy filter() for any external calls
        filter(type) {
            this._applyFilters(type);
        }
    };

    // =========================================
    // Notes Module
    // =========================================

    const Notes = {
        STORE_KEY: 'pln_notes',
        _activeId: null,
        _autoSaveTimer: null,
        _drawCtx: null,
        _drawing: false,
        _drawColor: '#6366f1',
        _drawSize: 2,
        _erasing: false,
        _drawDataURL: null,
        _pendingFiles: [],

        init() {
            state.notes = Store.get(this.STORE_KEY, []);
            this._bindEvents();
            this._initResizeHandles();
            this._initDrawing();
            this.renderList();
            this._syncDashboard();
        },

        // ── Create a fresh note and open it ──
        newNote() {
            const note = {
                id: Date.now(),
                title: '',
                content: '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                displayDate: formatDateTime({ month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
                wordCount: 0,
                drawing: null,
                files: null,
                pinned: false
            };
            state.notes.unshift(note);
            this._save();
            this.renderList();
            this.openNote(note.id);
            Streak.recordActivity();
            ActivityTracker.record();
            ActivityChart.render();
            StreakCalendar.render();
            this._syncDashboard();
            // Focus title input
            requestAnimationFrame(() => $('#notes-title-input')?.focus());
        },

        // ── Open a note in the editor (full-page mode) ──
        openNote(id) {
            // Save any unsaved changes first
            if (this._activeId !== null && this._activeId !== id) this._flushSave();

            this._activeId = id;
            const note = state.notes.find(n => n.id === id);
            if (!note) return;

            // Show editor (welcome screen removed, now handled by home view)
            const editor = $('#notes-editor');
            if (editor) editor.hidden = false;

            // Populate fields
            const titleEl = $('#notes-title-input');
            if (titleEl) titleEl.value = note.title || '';

            const body = $('#notes-rich-body');
            if (body) {
                body.innerHTML = note.content || '';
                this._updateWordCount();
            }

            // Auto date stamp (show created date)
            const dateEl = $('#notes-page-date');
            if (dateEl) {
                const d = new Date(note.createdAt || Date.now());
                dateEl.textContent = d.toLocaleString(undefined, {
                    weekday: 'long', year: 'numeric', month: 'long',
                    day: 'numeric', hour: '2-digit', minute: '2-digit'
                });
            }

            // Drawing
            this._drawDataURL = note.drawing || null;
            // Files
            this._pendingFiles = note.files ? [...note.files] : [];
            this._renderAttachPreview();

            // Pin button state
            const pinBtn = $('#note-pin-btn');
            if (pinBtn) pinBtn.classList.toggle('pinned', !!note.pinned);

            // Update sidebar active state
            document.querySelectorAll('#notes-list .nli').forEach(el => {
                el.classList.toggle('active', parseInt(el.dataset.id) === id);
            });

            // Enter full-page mode (sidebar slides away)
            document.getElementById('notes-app')?.classList.add('page-open');

            // Show right sidebar and populate panels
            const rSidebar = document.getElementById('notes-right-sidebar');
            if (rSidebar) {
                rSidebar.classList.remove('panel-hidden');
                if (!rSidebar.classList.contains('collapsed')) {
                    document.getElementById('note-toggle-panel')?.classList.add('panel-active');
                }
            }
            requestAnimationFrame(() => {
                this._updateOutline();
                this._updatePageInfo();
            });

            // Scroll page content to top
            const content = $('#notes-page-content');
            if (content) content.scrollTop = 0;

            this._setAutosave('');
            // Focus title if blank
            requestAnimationFrame(() => {
                if (!note.title) $('#notes-title-input')?.focus();
                else $('#notes-rich-body')?.focus();
            });
        },

        // ── Bind all events ──
        _bindEvents() {
            // New note buttons (sidebar + home + nav sidebar)
            $('#notes-new-btn')?.addEventListener('click', () => this.newNote());
            $('#notes-home-new-btn')?.addEventListener('click', () => this.newNote());
            $('#notes-home-empty-new')?.addEventListener('click', () => this.newNote());
            $('#nns-new-page-btn')?.addEventListener('click', () => this.newNote());

            // Back buttons — exit full-page mode
            $('#notes-back-btn')?.addEventListener('click', () => {
                document.getElementById('notes-app')?.classList.remove('page-open');
            });
            $('#notes-nav-back')?.addEventListener('click', () => {
                document.getElementById('notes-app')?.classList.remove('page-open');
            });

            // Home search
            $('#notes-home-search')?.addEventListener('input', (e) => this._filterHomeList(e.target.value.trim()));

            // Title input → autosave
            $('#notes-title-input')?.addEventListener('input', () => this._scheduleAutosave());

            // Rich body → autosave + word count + format bar state
            const body = $('#notes-rich-body');
            body?.addEventListener('input', () => {
                this._updateWordCount();
                this._updateOutline();
                this._updatePageInfo();
                this._scheduleAutosave();
            });
            body?.addEventListener('keyup', () => this._updateFormatBar());
            body?.addEventListener('mouseup', () => this._updateFormatBar());
            body?.addEventListener('keydown', (e) => {
                // Checklist: Enter inside a checklist li should create new li
                if (e.key === 'Enter') {
                    const sel = window.getSelection();
                    if (sel && sel.anchorNode) {
                        const li = sel.anchorNode.closest?.('li');
                        if (li && li.closest('ul.checklist')) {
                            e.preventDefault();
                            document.execCommand('insertHTML', false, '<li>');
                        }
                    }
                }
                // Tab inside pre → insert spaces
                if (e.key === 'Tab') {
                    const sel = window.getSelection();
                    if (sel && sel.anchorNode?.closest?.('pre')) {
                        e.preventDefault();
                        document.execCommand('insertText', false, '    ');
                    }
                }
            });

            // Font size select
            // Font family select
            $('#notes-font-family')?.addEventListener('change', (e) => {
                const bodyEl = $('#notes-rich-body');
                bodyEl?.focus();
                if (e.target.value) {
                    document.execCommand('fontName', false, e.target.value);
                } else {
                    document.execCommand('removeFormat', false, null);
                }
                this._scheduleAutosave();
            });

            $('#notes-font-size')?.addEventListener('change', (e) => {
                const bodyEl = $('#notes-rich-body');
                bodyEl?.focus();
                document.execCommand('fontSize', false, e.target.value);
                this._scheduleAutosave();
            });

            // Text color picker
            $('#text-color-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                document.getElementById('highlight-wrap')?.classList.remove('open');
                document.getElementById('text-color-wrap')?.classList.toggle('open');
            });
            $('#text-color-popup')?.addEventListener('click', (e) => {
                const btn = e.target.closest('.cswatch');
                if (!btn) return;
                const color = btn.dataset.color;
                document.getElementById('text-color-wrap')?.classList.remove('open');
                const bodyEl = $('#notes-rich-body');
                bodyEl?.focus();
                if (color) {
                    document.execCommand('foreColor', false, color);
                    const bar = $('#text-color-bar');
                    if (bar) bar.style.background = color;
                } else {
                    document.execCommand('removeFormat', false, null);
                }
                this._scheduleAutosave();
            });

            // Highlight color picker
            $('#highlight-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                document.getElementById('text-color-wrap')?.classList.remove('open');
                document.getElementById('highlight-wrap')?.classList.toggle('open');
            });
            $('#highlight-popup')?.addEventListener('click', (e) => {
                const btn = e.target.closest('.cswatch');
                if (!btn) return;
                const color = btn.dataset.color;
                document.getElementById('highlight-wrap')?.classList.remove('open');
                const bodyEl = $('#notes-rich-body');
                bodyEl?.focus();
                if (color === 'transparent') {
                    document.execCommand('hiliteColor', false, 'transparent');
                    document.execCommand('backColor', false, 'transparent');
                } else if (color) {
                    document.execCommand('hiliteColor', false, color) ||
                    document.execCommand('backColor', false, color);
                    const bar = $('#highlight-bar');
                    if (bar) bar.style.background = color;
                }
                this._scheduleAutosave();
            });

            // Close color popups on outside click
            document.addEventListener('click', () => {
                document.getElementById('text-color-wrap')?.classList.remove('open');
                document.getElementById('highlight-wrap')?.classList.remove('open');
            });

            // Format toolbar
            $('#notes-format-bar')?.addEventListener('click', (e) => {
                const btn = e.target.closest('.fmt-btn');
                if (!btn) return;
                const cmd = btn.dataset.cmd;
                const val = btn.dataset.val || null;
                if (!cmd) return;

                if (cmd === 'checklist') {
                    this._insertChecklist();
                } else if (cmd === 'insertLink') {
                    this._insertLink();
                } else {
                    const bodyEl = $('#notes-rich-body');
                    bodyEl?.focus();
                    document.execCommand(cmd, false, val);
                }
                this._updateFormatBar();
                this._scheduleAutosave();
            });

            // Pin / delete
            $('#note-pin-btn')?.addEventListener('click', () => this._togglePin());
            $('#note-delete-btn')?.addEventListener('click', () => this._deleteActive());

            // Toggle right panel
            $('#note-toggle-panel')?.addEventListener('click', () => {
                const rSidebar = document.getElementById('notes-right-sidebar');
                const btn      = document.getElementById('note-toggle-panel');
                if (!rSidebar) return;
                const isCollapsed = rSidebar.classList.toggle('collapsed');
                btn?.classList.toggle('panel-active', !isCollapsed);
            });

            // Search
            $('#notes-search')?.addEventListener('input', (e) => this._filterList(e.target.value.trim()));

            // File input
            $('#note-file-input')?.addEventListener('change', (e) => this._handleFiles(e.target.files));

            // Draw toggle
            $('#note-draw-btn')?.addEventListener('click', () => {
                const panel = $('#note-draw-panel');
                const btn = $('#note-draw-btn');
                const isOpen = panel?.classList.toggle('open');
                btn?.classList.toggle('active-tool', isOpen);
                if (isOpen) requestAnimationFrame(() => this._sizeCanvas());
            });

            // Checklist click (toggle checked)
            $('#notes-rich-body')?.addEventListener('click', (e) => {
                const li = e.target.closest('ul.checklist li');
                if (li) {
                    li.classList.toggle('checked');
                    this._scheduleAutosave();
                }
            });
        },

        _insertChecklist() {
            const bodyEl = $('#notes-rich-body');
            if (!bodyEl) return;
            bodyEl.focus();
            document.execCommand('insertHTML', false,
                '<ul class="checklist"><li>Task</li></ul><p></p>');
        },

        // ── Resize handles (drag-to-resize + double-click collapse) ──
        _initResizeHandles() {
            const leftSidebar  = document.getElementById('notes-sidebar');
            const rightSidebar = document.getElementById('notes-right-sidebar');
            const leftHandle   = document.getElementById('notes-resize-left');
            const rightHandle  = document.getElementById('notes-resize-right');
            const MIN_W = 160, MAX_W = 500;

            const makeDraggable = (handle, target, side) => {
                if (!handle || !target) return;
                let startX, startW, active = false;

                handle.addEventListener('mousedown', e => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    startX = e.clientX;
                    startW = target.getBoundingClientRect().width;
                    active = true;
                    handle.classList.add('dragging');
                    document.body.style.cursor = 'col-resize';
                    document.body.style.userSelect = 'none';
                });

                document.addEventListener('mousemove', e => {
                    if (!active) return;
                    const delta = e.clientX - startX;
                    const newW = side === 'left'
                        ? Math.max(MIN_W, Math.min(MAX_W, startW + delta))
                        : Math.max(MIN_W, Math.min(MAX_W, startW - delta));
                    target.style.width = newW + 'px';
                    target.style.minWidth = newW + 'px';
                    localStorage.setItem(`notes-${side}-w`, newW);
                });

                document.addEventListener('mouseup', () => {
                    if (!active) return;
                    active = false;
                    handle.classList.remove('dragging');
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                });

                // Double-click → collapse or expand
                handle.addEventListener('dblclick', () => {
                    const w = target.getBoundingClientRect().width;
                    if (w < MIN_W + 20) {
                        const saved = parseInt(localStorage.getItem(`notes-${side}-w`) || (side === 'left' ? '260' : '220'));
                        const expandW = Math.max(MIN_W, saved);
                        target.style.width = expandW + 'px';
                        target.style.minWidth = expandW + 'px';
                        target.classList.remove('collapsed');
                        if (side === 'right') document.getElementById('note-toggle-panel')?.classList.add('panel-active');
                    } else {
                        localStorage.setItem(`notes-${side}-w`, w);
                        target.style.width = '0px';
                        target.style.minWidth = '0px';
                        target.classList.add('collapsed');
                        if (side === 'right') document.getElementById('note-toggle-panel')?.classList.remove('panel-active');
                    }
                });
            };

            makeDraggable(leftHandle, leftSidebar, 'left');
            makeDraggable(rightHandle, rightSidebar, 'right');

            // Restore saved widths on load
            const savedLeft = localStorage.getItem('notes-left-w');
            if (savedLeft && leftSidebar) {
                leftSidebar.style.width = savedLeft + 'px';
                leftSidebar.style.minWidth = savedLeft + 'px';
            }
        },

        // ── Update heading outline in right sidebar ──
        _updateOutline() {
            const body    = document.getElementById('notes-rich-body');
            const outline = document.getElementById('notes-outline-list');
            if (!body || !outline) return;
            const headings = body.querySelectorAll('h1, h2, h3');
            if (!headings.length) {
                outline.innerHTML = '<span class="notes-outline-empty">No headings yet</span>';
                return;
            }
            outline.innerHTML = '';
            headings.forEach(h => {
                const level = parseInt(h.tagName[1]);
                const item  = document.createElement('div');
                item.className = `notes-outline-item notes-outline-item--h${level}`;
                item.textContent = h.textContent?.trim() || 'Untitled';
                item.addEventListener('click', () => h.scrollIntoView({ behavior: 'smooth', block: 'start' }));
                outline.appendChild(item);
            });
        },

        // ── Update word / char / reading-time in right sidebar ──
        _updatePageInfo() {
            const body = document.getElementById('notes-rich-body');
            if (!body) return;
            const text  = body.innerText || '';
            const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
            const chars = text.length;
            const mins  = Math.max(1, Math.round(words / 200));
            const set   = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            set('notes-info-words',    words);
            set('notes-info-chars',    chars);
            set('notes-info-read-time', mins + ' min');
        },

        _togglePin() {
            const note = state.notes.find(n => n.id === this._activeId);
            if (!note) return;
            note.pinned = !note.pinned;
            $('#note-pin-btn')?.classList.toggle('pinned', note.pinned);
            this._save();
            this.renderList();
        },

        _deleteActive() {
            const id = this._activeId;
            if (id === null) return;
            const note = state.notes.find(n => n.id === id);
            if (!note) return;
            const idx = state.notes.indexOf(note);

            state.notes = state.notes.filter(n => n.id !== id);
            this._save();
            this._activeId = null;

            // Exit full-page mode (returns to home view)
            if ($('#notes-editor')) document.getElementById('notes-editor').hidden = true;
            document.getElementById('notes-app')?.classList.remove('page-open');

            // Hide right sidebar
            const rSidebar = document.getElementById('notes-right-sidebar');
            if (rSidebar) rSidebar.classList.add('panel-hidden');
            document.getElementById('note-toggle-panel')?.classList.remove('panel-active');

            this.renderList();
            this._syncDashboard();

            UndoQueue.push(
                'Note deleted',
                () => {
                    state.notes.splice(idx, 0, note);
                    this._save();
                    this.renderList();
                    this.openNote(note.id);
                    this._syncDashboard();
                    notify('↩ Restored', 'Note restored successfully', 'success');
                },
                () => { this._save(); }
            );
        },

        // ── Auto-save ──
        _scheduleAutosave() {
            this._setAutosave('saving');
            clearTimeout(this._autoSaveTimer);
            this._autoSaveTimer = setTimeout(() => this._flushSave(), 800);
        },

        _flushSave() {
            clearTimeout(this._autoSaveTimer);
            if (this._activeId === null) return;
            const note = state.notes.find(n => n.id === this._activeId);
            if (!note) return;

            const titleEl = $('#notes-title-input');
            const body = $('#notes-rich-body');

            note.title = titleEl?.value.trim() || '';
            note.content = body?.innerHTML || '';
            note.drawing = this._drawDataURL || null;
            note.files = this._pendingFiles.length ? [...this._pendingFiles] : null;
            note.updatedAt = new Date().toISOString();
            note.wordCount = this._countWords(body?.innerText || '');

            this._save();
            this.renderList();
            this._setAutosave('saved');
            this._syncDashboard();
        },

        _setAutosave(state) {
            const el = $('#notes-autosave');
            if (!el) return;
            el.className = 'notes-autosave';
            if (state === 'saving') { el.textContent = 'Saving…'; el.classList.add('saving'); }
            else if (state === 'saved') { el.textContent = 'Saved'; el.classList.add('saved'); }
            else { el.textContent = ''; }
        },

        _countWords(text) {
            const t = text.trim();
            return t ? t.split(/\s+/).filter(Boolean).length : 0;
        },

        _updateWordCount() {
            const body = $('#notes-rich-body');
            const wc = this._countWords(body?.innerText || '');
            const el = $('#notes-word-count');
            if (el) el.textContent = `${wc} word${wc !== 1 ? 's' : ''}`;
        },

        // ── Render sidebar list ──
        renderList() {
            const list = $('#notes-list');
            const empty = $('#empty-state-notes');
            if (!list) return;

            const q = ($('#notes-search')?.value || '').toLowerCase().trim();
            const sorted = [...state.notes].sort((a, b) => {
                if (b.pinned !== a.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
                return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
            });
            const filtered = q
                ? sorted.filter(n => (n.title + ' ' + (n.content || '')).toLowerCase().includes(q))
                : sorted;

            // Update count badge
            const countEl = document.getElementById('nns-all-count');
            if (countEl) countEl.textContent = state.notes.length;

            if (filtered.length === 0) {
                list.innerHTML = '';
                empty?.classList.add('show');
                this._renderHomeList(q);
                return;
            }
            empty?.classList.remove('show');

            // Time grouping helpers
            const now = new Date();
            const startOfToday    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const startOfYest     = new Date(startOfToday - 86400000);
            const startOfWeek     = new Date(startOfToday - (now.getDay() || 7) * 86400000);

            const getGroup = (n) => {
                if (n.pinned) return 'PINNED';
                const d = new Date(n.updatedAt || n.createdAt);
                if (d >= startOfToday) return 'TODAY';
                if (d >= startOfYest)  return 'YESTERDAY';
                if (d >= startOfWeek)  return 'THIS WEEK';
                return 'EARLIER';
            };

            const fileIcon = `<svg class="nli-file-icon" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
            const pinIcon  = `<span class="nli-pin">📌</span>`;

            let html = '';
            let lastGroup = null;
            const groupOrder = ['PINNED','TODAY','YESTERDAY','THIS WEEK','EARLIER'];
            const grouped = {};
            filtered.forEach(n => { const g = getGroup(n); (grouped[g] = grouped[g] || []).push(n); });

            groupOrder.forEach(g => {
                if (!grouped[g]) return;
                html += `<div class="nli-group-label">${g}</div>`;
                grouped[g].forEach(n => {
                    const title = n.title || this._plainPreview(n.content, 40) || '(Untitled)';
                    const preview = n.title ? this._plainPreview(n.content, 55) : '';
                    const age = this._timeAgo(n.updatedAt || n.createdAt);
                    const isActive = n.id === this._activeId;
                    html += `<div class="nli${isActive ? ' active' : ''}" data-id="${n.id}">
                        ${fileIcon}
                        ${n.pinned && g !== 'PINNED' ? pinIcon : ''}
                        <div class="nli-content">
                            <div class="nli-title">${escapeHtml(title)}</div>
                            ${preview ? `<div class="nli-preview">${escapeHtml(preview)}</div>` : ''}
                            <div class="nli-meta">${age}</div>
                        </div>
                    </div>`;
                });
            });

            list.innerHTML = html;

            // Click on list item
            list.querySelectorAll('.nli').forEach(el => {
                el.addEventListener('click', () => this.openNote(parseInt(el.dataset.id)));
            });

            // Render home list too
            this._renderHomeList(q);
        },

        _renderHomeList(q = '') {
            const list  = document.getElementById('notes-home-list');
            const empty = document.getElementById('notes-home-empty');
            const label = document.getElementById('notes-home-section-label');
            if (!list) return;

            const sorted   = [...state.notes].sort((a, b) =>
                new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
            const filtered = q
                ? sorted.filter(n => (n.title + ' ' + (n.content || '')).toLowerCase().includes(q.toLowerCase()))
                : sorted;

            if (!filtered.length) {
                list.innerHTML = '';
                if (empty)  { empty.hidden  = false; empty.classList.add('visible'); }
                if (label)  label.hidden = true;
                return;
            }
            if (empty)  { empty.hidden  = true;  empty.classList.remove('visible'); }
            if (label)  { label.hidden = false; }

            list.innerHTML = filtered.map(n => {
                const title   = n.title || this._plainPreview(n.content, 40) || '(Untitled)';
                const date    = this._timeAgo(n.updatedAt || n.createdAt);
                const bodyTxt = n.content
                    ? new DOMParser().parseFromString(n.content, 'text/html').body.innerText : '';
                const words   = bodyTxt.trim() ? bodyTxt.trim().split(/\s+/).filter(Boolean).length : 0;
                const readMin = Math.max(1, Math.round(words / 200));
                return `<div class="notes-home-item" data-id="${n.id}">
                    <div class="notes-home-item-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                        </svg>
                    </div>
                    <div class="notes-home-item-info">
                        <div class="notes-home-item-title">${escapeHtml(title)}</div>
                        <div class="notes-home-item-meta">${date} · ${readMin} min read</div>
                    </div>
                    <button class="notes-home-item-menu" title="More options">···</button>
                </div>`;
            }).join('');

            list.querySelectorAll('.notes-home-item').forEach(el => {
                el.addEventListener('click', (e) => {
                    if (e.target.closest('.notes-home-item-menu')) return;
                    this.openNote(parseInt(el.dataset.id));
                });
            });
        },

        _filterHomeList(q) {
            this._renderHomeList(q);
        },

        _plainPreview(html, maxLen) {
            if (!html) return '';
            const tmp = document.createElement('div');
            tmp.innerHTML = html;
            const text = (tmp.textContent || '').replace(/\s+/g, ' ').trim();
            return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
        },

        _filterList(q) {
            this.renderList();
        },

        _timeAgo(isoStr) {
            if (!isoStr) return '';
            const date = new Date(isoStr);
            if (isNaN(date)) return isoStr;
            const diff = Math.floor((Date.now() - date) / 1000);
            if (diff < 60) return 'just now';
            if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
            if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
            if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
            return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        },

        // ── Insert link ──
        _insertLink() {
            const bodyEl = $('#notes-rich-body');
            if (!bodyEl) return;
            const url = prompt('Enter URL:');
            if (!url) return;
            const safe = url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')
                ? url : 'https://' + url;
            bodyEl.focus();
            const sel = window.getSelection();
            const hasSelection = sel && sel.toString().trim();
            if (hasSelection) {
                document.execCommand('createLink', false, safe);
            } else {
                document.execCommand('insertHTML', false,
                    `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener">${escapeHtml(safe)}</a>`);
            }
        },

        // ── Format bar active state ──
        _updateFormatBar() {
            ['bold', 'italic', 'underline', 'strikeThrough',
             'insertUnorderedList', 'insertOrderedList',
             'justifyLeft', 'justifyCenter', 'justifyRight'].forEach(cmd => {
                const btn = document.querySelector(`.fmt-btn[data-cmd="${cmd}"]`);
                if (btn) btn.classList.toggle('active', document.queryCommandState(cmd));
            });
        },

        // ── Drawing ──
        _sizeCanvas() {
            const canvas = $('#note-draw-canvas');
            const ctx = this._drawCtx;
            if (!canvas || !ctx) return;
            const dpr = window.devicePixelRatio || 1;
            const w = canvas.offsetWidth;
            const h = canvas.offsetHeight || 250;
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            ctx.scale(dpr, dpr);
        },

        _initDrawing() {
            const canvas = $('#note-draw-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            this._drawCtx = ctx;

            const getPos = (e) => {
                const r = canvas.getBoundingClientRect();
                const t = e.touches ? e.touches[0] : e;
                return { x: t.clientX - r.left, y: t.clientY - r.top };
            };

            const startDraw = (e) => { this._drawing = true; ctx.beginPath(); const p = getPos(e); ctx.moveTo(p.x, p.y); };
            const draw = (e) => {
                if (!this._drawing) return;
                e.preventDefault();
                const p = getPos(e);
                ctx.lineWidth = this._erasing ? this._drawSize * 6 : this._drawSize;
                ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.strokeStyle = this._erasing
                    ? (document.documentElement.dataset.theme === 'light' ? '#ffffff' : '#1e293b')
                    : this._drawColor;
                ctx.globalCompositeOperation = this._erasing ? 'destination-out' : 'source-over';
                ctx.lineTo(p.x, p.y); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(p.x, p.y);
            };
            const endDraw = () => { this._drawing = false; ctx.beginPath(); };

            canvas.addEventListener('mousedown', startDraw);
            canvas.addEventListener('mousemove', draw);
            canvas.addEventListener('mouseup', endDraw);
            canvas.addEventListener('mouseleave', endDraw);
            canvas.addEventListener('touchstart', startDraw, { passive: false });
            canvas.addEventListener('touchmove', draw, { passive: false });
            canvas.addEventListener('touchend', endDraw);

            $('#note-draw-colors')?.addEventListener('click', (e) => {
                const btn = e.target.closest('.draw-color-btn');
                if (!btn) return;
                $$('#note-draw-colors .draw-color-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._drawColor = btn.dataset.color;
                this._erasing = false;
                $('#note-draw-eraser')?.classList.remove('active-tool');
            });

            $('#note-draw-sizes')?.addEventListener('click', (e) => {
                const btn = e.target.closest('.draw-size-btn');
                if (!btn) return;
                $$('#note-draw-sizes .draw-size-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._drawSize = parseInt(btn.dataset.size);
            });

            $('#note-draw-eraser')?.addEventListener('click', () => {
                this._erasing = !this._erasing;
                $('#note-draw-eraser')?.classList.toggle('active-tool', this._erasing);
            });

            $('#note-draw-clear')?.addEventListener('click', () => {
                const dpr = window.devicePixelRatio || 1;
                ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
            });

            $('#note-draw-done')?.addEventListener('click', () => {
                this._drawDataURL = canvas.toDataURL('image/png');
                const dpr = window.devicePixelRatio || 1;
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const hasContent = imgData.data.some((v, i) => i % 4 === 3 && v > 0);
                if (!hasContent) this._drawDataURL = null;
                $('#note-draw-panel')?.classList.remove('open');
                $('#note-draw-btn')?.classList.remove('active-tool');

                if (this._drawDataURL) {
                    // Insert drawing inline into rich body
                    const bodyEl = $('#notes-rich-body');
                    if (bodyEl) {
                        bodyEl.focus();
                        document.execCommand('insertHTML', false,
                            `<img src="${this._drawDataURL}" class="note-drawing-inline" alt="sketch"><p></p>`);
                    }
                    this._scheduleAutosave();
                }
            });
        },

        // ── File attachments ──
        _handleFiles(fileList) {
            if (!fileList || !fileList.length) return;
            Array.from(fileList).forEach(file => {
                if (file.size > 5 * 1024 * 1024) { notify('File Too Large', `"${file.name}" exceeds 5 MB`); return; }
                const reader = new FileReader();
                reader.onload = () => {
                    const entry = { name: file.name, dataURL: reader.result, type: file.type };
                    if (file.type.startsWith('image/')) {
                        // Insert image inline
                        const bodyEl = $('#notes-rich-body');
                        if (bodyEl) {
                            bodyEl.focus();
                            document.execCommand('insertHTML', false,
                                `<img src="${entry.dataURL}" class="note-drawing-inline" alt="${escapeHtml(file.name)}"><p></p>`);
                        }
                    } else {
                        this._pendingFiles.push(entry);
                        this._renderAttachPreview();
                    }
                    this._scheduleAutosave();
                };
                reader.readAsDataURL(file);
            });
            const inp = $('#note-file-input');
            if (inp) inp.value = '';
        },

        _renderAttachPreview() {
            const preview = $('#note-attachments-preview');
            if (!preview) return;
            preview.innerHTML = this._pendingFiles.map((f, i) => {
                return `<div class="note-attach-thumb" data-idx="${i}">
                    <span class="attach-file-icon">${escapeHtml(f.name.split('.').pop().toUpperCase())}<br>${escapeHtml(f.name.substring(0, 12))}</span>
                    <button class="note-attach-remove" data-idx="${i}">&times;</button>
                </div>`;
            }).join('');
            preview.querySelectorAll('.note-attach-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    this._pendingFiles.splice(parseInt(e.currentTarget.dataset.idx), 1);
                    this._renderAttachPreview();
                    this._scheduleAutosave();
                });
            });
        },

        // ── Kept for dashboard / command palette compatibility ──
        render() { this.renderList(); },

        _syncDashboard() {
            state.dashboard.notesCount = state.notes.length;
            Dashboard.refresh();
        },

        _save() {
            Store.set(this.STORE_KEY, state.notes);
        }
    };

    // =========================================
    // Reflections Module
    // =========================================

    const Reflections = {
        STORE_KEY: 'pln_reflections',

        init() {
            state.reflections = Store.get(this.STORE_KEY, []);
            this._bindEvents();
            this.render();
        },

        _bindEvents() {
            const saveBtn = $('#save-reflection-btn');
            const list = $('#reflections-list');

            saveBtn?.addEventListener('click', () => this.save());

            list?.addEventListener('click', (e) => {
                // Expand / collapse
                const header = e.target.closest('.reflection-tl-header');
                if (header) {
                    const item = header.closest('.reflection-tl-item');
                    if (item) item.classList.toggle('open');
                    return;
                }
                // Delete
                const btn = e.target.closest('.reflection-delete-btn');
                if (btn) this.delete(parseInt(btn.dataset.reflectionId));
            });
        },

        save() {
            const fields = {
                learned: $('#reflection-learn')?.value.trim() || '',
                worked: $('#reflection-worked')?.value.trim() || '',
                improve: $('#reflection-improve')?.value.trim() || ''
            };

            if (!fields.learned && !fields.worked && !fields.improve) {
                notify('Empty Reflection', 'Please answer at least one question');
                return;
            }

            const now = new Date();
            const reflection = {
                id: Date.now(),
                ...fields,
                createdAt: now.toISOString(),
                displayDate: formatDateTime({
                    weekday: 'short', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                })
            };

            state.reflections.unshift(reflection);
            this._save();
            this.render();
            Streak.recordActivity();

            // Auto-open the new one
            const first = document.querySelector('.reflection-tl-item');
            if (first) first.classList.add('open');

            ['#reflection-learn', '#reflection-worked', '#reflection-improve']
                .forEach(sel => { const el = $(sel); if (el) el.value = ''; });

            notify('Reflection Saved! 💭', 'Your reflection has been saved successfully');
        },

        delete(id) {
            const reflection = state.reflections.find(r => r.id === id);
            if (!reflection) return;
            const idx = state.reflections.indexOf(reflection);
            const el = document.getElementById(`reflection-${id}`);

            const doDelete = () => {
                state.reflections = state.reflections.filter(r => r.id !== id);
                this.render();
                UndoQueue.push(
                    `Reflection deleted`,
                    () => {
                        state.reflections.splice(idx, 0, reflection);
                        this._save();
                        this.render();
                        notify('↩ Restored', `Reflection restored successfully`, 'success');
                    },
                    () => { this._save(); }
                );
            };

            if (el) {
                el.classList.add('deleting');
                setTimeout(doDelete, 350);
            } else {
                doDelete();
            }
        },

        render() {
            const list = $('#reflections-list');
            const empty = $('#empty-state-reflections');
            if (!list) return;

            if (state.reflections.length === 0) {
                list.innerHTML = '';
                empty?.classList.add('show');
                return;
            }
            empty?.classList.remove('show');

            list.innerHTML = state.reflections.map((r, i) => {
                const dateObj = new Date(r.createdAt);
                const isValidDate = !isNaN(dateObj);

                const dateLine = isValidDate
                    ? dateObj.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
                    : (r.displayDate || r.createdAt);

                const timeLine = isValidDate
                    ? dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                    : '';

                const timeAgo = isValidDate ? this._timeAgo(dateObj) : '';

                // Count how many sections filled
                const sections = [r.learned, r.worked, r.improve].filter(Boolean).length;

                // Build question blocks with staggered delays
                let qIdx = 0;
                const blocks = [];
                if (r.learned) {
                    blocks.push(`<div class="reflection-q-block reflection-q-block--learn" style="--q-delay:${qIdx * 80}ms">
                        <div class="reflection-q-title">💡 What did I learn?</div>
                        <p class="reflection-q-text">${escapeHtml(r.learned)}</p>
                    </div>`);
                    qIdx++;
                }
                if (r.worked) {
                    blocks.push(`<div class="reflection-q-block reflection-q-block--worked" style="--q-delay:${qIdx * 80}ms">
                        <div class="reflection-q-title">✅ What worked well?</div>
                        <p class="reflection-q-text">${escapeHtml(r.worked)}</p>
                    </div>`);
                    qIdx++;
                }
                if (r.improve) {
                    blocks.push(`<div class="reflection-q-block reflection-q-block--improve" style="--q-delay:${qIdx * 80}ms">
                        <div class="reflection-q-title">🎯 What can I improve?</div>
                        <p class="reflection-q-text">${escapeHtml(r.improve)}</p>
                    </div>`);
                }

                return `
                <div class="reflection-tl-item" id="reflection-${r.id}" style="--tl-delay:${i * 80}ms">
                    <div class="reflection-tl-dot"></div>
                    <div class="reflection-tl-card">
                        <div class="reflection-tl-header">
                            <div class="reflection-tl-date-group">
                                <div class="reflection-tl-date">${dateLine}</div>
                                <div class="reflection-tl-time">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                    ${timeLine}${timeAgo ? ` · ${timeAgo}` : ''}
                                </div>
                            </div>
                            <span class="reflection-tl-badge">${sections} topic${sections !== 1 ? 's' : ''}</span>
                            <div class="reflection-tl-chevron">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                            </div>
                        </div>
                        <div class="reflection-tl-body">
                            <div class="reflection-tl-body-inner">
                                ${blocks.join('')}
                                <div class="reflection-tl-footer">
                                    <button class="reflection-delete-btn" data-reflection-id="${r.id}">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
            }).join('');
        },

        _timeAgo(date) {
            const now = new Date();
            const diff = Math.floor((now - date) / 1000);
            if (diff < 60) return 'just now';
            if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
            if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
            if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
            return '';
        },

        _save() {
            Store.set(this.STORE_KEY, state.reflections);
        }
    };

    // =========================================
    // Internationalisation (EN / NO)
    // =========================================

    const I18n = {
        _current: 'no',

        _strings: {
            no: {
                loginSubtitle:      'Logg inn og fortsett der du slapp — alt er lagret og klart for deg',
                emailPlaceholder:   'E-post',
                passwordPlaceholder:'Passord',
                signIn:             'Logg inn',
                register:           'Opprett konto',
                signOut:            'Logg ut',
                syncActive:         'Synkronisert',
                searchPlaceholder:  'Søk...',
                exportBtn:          '⬇ Eksporter',
                importBtn:          '⬆ Importer',
                exportTitle:        'Last ned alle data som JSON-fil',
                importTitle:        'Last opp en tidligere eksportert JSON-fil',
                navDashboard:       'Dashboard',
                navGoals:           'Læringsmål',
                navResources:       'Ressurser',
                navNotes:           'Notater',
                navReflection:      'Refleksjon',
                dashWelcome:        'Velkommen til Kompass',
                dashSubtitle:       'Din personlige læringsreise — ett sted for mål, notater og vekst',
                quickOverview:      'Rask oversikt',
                totalGoals:         'Totale mål',
                totalGoalsSub:      'Mål du jobber mot',
                completedGoals:     'Fullførte mål',
                completedGoalsSub:  'Oppnådd og krysset av',
                notesCount:         'Antall notater',
                notesCountSub:      'Kunnskap fanget opp',
                learningProgress:   'Læringsframgang',
                complete:           '% Fullført',
                recentActivity:     'Nylig aktivitet',
                activity1:          '✓ Fullført: Web Development Course',
                activity2:          '✓ Lagt til: 3 nye ressurser',
                activity3:          '✓ Publisert: Læringsrefleksjon',
                goalsSub:           'Sett tydelige mål og se fremgangen din vokse over tid',
                overallProgress:    'Total fremgang',
                of:                 'av',
                goalsCompleted:     'mål fullført',
                goalPlaceholder:    'Legg til et nytt læringsmål... (f.eks. Mestre React Hooks)',
                addGoal:            '+ Legg til mål',
                goalsEmpty:         'Ingen mål ennå. Opprett ditt første læringsmål!',
                resourcesSub:       'Samle lenker, bøker og verktøy du vil huske — alltid tilgjengelig',
                filterAll:          'Alle ressurser',
                filterTypeLabel:    'Type',
                filterCatLabel:     'Kategori',
                filterCatAll:       'Alle',
                filterClearAll:     'Fjern alle filtre',
                resAddBtn:          'Legg til ressurs',
                resUpdateBtn:       'Oppdater ressurs',
                resAddTitle:        'Legg til ny ressurs',
                resEditTitle:       'Rediger ressurs',
                showing:            'Viser',
                resources:          'ressurser',
                notesSub:           'Skriv ned det du lærer mens det er ferskt — bygg din egen kunnskapsbase',
                notePlaceholder:    'Skriv læringsnotater her... (f.eks. nøkkelbegreper, innsikter)',
                saveNote:           '💾 Lagre notat',
                notesEmpty:         'Ingen notater ennå. Begynn å skrive ditt første notat!',
                reflectionSub:      'Se tilbake, tenk fremover — refleksjon er der læringen fester seg',
                reflectQ1:          '💡 Hva lærte jeg denne uken?',
                reflectQ1placeholder:'Del nøkkelbegreper, ferdigheter eller innsikter du fikk...',
                reflectQ2:          '✅ Hva fungerte bra?',
                reflectQ2placeholder:'Beskriv hva som gikk bra, suksesser eller positive resultater...',
                reflectQ3:          '🎯 Hva kan jeg forbedre?',
                reflectQ3placeholder:'Del forbedringsområder og handlingsplaner...',
                saveReflection:     '💭 Lagre refleksjon',
                prevReflections:    'Tidligere refleksjoner',
                reflectionsEmpty:   'Ingen refleksjoner ennå. Opprett din første refleksjon!',
                resCategoryLabel:   'Kategori',
                catDevelopment:     'Utvikling',
                catDriftsstotte:    'Driftstøtte',
                catBrukerstotte:    'Brukerstøtte',
                insightsTitle:      '📊 Læringsinnsikt',
                insightWeeklyGoals: 'Mål fullført denne uken',
                insightTopResource: 'Mest brukte ressurstype',
                insightNotesWritten:'Notater skrevet',
                insightWords:       'ord',
                insightDrawings:    'tegninger',
                navInsights:        'Innsikt',
                insightsHeading:    'Læringsinnsikt',
                insightsSub:        'Se hva du faktisk har oppnådd — tallene forteller din læringshistorie',
                insightsIntro:      'Oversikt over læringsaktiviteten din',
                insightGoalProgress:'Måloppnåelse',
                insightDeepDive:    'Dypdykk',

                streakDay:          'dags streak',
                streakDays:         'dagers streak',
                suggestionsTitle:   '💡 Forslag',
                suggestAddGoal:     'Legg til ditt første læringsmål for å komme i gang',
                suggestIncompleteGoals: 'Du har {n} ufullførte mål — fortsett!',
                suggestAddNote:     'Skriv ditt første notat for å fange opp læringen',
                suggestAddReflection: 'Opprett en refleksjon for å dokumentere reisen din',
                suggestAddResource: 'Legg til din første ressurs for å bygge samlingen',
                suggestGoToGoals:   'Gå til mål',
                suggestGoToNotes:   'Gå til notater',
                suggestGoToReflection: 'Gå til refleksjon',
                suggestGoToResources: 'Gå til ressurser',
                focusStartBtn:      '🎯 Start fokusøkt',
                focusLabel:         'Hold fokus',
                focusCancelBtn:     '✕ Avslutt økt',
                focusDoneTitle:     'Økt fullført!',
                focusDoneText:      'Bra jobba! Du holdt fokus i 25 minutter.',
                focusComplete:      'Fokusøkt fullført! 🎉',
                focusCompleteMsg:   'Du fullførte en 25-minutters fokusøkt',
                pdfBtn:             '📄 Eksporter PDF',
                pdfReportTitle:     'Læringsrapport',
                pdfGeneratedOn:     'Generert',
                pdfGoalCol:         'Mål',
                pdfCategoryCol:     'Kategori',
                pdfDateCol:         'Dato',
                pdfExportTitle:     'PDF klar! 📄',
                pdfExportMsg:       'Rapporten åpnes i et nytt vindu — bruk Lagre som PDF',
                pdfBlockedTitle:    'Popup blokkert',
                pdfBlockedMsg:      'Tillat popups for å eksportere PDF',
                sectionTitles: {
                    dashboard: 'Dashboard', goals: 'Læringsmål',
                    resources: 'Ressurser', notes: 'Notater', reflection: 'Refleksjon',
                    insights: 'Innsikt'
                },
                loginHeroTagline:    'Din personlige læringsapp — sett mål, bygg vaner og se veksten din over tid.',
                loginFeature1Title:  'Sett læringsmål',
                loginFeature1Sub:    'Følg fremgangen og feir milepæler',
                loginFeature2Title:  'Ta smarte notater',
                loginFeature2Sub:    'Med tegning, vedlegg og tidslinje',
                loginFeature3Title:  'Se innsikt og statistikk',
                loginFeature3Sub:    'Visualiser læringsreisen din',
                loginFeature4Title:  'Synkroniser overalt',
                loginFeature4Sub:    'Tilgjengelig på alle enheter, alltid',
                loginHeroBadge:      '✦ Gratis å bruke',
                loginMobileSubtitle: 'Kompass hjelper deg å holde oversikt over det du lærer — og hvor du er på vei',
                loginFormTitle:      'Velkommen tilbake',
                loginFormSubtitle:   'Logg inn og fortsett der du slapp',
                loginEmailLabel:     'E-postadresse',
                loginPasswordLabel:  'Passord',
                loginEmailPlaceholder: 'deg@eksempel.no',
                loginPwPlaceholder:  'Skriv inn passordet ditt',
                loginForgotPw:       'Glemt passord?',
                loginSignInBtn:      'Logg inn',
                loginDividerNew:     'Ny bruker?',
                loginRegisterHint:   'Ingen konto ennå? Det tar under ett minutt og er helt gratis.',
                loginRegisterBtn:    '✦ Opprett gratis konto',
                forgotPwTitle:       'Glemt passord?',
                forgotPwSubtitle:    'Skriv inn e-posten din — vi sender deg en tilbakestillingslenke',
                forgotPwEmailLabel:  'E-postadresse',
                forgotPwEmailPh:     'deg@eksempel.no',
                forgotPwSubmitBtn:   'Send tilbakestillingslenke',
                forgotPwFooter:      'Husket du det?',
                forgotPwBack:        'Logg inn',
                regTitle:            'Opprett gratis konto',
                regSubtitle:         'Gratis for alltid — kom i gang på under ett minutt',
                regEmailLabel:       'E-postadresse',
                regEmailPh:          'deg@eksempel.no',
                regPasswordLabel:    'Passord',
                regPwPh:             'Minst 12 tegn',
                regConfirmLabel:     'Bekreft passord',
                regConfirmPh:        'Skriv passordet på nytt',
                regSubmitBtn:        'Opprett konto',
                regFooter:           'Har du allerede en konto?',
                regBack:             'Logg inn',
                pwHintLength:        'Minst 12 tegn',
                pwHintUpper:         'Stor og liten bokstav',
                pwHintNumber:        'Minst ett tall',
                pwHintSpecial:       'Minst ett spesialtegn (!@#…)',
                mobHome: 'Hjem',
                mobGoals: 'Mål',
                mobResources: 'Ressurser',
                mobNotes: 'Notater',
                mobReflect: 'Refleksjon',
                mobInsights: 'Innsikt'
            },
            en: {
                loginSubtitle:      'Welcome back — pick up right where you left off',
                emailPlaceholder:   'Email',
                passwordPlaceholder:'Password',
                signIn:             'Sign In',
                register:           'Create Account',
                signOut:            'Sign Out',
                syncActive:         'Synced',
                searchPlaceholder:  'Search...',
                exportBtn:          '⬇ Export',
                importBtn:          '⬆ Import',
                exportTitle:        'Download all data as JSON file',
                importTitle:        'Upload a previously exported JSON file',
                navDashboard:       'Dashboard',
                navGoals:           'Learning Goals',
                navResources:       'Resources',
                navNotes:           'Notes',
                navReflection:      'Reflection',
                dashWelcome:        'Welcome to Kompass',
                dashSubtitle:       'Your personal learning journey — one place for goals, notes and growth',
                quickOverview:      'Quick Overview',
                totalGoals:         'Total Goals',
                totalGoalsSub:      'Goals you\'re working towards',
                completedGoals:     'Completed Goals',
                completedGoalsSub:  'Achieved and checked off',
                notesCount:         'Notes Count',
                notesCountSub:      'Knowledge captured',
                learningProgress:   'Learning Progress',
                complete:           'Complete',
                recentActivity:     'Recent Activity',
                activity1:          '✓ Completed: Web Development Course',
                activity2:          '✓ Added: 3 new resources',
                activity3:          '✓ Published: Learning reflection',
                goalsSub:           'Set clear goals and watch your progress grow over time',
                overallProgress:    'Overall Progress',
                of:                 'of',
                goalsCompleted:     'goals completed',
                goalPlaceholder:    'Add a new learning goal... (e.g., Master React Hooks)',
                addGoal:            '+ Add Goal',
                goalsEmpty:         'No goals yet. Create your first learning goal!',
                resourcesSub:       'Save links, books and tools you want to remember — always at hand',
                filterAll:          'All Resources',
                filterTypeLabel:    'Type',
                filterCatLabel:     'Category',
                filterCatAll:       'All',
                filterClearAll:     'Clear all filters',
                resAddBtn:          'Add Resource',
                resUpdateBtn:       'Update Resource',
                resAddTitle:        'Add New Resource',
                resEditTitle:       'Edit Resource',
                showing:            'Showing',
                resources:          'resources',
                notesSub:           'Write down what you learn while it\'s fresh — build your own knowledge base',
                notePlaceholder:    'Write your learning notes here... (e.g., Key concepts, insights, action items)',
                saveNote:           '💾 Save Note',
                notesEmpty:         'No notes yet. Start writing your first note!',
                reflectionSub:      'Look back, think ahead — reflection is where learning sticks',
                reflectQ1:          '💡 What did I learn this week?',
                reflectQ1placeholder:'Share the key concepts, skills, or insights you gained...',
                reflectQ2:          '✅ What worked well?',
                reflectQ2placeholder:'Describe what went well, successes, or positive outcomes...',
                reflectQ3:          '🎯 What can I improve?',
                reflectQ3placeholder:'Share areas for improvement and action items...',
                saveReflection:     '💭 Save Reflection',
                prevReflections:    'Previous Reflections',
                reflectionsEmpty:   'No reflections yet. Create your first reflection!',
                resCategoryLabel:   'Category',
                catDevelopment:     'Development',
                catDriftsstotte:    'Operations Support',
                catBrukerstotte:    'User Support',
                insightsTitle:      '📊 Learning Insights',
                insightWeeklyGoals: 'Goals Completed This Week',
                insightTopResource: 'Most Used Resource Type',
                insightNotesWritten:'Notes Written',
                insightWords:       'words',
                insightDrawings:    'drawings',
                navInsights:        'Insights',
                insightsHeading:    'Learning Insights',
                insightsSub:        'See what you\'ve actually achieved — the numbers tell your learning story',
                insightsIntro:      'Overview of your learning activity',
                insightGoalProgress:'Goal Completion',
                insightDeepDive:    'Deep Dive',
                streakDay:          'day streak',
                streakDays:         'day streak',
                suggestionsTitle:   '💡 Suggestions',
                suggestAddGoal:     'Add your first learning goal to get started',
                suggestIncompleteGoals: 'You have {n} unfinished goals — keep going!',
                suggestAddNote:     'Write your first note to capture your learning',
                suggestAddReflection: 'Create a reflection to document your journey',
                suggestAddResource: 'Add your first resource to build your collection',
                suggestGoToGoals:   'Go to Goals',
                suggestGoToNotes:   'Go to Notes',
                suggestGoToReflection: 'Go to Reflection',
                suggestGoToResources: 'Go to Resources',
                focusStartBtn:      '🎯 Start Focus Session',
                focusLabel:         'Stay focused',
                focusCancelBtn:     '✕ End Session',
                focusDoneTitle:     'Session Complete!',
                focusDoneText:      'Great work! You stayed focused for 25 minutes.',
                focusComplete:      'Focus Session Complete! 🎉',
                focusCompleteMsg:   'You completed a 25-minute focus session',
                pdfBtn:             '📄 Export PDF',
                pdfReportTitle:     'Learning Report',
                pdfGeneratedOn:     'Generated on',
                pdfGoalCol:         'Goal',
                pdfCategoryCol:     'Category',
                pdfDateCol:         'Date',
                pdfExportTitle:     'PDF Ready! 📄',
                pdfExportMsg:       'Report opened in a new window — use Save as PDF',
                pdfBlockedTitle:    'Popup Blocked',
                pdfBlockedMsg:      'Allow popups to export the PDF report',
                sectionTitles: {
                    dashboard: 'Dashboard', goals: 'Learning Goals',
                    resources: 'Resources', notes: 'Notes', reflection: 'Reflection',
                    insights: 'Insights'
                },
                mobHome: 'Home',
                loginHeroTagline:    'Your personal learning app — set goals, build habits and track your growth.',
                loginFeature1Title:  'Set learning goals',
                loginFeature1Sub:    'Track progress and celebrate milestones',
                loginFeature2Title:  'Take smart notes',
                loginFeature2Sub:    'With drawing, attachments and timeline',
                loginFeature3Title:  'View insights & statistics',
                loginFeature3Sub:    'Visualise your learning journey',
                loginFeature4Title:  'Sync everywhere',
                loginFeature4Sub:    'Available on all devices, always',
                loginHeroBadge:      '✦ Free to use',
                loginMobileSubtitle: 'Kompass helps you keep track of what you\'re learning — and where you\'re headed',
                loginFormTitle:      'Welcome back',
                loginFormSubtitle:   'Sign in and pick up where you left off',
                loginEmailLabel:     'Email address',
                loginPasswordLabel:  'Password',
                loginEmailPlaceholder: 'you@example.com',
                loginPwPlaceholder:  'Enter your password',
                loginForgotPw:       'Forgot password?',
                loginSignInBtn:      'Sign in',
                loginDividerNew:     'New here?',
                loginRegisterHint:   'No account yet? Takes under a minute and it\'s completely free.',
                loginRegisterBtn:    '✦ Create free account',
                forgotPwTitle:       'Forgot your password?',
                forgotPwSubtitle:    'Enter your email — we\'ll send you a reset link',
                forgotPwEmailLabel:  'Email address',
                forgotPwEmailPh:     'you@example.com',
                forgotPwSubmitBtn:   'Send reset link',
                forgotPwFooter:      'Remember it now?',
                forgotPwBack:        'Sign in',
                regTitle:            'Create a free account',
                regSubtitle:         'Free forever — get started in under a minute',
                regEmailLabel:       'Email address',
                regEmailPh:          'you@example.com',
                regPasswordLabel:    'Password',
                regPwPh:             'At least 12 characters',
                regConfirmLabel:     'Confirm password',
                regConfirmPh:        'Re-enter your password',
                regSubmitBtn:        'Create account',
                regFooter:           'Already have an account?',
                regBack:             'Sign in',
                pwHintLength:        'At least 12 characters',
                pwHintUpper:         'Upper and lowercase letters',
                pwHintNumber:        'At least one number',
                pwHintSpecial:       'At least one special character (!@#…)',
                mobGoals: 'Goals',
                mobResources: 'Resources',
                mobNotes: 'Notes',
                mobReflect: 'Reflect',
                mobInsights: 'Insights'
            }
        },

        get current() { return this._current; },

        t(key) {
            return this._strings[this._current][key] ?? this._strings.en[key] ?? key;
        },

        apply() {
            const lang = this._current;
            const strings = this._strings[lang];

            document.documentElement.lang = lang;

            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                if (strings[key] !== undefined) el.textContent = strings[key];
            });

            document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
                const key = el.getAttribute('data-i18n-placeholder');
                if (strings[key] !== undefined) el.placeholder = strings[key];
            });

            document.querySelectorAll('[data-i18n-title]').forEach(el => {
                const key = el.getAttribute('data-i18n-title');
                if (strings[key] !== undefined) el.title = strings[key];
            });

            // Update section titles used by Navigation
            Object.assign(SECTION_TITLES, strings.sectionTitles);

            // Update the currently visible page title
            const activeSection = document.querySelector('.content-section.active');
            if (activeSection) {
                const pageTitle = $('.page-title');
                if (pageTitle) pageTitle.textContent = strings.sectionTitles[activeSection.id] || pageTitle.textContent;
            }

            // Update the lang button flag + code
            const btn = $('#lang-toggle-btn');
            const flag = $('#lang-flag');
            const code = $('#lang-code');
            if (flag) flag.textContent = lang === 'no' ? '🇳🇴' : '🇬🇧';
            if (code) code.textContent = lang === 'no' ? 'NO' : 'EN';
            const loginFlag = $('#login-lang-flag');
            const loginCode = $('#login-lang-code');
            if (loginFlag) loginFlag.textContent = lang === 'no' ? '🇳🇴' : '🇬🇧';
            if (loginCode) loginCode.textContent = lang === 'no' ? 'NO' : 'EN';

            // Re-render dynamic text that uses I18n.t()
            Streak.render();
            Suggestions.refresh();
        },

        toggle() {
            this._current = this._current === 'no' ? 'en' : 'no';
            Store.setRaw('pln_lang', this._current);
            this.apply();
        },

        init() {
            const saved = Store.getRaw('pln_lang');
            if (saved === 'en' || saved === 'no') this._current = saved;
            this.apply();
            $('#lang-toggle-btn')?.addEventListener('click', () => this.toggle());
            $('#login-lang-btn')?.addEventListener('click', () => this.toggle());
        }
    };

    // =========================================
    // Data Export / Import
    // =========================================

    const DataIO = {
        init() {
            $('#export-btn')?.addEventListener('click', () => this.exportData());
            $('#import-input')?.addEventListener('change', (e) => this.importData(e));
            $('#export-pdf-btn')?.addEventListener('click', () => this.exportPDF());
        },

        exportPDF() {
            const t = (k) => I18n.t(k);
            const date = new Date().toLocaleDateString(I18n.current === 'no' ? 'nb-NO' : 'en-US', {
                year: 'numeric', month: 'long', day: 'numeric'
            });

            const esc = (s) => {
                const d = document.createElement('div');
                d.textContent = s || '';
                return d.innerHTML;
            };

            // Build goals section
            let goalsHtml = '';
            if (state.goals.length) {
                goalsHtml = state.goals.map(g => `
                    <tr>
                        <td>${g.completed ? '✅' : '⬜'}</td>
                        <td>${esc(g.text)}</td>
                        <td><span class="cat">${esc(g.category || '—')}</span></td>
                        <td>${esc(g.createdAt || '—')}</td>
                    </tr>
                `).join('');
            } else {
                goalsHtml = `<tr><td colspan="4" class="empty">${esc(t('goalsEmpty'))}</td></tr>`;
            }

            // Build notes section
            let notesHtml = '';
            if (state.notes.length) {
                notesHtml = state.notes.map(n => `
                    <div class="note-block">
                        <div class="note-meta">${esc(n.displayDate || '—')}${n.wordCount ? ' · ' + n.wordCount + ' ' + t('insightWords') : ''}</div>
                        <div class="note-body">${esc(n.content || '')}</div>
                    </div>
                `).join('');
            } else {
                notesHtml = `<p class="empty">${esc(t('notesEmpty'))}</p>`;
            }

            // Build reflections section
            let reflectionsHtml = '';
            if (state.reflections.length) {
                reflectionsHtml = state.reflections.map(r => `
                    <div class="reflection-block">
                        <div class="note-meta">${esc(r.displayDate || '—')}</div>
                        ${r.learned  ? `<div class="rq"><strong>${esc(t('reflectQ1'))}</strong><p>${esc(r.learned)}</p></div>` : ''}
                        ${r.worked   ? `<div class="rq"><strong>${esc(t('reflectQ2'))}</strong><p>${esc(r.worked)}</p></div>` : ''}
                        ${r.improve  ? `<div class="rq"><strong>${esc(t('reflectQ3'))}</strong><p>${esc(r.improve)}</p></div>` : ''}
                    </div>
                `).join('');
            } else {
                reflectionsHtml = `<p class="empty">${esc(t('reflectionsEmpty'))}</p>`;
            }

            // Stats
            const totalGoals = state.goals.length;
            const completedGoals = state.goals.filter(g => g.completed).length;
            const totalNotes = state.notes.length;
            const totalReflections = state.reflections.length;

            const html = `<!DOCTYPE html>
<html lang="${I18n.current}">
<head>
<meta charset="UTF-8">
<title>PLN Report – ${esc(date)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#1e293b;line-height:1.6;padding:40px 48px;max-width:900px;margin:0 auto}
h1{font-size:28px;font-weight:800;margin-bottom:2px}
.subtitle{color:#64748b;font-size:14px;margin-bottom:32px}
h2{font-size:20px;font-weight:700;margin:32px 0 12px;padding-bottom:6px;border-bottom:2px solid #e2e8f0}
.stats{display:flex;gap:16px;margin-bottom:28px}
.stat{flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;text-align:center}
.stat-val{font-size:28px;font-weight:700;color:#6366f1}
.stat-lbl{font-size:12px;color:#64748b;margin-top:2px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0}
th{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;background:#f8fafc}
.cat{display:inline-block;padding:2px 8px;background:#f1f5f9;border-radius:4px;font-size:11px}
.note-block,.reflection-block{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin-bottom:10px}
.note-meta{font-size:11px;color:#94a3b8;margin-bottom:6px}
.note-body{font-size:13px;white-space:pre-wrap}
.rq{margin-top:8px}
.rq strong{font-size:12px;color:#6366f1}
.rq p{font-size:13px;margin-top:2px}
.empty{color:#94a3b8;font-style:italic;text-align:center;padding:20px}
.footer{margin-top:40px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px}
@media print{body{padding:20px 24px}h1{font-size:22px}h2{font-size:17px}.stat-val{font-size:22px}}
</style>
</head>
<body>
<h1>📋 PLN ${esc(t('pdfReportTitle'))}</h1>
<p class="subtitle">${esc(t('pdfGeneratedOn'))} ${esc(date)}</p>

<div class="stats">
<div class="stat"><div class="stat-val">${totalGoals}</div><div class="stat-lbl">${esc(t('totalGoals'))}</div></div>
<div class="stat"><div class="stat-val">${completedGoals}</div><div class="stat-lbl">${esc(t('completedGoals'))}</div></div>
<div class="stat"><div class="stat-val">${totalNotes}</div><div class="stat-lbl">${esc(t('notesCount'))}</div></div>
<div class="stat"><div class="stat-val">${totalReflections}</div><div class="stat-lbl">${esc(t('navReflection'))}</div></div>
</div>

<h2>🎯 ${esc(t('navGoals'))}</h2>
<table>
<thead><tr><th></th><th>${esc(t('pdfGoalCol'))}</th><th>${esc(t('pdfCategoryCol'))}</th><th>${esc(t('pdfDateCol'))}</th></tr></thead>
<tbody>${goalsHtml}</tbody>
</table>

<h2>📝 ${esc(t('navNotes'))}</h2>
${notesHtml}

<h2>💭 ${esc(t('navReflection'))}</h2>
${reflectionsHtml}

<div class="footer">Kompass · ${esc(date)}</div>
</body>
</html>`;

            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                notify(t('pdfBlockedTitle'), t('pdfBlockedMsg'), 'warning');
                return;
            }
            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.addEventListener('load', () => {
                printWindow.print();
            });
            notify(t('pdfExportTitle'), t('pdfExportMsg'), 'success');
        },

        exportData() {
            const payload = {
                exportedAt: new Date().toISOString(),
                version: 1,
                goals: state.goals,
                notes: state.notes,
                reflections: state.reflections
            };

            const json = JSON.stringify(payload, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const date = new Date().toISOString().slice(0, 10);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pln-backup-${date}.json`;
            a.click();
            URL.revokeObjectURL(url);

            notify('Eksport fullført!', 'Data lastet ned som JSON-fil', 'success');
        },

        importData(e) {
            const file = e.target.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const parsed = JSON.parse(ev.target.result);

                    if (!parsed.version || !Array.isArray(parsed.goals)) {
                        throw new Error('Ugyldig filformat');
                    }

                    // Merge imported data with existing (import adds, does not overwrite)
                    const existingGoalIds = new Set(state.goals.map(g => g.id));
                    const existingNoteIds = new Set(state.notes.map(n => n.id));
                    const existingReflectionIds = new Set(state.reflections.map(r => r.id));

                    const newGoals = (parsed.goals || []).filter(g => !existingGoalIds.has(g.id));
                    const newNotes = (parsed.notes || []).filter(n => !existingNoteIds.has(n.id));
                    const newReflections = (parsed.reflections || []).filter(r => !existingReflectionIds.has(r.id));

                    state.goals.push(...newGoals);
                    state.notes.push(...newNotes);
                    state.reflections.push(...newReflections);

                    Store.set('pln_goals', state.goals);
                    Store.set('pln_notes', state.notes);
                    Store.set('pln_reflections', state.reflections);

                    Goals.render();
                    Goals.updateProgress();
                    Notes.render();
                    Notes._syncDashboard();
                    Reflections.render();

                    const total = newGoals.length + newNotes.length + newReflections.length;
                    notify('Import fullført!', `${total} nye element(er) ble lagt til`, 'success');
                } catch {
                    notify('Importfeil', 'Filen er ugyldig eller skadet', 'error');
                } finally {
                    e.target.value = '';
                }
            };
            reader.readAsText(file);
        }
    };

    // =========================================
    // Cloud Sync (Supabase)
    // =========================================

    const CloudSync = {
        _saveTimer: null,
        _isSaving: false,

        scheduleSave(immediate = false) {
            clearTimeout(this._saveTimer);
            if (immediate) {
                this._save();
            } else {
                this._saveTimer = setTimeout(() => this._save(), 1500);
            }
        },

        async _save() {
            if (!supabaseClient) return;
            if (this._isSaving) {
                clearTimeout(this._saveTimer);
                this._saveTimer = setTimeout(() => this._save(), 1500);
                return;
            }
            this._isSaving = true;
            const container = $('.sections-container');
            try {
                const { data: { user } } = await supabaseClient.auth.getUser();
                if (!user) { this._isSaving = false; return; }

                if (container) container.classList.add('syncing');
                const { error } = await supabaseClient.from('user_data').upsert({
                    user_id: user.id,
                    goals: state.goals,
                    notes: state.notes,
                    reflections: state.reflections,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });
                if (error) {
                    console.error('CloudSync._save failed:', error);
                    notify('Synk feilet', error.message || 'Kunne ikke lagre til skyen', 'error');
                } else {
                    notify('Lagret i skyen ☁️', 'Dataene dine er synkronisert', 'success');
                }
            } catch (err) {
                console.error('CloudSync._save critical error:', err);
                notify('Synk feilet', err.message || 'Ukjent feil ved lagring', 'error');
            } finally {
                this._isSaving = false;
                if (container) container.classList.remove('syncing');
            }
        },

        async load() {
            if (!supabaseClient) return;
            const container = $('.sections-container');
            // Disable write hook during load to avoid a feedback loop
            const prevHook = Store._onWrite;
            Store._onWrite = null;

            try {
                const { data: { user } } = await supabaseClient.auth.getUser();
                if (!user) { Store._onWrite = prevHook; return; }

                if (container) container.classList.add('syncing');
                const { data, error } = await supabaseClient
                    .from('user_data')
                    .select('*')
                    .eq('user_id', user.id)
                    .single();

                if (error && error.code === 'PGRST116') {
                    // No row yet – first login, push local data to cloud
                    Store._onWrite = prevHook;
                    await this._save();
                    return;
                }

                if (error) throw error;

                // Rebuild array using remote order as source of truth, appending any new local-only items
                const merge = (local, remote) => {
                    const remoteArr = remote || [];
                    const remoteIds = new Set(remoteArr.map(i => i.id));
                    const localOnly = local.filter(i => !remoteIds.has(i.id));
                    
                    // Supabase sends items in the exact array order they were saved
                    const merged = [...remoteArr, ...localOnly];
                    return merged.length ? merged : local;
                };

                state.goals       = merge(state.goals,       data.goals);
                state.notes       = merge(state.notes,       data.notes);
                state.reflections = merge(state.reflections, data.reflections);

                // Persist merged result to localStorage
                localStorage.setItem('pln_goals',       JSON.stringify(state.goals));
                localStorage.setItem('pln_notes',       JSON.stringify(state.notes));
                localStorage.setItem('pln_reflections', JSON.stringify(state.reflections));

                Goals.render();
                Goals.updateProgress();
                Notes.render();
                Notes._syncDashboard();
                Reflections.render();
                Navigation.updateBadges();

                notify('Synkronisert ☁️', 'Data lastet inn fra skyen', 'success');
            } catch (e) {
                console.error('CloudSync.load failed:', e);
                notify('Synk feilet', 'Kunne ikke hente data fra skyen', 'error');
            } finally {
                Store._onWrite = prevHook;
                if (container) container.classList.remove('syncing');
            }
        }
    };

    // =========================================
    // Authentication (Email + Password via Supabase)
    // =========================================

    const Auth = {
        init() {
            // If Supabase isn't configured (config not filled in), skip and hide overlay
            if (!supabaseClient) {
                $('#login-overlay')?.classList.add('hidden');
                return;
            }

            // React to sign-in / sign-out (also fires on page load for existing sessions)
            supabaseClient.auth.onAuthStateChange((event, session) => {
                if (session?.user) this._onSignedIn(session.user);
                else this._onSignedOut();
            });

            const getFields = () => ({
                email:    $('#auth-email')?.value?.trim(),
                password: $('#auth-password')?.value
            });

            // Sign in
            $('#btn-signin')?.addEventListener('click', async () => {
                const { email, password } = getFields();
                if (!email || !password) { notify('Mangler felt', 'Fyll inn e-post og passord', 'warning'); return; }

                const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
                if (error) notify('Innloggingsfeil', error.message, 'error');
            });

            // Register new account — open modal instead of inline form
            const regModal    = $('#reg-modal-overlay');
            const regNote     = $('#reg-note');
            const regEmailEl  = $('#reg-email');
            const regPwEl     = $('#reg-password');
            const regPw2El    = $('#reg-password2');
            const strengthEl  = $('#pw-strength');
            const strengthLbl = $('#pw-strength-label');
            const matchMsg    = $('#pw-match-msg');
            const hints       = {
                length:  $('#pw-hints [data-rule="length"]'),
                upper:   $('#pw-hints [data-rule="upper"]'),
                number:  $('#pw-hints [data-rule="number"]'),
                special: $('#pw-hints [data-rule="special"]'),
            };

            const pwStrengthLabels = ['', 'Svak', 'Middels', 'Bra', 'Sterk'];

            function evalPassword(pw) {
                const rules = {
                    length:  pw.length >= 12,
                    upper:   /[A-Z]/.test(pw) && /[a-z]/.test(pw),
                    number:  /\d/.test(pw),
                    special: /[^A-Za-z0-9]/.test(pw),
                };
                // Extra: longer passwords give bonus
                const bonus = pw.length >= 16 ? 1 : 0;
                const score = Math.min(4, Object.values(rules).filter(Boolean).length + bonus - (rules.length ? 0 : 1));
                return { rules, score: Math.max(0, score) };
            }

            function updateStrength() {
                const pw = regPwEl?.value || '';
                if (!pw) {
                    if (strengthEl) strengthEl.removeAttribute('data-level');
                    if (strengthLbl) strengthLbl.textContent = '';
                    Object.values(hints).forEach(el => el?.classList.remove('met'));
                    return;
                }
                const { rules, score } = evalPassword(pw);
                if (strengthEl) strengthEl.dataset.level = score;
                if (strengthLbl) strengthLbl.textContent = pwStrengthLabels[score] || '';
                Object.entries(rules).forEach(([rule, met]) => {
                    hints[rule]?.classList.toggle('met', met);
                });
            }

            function updateMatch() {
                const pw  = regPwEl?.value || '';
                const pw2 = regPw2El?.value || '';
                if (!matchMsg) return;
                if (!pw2) { matchMsg.textContent = ''; matchMsg.className = 'pw-match-msg'; return; }
                if (pw === pw2) {
                    matchMsg.textContent = '✓ Passordene stemmer overens';
                    matchMsg.className = 'pw-match-msg match';
                } else {
                    matchMsg.textContent = '✗ Passordene er ikke like';
                    matchMsg.className = 'pw-match-msg mismatch';
                }
            }

            function openRegModal() {
                if (!regModal) return;
                // Pre-fill email if already typed in login form
                const loginEmail = $('#auth-email')?.value?.trim();
                if (loginEmail && regEmailEl) regEmailEl.value = loginEmail;
                regModal.classList.remove('hidden');
                regEmailEl?.focus();
            }

            function closeRegModal() {
                regModal?.classList.add('hidden');
                // Reset form
                if (regEmailEl)  regEmailEl.value  = '';
                if (regPwEl)     regPwEl.value      = '';
                if (regPw2El)    regPw2El.value     = '';
                if (regNote)     regNote.textContent = '';
                if (matchMsg)    { matchMsg.textContent = ''; matchMsg.className = 'pw-match-msg'; }
                if (strengthEl)  { strengthEl.removeAttribute('data-level'); }
                if (strengthLbl) strengthLbl.textContent = '';
                Object.values(hints).forEach(el => el?.classList.remove('met'));
            }

            $('#btn-register')?.addEventListener('click', openRegModal);

            $('#reg-modal-close')?.addEventListener('click', closeRegModal);
            $('#reg-back-link')?.addEventListener('click', closeRegModal);

            // Close on backdrop click
            regModal?.addEventListener('click', (e) => {
                if (e.target === regModal) closeRegModal();
            });

            // Close on Escape
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && regModal && !regModal.classList.contains('hidden')) closeRegModal();
            });

            regPwEl?.addEventListener('input', () => { updateStrength(); updateMatch(); });
            regPw2El?.addEventListener('input', updateMatch);

            $('#btn-reg-submit')?.addEventListener('click', async () => {
                const email = regEmailEl?.value?.trim();
                const pw    = regPwEl?.value;
                const pw2   = regPw2El?.value;

                if (!email || !pw) { notify('Mangler felt', 'Fyll inn e-post og passord', 'warning'); return; }
                if (pw.length < 12) { notify('Passord for kort', 'Passordet må være minst 12 tegn', 'warning'); return; }
                if (pw !== pw2) { notify('Passord stemmer ikke', 'De to passordene er ikke like', 'warning'); return; }

                const btn = $('#btn-reg-submit');
                if (btn) { btn.disabled = true; btn.querySelector('span').textContent = 'Oppretter…'; }

                const { error } = await supabaseClient.auth.signUp({ email, password: pw });

                if (btn) { btn.disabled = false; btn.querySelector('span').textContent = 'Opprett konto'; }

                if (error) {
                    notify('Registreringsfeil', error.message, 'error');
                    if (regNote) regNote.textContent = '⚠ ' + error.message;
                } else {
                    closeRegModal();
                    notify('Konto opprettet! 🎉', 'Du kan nå logge inn med ditt passord', 'success');
                    const note = $('#auth-note');
                    if (note) note.textContent = '✅ Konto opprettet! Du kan nå logge inn.';
                }
            });

            // Allow Enter in reg form to submit
            [regEmailEl, regPwEl, regPw2El].forEach(el => {
                el?.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') $('#btn-reg-submit')?.click();
                });
            });

            // Allow Enter key to trigger sign in
            ['auth-email', 'auth-password'].forEach(id => {
                $(`#${id}`)?.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') $('#btn-signin')?.click();
                });
            });

            // ---- Forgot Password ----
            const forgotModal = $('#forgot-pw-modal');

            function openForgotModal() {
                const loginEmail = $('#auth-email')?.value?.trim();
                const fpEmail = $('#forgot-pw-email');
                if (loginEmail && fpEmail) fpEmail.value = loginEmail;
                forgotModal?.classList.remove('hidden');
                fpEmail?.focus();
            }

            function closeForgotModal() {
                forgotModal?.classList.add('hidden');
                const fpNote = $('#forgot-pw-note');
                if (fpNote) fpNote.textContent = '';
            }

            $('#forgot-pw-link')?.addEventListener('click', openForgotModal);
            $('#forgot-pw-close')?.addEventListener('click', closeForgotModal);
            $('#forgot-pw-back')?.addEventListener('click', closeForgotModal);
            forgotModal?.addEventListener('click', (e) => { if (e.target === forgotModal) closeForgotModal(); });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && forgotModal && !forgotModal.classList.contains('hidden')) closeForgotModal();
            });

            $('#forgot-pw-email')?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') $('#btn-forgot-pw-submit')?.click();
            });

            $('#btn-forgot-pw-submit')?.addEventListener('click', async () => {
                const email = $('#forgot-pw-email')?.value?.trim();
                if (!email) { notify('Mangler e-post', 'Fyll inn e-postadressen din', 'warning'); return; }

                const btn = $('#btn-forgot-pw-submit');
                const btnLabel = btn?.querySelector('span');
                if (btn) { btn.disabled = true; if (btnLabel) btnLabel.textContent = 'Sender…'; }

                const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin
                });

                if (btn) { btn.disabled = false; if (btnLabel) btnLabel.textContent = 'Send tilbakestillingslenke'; }

                const fpNote = $('#forgot-pw-note');
                if (error) {
                    notify('Feil', error.message, 'error');
                } else {
                    if (fpNote) fpNote.textContent = '✅ Sjekk e-posten din for tilbakestillingslenke';
                    notify('E-post sendt! 📧', 'Sjekk innboksen din for tilbakestillingslenken', 'success');
                }
            });

            // Start auto-logout only after sign-in (set up in _onSignedIn)

            // Sign-out button is now inside the avatar dropdown — wired in ProfileModal
            $('#signout-btn')?.addEventListener('click', () => {
                supabaseClient.auth.signOut()
                    .then(() => notify('Logget ut', 'Du er nå logget ut', 'info'));
            });

            ProfileModal.init();
        },

        _onSignedIn(user) {
            $('#login-overlay')?.classList.add('hidden');

            Auth._updateAvatarUI(user);

            const signoutBtn = $('#signout-btn');
            if (signoutBtn) signoutBtn.hidden = false;

            const syncBadge = $('#sync-badge');
            if (syncBadge) syncBadge.hidden = false;

            Store._onWrite = () => CloudSync.scheduleSave();
            CloudSync.load();
            AutoLogout.start();
            Onboarding.maybeShow();
            RealtimeSync.init();
        },

        _updateAvatarUI(user) {
            const meta = user.user_metadata || {};
            const name = meta.display_name || user.email || '';
            const initial = escapeHtml((name[0] || '👤').toUpperCase());
            const color = meta.avatar_color || '#7c8fff';
            const avatar = $('#user-avatar');
            if (avatar) {
                avatar.innerHTML = initial;
                avatar.title = name;
                avatar.style.background = color;
            }
            // also update dropdown email
            const dropEmail = $('#avatar-dropdown-email');
            if (dropEmail) dropEmail.textContent = user.email;
        },

        _onSignedOut() {
            const input = $('#auth-password');
            if (input) input.value = '';
            const note = $('#auth-note');
            if (note) note.textContent = '';

            $('#login-overlay')?.classList.remove('hidden');
            AutoLogout.stop();
            ProfileModal.close();

            const avatar = $('#user-avatar');
            if (avatar) {
                avatar.innerHTML = '👤';
                avatar.title = '';
                avatar.style.background = '';
            }

            const signoutBtn = $('#signout-btn');
            if (signoutBtn) signoutBtn.hidden = true;

            const syncBadge = $('#sync-badge');
            if (syncBadge) syncBadge.hidden = true;

            Store._onWrite = null;
            RealtimeSync.stop();
        }
    };

    // =========================================
    // Profile Modal
    // =========================================

    const ProfileModal = {
        _currentUser: null,

        init() {
            // Avatar click — toggle dropdown
            const avatarEl = $('#user-avatar');
            const dropdown = $('#avatar-dropdown');
            if (avatarEl && dropdown) {
                avatarEl.addEventListener('click', () => this._toggleDropdown());
                avatarEl.addEventListener('keydown', e => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._toggleDropdown(); }
                });
                document.addEventListener('click', e => {
                    if (!avatarEl.contains(e.target) && !dropdown.contains(e.target)) {
                        dropdown.classList.add('hidden');
                    }
                }, true);
            }

            // Open profile modal button
            $('#btn-open-profile')?.addEventListener('click', () => {
                dropdown?.classList.add('hidden');
                this.open();
            });

            // Close profile modal
            $('#btn-close-profile')?.addEventListener('click', () => this.close());
            $('#profile-modal-overlay')?.addEventListener('click', e => {
                if (e.target.id === 'profile-modal-overlay') this.close();
            });
            document.addEventListener('keydown', e => {
                if (e.key === 'Escape') this.close();
            });

            // Save display name
            $('#btn-save-display-name')?.addEventListener('click', () => this._saveDisplayName());

            // Avatar color swatches
            $('#avatar-color-grid')?.addEventListener('click', e => {
                const swatch = e.target.closest('.avatar-color-swatch');
                if (!swatch) return;
                this._setAvatarColor(swatch.dataset.color);
            });

            // Save password
            $('#btn-save-password')?.addEventListener('click', () => this._savePassword());
        },

        _toggleDropdown() {
            $('#avatar-dropdown')?.classList.toggle('hidden');
        },

        async open() {
            const overlay = $('#profile-modal-overlay');
            if (!overlay) return;
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) return;
            this._currentUser = user;
            const meta = user.user_metadata || {};

            // Populate fields
            const nameInput = $('#profile-display-name');
            if (nameInput) nameInput.value = meta.display_name || '';

            const emailDisp = $('#profile-modal-email-display');
            if (emailDisp) emailDisp.textContent = user.email;

            // Populate avatar preview
            const avatarPrev = $('#profile-modal-avatar');
            const name = meta.display_name || user.email || '';
            const color = meta.avatar_color || '#7c8fff';
            if (avatarPrev) {
                avatarPrev.textContent = (name[0] || '?').toUpperCase();
                avatarPrev.style.background = color;
            }

            // Mark active color swatch
            this._refreshSwatchActive(color);

            // Clear password fields
            ['#profile-new-password', '#profile-confirm-password'].forEach(sel => {
                const el = $(sel); if (el) el.value = '';
            });
            const pwNote = $('#profile-pw-note');
            if (pwNote) pwNote.textContent = '';

            overlay.classList.remove('hidden');
        },

        close() {
            $('#profile-modal-overlay')?.classList.add('hidden');
        },

        _refreshSwatchActive(color) {
            $$('.avatar-color-swatch').forEach(s => {
                s.classList.toggle('avatar-color-swatch--active', s.dataset.color === color);
            });
        },

        async _saveDisplayName() {
            const input = $('#profile-display-name');
            const name = input?.value.trim();
            const btn = $('#btn-save-display-name');
            if (!name) { notify('Name required', 'Please enter a display name', 'error'); return; }
            if (btn) btn.disabled = true;
            const { data, error } = await supabaseClient.auth.updateUser({
                data: { display_name: name }
            });
            if (btn) btn.disabled = false;
            if (error) {
                notify('Error', error.message, 'error');
            } else {
                this._currentUser = data.user;
                Auth._updateAvatarUI(data.user);
                const avatarPrev = $('#profile-modal-avatar');
                if (avatarPrev) avatarPrev.textContent = (name[0] || '?').toUpperCase();
                notify('Profile updated ✅', 'Display name saved', 'success');
            }
        },

        async _setAvatarColor(color) {
            this._refreshSwatchActive(color);
            const avatarPrev = $('#profile-modal-avatar');
            if (avatarPrev) avatarPrev.style.background = color;
            const { data, error } = await supabaseClient.auth.updateUser({
                data: { avatar_color: color }
            });
            if (error) {
                notify('Error', error.message, 'error');
            } else {
                this._currentUser = data.user;
                Auth._updateAvatarUI(data.user);
            }
        },

        async _savePassword() {
            const newPw = $('#profile-new-password')?.value;
            const confirmPw = $('#profile-confirm-password')?.value;
            const pwNote = $('#profile-pw-note');
            if (!newPw || newPw.length < 12) {
                if (pwNote) pwNote.textContent = '⚠️ Password must be at least 12 characters';
                return;
            }
            if (newPw !== confirmPw) {
                if (pwNote) pwNote.textContent = '⚠️ Passwords do not match';
                return;
            }
            if (pwNote) pwNote.textContent = '';
            const btn = $('#btn-save-password');
            if (btn) btn.disabled = true;
            const { error } = await supabaseClient.auth.updateUser({ password: newPw });
            if (btn) btn.disabled = false;
            if (error) {
                notify('Error', error.message, 'error');
                if (pwNote) pwNote.textContent = `⚠️ ${error.message}`;
            } else {
                ['#profile-new-password', '#profile-confirm-password'].forEach(sel => {
                    const el = $(sel); if (el) el.value = '';
                });
                notify('Password updated ✅', 'Your password has been changed', 'success');
            }
        }
    };

    // =========================================
    // Focus Mode
    // =========================================

    const FocusMode = {
        _timer: null,
        _remaining: 0,
        _duration: 25 * 60, // 25 minutes in seconds

        init() {
            const startBtn = document.getElementById('focus-start-btn');
            const overlay = document.getElementById('focus-overlay');
            const cancelBtn = document.getElementById('focus-cancel-btn');

            if (startBtn) startBtn.addEventListener('click', () => this.start());
            if (cancelBtn) cancelBtn.addEventListener('click', () => this.stop());
            if (overlay) overlay.addEventListener('click', (e) => {
                if (e.target === overlay) this.stop();
            });

            // Mini ring in header — click to cancel
            document.getElementById('focus-mini-ring')?.addEventListener('click', () => this.stop());

            this._loadSessionCount();
        },

        start() {
            this._remaining = this._duration;
            document.body.classList.add('focus-active');
            const overlay = document.getElementById('focus-overlay');
            if (overlay) overlay.classList.add('visible');
            document.getElementById('focus-mini-ring')?.classList.remove('hidden');
            this._updateDisplay();
            this._timer = setInterval(() => this._tick(), 1000);
        },

        stop() {
            clearInterval(this._timer);
            this._timer = null;
            document.body.classList.remove('focus-active');
            const overlay = document.getElementById('focus-overlay');
            if (overlay) overlay.classList.remove('visible');
            const done = document.getElementById('focus-done');
            if (done) done.classList.remove('visible');
            document.getElementById('focus-mini-ring')?.classList.add('hidden');
        },

        _tick() {
            this._remaining--;
            if (this._remaining <= 0) {
                clearInterval(this._timer);
                this._timer = null;
                this._onComplete();
                return;
            }
            this._updateDisplay();
        },

        _updateDisplay() {
            const min = Math.floor(this._remaining / 60);
            const sec = this._remaining % 60;
            const timeStr = String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
            const el = document.getElementById('focus-time');
            if (el) el.textContent = timeStr;

            const progress = document.getElementById('focus-ring-progress');
            if (progress) {
                const pct = this._remaining / this._duration;
                const circumference = 2 * Math.PI * 90;
                progress.style.strokeDashoffset = circumference * (1 - pct);
            }

            // Update header mini ring
            const miniProgress = document.getElementById('focus-mini-progress');
            const miniTime     = document.getElementById('focus-mini-time');
            if (miniProgress) {
                const miniCircumference = 2 * Math.PI * 14; // r=14 → ~87.96
                const pct = this._remaining / this._duration;
                miniProgress.style.strokeDashoffset = String(miniCircumference * (1 - pct));
            }
            if (miniTime) miniTime.textContent = timeStr;
        },

        _onComplete() {
            const timer = document.getElementById('focus-timer-area');
            const done = document.getElementById('focus-done');
            if (timer) timer.classList.add('hidden');
            if (done) done.classList.add('visible');
            Streak.recordActivity();
            FocusMode._recordSession();
            notify(I18n.t('focusComplete'), I18n.t('focusCompleteMsg'), 'success');

            // Auto-close after 5 seconds
            setTimeout(() => {
                this.stop();
                if (timer) timer.classList.remove('hidden');
            }, 5000);
        },

        _recordSession() {
            const today = new Date().toISOString().slice(0, 10);
            const sessions = Store.getRaw('kompass_focus_sessions');
            let data = {};
            try { data = JSON.parse(sessions || '{}'); } catch { data = {}; }
            data[today] = (data[today] || 0) + 1;
            Store.setRaw('kompass_focus_sessions', JSON.stringify(data));
            // Update dashboard stat
            const el = $('#stat-focus');
            if (el) {
                const total = Object.values(data).reduce((s, n) => s + n, 0);
                el.textContent = total;
            }
        },

        _loadSessionCount() {
            const sessions = Store.getRaw('kompass_focus_sessions');
            let data = {};
            try { data = JSON.parse(sessions || '{}'); } catch { data = {}; }
            const total = Object.values(data).reduce((s, n) => s + n, 0);
            const el = $('#stat-focus');
            if (el) el.textContent = total;
        }
    };

    // =========================================
    // Keyboard Shortcuts
    // =========================================

    const Shortcuts = {
        SECTION_MAP: { '1': 'dashboard', '2': 'goals', '3': 'resources', '4': 'notes', '5': 'reflection', '6': 'insights' },

        init() {
            document.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                    e.preventDefault();
                    CommandPalette.open();
                    return;
                }
                if (e.altKey && this.SECTION_MAP[e.key]) {
                    $(`[data-section="${this.SECTION_MAP[e.key]}"]`)?.click();
                    return;
                }
                // ? — show shortcuts panel (only when no text input is focused)
                if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    const tag = document.activeElement?.tagName;
                    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
                    this.togglePanel();
                }
                if (e.key === 'Escape') {
                    this.closePanel();
                }
            });

            $('#shortcuts-close')?.addEventListener('click', () => this.closePanel());
            $('#shortcuts-overlay')?.addEventListener('click', e => {
                if (e.target.id === 'shortcuts-overlay') this.closePanel();
            });
        },

        togglePanel() {
            const overlay = $('#shortcuts-overlay');
            if (!overlay) return;
            overlay.classList.toggle('hidden');
        },

        closePanel() {
            $('#shortcuts-overlay')?.classList.add('hidden');
        }
    };

    // =========================================
    // Misc UI Interactions
    // =========================================

    const MiscUI = {
        init() {
            const dashGrid = $('.dashboard-grid');
            dashGrid?.addEventListener('click', (e) => {
                const card = e.target.closest('.stat-card');
                if (!card) return;
                // Use CSS keyframe animation instead of manual setTimeout + inline style
                card.classList.remove('pressing');
                void card.offsetWidth; // force reflow so animation restarts if clicked rapidly
                card.classList.add('pressing');
                card.addEventListener('animationend', () => card.classList.remove('pressing'), { once: true });
            });

            document.addEventListener('click', (e) => {
                const anchor = e.target.closest('a[href^="#"]');
                if (!anchor) return;
                const href = anchor.getAttribute('href');
                if (href === '#') return;
                e.preventDefault();
                document.querySelector(href)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }
    };

    // =========================================
    // Activity Tracker
    // =========================================

    const ActivityTracker = {
        STORE_KEY: 'kompass_activity',

        record() {
            const today = new Date().toISOString().slice(0, 10);
            const data = Store.get(this.STORE_KEY, {});
            data[today] = (data[today] || 0) + 1;
            Store.set(this.STORE_KEY, data);
        },

        getLast(days) {
            const data = Store.get(this.STORE_KEY, {});
            const result = [];
            for (let i = days - 1; i >= 0; i--) {
                const d = new Date(Date.now() - i * 86400000);
                const key = d.toISOString().slice(0, 10);
                result.push({ date: key, count: data[key] || 0, day: d });
            }
            return result;
        }
    };

    // =========================================
    // Weekly Activity Chart
    // =========================================

    const ActivityChart = {
        render() {
            const container = $('#activity-chart-bars');
            if (!container) return;
            const data = ActivityTracker.getLast(7);
            const max = Math.max(...data.map(d => d.count), 1);
            container.innerHTML = data.map(d => {
                const pct = Math.round((d.count / max) * 100);
                const dayLabel = d.day.toLocaleDateString('no-NO', { weekday: 'short' });
                return `<div class="activity-bar-col">
                    <div class="activity-bar-wrap">
                        <div class="activity-bar" style="height:${pct}%" title="${d.date}: ${d.count}"></div>
                    </div>
                    <span class="activity-bar-label">${dayLabel}</span>
                    <span class="activity-bar-count">${d.count || ''}</span>
                </div>`;
            }).join('');
        }
    };

    // =========================================
    // Streak Calendar (GitHub-style, 12 weeks)
    // =========================================

    const StreakCalendar = {
        render() {
            const container = $('#streak-calendar');
            if (!container) return;
            const data = ActivityTracker.getLast(84); // 12 weeks
            // Pad front so first week starts on Monday
            const firstDay = data[0].day.getDay(); // 0=Sun,1=Mon…
            const padDays = firstDay === 0 ? 6 : firstDay - 1;
            const padded = Array(padDays).fill(null).concat(data);
            // Split into weeks of 7
            const weeks = [];
            for (let i = 0; i < padded.length; i += 7) {
                weeks.push(padded.slice(i, i + 7));
            }
            container.innerHTML = `<div class="streak-calendar-grid">${weeks.map(week =>
                `<div class="streak-cal-week">${week.map(d => {
                    if (!d) return `<div class="streak-cal-cell level-0"></div>`;
                    const lv = d.count === 0 ? 0 : d.count < 2 ? 1 : d.count < 4 ? 2 : d.count < 7 ? 3 : 4;
                    return `<div class="streak-cal-cell level-${lv}" title="${d.date}: ${d.count}"></div>`;
                }).join('')}</div>`
            ).join('')}</div>`;
        }
    };

    // =========================================
    // Motivational Quotes
    // =========================================

    const Quotes = {
        _list: [
            { text: 'Live as if you were to die tomorrow. Learn as if you were to live forever.', author: 'Mahatma Gandhi' },
            { text: 'An investment in knowledge pays the best interest.', author: 'Benjamin Franklin' },
            { text: 'The capacity to learn is a gift; the ability to learn is a skill; the willingness to learn is a choice.', author: 'Brian Herbert' },
            { text: 'Education is the passport to the future, for tomorrow belongs to those who prepare for it today.', author: 'Malcolm X' },
            { text: 'The beautiful thing about learning is that nobody can take it away from you.', author: 'B.B. King' },
            { text: 'The more that you read, the more things you will know.', author: 'Dr. Seuss' },
            { text: 'Learning never exhausts the mind.', author: 'Leonardo da Vinci' },
            { text: 'Tell me and I forget. Teach me and I remember. Involve me and I learn.', author: 'Benjamin Franklin' },
            { text: 'In learning you will teach, and in teaching you will learn.', author: 'Phil Collins' },
            { text: 'The expert in anything was once a beginner.', author: 'Helen Hayes' },
            { text: 'Every accomplishment starts with the decision to try.', author: 'John F. Kennedy' },
            { text: 'Success is the sum of small efforts repeated day in and day out.', author: 'Robert Collier' },
            { text: 'You don\'t have to be great to start, but you have to start to be great.', author: 'Zig Ziglar' },
            { text: 'Knowledge is power. Information is liberating.', author: 'Kofi Annan' },
        ],

        init() {
            const widget = $('#quote-widget');
            if (!widget) return;
            const day = Math.floor(Date.now() / 86400000);
            const q = this._list[day % this._list.length];
            const textEl = $('#quote-text');
            const authorEl = $('#quote-author');
            if (textEl) textEl.textContent = q.text;
            if (authorEl) authorEl.textContent = '— ' + q.author;
            widget.classList.remove('hidden');
            setTimeout(() => widget.classList.add('visible'), 50);
        }
    };

    // =========================================
    // Auto-Logout (30 min inactivity)
    // =========================================

    const AutoLogout = {
        TIMEOUT_MS: 30 * 60 * 1000,
        WARN_BEFORE_MS: 60 * 1000, // warn 1 min before
        _timer: null,
        _warnTimer: null,
        _controller: null, // AbortController for event listeners

        start() {
            // Stop any previous session first (removes old listeners, clears timers)
            this.stop();
            // Ensure toast exists in DOM
            if (!$('#autologout-toast')) {
                const el = document.createElement('div');
                el.className = 'autologout-toast';
                el.id = 'autologout-toast';
                el.innerHTML = '⚠️ Du logges ut om 1 minutt på grunn av inaktivitet';
                document.body.appendChild(el);
            }
            this._controller = new AbortController();
            const { signal } = this._controller;
            ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(ev =>
                document.addEventListener(ev, () => this._reset(), { passive: true, signal })
            );
            this._reset();
        },

        stop() {
            clearTimeout(this._timer);
            clearTimeout(this._warnTimer);
            this._hideToast();
            if (this._controller) { this._controller.abort(); this._controller = null; }
        },

        _reset() {
            clearTimeout(this._timer);
            clearTimeout(this._warnTimer);
            this._hideToast();
            this._warnTimer = setTimeout(() => this._showToast(), this.TIMEOUT_MS - this.WARN_BEFORE_MS);
            this._timer = setTimeout(() => {
                this._hideToast();
                if (typeof supabaseClient !== 'undefined') supabaseClient.auth.signOut();
            }, this.TIMEOUT_MS);
        },

        _showToast() {
            const t = $('#autologout-toast');
            if (t) t.classList.add('visible');
        },

        _hideToast() {
            const t = $('#autologout-toast');
            if (t) t.classList.remove('visible');
        }
    };

    // =========================================
    // Onboarding Tour
    // =========================================

    const Onboarding = {
        STORE_KEY: 'kompass_onboarded',
        _current: 1,
        _total: 4,

        init() {
            // Only bind buttons here — _show() is triggered by Auth._onSignedIn
            // so the onboarding never appears on top of the login overlay
            $('#onboarding-next')?.addEventListener('click', () => this._next());
            $('#onboarding-skip')?.addEventListener('click', () => this._complete());
        },

        maybeShow() {
            const done = Store.getRaw(this.STORE_KEY);
            if (!done) setTimeout(() => this._show(), 800);
        },

        _show() {
            const overlay = $('#onboarding-overlay');
            overlay?.classList.remove('hidden');
        },

        _next() {
            if (this._current >= this._total) { this._complete(); return; }
            const cur = document.querySelector(`.onboarding-step[data-step="${this._current}"]`);
            this._current++;
            const nxt = document.querySelector(`.onboarding-step[data-step="${this._current}"]`);
            cur?.classList.remove('active');
            nxt?.classList.add('active');
            document.querySelectorAll('.onboarding-dot').forEach(d =>
                d.classList.toggle('active', parseInt(d.dataset.dot) === this._current)
            );
            const lbl = $('#onboarding-next-label');
            if (lbl) lbl.textContent = this._current === this._total ? 'Kom i gang!' : 'Neste';
        },

        _complete() {
            Store.setRaw(this.STORE_KEY, '1');
            $('#onboarding-overlay')?.classList.add('hidden');
        }
    };

    // =========================================
    // Command Palette (Ctrl+K)
    // =========================================

    const CommandPalette = {
        _items: [],
        _active: -1,
        _prevFocus: null,

        init() {
            const overlay = document.getElementById('cmd-overlay');
            overlay?.addEventListener('click', (e) => {
                if (e.target === overlay) this.close();
            });

            // Focus trap: Tab wraps within the panel
            overlay?.addEventListener('keydown', (e) => {
                if (e.key !== 'Tab') return;
                const focusable = Array.from(
                    overlay.querySelectorAll('input, button:not([disabled]), [tabindex]:not([tabindex="-1"])')
                ).filter(el => !el.closest('.hidden'));
                if (focusable.length < 2) { e.preventDefault(); return; }
                const first = focusable[0];
                const last  = focusable[focusable.length - 1];
                if (e.shiftKey) {
                    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
                } else {
                    if (document.activeElement === last) { e.preventDefault(); first.focus(); }
                }
            });

            const input = document.getElementById('cmd-input');
            input?.addEventListener('input', () => this._search(input.value));
            input?.addEventListener('keydown', (e) => this._onKeydown(e));

            // Header search box — clicking it opens the command palette
            document.querySelector('.search-input')?.addEventListener('click', () => this.open());
        },

        open() {
            const overlay = document.getElementById('cmd-overlay');
            const input = document.getElementById('cmd-input');
            if (!overlay) return;
            this._prevFocus = document.activeElement;
            overlay.classList.remove('hidden');
            if (input) { input.value = ''; input.focus(); }
            this._search('');
        },

        close() {
            document.getElementById('cmd-overlay')?.classList.add('hidden');
            this._active = -1;
            // Restore focus to whatever triggered the palette
            setTimeout(() => this._prevFocus?.focus(), 50);
        },

        _getItems(query) {
            const q = query.trim().toLowerCase();
            const results = [];

            const sections = [
                { id: 'dashboard',  label: 'Dashboard',       icon: '⊞', badge: 'Section' },
                { id: 'goals',      label: 'Learning Goals',  icon: '🎯', badge: 'Section' },
                { id: 'resources',  label: 'Resources',       icon: '📚', badge: 'Section' },
                { id: 'notes',      label: 'Notes',           icon: '📝', badge: 'Section' },
                { id: 'reflection', label: 'Reflection',      icon: '💭', badge: 'Section' },
                { id: 'insights',   label: 'Insights',        icon: '📊', badge: 'Section' },
            ];

            const matchSec = q ? sections.filter(s => s.label.toLowerCase().includes(q)) : sections;
            if (matchSec.length) {
                results.push({ type: 'group', label: 'Navigate' });
                matchSec.forEach(s => results.push({ ...s, type: 'section' }));
            }

            const goals = (state?.goals || []).filter(g => !q || g.text.toLowerCase().includes(q)).slice(0, 6);
            if (goals.length) {
                results.push({ type: 'group', label: 'Goals' });
                goals.forEach(g => results.push({
                    type: 'goal', id: g.id,
                    label: g.text,
                    icon: g.completed ? '✅' : '🎯',
                    badge: g.completed ? 'Done' : 'Active',
                    sub: g.category || ''
                }));
            }

            const notes = (state?.notes || []).filter(n => !q || (n.content || '').toLowerCase().includes(q)).slice(0, 5);
            if (notes.length) {
                results.push({ type: 'group', label: 'Notes' });
                notes.forEach(n => results.push({
                    type: 'note', id: n.id,
                    label: (n.content || '').slice(0, 60) || 'Untitled note',
                    icon: '📝', badge: 'Note', sub: ''
                }));
            }

            const resList = Store.get('pln_user_resources', [])
                .filter(r => !q || (r.title || '').toLowerCase().includes(q) || (r.url || '').toLowerCase().includes(q))
                .slice(0, 5);
            if (resList.length) {
                results.push({ type: 'group', label: 'Resources' });
                resList.forEach(r => results.push({
                    type: 'resource', id: r.id,
                    label: r.title || r.url || 'Untitled',
                    icon: r.type === 'youtube' ? '▶️' : r.type === 'podcast' ? '🎙️' : '🔗',
                    badge: r.type || 'Link',
                    sub: r.url || ''
                }));
            }

            return results;
        },

        _search(query) {
            this._items = this._getItems(query);
            this._active = -1;
            this._render();
        },

        _render() {
            const list = document.getElementById('cmd-results');
            if (!list) return;
            list.innerHTML = '';
            this._items.forEach((item, i) => {
                if (item.type === 'group') {
                    const li = document.createElement('li');
                    li.className = 'cmd-group-label';
                    li.textContent = item.label;
                    li.setAttribute('role', 'presentation');
                    list.appendChild(li);
                    return;
                }
                const li = document.createElement('li');
                li.className = 'cmd-item';
                li.setAttribute('role', 'option');
                li.setAttribute('data-idx', i);
                li.innerHTML = `
                    <div class="cmd-item-icon">${item.icon}</div>
                    <div class="cmd-item-body">
                        <div class="cmd-item-title">${escapeHtml(item.label)}</div>
                        ${item.sub ? `<div class="cmd-item-sub">${escapeHtml(item.sub)}</div>` : ''}
                    </div>
                    <span class="cmd-item-badge">${escapeHtml(item.badge || '')}</span>
                `;
                li.addEventListener('click', () => this._select(i));
                li.addEventListener('mouseenter', () => {
                    this._active = i;
                    this._highlightActive();
                });
                list.appendChild(li);
            });
        },

        _onKeydown(e) {
            if (e.key === 'ArrowDown') { e.preventDefault(); this._moveActive(1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); this._moveActive(-1); }
            else if (e.key === 'Enter') {
                e.preventDefault();
                const active = document.querySelector('.cmd-item.active');
                if (active) this._select(parseInt(active.dataset.idx));
            } else if (e.key === 'Escape') {
                this.close();
            }
        },

        _moveActive(dir) {
            const items = Array.from(document.querySelectorAll('.cmd-item'));
            if (!items.length) return;
            const cur = items.findIndex(el => el.classList.contains('active'));
            let next = cur + dir;
            if (next < 0) next = items.length - 1;
            if (next >= items.length) next = 0;
            items.forEach(el => el.classList.remove('active'));
            items[next]?.classList.add('active');
            items[next]?.scrollIntoView({ block: 'nearest' });
            this._active = parseInt(items[next]?.dataset.idx ?? '-1');
        },

        _highlightActive() {
            document.querySelectorAll('.cmd-item').forEach(el => {
                el.classList.toggle('active', parseInt(el.dataset.idx) === this._active);
            });
        },

        _select(idx) {
            const item = this._items[idx];
            if (!item || item.type === 'group') return;
            this.close();
            if (item.type === 'section') {
                document.querySelector(`[data-section="${item.id}"]`)?.click();
            } else if (item.type === 'goal') {
                document.querySelector('[data-section="goals"]')?.click();
                setTimeout(() => {
                    document.getElementById(`goal-${item.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 220);
            } else if (item.type === 'note') {
                document.querySelector('[data-section="notes"]')?.click();
                setTimeout(() => {
                    document.getElementById(`note-${item.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 220);
            } else if (item.type === 'resource') {
                document.querySelector('[data-section="resources"]')?.click();
            }
        }
    };

    // =========================================
    // Resource Groups / Collections
    // =========================================

    const ResourceGroups = {
        STORE_KEY: 'pln_resource_groups',
        _activeGroupId: 'all',
        _editingId: null,
        _selectedColor: '#5B9FD4',

        getAll() {
            const raw = Store.getRaw(this.STORE_KEY);
            return raw ? JSON.parse(raw) : [];
        },

        _saveGroups(groups) {
            Store.setRaw(this.STORE_KEY, JSON.stringify(groups));
        },

        create(name, color) {
            const groups = this.getAll();
            const group = { id: Date.now(), name: name.trim(), color: color || '#5B9FD4' };
            groups.push(group);
            this._saveGroups(groups);
            return group;
        },

        delete(id) {
            const groups = this.getAll().filter(g => g.id !== id);
            this._saveGroups(groups);
            const resources = Store.get(Resources.STORE_KEY, []);
            resources.forEach(r => { if (String(r.groupId) === String(id)) delete r.groupId; });
            Store.set(Resources.STORE_KEY, resources);
        },

        getById(id) {
            return this.getAll().find(g => String(g.id) === String(id)) || null;
        },

        init() {
            this._renderBar();
            this._populateSelect();
            this._wireDialog();
            document.getElementById('collection-add-btn')?.addEventListener('click', () => this._openDialog(null));
            document.getElementById('collections-scroll')?.addEventListener('click', (e) => {
                const pill = e.target.closest('.collection-pill');
                if (!pill) return;
                document.querySelectorAll('.collection-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this._activeGroupId = pill.dataset.groupId || 'all';
                Resources._applyFilters();
            });
        },

        _wireDialog() {
            const overlay = document.getElementById('collection-dialog-overlay');
            const cancel  = document.getElementById('collection-dialog-cancel');
            const save    = document.getElementById('collection-dialog-save');
            const colors  = document.getElementById('collection-colors');
            cancel?.addEventListener('click', () => this._closeDialog());
            overlay?.addEventListener('click', (e) => { if (e.target === overlay) this._closeDialog(); });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && overlay && !overlay.classList.contains('hidden')) this._closeDialog();
            });
            colors?.addEventListener('click', (e) => {
                const swatch = e.target.closest('.collection-color-swatch');
                if (!swatch) return;
                colors.querySelectorAll('.collection-color-swatch').forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');
                this._selectedColor = swatch.dataset.color;
            });
            save?.addEventListener('click', () => {
                const nameInput = document.getElementById('collection-name-input');
                const name = nameInput?.value.trim();
                if (!name) { nameInput?.focus(); return; }
                if (this._editingId) {
                    const groups = this.getAll();
                    const g = groups.find(g => String(g.id) === this._editingId);
                    if (g) { g.name = name; g.color = this._selectedColor; this._saveGroups(groups); }
                } else {
                    const group = this.create(name, this._selectedColor);
                    this._setActive(String(group.id));
                }
                this._renderBar();
                this._populateSelect();
                this._closeDialog();
            });
        },

        _openDialog(groupId) {
            this._editingId = groupId;
            this._selectedColor = '#5B9FD4';
            const overlay = document.getElementById('collection-dialog-overlay');
            const nameInput = document.getElementById('collection-name-input');
            const colors = document.getElementById('collection-colors');
            const saveBtn = document.getElementById('collection-dialog-save');
            if (nameInput) nameInput.value = groupId ? (this.getById(groupId)?.name || '') : '';
            if (saveBtn) saveBtn.textContent = groupId ? 'Save' : 'Create';
            if (colors) colors.querySelectorAll('.collection-color-swatch').forEach((s, i) => s.classList.toggle('active', i === 0));
            overlay?.classList.remove('hidden');
            setTimeout(() => nameInput?.focus(), 50);
        },

        _closeDialog() {
            document.getElementById('collection-dialog-overlay')?.classList.add('hidden');
            this._editingId = null;
        },

        _renderBar() {
            const scroll = document.getElementById('collections-scroll');
            if (!scroll) return;
            const groups = this.getAll();
            scroll.querySelectorAll('.collection-pill:not([data-group-id="all"])').forEach(p => p.remove());
            groups.forEach(g => {
                const pill = document.createElement('button');
                pill.className = 'collection-pill';
                pill.dataset.groupId = String(g.id);
                pill.innerHTML = '<span class="collection-pill-dot" style="background:' + escapeHtml(g.color) + '"></span>' + escapeHtml(g.name);
                pill.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    if (confirm('Delete collection "' + g.name + '"?')) {
                        this.delete(g.id);
                        this._renderBar();
                        this._populateSelect();
                        if (this._activeGroupId === String(g.id)) this._setActive('all');
                        else Resources._applyFilters();
                    }
                });
                scroll.appendChild(pill);
            });
            this._restoreActivePill();
        },

        _restoreActivePill() {
            document.querySelectorAll('.collection-pill').forEach(p => {
                p.classList.toggle('active', p.dataset.groupId === this._activeGroupId);
            });
        },

        _setActive(groupId) {
            this._activeGroupId = groupId;
            this._restoreActivePill();
            Resources._applyFilters();
        },

        _populateSelect() {
            const select = document.getElementById('res-group');
            if (!select) return;
            const current = select.value;
            select.querySelectorAll('option:not([value=""])').forEach(o => o.remove());
            this.getAll().forEach(g => {
                const opt = document.createElement('option');
                opt.value = String(g.id);
                opt.textContent = g.name;
                select.appendChild(opt);
            });
            if (current && select.querySelector('option[value="' + current + '"]')) select.value = current;
        }
    };

    // =========================================
    // Goal Detail Drawer
    // =========================================

    const GoalDetailDrawer = {
        _currentGoalId: null,

        init() {
            document.getElementById('goal-drawer-close')?.addEventListener('click', () => this.close());
            document.getElementById('goal-drawer-overlay')?.addEventListener('click', (e) => {
                if (e.target === document.getElementById('goal-drawer-overlay')) this.close();
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this._currentGoalId !== null) this.close();
            });
        },

        open(goalId) {
            const goal = state.goals.find(g => g.id === goalId);
            if (!goal) return;
            this._currentGoalId = goalId;
            this._render(goal);
            const overlay = document.getElementById('goal-drawer-overlay');
            overlay?.classList.remove('hidden');
            document.getElementById('goal-drawer-close')?.focus();
        },

        close() {
            const overlay = document.getElementById('goal-drawer-overlay');
            if (!overlay || overlay.classList.contains('hidden')) return;
            overlay.classList.add('closing');
            overlay.addEventListener('animationend', () => {
                overlay.classList.remove('closing');
                overlay.classList.add('hidden');
                this._currentGoalId = null;
            }, { once: true });
        },

        _render(goal) {
            const titleEl = document.getElementById('goal-drawer-title');
            const bodyEl  = document.getElementById('goal-drawer-body');
            const actEl   = document.getElementById('goal-drawer-actions');
            if (!titleEl || !bodyEl) return;
            titleEl.textContent = goal.text;
            const today = new Date().toISOString().slice(0, 10);
            const isOverdue = goal.deadline && goal.deadline < today;
            const catLabels = { coding:'Coding', school:'School', personal:'Personal', reading:'Reading', health:'Health', other:'Other' };
            const catLabel = catLabels[goal.category] || goal.category || 'Other';
            const statusLabel = goal.completed ? 'Completed' : isOverdue ? 'Overdue' : 'Active';
            const statusCls = goal.completed ? 'tag--green' : isOverdue ? 'tag--red' : 'tag--blue';
            const ms = goal.milestones || [];
            const msDone = ms.filter(m => m.done).length;
            const msPct = ms.length ? Math.round(msDone / ms.length * 100) : 0;
            const shortText = goal.text.slice(0, 30).toLowerCase();
            const linkedNotes = (state.notes || []).filter(n => (n.content || '').toLowerCase().includes(shortText)).slice(0, 5);
            let msHtml = '';
            if (ms.length) {
                const checkboxes = ms.map(m => {
                    const chk = m.done ? 'checked' : '';
                    return '<div class="milestone-item ' + (m.done ? 'done' : '') + '">' +
                        '<input type="checkbox" class="milestone-checkbox drawer-ms-cb" ' + chk + ' data-goal-id="' + goal.id + '" data-milestone-id="' + m.id + '">' +
                        '<span class="milestone-text">' + escapeHtml(m.text) + '</span></div>';
                }).join('');
                msHtml = '<div class="goal-drawer-section">' +
                    '<p class="goal-drawer-section-heading">Milestones (' + msDone + '/' + ms.length + ' — ' + msPct + '%)</p>' +
                    '<div style="height:4px;background:rgba(255,255,255,0.08);border-radius:2px;margin-bottom:10px;overflow:hidden">' +
                    '<div style="height:100%;width:' + msPct + '%;background:var(--accent-primary);border-radius:2px;transition:width .3s"></div></div>' +
                    checkboxes + '</div>';
            }
            const notesHtml = linkedNotes.length
                ? linkedNotes.map(n => '<div class="goal-drawer-linked-note" data-note-id="' + n.id + '">' + escapeHtml((n.content || '').slice(0, 120)) + ((n.content || '').length > 120 ? '…' : '') + '</div>').join('')
                : '<p class="goal-drawer-empty-msg">No notes mention this goal yet.</p>';
            bodyEl.innerHTML =
                '<div class="goal-drawer-meta-row">' +
                    '<span class="tag ' + statusCls + '">' + statusLabel + '</span>' +
                    '<span class="tag">' + escapeHtml(catLabel) + '</span>' +
                    (goal.deadline ? '<span class="goal-deadline-badge">📅 ' + goal.deadline + '</span>' : '') +
                '</div>' +
                msHtml +
                '<div class="goal-drawer-section">' +
                    '<p class="goal-drawer-section-heading">Linked Notes</p>' +
                    notesHtml +
                '</div>';
            bodyEl.querySelectorAll('.drawer-ms-cb').forEach(cb => {
                cb.addEventListener('change', () => {
                    Goals._toggleMilestone(Number(cb.dataset.goalId), cb.dataset.milestoneId);
                    const updated = state.goals.find(g => g.id === Number(cb.dataset.goalId));
                    if (updated) this._render(updated);
                });
            });
            bodyEl.querySelectorAll('.goal-drawer-linked-note').forEach(el => {
                el.addEventListener('click', () => {
                    this.close();
                    document.querySelector('[data-section="notes"]')?.click();
                    const nId = el.dataset.noteId;
                    setTimeout(() => document.getElementById('note-' + nId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 280);
                });
            });
            if (actEl) {
                actEl.innerHTML = '<button class="btn btn-primary" id="goal-drawer-complete-btn">' + (goal.completed ? 'Mark Active' : 'Mark Complete') + '</button>' +
                    '<button class="btn" id="goal-drawer-edit-btn">Edit</button>';
                document.getElementById('goal-drawer-complete-btn')?.addEventListener('click', () => {
                    Goals.toggleComplete(goal.id);
                    const updated = state.goals.find(g => g.id === goal.id);
                    if (updated) this._render(updated);
                });
                document.getElementById('goal-drawer-edit-btn')?.addEventListener('click', () => {
                    this.close();
                    setTimeout(() => { document.querySelector('[data-section="goals"]')?.click(); setTimeout(() => Goals.edit(goal.id), 200); }, 300);
                });
            }
        }
    };

    // =========================================
    // Smart Deadline Notifications
    // =========================================

    const DeadlineNotifier = {
        STORE_KEY: 'pln_last_deadline_notify',
        init() {
            setTimeout(() => this._checkAndNotify(), 3000);
            setInterval(() => this._checkAndNotify(), 3600000);
        },
        async _checkAndNotify() {
            if (!('Notification' in window)) return;
            if (Notification.permission === 'denied') return;
            const goalsWithDeadlines = (state.goals || []).filter(g => !g.completed && g.deadline);
            if (!goalsWithDeadlines.length) return;
            const today = new Date().toISOString().slice(0, 10);
            const in3Days = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
            const urgent = goalsWithDeadlines.filter(g => g.deadline <= in3Days);
            if (!urgent.length) return;
            const lastNotified = Store.getRaw(this.STORE_KEY);
            if (lastNotified === today) return;
            if (Notification.permission === 'default') {
                const result = await Notification.requestPermission();
                if (result !== 'granted') return;
            }
            Store.setRaw(this.STORE_KEY, today);
            urgent.forEach(g => {
                const overdue = g.deadline < today;
                const title = overdue ? '⚠️ Overdue Goal' : '⏰ Goal Due Soon';
                const body = (overdue ? 'Overdue since ' : 'Due ') + g.deadline + ': ' + g.text.slice(0, 60);
                try { new Notification(title, { body, tag: 'pln-goal-' + g.id, icon: '/icons/icon-192.png' }); } catch (_) {}
            });
        }
    };

    // =========================================
    // Recurring Reflection Prompts
    // =========================================

    const ReflectionPrompts = {
        STORE_KEY: 'pln_last_reflection_prompt',
        PROMPTS: [
            'What is one concept you finally understood this week?',
            'What challenge stretched you beyond your comfort zone?',
            'What would you do differently if you started the week over?',
            'Which skill improved the most and how did you practise it?',
            'What resource had the biggest impact on your learning?',
            'What question are you still trying to answer?',
            'What are you most proud of achieving this week?',
            'How have you applied something you learned in a real situation?',
            'What habit could you build to accelerate your learning next week?',
            'What feedback was most valuable this week?',
        ],
        _currentPrompt: '',
        init() {
            this._maybeShow();
            document.getElementById('reflection-prompt-use')?.addEventListener('click', () => {
                const learn = document.getElementById('reflection-learn');
                if (learn) { learn.value = this._currentPrompt; learn.focus(); }
                this._dismiss();
            });
            document.getElementById('reflection-prompt-skip')?.addEventListener('click', () => this._dismiss());
        },
        _maybeShow() {
            const lastShown = Store.getRaw(this.STORE_KEY);
            const daysSince = lastShown ? Math.floor((Date.now() - new Date(lastShown).getTime()) / 86400000) : 999;
            const isMonday = new Date().getDay() === 1;
            if (daysSince < 6 && !isMonday) return;
            this._currentPrompt = this.PROMPTS[Math.floor(Math.random() * this.PROMPTS.length)];
            const banner = document.getElementById('reflection-prompt-banner');
            const text = document.getElementById('reflection-prompt-text');
            if (banner && text) { text.textContent = this._currentPrompt; banner.classList.remove('hidden'); }
        },
        _dismiss() {
            Store.setRaw(this.STORE_KEY, new Date().toISOString().slice(0, 10));
            document.getElementById('reflection-prompt-banner')?.classList.add('hidden');
        }
    };

    // =========================================
    // Supabase Real-time Sync
    // =========================================

    const RealtimeSync = {
        _channel: null,
        async init() {
            if (!supabaseClient) return;
            try {
                const { data: { user } } = await supabaseClient.auth.getUser();
                if (!user) return;
                this._channel = supabaseClient.channel('pln_rt_' + user.id)
                    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_data', filter: 'user_id=eq.' + user.id },
                        (payload) => { if (!CloudSync._isSaving) this._applyRemote(payload.new); })
                    .subscribe();
            } catch (e) { console.warn('RealtimeSync.init:', e); }
        },
        _applyRemote(data) {
            const merge = (local, remote) => {
                const arr = Array.isArray(remote) ? remote : [];
                const ids = new Set(arr.map(i => i.id));
                return [...arr, ...(local || []).filter(i => !ids.has(i.id))];
            };
            state.goals = merge(state.goals, data.goals);
            state.notes = merge(state.notes, data.notes);
            state.reflections = merge(state.reflections, data.reflections);
            Goals.render(); Goals.updateProgress();
            Notes.render();
            if (typeof Notes._syncDashboard === 'function') Notes._syncDashboard();
            Reflections.render();
            Navigation.updateBadges();
            notify('Synkronisert', 'Data updated from another device', 'info');
        },
        stop() {
            if (this._channel && supabaseClient) { supabaseClient.removeChannel(this._channel); this._channel = null; }
        }
    };

    // =========================================
    // Supabase Storage Utility
    // NOTE: Requires a public bucket named "drawings" in Supabase Storage.
    // =========================================

    const StorageSync = {
        BUCKET: 'drawings',
        async uploadImage(userId, dataURL, filename) {
            if (!supabaseClient) return null;
            try {
                const res = await fetch(dataURL);
                const blob = await res.blob();
                const filePath = userId + '/' + filename;
                const { error } = await supabaseClient.storage.from(this.BUCKET).upload(filePath, blob, { contentType: blob.type, upsert: true });
                if (error) { console.warn('StorageSync upload:', error.message); return null; }
                const { data } = supabaseClient.storage.from(this.BUCKET).getPublicUrl(filePath);
                return data?.publicUrl || null;
            } catch (e) { console.warn('StorageSync.uploadImage:', e); return null; }
        },
        async deleteImage(userId, filename) {
            if (!supabaseClient) return;
            try { await supabaseClient.storage.from(this.BUCKET).remove([userId + '/' + filename]); }
            catch (e) { console.warn('StorageSync.deleteImage:', e); }
        }
    };


    // =========================================
    // Network Offline Banner
    // =========================================

    const NetworkStatus = {
        init() {
            const banner = document.getElementById('network-banner');
            const closeBtn = document.getElementById('network-banner-close');

            if (closeBtn) {
                closeBtn.addEventListener('click', () => { if (banner) banner.hidden = true; });
            }
            window.addEventListener('offline', () => { if (banner) banner.hidden = false; });
            window.addEventListener('online', () => {
                if (banner) banner.hidden = true;
                notify('Back Online ✓', 'Your connection has been restored', 'success');
            });
            if (!navigator.onLine && banner) banner.hidden = false;
        }
    };

    // =========================================
    // Bootstrap
    // =========================================

    document.addEventListener('DOMContentLoaded', () => {
        Theme.init();
        I18n.init();
        Sidebar.init();
        Navigation.init();
        Dashboard.init();
        Streak.init();
        Goals.init();
        Resources.init();
        Notes.init();
        Reflections.init();
        Shortcuts.init();
        MiscUI.init();
        FocusMode.init();
        DataIO.init();
        Auth.init(); // Must be last — triggers onAuthStateChanged
        Quotes.init();
        Onboarding.init();
        CommandPalette.init();
        NetworkStatus.init();
        DeadlineNotifier.init();
        ReflectionPrompts.init();
        GoalDetailDrawer.init();
        ActivityChart.render();
        StreakCalendar.render();

        // Empty state CTA buttons
        $('#empty-state-goals-cta')?.addEventListener('click', () => {
            $('#goal-input')?.focus();
        });
        $('#empty-state-notes-cta')?.addEventListener('click', () => {
            $('#note-textarea')?.focus();
            $('#note-textarea')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        $('#empty-state-reflections-cta')?.addEventListener('click', () => {
            $('#reflection-learn')?.focus();
            $('#reflection-learn')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        $('#empty-state-resources-cta')?.addEventListener('click', () => {
            $('#add-resource-btn')?.click();
        });

        // Stagger cards in the initially active section (no navigation.switchTo was called)
        setTimeout(() => {
            const initial = document.querySelector('.content-section.active');
            if (initial) Navigation._staggerCards(initial);
        }, 250);
    });
