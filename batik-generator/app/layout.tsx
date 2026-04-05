import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getServerLang } from "@/lib/i18n-server";
import { translate } from "@/lib/i18n-dictionary";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import I18nProvider from "@/components/I18nProvider";
import PageTransition from "@/components/PageTransition";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getServerLang();

  return {
    title: translate(lang, "meta.title"),
    description: translate(lang, "meta.description"),
    icons: {
      icon: "/itmo-logo.png",
      apple: "/itmo-logo.png",
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = await getServerLang();

  return (
    <html lang={lang}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#120e0c] text-[#f7f1e6] flex min-h-screen md:h-screen md:overflow-hidden`}
      >
        <I18nProvider>
          <Sidebar />
          <div className="flex-1 flex flex-col min-h-screen md:h-screen md:overflow-hidden">
            <Header />
            <PageTransition>
              {children}
            </PageTransition>
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
