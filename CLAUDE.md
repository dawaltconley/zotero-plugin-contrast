# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Zotero 7 plugin that adds Brightness and Contrast sliders to the PDF reader's Appearance panel. Built on a simplified personal template that drops the zotero-plugin-toolkit dependency and targets Zotero 7 only.

## Commands

```bash
npm run dev          # Start local dev server with hot reload (requires .env)
npm run build        # Build plugin and type-check
npm run lint:check   # Check formatting and linting
npm run lint:fix     # Auto-fix formatting and linting issues
npm run release      # Create versioned release
```

Before running `npm run dev`, copy `.env.example` to `.env` and set `ZOTERO_PLUGIN_ZOTERO_BIN_PATH` and `ZOTERO_PLUGIN_PROFILE_PATH`.

## Architecture

The plugin has two layers that connect through the build pipeline:

**`addon/bootstrap.js`** — Firefox/XUL extension entry point. Runs in Zotero's privileged scope. Handles Firefox lifecycle hooks (`startup`, `shutdown`, `onMainWindowLoad`, `onMainWindowUnload`), registers the chrome manifest, loads the compiled TypeScript bundle via `Services.scriptloader`, and manages `Plugin` class instantiation per window.

**`src/plugin.ts`** — Core plugin logic compiled by esbuild into the bundle loaded above. The `Plugin` class:

- Listens for `Zotero.Reader.registerEventListener('renderToolbar', ...)` and `Zotero.Notifier` tab events to call `attachStylesToReader()` on PDF readers
- `attachStylesToReader()` waits for both the outer reader iframe and inner PDF iframe to initialize, then calls `applyFilters()` and `addSliders()`
- `applyFilters()` injects `styles.scss` as a `<style>` element into the **inner** PDF iframe (`reader._internalReader._primaryView._iframeWindow`) and sets `--pdf-contrast` / `--pdf-brightness` CSS custom properties on its root element. When both values are 100%, the style element and properties are removed entirely.
- `addSliders()` sets up a `MutationObserver` on `#reader-ui` in the **outer** reader iframe (`reader._iframeWindow`) to detect when `.appearance-popup` is added to the DOM, then prepends the slider group into that popup.
- Per-document filter values are keyed by `reader._item.key` (stable across tab close/reopen). The global default and per-document values are persisted via `Zotero.Prefs`.

**`src/slider.ts`** — Pure DOM helpers. `createSlider(doc, initialValue, callback, config)` builds a `.row` with a ticked range input matching Zotero's native Appearance panel style. `createSliderGroup(doc, dataAttr)` wraps multiple sliders in a `.group` div used as both a container and a duplicate-injection guard.

**`src/utils.ts`** — Reader type guards (`isPDFReader`, etc.) and async helpers (`waitForReader`, `waitForInternalReader`) that await the reader's initialization promises.

**`src/styles.scss`** — Compiled to an inline CSS string at build time. Applies `brightness()` and `contrast()` filters to `.canvasWrapper canvas` via CSS custom properties with 100% fallbacks.

**`zotero-plugin.config.ts`** — Build config using zotero-plugin-scaffold + esbuild. Bundles `src/index.ts` with esbuild-sass-plugin for SCSS support, targeting Firefox 115+. Output goes to `.scaffold/build/`.

## Two-iframe architecture

The PDF reader uses two nested iframes:

- **Outer iframe** (`reader._iframeWindow`) — React app hosting the toolbar, sidebar, and Appearance popup. This is where the `MutationObserver` and slider DOM live.
- **Inner iframe** (`reader._internalReader._primaryView._iframeWindow`) — The PDF.js canvas. This is where the CSS filter is applied.

These must not be confused: injecting styles into the wrong iframe has no visible effect.

## Key Constraint

ESLint enforces using `Zotero.getMainWindow()` instead of the global `window` — global DOM access is unsafe in Zotero's multi-window environment.
