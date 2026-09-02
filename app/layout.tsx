import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Traffic Engineering Lab — UNR Vehicle Arrival Simulator",
  description: "A stochastic vehicle-arrival simulator for the Traffic Engineering Lab at UNR.",
  openGraph: {
    title: "Traffic Engineering Lab — UNR",
    description: "Explore random vehicle arrivals, repeated simulations, and traffic headway distributions.",
    images: ["https://flow-lab-traffic-simulator.kingkm.chatgpt.site/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Traffic Engineering Lab — UNR",
    description: "Explore random vehicle arrivals, repeated simulations, and traffic headway distributions.",
    images: ["https://flow-lab-traffic-simulator.kingkm.chatgpt.site/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
