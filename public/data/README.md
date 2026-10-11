# LGA Boundary PMTiles

`lga-boundaries-abs-2021.pmtiles` is a generated derivative of Australian Bureau of Statistics Australian Statistical Geography Standard (ASGS) Edition 3 Local Government Areas 2021 digital boundary data.

Source dataset: Australian Bureau of Statistics, ASGS Edition 3, Local Government Areas - 2021.

Source URL: https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/edition-3-july-2021-june-2026/access-and-downloads/digital-boundary-files

License: Creative Commons Attribution 4.0 International, unless otherwise noted by the ABS.

Derivative notes:

- Filtered to the 29 Local Government Area identifiers used by HeatGPT.
- Reprojected/normalised to GeoJSON for generation.
- Converted to PMTiles vector tiles with layer name `lgas`.
- Preserves `lga_id`, `lga_name`, `state`, `source`, `source_year`, and `source_license` feature attributes.

Attribution: Australian Bureau of Statistics, Australian Statistical Geography Standard (ASGS) Edition 3 Local Government Areas 2021, licensed under Creative Commons Attribution 4.0 International.
