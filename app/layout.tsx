import type { Metadata, Viewport } from "next";
import { PwaRegistration } from "@/components/PwaRegistration";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chatkari — AIマッチングチャット",
  description: "架空の成人AIキャラクターと話せるマッチングチャット",
  applicationName: "Chatkari",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Chatkari" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#fff9f8",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}<PwaRegistration /></body></html>;
}

