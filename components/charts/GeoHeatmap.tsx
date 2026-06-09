"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import type { Article } from "@/types";

// Local→national story density. Articles with geo coordinates are plotted as
// circles sized by how many stories share that place; color encodes sentiment.
export function GeoHeatmap({ articles }: { articles: Article[] }) {
  const geoArticles = articles.filter((a) => a.geo);

  // group by place
  const groups = new Map<
    string,
    { lat: number; lon: number; place: string; items: Article[] }
  >();
  for (const a of geoArticles) {
    if (!a.geo) continue;
    const key = a.geo.place;
    const g = groups.get(key) ?? {
      lat: a.geo.lat,
      lon: a.geo.lon,
      place: a.geo.place,
      items: [],
    };
    g.items.push(a);
    groups.set(key, g);
  }

  return (
    <div className="h-64 w-full overflow-hidden rounded-2xl">
      <MapContainer
        center={[39.5, -98.35]}
        zoom={3}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        {[...groups.values()].map((g) => {
          const avg =
            g.items.reduce((s, a) => s + a.sentiment, 0) / g.items.length;
          const color = avg > 0.15 ? "#16a34a" : avg < -0.15 ? "#dc2626" : "#38bdf8";
          return (
            <CircleMarker
              key={g.place}
              center={[g.lat, g.lon]}
              radius={8 + g.items.length * 3}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.4 }}
            >
              <Tooltip>
                <strong>{g.place}</strong>: {g.items.length} stor
                {g.items.length === 1 ? "y" : "ies"}
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
