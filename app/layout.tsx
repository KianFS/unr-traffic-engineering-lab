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
  title: "Flow Lab — Vehicle Arrival Simulator",
  description: "A polished stochastic traffic-arrival simulator for transportation engineering.",
  openGraph: {
    title: "Flow Lab — Vehicle Arrival Simulator",
    description: "Explore random vehicle arrivals, repeated simulations, and run-to-run distributions.",
    images: ["https://flow-lab-traffic-simulator.kingkm.chatgpt.site/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Flow Lab — Vehicle Arrival Simulator",
    description: "Explore random vehicle arrivals, repeated simulations, and run-to-run distributions.",
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
