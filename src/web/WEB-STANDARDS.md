# Web UI Standards

**Objective:** Desktop-first, Tautulli-level density for 1080p+ homelab displays

## Core Principles

1. **Desktop-First** - Optimize for 1920×1080+ displays, mobile is secondary
2. **Density Over Whitespace** - Maximize information density like Tautulli/*arr apps
3. **Utility Classes Over Inline Styles** - Centralized, consistent, maintainable
4. **Semantic HTML** - Use proper elements, avoid div soup

---

## Spacing System

All spacing uses CSS variables defined in `/css/styles.css`:

```css
--space-1: 0.25rem;   /* 4px  - tight elements */
--space-2: 0.375rem;  /* 6px  - compact (default) */
--space-3: 0.5rem;    /* 8px  - normal */
--space-4: 0.75rem;   /* 12px - section breaks */
--space-5: 1rem;      /* 16px - large gaps */
--space-6: 1.5rem;    /* 24px - major sections only */
```

**Default for most elements:** `--space-2` (6px) or `--space-3` (8px)
**Avoid:** `--space-6` except for major page sections

---

## Utility Classes

### Spacing

**Margin:**
```tsx
class="m-0"        // margin: 0
class="mb-3"       // margin-bottom: var(--space-3)
class="mt-5"       // margin-top: var(--space-5)
class="mb-6"       // margin-bottom: var(--space-6) - USE SPARINGLY
```

**Padding:**
```tsx
class="p-3"        // padding: var(--space-3)
class="px-4"       // padding-left/right: var(--space-4)
class="py-3"       // padding-top/bottom: var(--space-3)
```

### Layout

**Flexbox:**
```tsx
class="flex"              // display: flex
class="flex-between"      // justify-content: space-between + align-items: center
class="flex-center"       // align-items: center
class="flex-wrap"         // flex-wrap: wrap
class="gap-3"             // gap: var(--space-3)
```

**Grid:**
```tsx
class="grid-auto"         // Auto-fit grid, minmax(120px, 1fr)
class="grid-auto-wide"    // Auto-fit grid, minmax(160px, 1fr)
class="grid-2"            // 2 columns
class="grid-4"            // 4 columns
```

### Text

```tsx
class="text-muted"        // Muted color
class="text-sm"           // 0.8125rem
class="text-xs"           // 0.75rem
class="text-muted-sm"     // Muted + small
class="text-center"       // Text align center
```

### Cards & Components

```tsx
class="card"              // Standard card (padding: var(--space-4))
class="card-dense"        // Tight card (padding: var(--space-3))
class="rounded"           // Border radius 0.25rem
class="rounded-lg"        // Border radius 0.5rem
class="border-top"        // Top border with muted color
```

### Status Badges

```tsx
class="status-badge status-success"
class="status-badge status-failed"
class="status-badge status-running"
```

---

## When Inline Styles Are Allowed

✅ **Acceptable:**
- Dynamic values from variables: `style="font-size: ${size}rem"`
- Color values not in theme: `style="color: var(--pico-del-color)"`
- Complex gradients/animations
- One-off edge cases that don't justify a utility class

❌ **Forbidden:**
- `style="display: flex; justify-content: space-between"` → Use `class="flex-between"`
- `style="margin-bottom: 2rem"` → Use `class="mb-6"` (or ideally `class="mb-5"`)
- `style="padding: 1.5rem"` → Use `class="p-6"`
- `style="color: var(--pico-muted-color)"` → Use `class="text-muted"`
- `style="font-size: 0.875rem"` → Use `class="text-sm"`

---

## Common Patterns

### Page Header with Action
```tsx
<div class="flex-between mb-5">
  <h2>Page Title</h2>
  <a href="/action" role="button" class="secondary">Action</a>
</div>
```

### Breadcrumbs
```tsx
<nav aria-label="breadcrumb" class="mb-5">
  <ol class="flex text-muted-sm p-0 gap-3" style="list-style: none;">
    <li><a href="/">Dashboard</a></li>
    <li>›</li>
    <li><span style="color: var(--pico-contrast);">Current Page</span></li>
  </ol>
</nav>
```

### Stat Cards Grid
```tsx
<div class="grid-auto-wide gap-4 mb-5">
  <div class="stat-card">
    <h3>42</h3>
    <p>Label</p>
    <small class="text-muted text-xs">Subtitle</small>
  </div>
  {/* More cards... */}
</div>
```

### Card with Header
```tsx
<div class="card p-5 rounded-lg mb-5">
  <h3 class="m-0 mb-3">Card Title</h3>
  <p class="text-muted m-0">Content here</p>
</div>
```

### Alert/Banner
```tsx
<div class="card-dense rounded-lg mb-4 border-left-primary">
  <h3 class="m-0 mb-3">Alert Title</h3>
  <p class="m-0 mb-4">Alert message here</p>
  <a href="/action" role="button" class="m-0">Take Action →</a>
</div>
```

### Table Actions
```tsx
<td class="text-right">
  <div class="flex gap-3 justify-end">
    <button class="secondary m-0 text-sm">Edit</button>
    <button class="outline m-0 text-sm">Delete</button>
  </div>
</td>
```

---

## Component-Specific Guidelines

### Tables
- Use `text-center` and `text-right` classes for alignment
- Font size: `0.8125rem` (default from global CSS)
- Padding: `0.3125rem 0.5rem` per cell (tight, Tautulli-style)
- Headers: uppercase, `0.75rem`, letter-spacing

### Buttons
- Default padding: `0.3125rem 0.625rem`
- Action buttons: `class="action-btn"` for even tighter padding
- Always set `class="m-0"` to avoid default margins
- Use `class="secondary"` or `class="outline"` for non-primary actions

### Forms
- Label margin: `class="mb-2"`
- Input margin: `class="m-0"` (override PicoCSS defaults)
- Field groups: `class="mb-4"`

### Sections
- Between major sections: `class="mb-6"` (24px)
- Between subsections: `class="mb-4"` or `class="mb-5"`
- Default section: No class needed (global CSS applies `margin-top/bottom: var(--space-4)`)

---

## Migration Checklist

When refactoring a component:

1. ✅ Replace `style="margin-bottom: Xrem"` → `class="mb-X"`
2. ✅ Replace `style="padding: Xrem"` → `class="p-X"`
3. ✅ Replace `style="display: flex; ..."` → `class="flex-*"`
4. ✅ Replace `style="color: var(--pico-muted-color)"` → `class="text-muted"`
5. ✅ Replace `style="font-size: X"` → `class="text-sm"` or `class="text-xs"`
6. ✅ Remove component-specific `<style>` blocks if styles are now in `/css/styles.css`
7. ✅ Verify desktop density (no excessive whitespace)
8. ✅ Test at 1920×1080 resolution

---

## Examples: Before/After

### Before ❌
```tsx
<div style="background: var(--pico-card-background-color); padding: 1.5rem; border-radius: 0.5rem; margin-bottom: 2rem;">
  <h3 style="margin: 0 0 0.5rem 0;">Title</h3>
  <p style="color: var(--pico-muted-color); margin: 0;">
    Description text
  </p>
</div>
```

### After ✅
```tsx
<div class="card p-6 rounded-lg mb-5">
  <h3 class="m-0 mb-3">Title</h3>
  <p class="text-muted m-0">
    Description text
  </p>
</div>
```

---

## File Structure

```
src/web/
├── public/
│   └── css/
│       └── styles.css         ← All global styles, utilities, components
├── views/
│   ├── layout.tsx             ← Includes styles.css link
│   ├── dashboard.tsx
│   ├── playlists/
│   │   ├── index.tsx
│   │   └── detail.tsx
│   └── config/
│       └── index.tsx
└── WEB-STANDARDS.md           ← This file
```

**Rule:** No `<style>` blocks in component files unless truly page-specific and cannot be generalized.

---

## Resources

- **PicoCSS Docs:** https://picocss.com/docs
- **CSS Variables:** See `/css/styles.css` `:root` section
- **Tautulli Reference:** Visual density target for desktop apps
- **HTMX Docs:** https://htmx.org/docs/

---

## Questions?

Check existing components for patterns:
- `src/web/views/dashboard.tsx` - Stat cards, alerts
- `src/web/views/playlists/index.tsx` - Search, grids, tables
- `src/web/views/playlists/detail.tsx` - Breadcrumbs, navigation
- `src/web/views/config/index.tsx` - Config cards, forms
