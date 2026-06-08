# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Quillory is a static marketing website for a calm, private voice journaling iOS app. The site is hosted on GitHub Pages at `quillory.app` and has no build process — files are served directly.

## No Build or Test Commands

There is no `package.json`, no bundler, no linter, and no test suite. To preview changes, open the HTML files directly in a browser or use any static file server:

```bash
python3 -m http.server 8080
# or
npx serve .
```

Deployment is automatic via GitHub Pages on push to `main`.

## Architecture

The site consists of five standalone HTML files — each is fully self-contained with its own `<style>` block and inline scripts. There is no shared CSS file or JavaScript module:

| File | Purpose |
|---|---|
| `index.html` | Main marketing landing page (749 lines) |
| `privacy/index.html` | Privacy Policy |
| `terms/index.html` | Terms of Service |
| `support/index.html` | Support & FAQ |
| `verified/index.html` | Email verification confirmation |

The `v` file is a redirect placeholder. Static assets (icons, screenshots) live in `assets/`.

## Design System (inline, no external stylesheet)

All pages share the same conventions but duplicate the CSS. When editing styles, update each file individually.

**CSS Variables** (defined in `:root` on each page):
- `--green: #2f6e55` — primary brand colour
- `--bg: #f6f1e8` — warm cream background
- `--radius: 22px` — rounded aesthetic
- `--pad: 24px` — standard padding
- `--max: 1100px` — max content width

**Cards** use `rgba(255,255,255,.72)` backgrounds with `backdrop-filter: blur`.

**Mobile breakpoint**: `640px`. Side phone mockups (`.p1`, `.p2`) are hidden on mobile; layout shifts from 2-column grid to single column.

## Key JavaScript Patterns (`index.html`)

- **Scroll-reveal**: `IntersectionObserver` adds `.show` to elements with `.reveal` on entry.
- **Parallax**: Elements with `data-parallax="<depth>"` shift vertically on `window.scroll`.
- **Tone chip animation**: Cycles the hero chip label ("Nice" → "Balanced" → "Yourself") on a timer using `.chipActive` class toggling.
- **Dynamic footer year**: `new Date().getFullYear()`.

No external libraries are loaded anywhere — keep it vanilla JS.

## Content & Legal Context

- **Jurisdiction**: Yukon, Canada
- **Age minimum**: 13+
- **Support email**: support@quillory.app
- **Privacy stance**: The app collects minimal data; the copy consistently emphasises "no ads, no data selling." Do not add copy that contradicts this.
- **Legal caution**: Terms and Privacy pages are written conservatively ("no risky promises"). Maintain this tone if editing legal pages.

## CSS & HTML Conventions

- Class names are **camelCase** for component parts (`.phoneStage`, `.splashMark`) and **kebab-case** for utilities/states (`.chip-active` would be wrong — existing code uses `.chipActive`).
- Section blocks in CSS are separated with `/* ---------- Section Name ---------- */` comment markers.
- Layout containers use `.wrap` (max-width + horizontal padding) and `.grid` (CSS Grid).
- Avoid inline `style=""` attributes; use classes.
