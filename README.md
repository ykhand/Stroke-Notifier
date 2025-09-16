# Stroke-Notifier

Nepal Stroke Response Navigator is a browser-based tool that visualises neurological hospitals across Nepal, helps responders choose thrombolysis-capable centres reachable within the critical four-hour window, and provides one-click access to stroke helplines.

## Features

- **Interactive Leaflet map** backed by OpenStreetMap tiles to display stroke-ready hospitals and neurological support sites.
- **Guideline-aware recommendations** that calculate straight-line distance, estimate travel time based on an adjustable average speed, and surface the nearest hospital that offers thrombolysis and can be reached within four hours.
- **Comprehensive hospital directory** with facility badges, service highlights, and quick actions to focus markers or call the hospital/helpline directly.
- **Stroke team activation panel** containing a dedicated helpline button and scripted information to relay when coordinating emergency care.
- **Filter controls** to show only thrombolysis-capable facilities or those reachable within the four-hour guideline and to visualise the coverage radius around the selected location.

## Getting started

1. Clone or download this repository.
2. Open `index.html` in a modern desktop or mobile browser. (No build step or server is required.)
3. Set the patient location by using the GPS button, choosing a preset hub, or clicking the map to drop a pin.
4. Adjust the average travel speed slider to match local transport conditions and review the recommended hospital and directory list.
5. Use the helpline button to dial the national stroke hotline or, when available, the stroke team number of the recommended facility.

## Data sources

Hospital details live in [`assets/js/hospitals.js`](assets/js/hospitals.js). Each entry contains location coordinates, service capabilities, hotline numbers, and notes to support coordination. Update this file to add new facilities or refine data as more verified information becomes available.

## Technology

- [Leaflet](https://leafletjs.com/) with OpenStreetMap tiles for the interactive mapping experience.
- Vanilla HTML, CSS, and JavaScript for a fully client-side experience that works offline once loaded.

Contributions and verified dataset updates are welcome via pull requests.
