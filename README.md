# CapEx Floor Map — Fx Site

Interactive factory floor map for visualizing bay assignments, work areas, equipment placement, and location review status.

## Features

- **Configurable grid** — set rows (A-Z) and columns (1-30) to match your factory layout
- **Building shape editor** — disable bays to define L-shapes, C-shapes, or irregular footprints
- **Location assignment** — drag to select bays, assign work areas, purpose, and cell names
- **Dashboard view** — color-coded by work area, location review status indicators, equipment counts
- **Detail panel** — click any location to view/edit commission status, review status, and equipment
- **Persistent** — all data saves to browser localStorage

## Work Areas

| Code | Name | Color |
|------|------|-------|
| WLD | Weld | Red |
| NDT | NDT | Orange |
| FAB | Fab Lab | Yellow |
| FLX | Flexible Line | Green |
| FRD | Factory R&D | Cyan |
| FRG | Forge | Purple |
| TLG | Tooling | Pink |
| AUT | Automation | Blue |
| INV | Inventory | Gray |
| ADD | Additive | Teal |

## Location Review Status

- **Not Started** (gray) — Equipment addition pending review
- **In Progress** (amber) — Space request under review, location assessment started
- **In Review** (blue) — Space request provisional, location being formally assessed
- **Approved** (green) — Location confirmed suitable for equipment

## Development

```bash
npm install
npm run dev     # starts dev server at localhost:5173
npm run build   # builds to dist/
```

## Deployment

Automatically deploys to GitHub Pages on push to `main` via GitHub Actions.

**URL:** `https://<org>.github.io/capex-floor-map/`

## Setup for New Deployment

1. Create repo in your GitHub org: `capex-floor-map`
2. Push this code to `main`
3. Go to repo Settings → Pages → Source: GitHub Actions
4. First push triggers the deploy workflow
5. Add the GitHub Pages URL to the Airtable Interface Links section

## Future: Airtable API Integration

When ready to connect live data from Airtable:
1. Create an Airtable Personal Access Token (PAT) with read access to the CapEx base
2. Add `VITE_AIRTABLE_PAT` and `VITE_AIRTABLE_BASE_ID` as GitHub repo secrets
3. Add an API service layer in `src/airtable.js` to fetch Locations, Equipment, and Space Requests
4. Replace localStorage with API data on page load, keep localStorage as fallback/cache

## Contact

- **Floor Map:** Rahul Prasannan
- **Jira Integration:** Mario (TBD)
