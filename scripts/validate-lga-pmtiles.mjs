#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PMTiles } from 'pmtiles'
import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pmtilesPath = process.env.PMTILES || path.join(root, 'public/data/lga-boundaries.pmtiles')
const expectedCount = Number(process.env.EXPECTED_COUNT || 29)

class NodeFileSource {
  constructor(filePath) {
    this.filePath = filePath
  }

  getKey() {
    return this.filePath
  }

  async getBytes(offset, length) {
    const handle = await fs.open(this.filePath, 'r')
    try {
      const buffer = Buffer.alloc(length)
      const { bytesRead } = await handle.read(buffer, 0, length, offset)
      return { data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + bytesRead) }
    } finally {
      await handle.close()
    }
  }
}

async function getMetadata(archive) {
  const header = await archive.getHeader()
  const metadata = await archive.getMetadata()
  return { header, metadata }
}

const stat = await fs.stat(pmtilesPath)
const archive = new PMTiles(new NodeFileSource(pmtilesPath))
const { header, metadata } = await getMetadata(archive)
const checks = {
  path: pmtilesPath,
  sizeBytes: stat.size,
  minZoom: header.minZoom,
  maxZoom: header.maxZoom,
  bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
  vectorLayers: metadata.vector_layers?.map(layer => ({
    id: layer.id,
    fields: layer.fields,
    minzoom: layer.minzoom,
    maxzoom: layer.maxzoom,
  })),
}

const sampleTiles = [
  [8, 231, 157],
  [9, 462, 315],
  [10, 924, 630],
  [11, 1849, 1260],
]
let nonEmptyTiles = 0
const sampleLgaIds = new Set()
for (const [z, x, y] of sampleTiles) {
  const tile = await archive.getZxy(z, x, y)
  if (!tile) continue
  const vectorTile = new VectorTile(new PbfReader(new Uint8Array(tile.data)))
  const layer = vectorTile.layers.lgas
  if (!layer?.length) continue
  nonEmptyTiles += 1
  for (let index = 0; index < layer.length; index += 1) {
    const feature = layer.feature(index)
    if (feature.properties?.lga_id) sampleLgaIds.add(String(feature.properties.lga_id))
  }
}

if (!checks.vectorLayers?.some(layer => layer.id === 'lgas')) {
  throw new Error('Expected PMTiles metadata to contain vector layer "lgas"')
}
if (checks.maxZoom < 13) {
  throw new Error(`Expected max zoom >= 13, got ${checks.maxZoom}`)
}
if (nonEmptyTiles === 0) {
  throw new Error('Expected at least one non-empty sample tile around Melbourne')
}

console.log(JSON.stringify({
  ...checks,
  expectedFeatureCount: expectedCount,
  nonEmptySampleTiles: nonEmptyTiles,
  sampleLgaIds: [...sampleLgaIds].sort(),
}, null, 2))
