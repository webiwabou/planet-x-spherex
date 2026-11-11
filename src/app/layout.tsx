import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Planet X & SPHEREx Explorer | NASA Space Apps Challenge 2026",
  description:
    "Interactive public web platform for NASA SPHEREx mission sky exploration. Discover high proper motion objects, brown dwarfs, Planet X candidates and variable stars using time-series blink comparison and 102-band infrared spectroscopy.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-space-950 text-slate-100 min-h-screen antialiased selection:bg-spherex-cyan selection:text-space-950">
        {children}
      </body>
    </html>
  );
}
