import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ThemeProvider } from "@/components/ThemeProvider";
import { InactivityWatcher } from "@/components/InactivityWatcher";
import { DocsChatWidget } from "@/components/docs-chat/DocsChatWidget";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Asistente de Compras Estatales",
  description: "Sistema de análisis de licitaciones con IA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col`}
      >
        <ThemeProvider>
          <InactivityWatcher />
          <Navbar />
          <main className="flex-1">
            {children}
          </main>
          <Footer />
          <DocsChatWidget />
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}

