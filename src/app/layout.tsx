import type { Metadata, Viewport } from "next";
import { Archivo_Black, DM_Mono, Inter } from "next/font/google";
import "./globals.css";

const display = Archivo_Black({ variable: "--font-display", subsets: ["latin"], weight: "400" });
const sans = Inter({ variable: "--font-sans", subsets: ["latin"] });
const mono = DM_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500"] });

const description = "Search artist-approved downloads and match playlists against an open music catalog.";

export const metadata: Metadata = {
  title: "OpenCrate — Find music that is free to keep",
  description,
  applicationName: "OpenCrate",
  openGraph: { title: "OpenCrate", description, type: "website" },
  twitter: { card: "summary", title: "OpenCrate", description },
};

export const viewport: Viewport = {
  themeColor: "#121210",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}><body>{children}</body></html>;
}
