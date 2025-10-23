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

const appTitle = "specmatch v2.0 — Truthful Resume Rewriter"
const appDescription =
  "Upload a resume and target role to receive a truthful, role-aware rewrite with an explainable fit breakdown."

export const metadata: Metadata = {
  title: {
    default: appTitle,
    template: "%s • specmatch",
  },
  description: appDescription,
  keywords: [
    "resume",
    "job matching",
    "ai resume",
    "truthful resume",
    "career tools",
    "specmatch",
  ],
  openGraph: {
    title: appTitle,
    description: appDescription,
    url: "https://specmatch.app",
    siteName: "specmatch",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: appTitle,
    description: appDescription,
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0D0F12" },
    { media: "(prefers-color-scheme: light)", color: "#F9FAFB" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
