import { ImageResponse } from "next/og";

// iOS home-screen icon. Rendered as a PNG because Safari ignores SVG here, and
// kept fully opaque since iOS doesn't composite transparency on the tile.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0d13",
        }}
      >
        <div
          style={{
            width: 124,
            height: 124,
            borderRadius: 62,
            display: "flex",
            overflow: "hidden",
            border: "9px solid #38bdf8",
          }}
        >
          <div style={{ width: 36, height: 124, background: "#2563eb" }} />
          <div style={{ width: 34, height: 124, background: "#e7ecf3" }} />
          <div style={{ width: 36, height: 124, background: "#dc2626" }} />
        </div>
      </div>
    ),
    { ...size },
  );
}
