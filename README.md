# Swedish municipal job-home network atlas

A static, interactive atlas of registered residence-to-workplace associations across Sweden's 290 municipalities. Built for this repository from the supplied SCB web data package.

Intended public URL: https://JunyaoHe001.github.io/SWE_job_home_network/

## Explore

- Switch among BAS (2020-2024), new RAMS (2019-2021) and legacy RAMS (2004-2018).
- Select a year, total / women / men, and residence or workplace perspective.
- Click a municipality, or search its name or four-digit code.
- Map external share, external persons, weighted distance, partner count or diversity.
- Filter links by persons and display the strongest 50-600 connections.
- Inspect complete-matrix indicators, top partners and a within-series trend.
- Export all threshold-matching external links in the current scope as CSV, independent of the drawing cap.
- Share the URL to preserve the filter state.

The interface is in English. Swedish municipality names are preserved. Works on desktop and mobile; modern Chrome, Edge, Firefox or Safari with `DecompressionStream` is required.

## Publish on GitHub Pages

In **Settings > Pages > Build and deployment**:

1. Source: **Deploy from a branch**.
2. Branch: **main**, folder: **/(root)**.
3. Click **Save**. Wait for the `pages-build-deployment` run to finish.

There is no build step, backend, API key or external tile dependency. `.nojekyll` is included. All asset paths are relative to support the repository URL prefix. Do not open `index.html` via `file://`; JSON loading requires an HTTP server.

## Local preview

```sh
python -m http.server 8000
```

Then open http://localhost:8000/ in your browser.

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | Interface, sources and methods |
| `style.css` | Responsive layout and map typography |
| `app.js` | Filters, map, directed curves, indicators, trends and CSV export |
| `data/catalog.json` | Sources, 69 partitions and input provenance |
| `data/geography.json.gz` | 290 nodes and fixed 2024 municipal boundaries |
| `data/TAB*_YEAR_SEX.json.gz` | One published layer, positive links and full-matrix metrics |
| `data/history.json.gz` | Compact indicator history for trend charts |
| `scripts/prepare_data.py` | Rebuild browser assets from the extracted handoff package |
| `vendor/` | Leaflet 1.9.4 and its BSD 2-Clause license |

Each bundle contains `meta`, `links`, and `metrics`. Links are `[origin_node_index, destination_node_index, persons]`; indices refer to the ordered nodes in `geography.json.gz`. Self-links are retained in the bundles but not drawn. Metrics follow the same node order. No published count or precomputed metric is rounded during preparation. ZIP input integrity was checked against the supplied manifest before preparation; its SHA-256 is recorded in the catalog.

To update with another package of the same schema:

```sh
python scripts/prepare_data.py /path/to/extracted/SCB_web_package
```

The standard-library script validates 290 matching codes and positive-link totals. Adjust available series or interface date labels if the new package changes their coverage.

## Interpretation

Connections count registered persons, not trips, remote-working days or migration. The domestic matrix excludes foreign / unknown-region nodes. All-person totals are published independently and are never summed with the men and women layers.

Residence indicators describe the row of a municipality; workplace indicators describe its column. External share is external workers divided by observed total workers. National shares are ratios of sums. National mean external distance is weighted by external persons with a defined distance. Thresholds and display caps do not change indicators. Colour classes are layer-specific quintiles, so colours alone cannot establish a temporal change.

Distances are weighted great-circle approximations between municipality centroids, whose positions were computed in EPSG:3006. They are not road distances. Diversity is Shannon entropy over external links divided by ln(289). Partner counts use a minimum of five persons.

Series and methodology are not harmonised:

- **TAB333, legacy RAMS, 2004-2018**: classification and upper-age changes in 2011; persons aged 75+ excluded from 2011. [SCB source](https://www.statistikdatabasen.scb.se/goto/en/ssd/AM0207PendlKomA04).
- **TAB5850, new RAMS, 2019-2021**: ages 16-74; 2019 AGI / method change and Armed Forces reporting changes from 2020. [SCB source](https://www.statistikdatabasen.scb.se/goto/en/ssd/AM0207PendlKomA04N).
- **TAB1830, BAS, 2020-2024**: ages 15-74; disclosure protection affects small cells and additivity; unknown workplaces are assigned to residence. Entrepreneur classification changes in 2024. [SCB source](https://www.statistikdatabasen.scb.se/goto/en/ssd/ArRegPend2).

Trend charts leave gaps at the supplied methodological changes. Cross-series comparisons need additional analytical decisions.

## Geography and licenses

The bundled map is the Swedish subset of Eurostat GISCO LAU 2024, generalised at 1:1 million, WGS84. All years use these fixed 2024 boundaries; no historical geographic crosswalk has been applied. The map does not use OpenStreetMap or any third-party tile service.

**© EuroGeographics for the administrative boundaries.** Administrative boundaries are subject to GISCO attributed, non-commercial use terms. See [GISCO geography](https://ec.europa.eu/eurostat/web/gisco/geodata/statistical-units/local-administrative-units) and [terms](https://ec.europa.eu/eurostat/web/gisco/geodata/reference-data/administrative-units-statistical-units). SCB statistical data retain the source conditions; no broader data license is asserted by this repository. Leaflet's license is in `vendor/LEAFLET-LICENSE.txt`.
