# HeatGPT Frontend

HeatGPT is an urban heat island exploration interface for Australian local government areas. The frontend renders an interactive MapLibre GL JS map, lets users select LGA polygons from a PMTiles vector archive, visualises satellite-derived heat and vegetation layers, and opens a responsive panel with charts, saved layers, SUHI metrics, and a HeatGPT chat panel.

This repository is the standalone frontend for [D33pakGanesh/heatgpt-frontend](https://github.com/D33pakGanesh/heatgpt-frontend). It is designed to work with the companion backend at [D33pakGanesh/heatgpt-backend](https://github.com/D33pakGanesh/heatgpt-backend).

## Features

- Interactive LGA map using MapLibre GL JS, PMTiles and React.
- Configurable map basemaps, polygon styling, north arrow, scale bar, and raster legends.
- Heat metrics panel with LST, NDVI, UHI, SUHI, trend charts, and saved layer management.
- HeatGPT chat requests scoped to the currently selected LGA and heat statistics.
- Mobile bottom sheet for selected LGA details, with collapsed, half and expanded states.
- Configurable backend API base URL for local, staging, and production deployments.

## Stack

- React 18
- TypeScript
- Vite
- MapLibre GL JS
- PMTiles
- TanStack Query
- Recharts
- Plain CSS with Autoprefixer

## Architecture

```text
Browser
  |
  | React UI, MapLibre map, PMTiles, TanStack Query
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
VITE_LGA_PMTILES_URL=/data/lga-boundaries-abs-2021.pmtiles
VITE_LGA_PMTILES_LAYER=lgas
```

`VITE_API_BASE_URL` controls runtime API requests. Leave it blank when serving the frontend and backend from the same origin through a reverse proxy.

`VITE_API_PROXY_TARGET` controls the Vite development proxy for `/api`.

`VITE_LGA_PMTILES_URL` and `VITE_LGA_PMTILES_LAYER` configure the LGA vector tile archive used by MapLibre. The checked-in archive is documented in [public/data/README.md](public/data/README.md). More implementation notes are in [docs/maplibre-pmtiles.md](docs/maplibre-pmtiles.md).

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
npm run test:e2e
```

The Playwright suite includes desktop MapLibre/PMTiles interaction checks and mobile bottom-sheet regression tests. Set `PLAYWRIGHT_BASE_URL` to test an already running instance:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:5173 npm run test:e2e
```
