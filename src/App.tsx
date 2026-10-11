import { Suspense, lazy, useState, useCallback, useRef } from 'react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import MapView from './components/MapView'
import SymbologyPanel, { SymbologySettings, BasemapType } from './components/SymbologyPanel'
import MapControls from './components/MapControls'
import type { HeatMap, LgaFeature, TileLayer } from './mapTypes'

const queryClient = new QueryClient()
const SidePanel = lazy(() => import('./components/SidePanel'))

const DEFAULT_SYMBOLOGY: SymbologySettings = {
  fillOpacity: 0.7,
  strokeColor: '#666666',
  strokeWeight: 1,
  solidColor: '#3b82f6',
}

const HEADER_HEIGHT = 52

function geometryBounds(geometry: GeoJSON.Geometry): [[number, number], [number, number]] | null {
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

function Header({ hasSelection }: { hasSelection: boolean }) {
  return (
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0, height: `${HEADER_HEIGHT}px`,
      backgroundColor: '#0f172a', zIndex: 5000,
      display: 'flex', alignItems: 'center', padding: '0 20px',
      borderBottom: '1px solid rgba(255,255,255,0.07)',
    }}>
      <span style={{
        fontSize: '15px', fontWeight: 700, color: '#f1f5f9',
        letterSpacing: '-0.02em', fontFamily: 'Inter, sans-serif',
      }}>
        HeatGPT
      </span>
      <span style={{
        fontSize: '13px', color: '#475569', marginLeft: '12px',
        fontWeight: 400, fontFamily: 'Inter, sans-serif',
      }}>
        {hasSelection ? 'Urban Heat Island Explorer' : 'Click an LGA polygon to get started'}
      </span>

      <span style={{
        marginLeft: 'auto',
        fontSize: '12px', color: '#334155', fontWeight: 500,
        fontFamily: 'Inter, sans-serif', letterSpacing: '0.01em',
      }}>
        by Deepak S · 4053309
      </span>
    </header>
  )
}

function AppInner() {
  const qc = useQueryClient()
  const [selectedLgaId, setSelectedLgaId] = useState<string | null>(null)
  const [panelCollapsed, setPanelCollapsed] = useState(true)
  const [activeTileLayer, setActiveTileLayer] = useState<TileLayer | null>(null)
  const [symbology, setSymbology] = useState<SymbologySettings>(DEFAULT_SYMBOLOGY)
  const [basemap, setBasemap] = useState<BasemapType>('map')
  const [mapInstance, setMapInstance] = useState<HeatMap | null>(null)
  const mapRef = useRef<HeatMap | null>(null)
  const selectedLgaGeometryRef = useRef<GeoJSON.Geometry | null>(null)

  const panelOpen = selectedLgaId !== null && !panelCollapsed

  const handleLgaSelect = useCallback((feature: LgaFeature) => {
    const id = feature.properties.lga_id
    setSelectedLgaId(id)
    setActiveTileLayer(null)
    selectedLgaGeometryRef.current = feature.geometry
    qc.setQueryData<GeoJSON.FeatureCollection | undefined>(['lgas'], cached => {
      if (!cached) return cached
      return {
        ...cached,
        features: cached.features.map(existing =>
          existing.properties?.lga_id === id ? feature : existing
        ),
      }
    })
    if (feature?.geometry && mapRef.current) {
      const bounds = geometryBounds(feature.geometry)
      if (bounds) mapRef.current.fitBounds(bounds, { padding: 48, maxZoom: 13 })
    }
  }, [qc])

  const handleTileLayerChange = useCallback((layer: Omit<TileLayer, 'lgaGeometry'> | null) => {
    if (!layer) { setActiveTileLayer(null); return }
    setActiveTileLayer({
      ...layer,
      lgaGeometry: selectedLgaGeometryRef.current,
    })
    if (layer.bbox && mapRef.current) {
      const { west, south, east, north } = layer.bbox
      mapRef.current.fitBounds([[west, south], [east, north]], { padding: 48, maxZoom: 13 })
    }
  }, [])

  return (
    <>
      <Header hasSelection={selectedLgaId !== null} />

      {/* Map pushed down by header height */}
      <div style={{ position: 'fixed', top: `${HEADER_HEIGHT}px`, left: 0, right: 0, bottom: 0 }}>
        <MapView
          selectedLgaId={selectedLgaId}
          onLgaSelect={handleLgaSelect}
          activeTileLayer={activeTileLayer}
          symbology={symbology}
          basemap={basemap}
          mapRefCallback={(map) => { mapRef.current = map; setMapInstance(map) }}
        />
      </div>

      <MapControls
        map={mapInstance}
        activeTileLayer={activeTileLayer}
        sidePanelOpen={panelOpen}
        headerHeight={HEADER_HEIGHT}
      />
      <SymbologyPanel
        settings={symbology}
        onChange={setSymbology}
        basemap={basemap}
        onBasemapChange={setBasemap}
        headerHeight={HEADER_HEIGHT}
      />
      <Suspense fallback={null}>
        <SidePanel
          lgaId={selectedLgaId}
          onCollapse={setPanelCollapsed}
          onTileLayerChange={handleTileLayerChange}
          headerHeight={HEADER_HEIGHT}
        />
      </Suspense>
    </>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  )
}
