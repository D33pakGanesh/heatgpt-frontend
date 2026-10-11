# MapLibre GL JS + PMTiles Notes

This branch replaces the Leaflet map runtime with MapLibre GL JS. LGA drawing and picking can use a PMTiles vector archive when `VITE_LGA_PMTILES_URL` is configured. Development keeps a GeoJSON fallback through `/api/lgas` so the app still runs without a generated archive.

## Runtime Configuration

- `VITE_LGA_PMTILES_URL=/data/lga-boundaries.pmtiles`
- `VITE_LGA_PMTILES_LAYER=lgas`

PMTiles are used only for drawing, styling and hit testing. Complete selected geometry is fetched from `GET /api/lga/:id/geometry` because vector tile features may be simplified, clipped at tile boundaries and split across tiles.

## Generate PMTiles

Run against a non-production PostGIS database:

```bash
DATABASE_URL='postgresql://user:pass@host:5432/db' npm run tiles:lgas
```

The script exports `lga_id`, `lga_name`, `state` and valid EPSG:4326 multipolygon geometry to GeoJSON, then builds `public/data/lga-boundaries-YYYYMMDD.pmtiles` with layer name `lgas` and a stable `public/data/lga-boundaries.pmtiles` symlink.

Do not commit production dumps or restricted source data. Confirm the redistribution licence for the LGA source dataset before committing a public `.pmtiles` archive. If redistribution is not permitted, keep the archive in staging/object storage and commit only development fixtures.

## Static Hosting

PMTiles should be served as a static file with HTTP Range support. Nginx file serving supports Range requests for static files by default; verify with:

```bash
curl -I -H 'Range: bytes=0-1023' https://example.com/data/lga-boundaries.pmtiles
```

Expected response: `206 Partial Content` with `Accept-Ranges: bytes`.

Example staging location block:

```nginx
location /data/ {
  alias /var/www/heatgpt-staging/frontend/dist/data/;
  types { application/octet-stream pmtiles; }
  add_header Accept-Ranges bytes always;
  add_header Cache-Control "public, max-age=31536000, immutable";
  try_files $uri =404;
}
```

Do not modify production Nginx until this branch has been validated in staging.

## Benchmark Checklist

1. Measure `/api/lgas` transfer size and parse time in the browser network panel.
2. Measure initial PMTiles header request and visible tile byte ranges.
3. Confirm taps and clicks select the same LGA near polygon boundaries.
4. Confirm selected LGA geometry fetch occurs once per selected LGA and is reused by raster clipping.
5. Compare map load, first interaction and raster overlay behaviour on desktop and mobile.
