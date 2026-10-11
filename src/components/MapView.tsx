import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as maplibregl from 'maplibre-gl'
import {
  addProtocol,
  setWorkerUrl,
  type GeoJSONSource,
  type LngLatBoundsLike,
  type MapGeoJSONFeature,
  type MapLayerMouseEvent,
  type MapLayerTouchEvent,
  type PointLike,
} from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { Protocol } from 'pmtiles'
import type { SymbologySettings, BasemapType } from './SymbologyPanel'
import { apiUrl } from '../api'
import type { HeatMap, LgaFeature, TileLayer } from '../mapTypes'

interface MapViewProps {
  selectedLgaId: string | null
  onLgaSelect: (feature: LgaFeature) => void
  activeTileLayer?: TileLayer | null
  symbology?: SymbologySettings
  basemap?: BasemapType
  mapRefCallback?: (map: HeatMap | null) => void
}

const MELBOURNE_BOUNDS: LngLatBoundsLike = [[144.4, -38.5], [145.8, -37.4]]
const LGA_SOURCE = 'lga-boundaries'
const LGA_FILL_LAYER = 'lga-fill'
const LGA_LINE_LAYER = 'lga-line'
const LGA_SELECTED_LAYER = 'lga-selected'
const RASTER_SOURCE = 'gee-raster'
const RASTER_LAYER = 'gee-raster-layer'

const lgaPmtilesUrl = import.meta.env.VITE_LGA_PMTILES_URL?.trim()
const lgaPmtilesLayer = import.meta.env.VITE_LGA_PMTILES_LAYER?.trim() || 'lgas'
let pmtilesProtocolRegistered = false
let workerUrlRegistered = false

function registerMapLibreWorker() {
  if (workerUrlRegistered) return
  setWorkerUrl(maplibreWorkerUrl)
  workerUrlRegistered = true
}

function getBasemapStyle(basemap: BasemapType): maplibregl.StyleSpecification {
  const satellite = basemap === 'satellite' || basemap === 'hybrid'
  const rasterSource = satellite
    ? {
        type: 'raster' as const,
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 19,
        attribution: 'Esri, Maxar, Earthstar Geographics',
      }
    : {
        type: 'raster' as const,
        tiles: [
          'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: 'OpenStreetMap contributors',
      }

  return {
    version: 8,
    sources: { basemap: rasterSource },
    layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
  }
}

function registerPmtilesProtocol() {
  if (pmtilesProtocolRegistered) return
  const protocol = new Protocol()
  addProtocol('pmtiles', protocol.tile)
  pmtilesProtocolRegistered = true
}

function getFeatureId(feature: MapGeoJSONFeature): string | null {
  const value = feature.properties?.lga_id ?? feature.properties?.LGA_CODE ?? feature.properties?.id
  return value == null ? null : String(value)
}

function geometryBounds(geometry: GeoJSON.Geometry): LngLatBoundsLike | null {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  const visit = (coords: any) => {
    if (typeof coords?.[0] === 'number') {
      const [lng, lat] = coords as GeoJSON.Position
      west = Math.min(west, lng)
      east = Math.max(east, lng)
      south = Math.min(south, lat)
      north = Math.max(north, lat)
      return
    }
    coords?.forEach(visit)
  }
  if (geometry.type === 'GeometryCollection') geometry.geometries.forEach(g => visit((g as any).coordinates))
  else visit((geometry as any).coordinates)
  return Number.isFinite(west) ? [[west, south], [east, north]] : null
}

async function fetchFullLgaFeature(lgaId: string, fallback?: LgaFeature): Promise<LgaFeature> {
  const response = await fetch(apiUrl(`/api/lga/${encodeURIComponent(lgaId)}/geometry`))
  if (response.ok) return response.json()
  if (fallback?.geometry) return fallback
  throw new Error('Failed to fetch complete LGA geometry')
}

export default function MapView({
  selectedLgaId,
  onLgaSelect,
  activeTileLayer,
  symbology,
  basemap = 'map',
  mapRefCallback,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<HeatMap | null>(null)
  const geeLayerRef = useRef<{ remove: () => void } | null>(null)
  const lgaLookupRef = useRef<Map<string, LgaFeature>>(new Map())
  const selectedLgaIdRef = useRef<string | null>(selectedLgaId)
  const symbologyRef = useRef<SymbologySettings | undefined>(symbology)
  const activeTileLayerRef = useRef<TileLayer | null | undefined>(activeTileLayer)
  const usingPmtiles = Boolean(lgaPmtilesUrl)

  selectedLgaIdRef.current = selectedLgaId
  symbologyRef.current = symbology
  activeTileLayerRef.current = activeTileLayer

  const { data, isError } = useQuery<GeoJSON.FeatureCollection>({
    queryKey: ['lgas'],
    queryFn: () => fetch(apiUrl('/api/lgas')).then(res => {
      if (!res.ok) throw new Error('Failed to fetch LGA boundaries')
      return res.json()
    }),
    enabled: !usingPmtiles,
  })

  const geojsonData = useMemo(
    (): GeoJSON.FeatureCollection => data ?? { type: 'FeatureCollection', features: [] },
    [data]
  )

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    registerMapLibreWorker()
    if (usingPmtiles) registerPmtilesProtocol()

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getBasemapStyle(basemap),
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      cooperativeGestures: false,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-left')
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    map.fitBounds(MELBOURNE_BOUNDS, { padding: 20, duration: 0 })
    ;(window as any).__heatgptMap = map
    mapRefCallback?.(map)

    const resize = () => map.resize()
    window.addEventListener('resize', resize)
    window.addEventListener('orientationchange', resize)

    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('orientationchange', resize)
      geeLayerRef.current?.remove()
      map.remove()
      delete (window as any).__heatgptMap
      mapRef.current = null
      mapRefCallback?.(null)
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    let listenersAttached = false

    const addLgaLayers = () => {
      const sourceLayer = usingPmtiles ? lgaPmtilesLayer : undefined
      let lastSelectionAt = 0
      if (!map.getLayer(LGA_FILL_LAYER)) {
        if (usingPmtiles) {
          map.addSource(LGA_SOURCE, {
            type: 'vector',
            url: `pmtiles://${lgaPmtilesUrl}`,
            promoteId: { [lgaPmtilesLayer]: 'lga_id' },
          })
        } else {
          map.addSource(LGA_SOURCE, {
            type: 'geojson',
            data: geojsonData,
            promoteId: 'lga_id',
          })
        }

        map.addLayer({
          id: LGA_FILL_LAYER,
          type: 'fill',
          source: LGA_SOURCE,
          ...(sourceLayer ? { 'source-layer': sourceLayer } : {}),
          paint: {
            'fill-color': symbologyRef.current?.solidColor ?? '#3b82f6',
            'fill-opacity': activeTileLayerRef.current ? 0.05 : symbologyRef.current?.fillOpacity ?? 0.7,
          },
        })
        map.addLayer({
          id: LGA_LINE_LAYER,
          type: 'line',
          source: LGA_SOURCE,
          ...(sourceLayer ? { 'source-layer': sourceLayer } : {}),
          paint: {
            'line-color': symbologyRef.current?.strokeColor ?? '#666666',
            'line-width': activeTileLayerRef.current ? 0.3 : symbologyRef.current?.strokeWeight ?? 1,
          },
        })
        map.addLayer({
          id: LGA_SELECTED_LAYER,
          type: 'line',
          source: LGA_SOURCE,
          ...(sourceLayer ? { 'source-layer': sourceLayer } : {}),
          filter: ['==', ['get', 'lga_id'], selectedLgaIdRef.current ?? ''],
          paint: {
            'line-color': '#f97316',
            'line-width': 3,
            'line-opacity': 0.95,
          },
        })
      }

      const selectFeatureAtPoint = async (point: PointLike, eventFeatures?: MapGeoJSONFeature[]) => {
        const now = Date.now()
        if (now - lastSelectionAt < 250) return
        const hitSize = 12
        const pointLike = point as { x: number; y: number }
        const feature = eventFeatures?.[0] ??
          map.queryRenderedFeatures(point, { layers: [LGA_FILL_LAYER] })[0] ??
          map.queryRenderedFeatures([
          [pointLike.x - hitSize, pointLike.y - hitSize],
          [pointLike.x + hitSize, pointLike.y + hitSize],
        ], { layers: [LGA_FILL_LAYER] })[0]
        if (!feature) return
        lastSelectionAt = now
        const lgaId = getFeatureId(feature)
        if (!lgaId) return
        const fallback = lgaLookupRef.current.get(lgaId) ?? (feature as unknown as LgaFeature)
        const fullFeature = await fetchFullLgaFeature(lgaId, fallback)
        lgaLookupRef.current.set(lgaId, fullFeature)
        onLgaSelect(fullFeature)
        const bounds = geometryBounds(fullFeature.geometry)
        if (bounds) map.fitBounds(bounds, { padding: 48, maxZoom: 13 })
      }

      const selectFeatureFromMap = (event: MapLayerMouseEvent | MapLayerTouchEvent) => {
        void selectFeatureAtPoint(event.point)
      }
      const selectFeatureFromLayer = (event: MapLayerMouseEvent | MapLayerTouchEvent) => {
        void selectFeatureAtPoint(event.point, event.features)
      }
      const selectFeatureFromTouch = (event: TouchEvent) => {
        const touch = event.changedTouches[0]
        if (!touch) return
        const rect = map.getCanvas().getBoundingClientRect()
        void selectFeatureAtPoint([touch.clientX - rect.left, touch.clientY - rect.top])
      }
      const setPointerCursor = () => { map.getCanvas().style.cursor = 'pointer' }
      const clearPointerCursor = () => { map.getCanvas().style.cursor = '' }

      if (!listenersAttached) {
        map.on('click', selectFeatureFromMap)
        map.on('touchend', LGA_FILL_LAYER, selectFeatureFromLayer)
        map.on('touchend', selectFeatureFromMap)
        map.getCanvas().addEventListener('touchend', selectFeatureFromTouch, { passive: true })
        map.on('mouseenter', LGA_FILL_LAYER, setPointerCursor)
        map.on('mouseleave', LGA_FILL_LAYER, clearPointerCursor)
        listenersAttached = true
        ;(window as any).__heatgptLgaSelectionReady = true
      }

      return () => {
        if (!listenersAttached) return
        map.off('click', selectFeatureFromMap)
        map.off('touchend', LGA_FILL_LAYER, selectFeatureFromLayer)
        map.off('touchend', selectFeatureFromMap)
        map.getCanvas().removeEventListener('touchend', selectFeatureFromTouch)
        map.off('mouseenter', LGA_FILL_LAYER, setPointerCursor)
        map.off('mouseleave', LGA_FILL_LAYER, clearPointerCursor)
        listenersAttached = false
        delete (window as any).__heatgptLgaSelectionReady
      }
    }

    let removeLayerListeners: (() => void) | undefined
    const addLayersAndListeners = () => {
      removeLayerListeners = addLgaLayers()
    }

    map.on('style.load', addLayersAndListeners)
    if (map.isStyleLoaded()) addLayersAndListeners()
    else map.once('load', addLayersAndListeners)

    return () => {
      map.off('style.load', addLayersAndListeners)
      removeLayerListeners?.()
    }
  }, [usingPmtiles, geojsonData, onLgaSelect])

  useEffect(() => {
    if (!data) return
    lgaLookupRef.current = new Map(
      data.features
        .filter((feature): feature is LgaFeature => Boolean(feature.properties?.lga_id))
        .map(feature => [String(feature.properties.lga_id), feature])
    )
    const source = mapRef.current?.getSource(LGA_SOURCE) as GeoJSONSource | undefined
    if (source && !usingPmtiles) source.setData(data)
  }, [data, usingPmtiles])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer(LGA_FILL_LAYER)) return
    map.setPaintProperty(LGA_FILL_LAYER, 'fill-color', symbology?.solidColor ?? '#3b82f6')
    map.setPaintProperty(LGA_FILL_LAYER, 'fill-opacity', activeTileLayer ? 0.05 : symbology?.fillOpacity ?? 0.7)
    map.setPaintProperty(LGA_LINE_LAYER, 'line-color', symbology?.strokeColor ?? '#666666')
    map.setPaintProperty(LGA_LINE_LAYER, 'line-width', activeTileLayer ? 0.3 : symbology?.strokeWeight ?? 1)
  }, [symbology, activeTileLayer])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer(LGA_SELECTED_LAYER)) return
    map.setFilter(LGA_SELECTED_LAYER, ['==', ['get', 'lga_id'], selectedLgaId ?? ''])
  }, [selectedLgaId])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const applyStyle = () => map.setStyle(getBasemapStyle(basemap))
    if (map.isStyleLoaded()) applyStyle()
    else map.once('load', applyStyle)
  }, [basemap])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (geeLayerRef.current) {
      geeLayerRef.current.remove()
      geeLayerRef.current = null
    }
    if (!activeTileLayer?.bbox) return

    const { url, bbox, lgaGeometry } = activeTileLayer
    const imageUrl = apiUrl(url)

    if (lgaGeometry) {
      const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svgEl.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2;'

      const updateSvg = () => {
        const canvas = map.getCanvas()
        svgEl.setAttribute('width', String(canvas.clientWidth))
        svgEl.setAttribute('height', String(canvas.clientHeight))

        const coordsToD = (coords: number[][]): string =>
          coords.map((coord, i) => {
            const pt = map.project([coord[0], coord[1]])
            return `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`
          }).join(' ') + ' Z'

        let pathD = ''
        if (lgaGeometry.type === 'Polygon') {
          lgaGeometry.coordinates.forEach(ring => { pathD += coordsToD(ring) + ' ' })
        } else if (lgaGeometry.type === 'MultiPolygon') {
          lgaGeometry.coordinates.forEach(poly => poly.forEach(ring => { pathD += coordsToD(ring) + ' ' }))
        }

        const topLeft = map.project([bbox.west, bbox.north])
        const bottomRight = map.project([bbox.east, bbox.south])

        svgEl.innerHTML = `
          <defs>
            <clipPath id="lga-raster-clip">
              <path d="${pathD}" fill-rule="evenodd"/>
            </clipPath>
          </defs>
          <image
            href="${imageUrl}"
            x="${topLeft.x}" y="${topLeft.y}"
            width="${bottomRight.x - topLeft.x}" height="${bottomRight.y - topLeft.y}"
            clip-path="url(#lga-raster-clip)"
            opacity="0.85"
            preserveAspectRatio="none"
          />
        `
      }

      updateSvg()
      map.on('move', updateSvg)
      map.on('zoom', updateSvg)
      map.on('resize', updateSvg)
      map.getCanvasContainer().appendChild(svgEl)
      geeLayerRef.current = {
        remove: () => {
          svgEl.remove()
          map.off('move', updateSvg)
          map.off('zoom', updateSvg)
          map.off('resize', updateSvg)
        },
      }
      return
    }

    const addRaster = () => {
      if (map.getLayer(RASTER_LAYER)) map.removeLayer(RASTER_LAYER)
      if (map.getSource(RASTER_SOURCE)) map.removeSource(RASTER_SOURCE)
      map.addSource(RASTER_SOURCE, {
        type: 'image',
        url: imageUrl,
        coordinates: [
          [bbox.west, bbox.north],
          [bbox.east, bbox.north],
          [bbox.east, bbox.south],
          [bbox.west, bbox.south],
        ],
      })
      map.addLayer({
        id: RASTER_LAYER,
        type: 'raster',
        source: RASTER_SOURCE,
        paint: { 'raster-opacity': 0.85 },
      }, map.getLayer(LGA_FILL_LAYER) ? LGA_FILL_LAYER : undefined)
      geeLayerRef.current = {
        remove: () => {
          if (map.getLayer(RASTER_LAYER)) map.removeLayer(RASTER_LAYER)
          if (map.getSource(RASTER_SOURCE)) map.removeSource(RASTER_SOURCE)
        },
      }
    }

    if (map.isStyleLoaded()) addRaster()
    else map.once('load', addRaster)
  }, [activeTileLayer])

  if (isError) return <div>Failed to load LGA boundaries.</div>
  return <div ref={containerRef} className="heat-map" />
}
