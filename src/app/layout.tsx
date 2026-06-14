import type { Metadata } from "next";
import "./globals.css";
import FirebaseSessionProvider from "@/components/FirebaseSessionProvider";

export const metadata: Metadata = {
  title: "Splitsy — Share expenses beautifully",
  description: "A premium expense sharing app. Split bills, track balances, and settle up with world-class design.",
  keywords: "expense sharing, split bills, group expenses, money management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen antialiased">
        <FirebaseSessionProvider>{children}</FirebaseSessionProvider>
      </body>
    </html>
  );
}
