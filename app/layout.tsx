import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { NavTabs } from "@/components/layout/NavTabs";
import { Footer } from "@/components/layout/Footer";
import { SettingsProvider } from "@/components/SettingsProvider";
import { ArticleModalProvider } from "@/components/ArticleModalProvider";
import { ConsentBanner } from "@/components/ConsentBanner";

const adsenseClient = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

// Applies saved theme / text-scale / reduce-motion before first paint (no FOUC).
const themeInit = `(function(){try{var s=JSON.parse(localStorage.getItem('newsscope.settings')||'{}');var r=document.documentElement;r.dataset.theme=s.theme||'dark';if(s.textScale)r.style.setProperty('--text-scale',String(s.textScale));if(s.reduceMotion)r.dataset.reduceMotion='true';}catch(e){document.documentElement.dataset.theme='dark';}})();`;

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {adsenseClient && (
          <Script
            async
            strategy="afterInteractive"
            crossOrigin="anonymous"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`}
          />
        )}
      </head>
      <body>
        <SettingsProvider>
          <ArticleModalProvider>
            <NavTabs />
            <main className="mx-auto max-w-5xl px-4 pt-5 md:pt-6">
              {children}
            </main>
            <Footer />
            <ConsentBanner />
          </ArticleModalProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
