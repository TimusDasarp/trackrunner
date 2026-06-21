# TrackRunner Dashboard

React + Vite + TypeScript dispatcher dashboard for the TrackRunner real-time courier tracking system.

## Stack
- React 18 + Vite 5
- TypeScript
- Tailwind CSS
- Leaflet + react-leaflet (OpenStreetMap tiles)
- socket.io-client

## Setup

```bash
npm install
npm run dev
```

The dev server runs on `http://localhost:5173` and proxies `/api` and `/socket.io` to `http://localhost:3000` (the backend).

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
