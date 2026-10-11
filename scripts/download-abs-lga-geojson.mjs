#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = process.env.OUT_DIR || path.join(root, 'public/data')
const outFile = process.env.OUT_FILE || path.join(outDir, 'abs-lga-2021-heatgpt.geojson')
const codes = [
  '20660', '20910', '21110', '21180', '21450', '21610', '21890', '22170',
  '22310', '23110', '23270', '23430', '23670', '24210', '24330', '24410',
  '24600', '24650', '24970', '25060', '25340', '25710', '25900', '26350',
  '26980', '27070', '27260', '27350', '27450',
]

const params = new URLSearchParams({
  f: 'geojson',
  where: `lga_code_2021 IN (${codes.map(code => `'${code}'`).join(',')})`,
  outFields: 'lga_code_2021,lga_name_2021,state_name_2021,area_albers_sqkm',
  outSR: '4326',
  returnGeometry: 'true',
  orderByFields: 'lga_code_2021',
})
const url = `https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/LGA/MapServer/0/query?${params}`
const response = await fetch(url)
if (!response.ok) {
  throw new Error(`ABS LGA query failed: ${response.status} ${response.statusText}`)
}

const source = await response.json()
if (source.type !== 'FeatureCollection' || source.features?.length !== codes.length) {
  throw new Error(`Expected ${codes.length} ABS LGA features, got ${source.features?.length ?? 0}`)
}

const features = source.features.map(feature => {
  const properties = feature.properties || {}
  const lgaId = String(properties.lga_code_2021)
  if (!codes.includes(lgaId)) throw new Error(`Unexpected LGA code from ABS: ${lgaId}`)
  return {
    type: 'Feature',
    properties: {
      lga_id: lgaId,
      lga_name: properties.lga_name_2021,
      state: properties.state_name_2021,
      source: 'Australian Bureau of Statistics ASGS Edition 3 Local Government Areas 2021',
      source_year: 2021,
      source_license: 'CC BY 4.0',
      area_albers_sqkm: properties.area_albers_sqkm,
    },
    geometry: feature.geometry,
  }
})

await fs.mkdir(outDir, { recursive: true })
await fs.writeFile(outFile, `${JSON.stringify({ type: 'FeatureCollection', features })}\n`)
console.log(`Wrote ${outFile}`)
