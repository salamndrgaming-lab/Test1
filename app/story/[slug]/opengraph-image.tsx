import { ImageResponse } from "next/og";
import { deslug } from "@/lib/blindspot";

export const alt = "How every side covers this story";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const topic = deslug(slug);
  const title = topic.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 70);

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          padding: 80,
          background: "#0a0d13",
          color: "#eef2f8",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, color: "#38bdf8", fontWeight: 700 }}>
          NewsScope · Blindspot
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "#93a0b4", marginTop: 28 }}>
          How Left, Center &amp; Right cover:
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 72,
            fontWeight: 800,
            lineHeight: 1.05,
            marginTop: 12,
            maxWidth: 1040,
          }}
        >
          {title}
        </div>
        <div style={{ display: "flex", marginTop: "auto", gap: 16 }}>
          {[
            ["LEFT", "#2563eb"],
            ["CENTER", "#a3a3a3"],
            ["RIGHT", "#dc2626"],
          ].map(([label, color]) => (
            <div
              key={label}
              style={{
                display: "flex",
                flex: 1,
                height: 64,
                borderRadius: 14,
                background: color,
                color: "#0a0d13",
                fontSize: 28,
                fontWeight: 800,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
