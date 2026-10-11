#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/public/data}"
VERSION="${VERSION:-$(date -u +%Y%m%d)}"
LAYER="${LAYER:-lgas}"
GEOJSON="$OUT_DIR/lga-boundaries-$VERSION.geojson"
PMTILES="$OUT_DIR/lga-boundaries-$VERSION.pmtiles"
LATEST="$OUT_DIR/lga-boundaries.pmtiles"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required and should point at a non-production PostGIS database." >&2
  exit 1
fi

command -v ogr2ogr >/dev/null || { echo "ogr2ogr is required (GDAL)." >&2; exit 1; }
command -v tippecanoe >/dev/null || { echo "tippecanoe is required." >&2; exit 1; }

mkdir -p "$OUT_DIR"

ogr2ogr \
  -f GeoJSON "$GEOJSON" \
  "PG:$DATABASE_URL" \
  -sql "SELECT lga_id, lga_name, state, ST_MakeValid(geom)::geometry(MultiPolygon, 4326) AS geom FROM lgas" \
  -nln "$LAYER" \
  -t_srs EPSG:4326 \
  -lco RFC7946=YES

tippecanoe \
  -o "$PMTILES" \
  -l "$LAYER" \
  -Z 5 \
  -z 13 \
  --projection=EPSG:4326 \
  --detect-shared-borders \
  --coalesce-densest-as-needed \
  --extend-zooms-if-still-dropping \
  --no-tile-compression \
  --force \
  "$GEOJSON"

ln -sf "$(basename "$PMTILES")" "$LATEST"

echo "Wrote $PMTILES"
echo "Configure VITE_LGA_PMTILES_URL=/data/lga-boundaries.pmtiles and VITE_LGA_PMTILES_LAYER=$LAYER"
