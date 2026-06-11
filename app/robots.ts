import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_APP_URL || "https://newsscope.example";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // keep private / user-specific surfaces out of the index
        disallow: [
          "/api/",
          "/profile",
          "/settings",
          "/saved",
          "/alerts",
          "/briefing",
          "/following",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
