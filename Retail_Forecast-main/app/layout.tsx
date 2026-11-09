import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coles Cold Drinks Stock Planner",
  description: "Forecast Sydney cold-drink demand with sales, visitor counts, live weather and NSW public holidays.",
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
