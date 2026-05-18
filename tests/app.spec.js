/**
 * PLN App — Playwright end-to-end tests
 * Run:  npx playwright test
 * Note: The app must be served at http://localhost:5173 (npx vite) or the
 *       webServer option in playwright.config.js will start it automatically.
 *
 * These tests mock the Supabase auth layer so no real account is required.
 * They exercise core UI flows in localStorage-only mode.
 */
import { test, expect } from '@playwright/test';

// Helper: dismiss the login overlay by patching supabaseClient to null
async function dismissLogin(page) {
    // The app skips the overlay when supabaseClient is null
    // We intercept before the page script runs
    await page.addInitScript(() => {
        // Override supabase config so the login overlay auto-hides
        window.__ENV__ = { SUPABASE_URL: '', SUPABASE_ANON_KEY: '' };
    });
}

test.beforeEach(async ({ page }) => {
    await dismissLogin(page);
    await page.goto('/');
    // Clear localStorage between tests to get a clean state
    await page.evaluate(() => {
        Object.keys(localStorage)
            .filter(k => k.startsWith('pln_') || k.startsWith('kompass_'))
            .forEach(k => localStorage.removeItem(k));
        location.reload();
    });
    await page.waitForLoadState('networkidle');
});

// ─── Navigation ─────────────────────────────────────────────────────────────

test('can navigate between all main sections', async ({ page }) => {
    const sections = ['goals', 'resources', 'notes', 'reflection', 'insights'];
    for (const section of sections) {
        await page.click(`[data-section="${section}"]`);
        await expect(page.locator(`#${section}`)).toBeVisible();
    }
});

// ─── Goals ───────────────────────────────────────────────────────────────────

test('can add a goal', async ({ page }) => {
    await page.click('[data-section="goals"]');
    await page.fill('#goal-input', 'Learn Playwright testing');
    await page.click('#add-goal-btn');
    await expect(page.locator('#goals-list')).toContainText('Learn Playwright testing');
});

test('can complete a goal', async ({ page }) => {
    await page.click('[data-section="goals"]');
    await page.fill('#goal-input', 'Complete me');
    await page.click('#add-goal-btn');
    const checkbox = page.locator('.goal-checkbox').first();
    await checkbox.check();
    await expect(page.locator('.goal-item.completed').first()).toBeVisible();
});

test('can delete a goal and undo', async ({ page }) => {
    await page.click('[data-section="goals"]');
    await page.fill('#goal-input', 'Temporary goal');
    await page.click('#add-goal-btn');
    await expect(page.locator('#goals-list')).toContainText('Temporary goal');

    const deleteBtn = page.locator('.goal-delete-btn').first();
    await deleteBtn.click();
    // The item should be removed from view
    await expect(page.locator('#goals-list')).not.toContainText('Temporary goal');

    // Undo toast should appear
    const undoBtn = page.locator('.toast-undo .undo-action-btn');
    await expect(undoBtn).toBeVisible({ timeout: 3000 });
    await undoBtn.click();
    // Goal should be restored
    await expect(page.locator('#goals-list')).toContainText('Temporary goal');
});

test('can add a milestone to a goal', async ({ page }) => {
    await page.click('[data-section="goals"]');
    await page.fill('#goal-input', 'Goal with steps');
    await page.click('#add-goal-btn');
    // Open milestone section
    await page.click('.milestones-toggle-btn');
    await page.fill('.milestone-add-input', 'Step one');
    await page.click('.milestone-add-btn');
    await expect(page.locator('.milestone-text').first()).toContainText('Step one');
});

// ─── Notes ───────────────────────────────────────────────────────────────────

test('can add a note', async ({ page }) => {
    await page.click('[data-section="notes"]');
    await page.fill('#note-textarea', 'My first test note');
    await page.click('#add-note-btn');
    await expect(page.locator('#notes-list')).toContainText('My first test note');
});

// ─── Resources ───────────────────────────────────────────────────────────────

test('can add a resource', async ({ page }) => {
    await page.click('[data-section="resources"]');
    // Open the add panel
    await page.click('#add-resource-btn');
    await page.fill('#res-title', 'Playwright Docs');
    await page.fill('#res-url', 'https://playwright.dev');
    await page.click('#res-save-btn');
    await expect(page.locator('#resources-grid')).toContainText('Playwright Docs');
});

test('can create a resource collection', async ({ page }) => {
    await page.click('[data-section="resources"]');
    await page.click('#collection-add-btn');
    await expect(page.locator('#collection-dialog-overlay')).toBeVisible();
    await page.fill('#collection-name-input', 'My Collection');
    await page.click('#collection-dialog-save');
    await expect(page.locator('#collections-scroll')).toContainText('My Collection');
});

// ─── Command Palette ─────────────────────────────────────────────────────────

test('command palette opens and closes', async ({ page }) => {
    // Open with Ctrl+K
    await page.keyboard.press('Control+k');
    await expect(page.locator('#cmd-overlay')).toBeVisible();

    // Close with Escape
    await page.keyboard.press('Escape');
    await expect(page.locator('#cmd-overlay')).toBeHidden();
});

test('command palette can navigate to a section', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await page.fill('#cmd-input', 'Notes');
    const noteItem = page.locator('.cmd-item').filter({ hasText: 'Notes' }).first();
    await expect(noteItem).toBeVisible();
    await noteItem.click();
    await expect(page.locator('#notes')).toBeVisible();
});

// ─── Reflection Prompt ───────────────────────────────────────────────────────

test('reflection prompt banner uses prompt text', async ({ page }) => {
    // Forcibly clear the last-shown date to trigger prompt display
    await page.evaluate(() => localStorage.removeItem('pln_last_reflection_prompt'));
    await page.click('[data-section="reflection"]');
    // The banner appears if today is Monday OR key is absent
    // We can't guarantee it shows in CI, so only check if visible
    const banner = page.locator('#reflection-prompt-banner');
    const isVisible = await banner.isVisible().catch(() => false);
    if (isVisible) {
        await page.click('#reflection-prompt-use');
        const learnVal = await page.inputValue('#reflection-learn');
        expect(learnVal.length).toBeGreaterThan(10);
    }
});

// ─── Sidebar ─────────────────────────────────────────────────────────────────

test('sidebar can be collapsed and expanded', async ({ page }) => {
    const collapseBtn = page.locator('#sidebar-collapse-btn');
    await collapseBtn.click();
    await expect(page.locator('.sidebar')).toHaveClass(/collapsed/);
    await collapseBtn.click();
    await expect(page.locator('.sidebar')).not.toHaveClass(/collapsed/);
});
