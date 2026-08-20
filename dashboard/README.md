# TrackRunner Dashboard

React + Vite + TypeScript dispatcher dashboard for the TrackRunner real-time courier tracking system.

## Stack
- React 18 + Vite 5
- TypeScript
- Tailwind CSS
- Google Maps JavaScript API via `@vis.gl/react-google-maps`
- socket.io-client

## Setup

```bash
npm install
npm run dev
```

The dev server runs on `http://localhost:5173` and proxies `/api` and `/socket.io` to `http://localhost:3000` (the backend).

## Google Maps configuration

Create `dashboard/.env.local` with a browser-restricted key and a Google Maps Map ID:

```bash
VITE_GOOGLE_MAPS_API_KEY=your_browser_restricted_key
VITE_GOOGLE_MAP_ID=your_google_map_id
```

Enable **Maps JavaScript API**. Enable **Places API (New)** as well to use task address autocomplete.

## Demo credentials

```
dispatcher@demo.local / demo1234
runner@demo.local      / demo1234
```

## Build

```bash
npm run build
npm run preview
```
