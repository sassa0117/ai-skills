import type { Metadata } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

export const metadata: Metadata = {
  title: "在庫管理アプリ",
  description: "転売・在庫管理アプリケーション",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased max-w-lg mx-auto min-h-screen bg-gray-50">
        <main className="pb-20">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
