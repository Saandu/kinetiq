# Kinetiq

Kinetiq is a browser-based condition-monitoring demo that shows which fictional factory machines need attention and when.

**Live demo:** [https://kinetiq-dashboard.web.app](https://kinetiq-dashboard.web.app)

This repository is a standalone 2026 portfolio project. All machine identities,
locations, telemetry, thresholds and events are fictional and generated for the
demo. It has no backend, database, authentication, credentials or runtime API
calls.

## Engineering decisions

### A small interface without a UI framework

The application uses project-specific Vue components and hand-written CSS. That
keeps the runtime dependency set limited to Vue, Pinia, Vue Router and vue-i18n,
and avoids shipping a general component or charting system for a compact,
fixed-purpose interface. The cost is that accessibility and responsive behavior
must be implemented and reviewed in the local components.

### One data boundary

Pages and stores depend on the `TelemetrySource` interface rather than browser
storage or generator functions directly. The local implementation combines a
deterministic telemetry source with namespaced `localStorage`, keeping storage
details out of the UI.

### Deterministic simulation

Generated values are derived from machine identity, field name and wall-clock
time. Reloading does not randomly move machines into unrelated states, and two
tabs opened at the same time agree. Explicit demo profiles ensure the dashboard
always contains a useful mix of healthy, warning, critical and offline states.

### One shared clock

A ref-counted timer updates one reactive timestamp for the whole application.
All live values derive from that timestamp, and updates pause while the tab is
hidden. Individual pages do not create polling loops.

### Visualisation follows the comparison

Operating-state distribution uses a stacked bar because the task is comparing
parts of a whole on a shared baseline. Ratios use simple meters. Severity is
also expressed with icon shape and text, so color is never the only signal.

## Stack

| Layer | Technology |
|---|---|
| UI | Vue 3 with TypeScript and `<script setup>` |
| State | Pinia |
| Routing | Vue Router |
| Internationalisation | vue-i18n, English and German |
| Styling and charts | Custom CSS and inline SVG |
| Build | Vite |
| Persistence | Browser `localStorage` |
| Hosting | Firebase Hosting as static files |

## Accessibility and mobile behavior

- Status combines color, icon shape and text.
- Interactive controls expose labels and focus-visible states.
- Reduced-motion preferences are respected.
- Touch targets expand on coarse pointers.
- Form controls use 16px text on touch devices because smaller controls cause
  iOS Safari to zoom the page on focus, which disrupts the layout.
- Drawers and dialogs lock and restore page scroll position.
- The layout accounts for dynamic mobile viewports and safe-area insets.

## Run locally

Requirements: Node.js `^20.19.0` or `>=22.12.0`, plus npm.

```bash
git clone https://github.com/Saandu/kinetiq.git
cd kinetiq
npm ci
npm run dev
```

Open [http://localhost:3100](http://localhost:3100).

```bash
npm run typecheck  # TypeScript and Vue checks
npm run build      # verified build in dist/
npm run preview    # serve the built application locally
```

## Known limitations

- Telemetry is illustrative and should not be used for operational decisions.
- Browser storage is local to one device and can be cleared at any time.
- The demo has no multi-user workflow, authentication or server-side history.
- Alert configuration affects generated demo severity only.
