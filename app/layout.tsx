import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth/AuthContext";
import { PwaBanner } from "@/components/pwa/PwaBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: "StockIntel Agri - Farm Operations Platform",
  description: "Premium agriculture stock, packhouse, livestock, weather, expense, and team management platform with offline-ready workflows.",
  manifest: "/manifest.json",
  icons: { icon: "/logo.svg", apple: "/logo.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthProvider><PwaBanner />{children}</AuthProvider>
      </body>
    </html>
  );
}
