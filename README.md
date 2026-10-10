# HeatGPT Frontend

HeatGPT is an urban heat island exploration interface for Australian local government areas. The frontend renders an interactive Leaflet map, lets users select LGA polygons, visualises satellite-derived heat and vegetation layers, and opens a side panel with charts, saved layers, SUHI metrics, and a HeatGPT chat panel.

This repository is the standalone frontend for `D33pakGanesh/heatgpt-frontend`. It is designed to work with the companion backend at `D33pakGanesh/heatgpt-backend`.

## Features

- Interactive LGA map using Leaflet and React.
- Configurable map basemaps, polygon styling, north arrow, scale bar, and raster legends.
- Heat metrics panel with LST, NDVI, UHI, SUHI, trend charts, and saved layer management.
- HeatGPT chat requests scoped to the currently selected LGA and heat statistics.
- Configurable backend API base URL for local, staging, and production deployments.

## Stack

- React 18
- TypeScript
- Vite
- Leaflet
- TanStack Query
- Recharts
- Plain CSS with Autoprefixer

## Architecture

```text
Browser
  |
  | React UI, Leaflet map, TanStack Query
  v
HeatGPT frontend
  |
  | HTTP requests to VITE_API_BASE_URL or same-origin /api
  v
HeatGPT backend
```

The frontend never stores database credentials, Earth Engine keys, or Gemini API keys. Those belong only in the backend environment.

## Configuration

Copy `.env.example` to `.env` for local development:

```bash
VITE_API_BASE_URL=http://localhost:3001
VITE_API_PROXY_TARGET=http://localhost:3001
```

`VITE_API_BASE_URL` controls runtime API requests. Leave it blank when serving the frontend and backend from the same origin through a reverse proxy.

`VITE_API_PROXY_TARGET` controls the Vite development proxy for `/api`.

## Development

```bash
npm ci
npm run dev
```

The Vite dev server defaults to `http://localhost:5173`.

## Verification

```bash
npm run typecheck
npm run build
```

Current verification on October 10, 2026:

- `npm run typecheck` passes.
- `npm run build` passes.
- Vite production build completes without chunk-size warnings after lazy-loading the side panel/chart bundle.
- `npm audit` reports 0 vulnerabilities.
