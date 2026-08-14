import type { Metadata, Viewport } from "next";
import "./globals.css";
import { I18nProvider } from "@/components/providers/I18nProvider";
import { AuthProvider } from "@/components/providers/AuthProvider";
import localFont from "next/font/local";
import { Sora, Vazirmatn } from "next/font/google";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  interactiveWidget: "resizes-visual",
};

const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sora",
  display: "swap",
});

const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-vazirmatn",
  display: "swap",
});

const estedad = localFont({
  src: [
    { path: "../fonts/Estedad-Regular.ttf", weight: "400", style: "normal" },
    { path: "../fonts/Estedad-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-estedad",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FelFel Chat",
  description: "Secure and modern real-time messaging",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning data-scroll-behavior="smooth">
      <body
        className={`${estedad.variable} ${vazirmatn.variable} ${sora.variable}`}
        style={{ fontFamily: "var(--font-estedad), var(--font-sora), sans-serif" }}
      >
        <I18nProvider>
          <AuthProvider>{children}</AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
