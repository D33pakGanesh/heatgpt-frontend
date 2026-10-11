import type { Map as MapLibreMap } from 'maplibre-gl'

export type HeatMap = MapLibreMap

export type LgaFeature = GeoJSON.Feature<GeoJSON.Geometry, {
  lga_id: string
  lga_name?: string
  state?: string
}>

export type TileLayer = {
  url: string
  type: 'lst' | 'ndvi' | 'suhi'
  bbox?: { west: number; south: number; east: number; north: number }
  lgaGeometry?: GeoJSON.Geometry | null
  dateRangeStart?: string
  dateRangeEnd?: string
}

export type LngLatBoundsArray = [[number, number], [number, number]]
