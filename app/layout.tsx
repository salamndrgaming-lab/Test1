import type { Metadata, Viewport } from "next";
import "./globals.css";
import { NavTabs } from "@/components/layout/NavTabs";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "NewsScope — News, Visualized",
  description:
    "Local-to-national news aggregation with bias sorting, a Good News tab, sports odds research, weather, and entertainment.",
  applicationName: "NewsScope",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "NewsScope",
  },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0b0f17",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <NavTabs />
        <main className="mx-auto max-w-5xl px-4 pt-5 md:pt-6">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
