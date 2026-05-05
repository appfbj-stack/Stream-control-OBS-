import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegistration } from "@/components/pwa-registration";

export const metadata: Metadata = {
  title: "Stream Control Lite PRO",
  description: "Painel PWA para controle OBS, áudio, mídia e macros direto do navegador.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#08131f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}
