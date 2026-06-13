import type { Metadata } from "next";
import "./globals.css";
import FirebaseSessionProvider from "@/components/FirebaseSessionProvider";

export const metadata: Metadata = {
  title: "Splitsy — Share expenses with friends",
  description: "A simplified Splitwise-inspired expense sharing app",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <FirebaseSessionProvider>{children}</FirebaseSessionProvider>
      </body>
    </html>
  );
}
