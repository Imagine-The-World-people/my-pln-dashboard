// =============================================
// Kompass – Main Application
// =============================================

(function PLNDashboard() {
    'use strict';

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
    // Navigation
    // =========================================

    const Navigation = {
        init() {
            const navMenu = $('.nav-menu');
            if (!navMenu) return;

            navMenu.addEventListener('click', (e) => {
                const item = e.target.closest('.nav-item');
                if (!item) return;
                this.switchTo(item.dataset.section, item);
            });
        },

        switchTo(sectionId, clickedItem) {
            const pageTitle = $('.page-title');
            const skeleton = document.getElementById('section-skeleton');

            // Determine slide direction based on nav order
            const currentSection = document.querySelector('.content-section.active');
            const oldId = currentSection?.id;
            const oldIdx = SECTION_ORDER.indexOf(oldId);
            const newIdx = SECTION_ORDER.indexOf(sectionId);
            const goingForward = oldIdx < 0 || newIdx > oldIdx;

            // Update nav items
            $$('.nav-item').forEach(n => n.classList.remove('active'));
            if (clickedItem) clickedItem.classList.add('active');

            // Show skeleton loader during transition
            if (skeleton) skeleton.classList.add('visible');

            // Exit current section with directional leave
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

                // Enter new section with directional enter class
                const section = document.getElementById(sectionId);
                if (section) {
                    section.classList.add(goingForward ? 'enter-right' : 'enter-left');
                    section.classList.add('active');
                    // Slight delay before staggering cards so the section slide is visible first
                    setTimeout(() => Navigation._staggerCards(section), 80);
                    // Remove direction class after animation ends so it doesn't interfere later
                    section.addEventListener('animationend', () => {
                        section.classList.remove('enter-right', 'enter-left');
                    }, { once: true });
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
                if (container) container.scrollTop = 0;
            }, 200);
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
                // Ease-in stagger: early cards appear fast, later ones slow down
                const idx = Math.min(i, 10);
                const delay = Math.round(idx * 45 + (idx * idx * 1.5)) + 30;
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
            const initial = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
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
        }, 50),

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

            const pctEl = document.getElementById('kpi-goal-pct');
            if (pctEl) pctEl.textContent = pct + '%';

            const bar = document.getElementById('kpi-goal-bar');
            if (bar) requestAnimationFrame(() => { bar.style.width = pct + '%'; });

            const detail = document.getElementById('kpi-goal-detail');
            if (detail) detail.textContent = `${completed} / ${total}`;

            // Spark bars — show proportional fill per KPI
            const maxItems = Math.max(total, notesLen, reflections, 1);
            this._setSpark('kpi-spark-goals', total, maxItems);
            this._setSpark('kpi-spark-completed', completed, maxItems);
            this._setSpark('kpi-spark-notes', notesLen, maxItems);
            this._setSpark('kpi-spark-reflections', reflections, maxItems);
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

            // Goal item actions: delete, edit, save, cancel
            list?.addEventListener('click', (e) => {
                const deleteBtn = e.target.closest('.goal-delete-btn');
                const editBtn   = e.target.closest('.goal-edit-btn');
                const saveBtn   = e.target.closest('.goal-save-btn');
                const cancelBtn = e.target.closest('.goal-cancel-btn');
                if (deleteBtn) this.delete(parseInt(deleteBtn.dataset.goalId));
                if (editBtn)   this.edit(parseInt(editBtn.dataset.goalId));
                if (saveBtn)   this._saveEdit(parseInt(saveBtn.dataset.goalId));
                if (cancelBtn) this._cancelEdit(parseInt(cancelBtn.dataset.goalId));
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
            const el = document.getElementById(`goal-${id}`);
            const doDelete = () => {
                state.goals = state.goals.filter(g => g.id !== id);
                this._save();
                this.render();
                this.updateProgress();
                notify('Goal Deleted', 'Learning goal has been removed');
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
            empty?.classList.remove('show');

            list.innerHTML = state.goals.map(g => `
                <div class="goal-item ${g.completed ? 'completed' : ''}" id="goal-${g.id}">
                    <input type="checkbox" class="goal-checkbox"
                        ${g.completed ? 'checked' : ''} data-goal-id="${g.id}">
                    <div class="goal-content">${this._contentHtml(g)}</div>
                    <div class="goal-actions">${this._actionsHtml(g.id)}</div>
                </div>
            `).join('');
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
                    <p class="goal-text">${escapeHtml(goal.text)}</p>
                    ${this._tagHtml(goal.category)}
                    ${this._deadlineBadge(goal.deadline)}
                </div>
                <span class="goal-date">📅 ${goal.createdAt}</span>
            `;
        },

        _deadlineBadge(deadline) {
            if (!deadline) return '';
            const today = new Date().toISOString().slice(0, 10);
            const isOverdue = deadline < today;
            const isSoon = !isOverdue && deadline <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
            const [y, m, d] = deadline.split('-');
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
                    card.classList.add('card-out');
                    setTimeout(() => {
                        card.remove();
                        const id = card.dataset.id;
                        if (id) {
                            const list = Store.get(this.STORE_KEY, []);
                            Store.set(this.STORE_KEY, list.filter(r => String(r.id) !== id));
                        }
                        this._updateCount();
                        this._toggleEmpty();
                        notify('Resource Deleted', 'Resource removed');
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
            const isEdit = !!this._editingId;

            if (isEdit) {
                // Update existing resource
                const list = Store.get(this.STORE_KEY, []);
                const idx = list.findIndex(r => String(r.id) === this._editingId);
                if (idx !== -1) {
                    list[idx] = { ...list[idx], title, desc: desc || 'No description provided.', url: url || '#', type, category, tags, rating };
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
            const activeCat = this._activeCat || 'all';
            const cards = Array.from($$('.resource-card'));
            const search = this._searchTerm;
            const tag = this._activeTag;

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
                    const typeMatch = activeFilter === 'all' || card.dataset.type === activeFilter;
                    const catMatch = activeCat === 'all' || card.dataset.category === activeCat;
                    const searchMatch = !search || card.textContent.toLowerCase().includes(search);
                    const tagMatch = !tag || (card.dataset.tags || '').toLowerCase().split(',').some(t => t.trim() === tag);
                    const match = typeMatch && catMatch && searchMatch && tagMatch;

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
        MAX_CHARS: 500,
        _drawCtx: null,
        _drawing: false,
        _drawColor: '#6366f1',
        _drawSize: 2,
        _erasing: false,
        _drawDataURL: null,
        _pendingFiles: [],   // { name, dataURL, type }

        init() {
            state.notes = Store.get(this.STORE_KEY, []);
            this._bindEvents();
            this._initDrawing();
            this.render();
            this._syncDashboard();
        },

        _bindEvents() {
            const textarea = $('#note-textarea');
            const saveBtn = $('#save-note-btn');
            const list = $('#notes-list');

            saveBtn?.addEventListener('click', () => this.save());

            textarea?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.ctrlKey) this.save();
            });

            textarea?.addEventListener('input', () => {
                let len = textarea.value.length;
                if (len > this.MAX_CHARS) {
                    textarea.value = textarea.value.substring(0, this.MAX_CHARS);
                    len = this.MAX_CHARS;
                }
                const counter = $('#char-count');
                if (counter) counter.textContent = len;
                const wrap = document.querySelector('.char-count');
                if (wrap) {
                    wrap.classList.toggle('warning', len >= 400 && len < 475);
                    const isDanger = len >= 475;
                    if (isDanger && !wrap.classList.contains('danger')) {
                        wrap.classList.remove('danger');
                        void wrap.offsetWidth;
                    }
                    wrap.classList.toggle('danger', isDanger);
                }
            });

            // Delegated clicks on note list
            list?.addEventListener('click', (e) => {
                const card = e.target.closest('.note-card');
                if (!card) return;
                const id = parseInt(card.id.replace('note-', ''));

                if (e.target.closest('.note-delete-btn')) return this.delete(id);
                if (e.target.closest('.note-edit-btn'))   return this.startEdit(id);
                if (e.target.closest('.note-edit-save'))  return this.saveEdit(id);
                if (e.target.closest('.note-edit-cancel'))return this.cancelEdit(id);
                if (e.target.closest('.note-pin-btn'))    return this.togglePin(id);
            });

            // Note search
            $('#notes-search')?.addEventListener('input', (e) => {
                this._filterBySearch(e.target.value.trim());
            });

            // Draw toggle button
            $('#note-draw-btn')?.addEventListener('click', () => {
                const panel = $('#note-draw-panel');
                const btn = $('#note-draw-btn');
                const isOpen = panel?.classList.toggle('open');
                btn?.classList.toggle('active-tool', isOpen);
            });

            // File input
            $('#note-file-input')?.addEventListener('change', (e) => this._handleFiles(e.target.files));
        },

        /* ---- Drawing ---- */
        _initDrawing() {
            const canvas = $('#note-draw-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            this._drawCtx = ctx;

            // Hi-DPI
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);
            canvas.style.width = rect.width + 'px';
            canvas.style.height = rect.height + 'px';

            const getPos = (e) => {
                const r = canvas.getBoundingClientRect();
                const t = e.touches ? e.touches[0] : e;
                return { x: t.clientX - r.left, y: t.clientY - r.top };
            };

            const startDraw = (e) => {
                this._drawing = true;
                ctx.beginPath();
                const p = getPos(e);
                ctx.moveTo(p.x, p.y);
            };
            const draw = (e) => {
                if (!this._drawing) return;
                e.preventDefault();
                const p = getPos(e);
                ctx.lineWidth = this._erasing ? this._drawSize * 6 : this._drawSize;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.strokeStyle = this._erasing ? (document.documentElement.dataset.theme === 'light' ? '#ffffff' : '#1e293b') : this._drawColor;
                ctx.globalCompositeOperation = this._erasing ? 'destination-out' : 'source-over';
                ctx.lineTo(p.x, p.y);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
            };
            const endDraw = () => { this._drawing = false; ctx.beginPath(); };

            canvas.addEventListener('mousedown', startDraw);
            canvas.addEventListener('mousemove', draw);
            canvas.addEventListener('mouseup', endDraw);
            canvas.addEventListener('mouseleave', endDraw);
            canvas.addEventListener('touchstart', startDraw, { passive: false });
            canvas.addEventListener('touchmove', draw, { passive: false });
            canvas.addEventListener('touchend', endDraw);

            // Colors
            $('#note-draw-colors')?.addEventListener('click', (e) => {
                const btn = e.target.closest('.draw-color-btn');
                if (!btn) return;
                $$('#note-draw-colors .draw-color-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._drawColor = btn.dataset.color;
                this._erasing = false;
                $('#note-draw-eraser')?.classList.remove('active-tool');
            });

            // Sizes
            $('#note-draw-sizes')?.addEventListener('click', (e) => {
                const btn = e.target.closest('.draw-size-btn');
                if (!btn) return;
                $$('#note-draw-sizes .draw-size-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._drawSize = parseInt(btn.dataset.size);
            });

            // Eraser
            $('#note-draw-eraser')?.addEventListener('click', () => {
                this._erasing = !this._erasing;
                $('#note-draw-eraser')?.classList.toggle('active-tool', this._erasing);
            });

            // Clear
            $('#note-draw-clear')?.addEventListener('click', () => {
                const dpr = window.devicePixelRatio || 1;
                ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
            });

            // Done — capture drawing
            $('#note-draw-done')?.addEventListener('click', () => {
                this._drawDataURL = canvas.toDataURL('image/png');
                // Check if canvas is actually empty
                const dpr = window.devicePixelRatio || 1;
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const hasContent = imgData.data.some((v, i) => i % 4 === 3 && v > 0);
                if (!hasContent) this._drawDataURL = null;

                $('#note-draw-panel')?.classList.remove('open');
                $('#note-draw-btn')?.classList.remove('active-tool');
                if (this._drawDataURL) notify('Drawing Ready', 'Your sketch will be attached to the note');
            });
        },

        /* ---- File attachments ---- */
        _handleFiles(fileList) {
            if (!fileList || !fileList.length) return;
            const preview = $('#note-attachments-preview');

            Array.from(fileList).forEach(file => {
                if (file.size > 5 * 1024 * 1024) {
                    notify('File Too Large', `"${file.name}" exceeds 5 MB limit`);
                    return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                    const entry = { name: file.name, dataURL: reader.result, type: file.type };
                    this._pendingFiles.push(entry);
                    this._renderAttachPreview();
                };
                reader.readAsDataURL(file);
            });

            // Reset input so same file can be picked again
            const inp = $('#note-file-input');
            if (inp) inp.value = '';
        },

        _renderAttachPreview() {
            const preview = $('#note-attachments-preview');
            if (!preview) return;
            preview.innerHTML = this._pendingFiles.map((f, i) => {
                const isImage = f.type.startsWith('image/');
                return `<div class="note-attach-thumb" data-idx="${i}">
                    ${isImage
                        ? `<img src="${f.dataURL}" alt="${escapeHtml(f.name)}">`
                        : `<span class="attach-file-icon">${escapeHtml(f.name.split('.').pop().toUpperCase())}<br>${escapeHtml(f.name.substring(0, 12))}</span>`}
                    <button class="note-attach-remove" data-idx="${i}">&times;</button>
                </div>`;
            }).join('');

            preview.querySelectorAll('.note-attach-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = parseInt(e.currentTarget.dataset.idx);
                    this._pendingFiles.splice(idx, 1);
                    this._renderAttachPreview();
                });
            });
        },

        /* ---- Save ---- */
        save() {
            const textarea = $('#note-textarea');
            const text = textarea?.value.trim();
            if (!text && !this._drawDataURL && !this._pendingFiles.length) {
                notify('Empty Note', 'Please write something, draw, or attach a file');
                return;
            }

            const now = new Date();
            const note = {
                id: Date.now(),
                content: text || '',
                createdAt: now.toISOString(),
                displayDate: formatDateTime({ month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
                wordCount: text ? text.split(/\s+/).length : 0,
                drawing: this._drawDataURL || null,
                files: this._pendingFiles.length ? [...this._pendingFiles] : null,
                pinned: false
            };

            state.notes.unshift(note);
            this._save();
            this.render();
            Streak.recordActivity();
            ActivityTracker.record();
            ActivityChart.render();
            StreakCalendar.render();

            // Reset
            if (textarea) textarea.value = '';
            const counter = $('#char-count');
            if (counter) counter.textContent = '0';
            const wrap = document.querySelector('.char-count');
            if (wrap) wrap.classList.remove('warning', 'danger');

            // Clear drawing
            this._drawDataURL = null;
            const canvas = $('#note-draw-canvas');
            if (canvas && this._drawCtx) {
                const dpr = window.devicePixelRatio || 1;
                this._drawCtx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
            }

            // Clear files
            this._pendingFiles = [];
            const preview = $('#note-attachments-preview');
            if (preview) preview.innerHTML = '';

            this._syncDashboard();
            notify('Note Saved! 📝', 'Your note has been saved successfully');
        },

        /* ---- Edit ---- */
        startEdit(id) {
            const note = state.notes.find(n => n.id === id);
            if (!note) return;
            const card = document.getElementById(`note-${id}`);
            if (!card) return;

            const contentEl = card.querySelector('.note-content');
            const footerEl = card.querySelector('.note-footer');
            if (!contentEl) return;

            // Replace content with textarea
            const ta = document.createElement('textarea');
            ta.className = 'note-edit-textarea';
            ta.value = note.content;
            ta.maxLength = this.MAX_CHARS;

            const actions = document.createElement('div');
            actions.className = 'note-edit-actions';
            actions.innerHTML = `
                <button class="note-edit-save">Save</button>
                <button class="note-edit-cancel">Cancel</button>
            `;

            contentEl.replaceWith(ta);
            ta.after(actions);
            ta.focus();
            ta.setSelectionRange(ta.value.length, ta.value.length);

            // Hide footer during edit
            if (footerEl) footerEl.style.display = 'none';
        },

        saveEdit(id) {
            const note = state.notes.find(n => n.id === id);
            if (!note) return;
            const card = document.getElementById(`note-${id}`);
            const ta = card?.querySelector('.note-edit-textarea');
            if (!ta) return;

            const newText = ta.value.trim();
            if (!newText) { notify('Empty Note', 'Note cannot be empty'); return; }

            note.content = newText;
            note.wordCount = newText.split(/\s+/).length;
            note.editedAt = new Date().toISOString();

            this._save();
            this.render();
            notify('Note Updated! ✏️', 'Your changes have been saved');
        },

        cancelEdit(id) {
            this.render(); // Re-render to discard changes
        },

        /* ---- Delete ---- */
        delete(id) {
            const el = document.getElementById(`note-${id}`);
            const doDelete = () => {
                state.notes = state.notes.filter(n => n.id !== id);
                this._save();
                this.render();
                this._syncDashboard();
                notify('Note Deleted', 'Your note has been removed');
            };

            if (el) {
                el.classList.add('deleting');
                setTimeout(doDelete, 300);
            } else {
                doDelete();
            }
        },

        /* ---- Render ---- */
        render() {
            const list = $('#notes-list');
            const empty = $('#empty-state-notes');
            if (!list) return;

            if (state.notes.length === 0) {
                list.innerHTML = '';
                empty?.classList.add('show');
                return;
            }
            empty?.classList.remove('show');

            // Sort: pinned first, then by date
            const sorted = [...state.notes].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

            list.innerHTML = sorted.map((n, i) => {
                const timeAgo = this._timeAgo(n.createdAt);
                const edited = n.editedAt ? ' (edited)' : '';

                // Drawing preview
                const drawingHtml = n.drawing
                    ? `<div class="note-drawing-preview"><img src="${n.drawing}" alt="Drawing"></div>`
                    : '';

                // File chips
                let filesHtml = '';
                if (n.files && n.files.length) {
                    const chips = n.files.map(f => {
                        if (f.type && f.type.startsWith('image/')) {
                            return `<div class="note-file-chip-img" title="${escapeHtml(f.name)}"><img src="${f.dataURL}" alt="${escapeHtml(f.name)}"></div>`;
                        }
                        return `<span class="note-file-chip" title="${escapeHtml(f.name)}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                            ${escapeHtml(f.name)}
                        </span>`;
                    }).join('');
                    filesHtml = `<div class="note-files">${chips}</div>`;
                }

                return `
                <div class="note-card ${n.pinned ? 'pinned-note' : ''}" id="note-${n.id}" style="--note-delay:${i * 60}ms">
                    <div class="note-card-inner">
                        <div class="note-header">
                            <div class="note-header-left">
                                <h3>${n.content ? (escapeHtml(n.content.substring(0, 50)) + (n.content.length > 50 ? '…' : '')) : (n.drawing ? 'Sketch Note' : 'File Note')}</h3>
                                <span class="note-timestamp">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                    ${timeAgo}${edited}
                                </span>
                            </div>
                            <div class="note-header-actions">
                                <button class="note-action-btn note-pin-btn ${n.pinned ? 'pinned' : ''}" title="${n.pinned ? 'Unpin note' : 'Pin note'}">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="${n.pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>
                                </button>
                                <button class="note-action-btn note-edit-btn" title="Edit note">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                </button>
                                <button class="note-action-btn note-delete-btn" title="Delete note">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                </button>
                            </div>
                        </div>
                        ${drawingHtml}
                        ${n.content ? `<p class="note-content">${escapeHtml(n.content)}</p>` : ''}
                        ${filesHtml}
                        <div class="note-footer">
                            <span class="note-word-count">${n.wordCount} word${n.wordCount !== 1 ? 's' : ''}</span>
                            <span class="note-date">${n.displayDate || n.createdAt}</span>
                        </div>
                    </div>
                </div>`;
            }).join('');
        },

        togglePin(id) {
            const note = state.notes.find(n => n.id === id);
            if (!note) return;
            note.pinned = !note.pinned;
            this._save();
            this.render();
        },

        _filterBySearch(q) {
            const lc = q.toLowerCase();
            const noResults = $('#notes-no-results');
            let anyVisible = false;
            document.querySelectorAll('#notes-list .note-card').forEach(card => {
                const match = !lc || card.textContent.toLowerCase().includes(lc);
                card.style.display = match ? '' : 'none';
                if (match) anyVisible = true;
            });
            if (noResults) noResults.classList.toggle('hidden', anyVisible || !lc);
        },

        _timeAgo(isoStr) {
            if (!isoStr) return '';
            const date = new Date(isoStr);
            if (isNaN(date)) return isoStr; // fallback for old format
            const now = new Date();
            const diff = Math.floor((now - date) / 1000);
            if (diff < 60) return 'just now';
            if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
            if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
            if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
            return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        },

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
            const el = document.getElementById(`reflection-${id}`);
            const doDelete = () => {
                state.reflections = state.reflections.filter(r => r.id !== id);
                this._save();
                this.render();
                notify('Reflection Deleted', 'Your reflection has been removed');
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
                totalGoals:         'Totale mål',
                completedGoals:     'Fullførte mål',
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
                }
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
                }
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

        scheduleSave() {
            clearTimeout(this._saveTimer);
            this._saveTimer = setTimeout(() => this._save(), 1500);
        },

        async _save() {
            if (!supabaseClient) return;
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) return;
            const container = $('.sections-container');
            if (container) container.classList.add('syncing');
            const { error } = await supabaseClient.from('user_data').upsert({
                user_id: user.id,
                goals: state.goals,
                notes: state.notes,
                reflections: state.reflections,
                updated_at: new Date().toISOString()
            });
            if (container) container.classList.remove('syncing');
            if (error) {
                console.error('CloudSync._save failed:', error);
                notify('Synk feilet', 'Kunne ikke lagre til skyen', 'error');
            } else {
                notify('Lagret i skyen ☁️', 'Dataene dine er synkronisert', 'success');
            }
        },

        async load() {
            if (!supabaseClient) return;
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) return;

            const container = $('.sections-container');
            if (container) container.classList.add('syncing');

            // Disable write hook during load to avoid a feedback loop
            const prevHook = Store._onWrite;
            Store._onWrite = null;

            try {
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

                // Merge by id: union of local + cloud, no duplicates, newest first
                const merge = (local, remote) => {
                    const map = new Map(local.map(i => [i.id, i]));
                    (remote || []).forEach(i => { if (!map.has(i.id)) map.set(i.id, i); });
                    return Array.from(map.values()).sort((a, b) => b.id - a.id);
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


            $('#signout-btn')?.addEventListener('click', () => {
                supabaseClient.auth.signOut()
                    .then(() => notify('Logget ut', 'Du er n\u00e5 logget ut', 'info'));
            });
        },

        _onSignedIn(user) {
            $('#login-overlay')?.classList.add('hidden');

            const avatar = $('#user-avatar');
            if (avatar) {
                const initial = escapeHtml((user.email?.[0] || '\u{1F464}').toUpperCase());
                avatar.innerHTML = initial;
                avatar.title = user.email;
            }

            const signoutBtn = $('#signout-btn');
            if (signoutBtn) signoutBtn.hidden = false;

            const syncBadge = $('#sync-badge');
            if (syncBadge) syncBadge.hidden = false;

            Store._onWrite = () => CloudSync.scheduleSave();
            CloudSync.load();
            AutoLogout.start();
        },

        _onSignedOut() {
            const input = $('#auth-password');
            if (input) input.value = '';
            const note = $('#auth-note');
            if (note) note.textContent = '';

            $('#login-overlay')?.classList.remove('hidden');
            AutoLogout.stop();

            const avatar = $('#user-avatar');
            if (avatar) { avatar.innerHTML = '\u{1F464}'; avatar.title = ''; }

            const signoutBtn = $('#signout-btn');
            if (signoutBtn) signoutBtn.hidden = true;

            const syncBadge = $('#sync-badge');
            if (syncBadge) syncBadge.hidden = true;

            Store._onWrite = null;
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
        },

        start() {
            this._remaining = this._duration;
            document.body.classList.add('focus-active');
            const overlay = document.getElementById('focus-overlay');
            if (overlay) overlay.classList.add('visible');
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
            const el = document.getElementById('focus-time');
            if (el) el.textContent = String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0');

            const progress = document.getElementById('focus-ring-progress');
            if (progress) {
                const pct = this._remaining / this._duration;
                const circumference = 2 * Math.PI * 90;
                progress.style.strokeDashoffset = circumference * (1 - pct);
            }
        },

        _onComplete() {
            const timer = document.getElementById('focus-timer-area');
            const done = document.getElementById('focus-done');
            if (timer) timer.classList.add('hidden');
            if (done) done.classList.add('visible');
            Streak.recordActivity();
            notify(I18n.t('focusComplete'), I18n.t('focusCompleteMsg'), 'success');

            // Auto-close after 5 seconds
            setTimeout(() => {
                this.stop();
                if (timer) timer.classList.remove('hidden');
            }, 5000);
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
                    $('.search-input')?.focus();
                    return;
                }
                if (e.altKey && this.SECTION_MAP[e.key]) {
                    $(`[data-section="${this.SECTION_MAP[e.key]}"]`)?.click();
                }
            });
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
        _toast: null,

        start() {
            this._toast = this._createToast();
            this._reset();
            ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(ev =>
                document.addEventListener(ev, () => this._reset(), { passive: true })
            );
        },

        stop() {
            clearTimeout(this._timer);
            clearTimeout(this._warnTimer);
            this._hideToast();
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

        _createToast() {
            const el = document.createElement('div');
            el.className = 'autologout-toast';
            el.id = 'autologout-toast';
            el.innerHTML = '⚠️ Du logges ut om 1 minutt på grunn av inaktivitet';
            document.body.appendChild(el);
            return el;
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
            const done = Store.getRaw(this.STORE_KEY);
            if (!done) {
                setTimeout(() => this._show(), 800);
            }
            $('#onboarding-next')?.addEventListener('click', () => this._next());
            $('#onboarding-skip')?.addEventListener('click', () => this._complete());
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
        ActivityChart.render();
        StreakCalendar.render();

        // Stagger cards in the initially active section (no navigation.switchTo was called)
        setTimeout(() => {
            const initial = document.querySelector('.content-section.active');
            if (initial) Navigation._staggerCards(initial);
        }, 250);
    });

})();
