# Trazabilidad de Camiones — Dashboard

Prototipo de dashboard para visualización de rutas de camiones en planta, con mapa abstracto y camión animado.

## Stack

- React + TypeScript
- TailwindCSS
- Framer Motion
- SVG (mapa abstracto, sin flechas)

## Desarrollo

```bash
npm install
npm run dev
```

## Producción

```bash
npm run build
npm run preview
```

## Estructura

- `src/components/TruckRouteSimulator.tsx` — Componente principal
- `src/data/routes.ts` — Rutas mock (25)
- `src/data/waypoints.ts` — Coordenadas del mapa
- `src/data/events.ts` — EVENT_DATA mock por estación

## Extensión

Para integrar CSV real: reemplazar `ROUTES` y `EVENT_DATA` con datos provenientes de API o archivos.
