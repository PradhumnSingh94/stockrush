import type { Metadata } from "next";
import { Space_Mono, Barlow_Condensed } from "next/font/google";
import { QueryProvider } from "@/providers/query-provider";
import "./globals.css";

const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-space-mono",
});

const barlowCondensed = Barlow_Condensed({
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
  variable: "--font-barlow",
});

export const metadata: Metadata = {
  title: "StockRush — Flash Sales",
  description: "Limited time. Limited stock. Move fast.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${spaceMono.variable} ${barlowCondensed.variable}`}
    >
      <body className="bg-[#0a0a0a] text-white antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}