#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/public/data}"
VERSION="${VERSION:-$(date -u +%Y%m%d)}"
LAYER="${LAYER:-lgas}"
GEOJSON="$OUT_DIR/lga-boundaries-$VERSION.geojson"
PMTILES="$OUT_DIR/lga-boundaries-$VERSION.pmtiles"
LATEST="$OUT_DIR/lga-boundaries.pmtiles"
SOURCE_GEOJSON="${SOURCE_GEOJSON:-}"

command -v ogr2ogr >/dev/null || { echo "ogr2ogr is required (GDAL)." >&2; exit 1; }
command -v tippecanoe >/dev/null || { echo "tippecanoe is required." >&2; exit 1; }

mkdir -p "$OUT_DIR"

if [[ -n "$SOURCE_GEOJSON" ]]; then
  ogr2ogr \
    -f GeoJSON "$GEOJSON" \
    "$SOURCE_GEOJSON" \
    -nln "$LAYER" \
    -t_srs EPSG:4326 \
    -lco RFC7946=YES \
    -select lga_id,lga_name,state,source,source_year,source_license
else
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "DATABASE_URL or SOURCE_GEOJSON is required. Use a non-production PostGIS database, or a licensed source GeoJSON." >&2
    exit 1
  fi

  ogr2ogr \
    -f GeoJSON "$GEOJSON" \
    "PG:$DATABASE_URL" \
    -sql "SELECT lga_id, lga_name, state, ST_MakeValid(geom)::geometry(MultiPolygon, 4326) AS geom FROM lgas" \
    -nln "$LAYER" \
    -t_srs EPSG:4326 \
    -lco RFC7946=YES
fi

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
