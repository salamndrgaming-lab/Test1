import { ImageResponse } from "next/og";

export const alt = "NewsScope — See Every Side of the News";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "#0a0d13",
          color: "#eef2f8",
        }}
      >
        <div style={{ display: "flex", fontSize: 34, color: "#38bdf8", fontWeight: 700 }}>
          NewsScope
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 76,
            fontWeight: 800,
            lineHeight: 1.05,
            marginTop: 20,
            maxWidth: 980,
          }}
        >
          See every side of the news.
        </div>
        <div style={{ display: "flex", fontSize: 34, color: "#93a0b4", marginTop: 24 }}>
          Left · Center · Right — plus markets, weather &amp; sports.
        </div>
        <div
          style={{
            display: "flex",
            height: 16,
            width: 1040,
            marginTop: 48,
            borderRadius: 999,
            background: "linear-gradient(90deg,#2563eb,#a3a3a3,#dc2626)",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
