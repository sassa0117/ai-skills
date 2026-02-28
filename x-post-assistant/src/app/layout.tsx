import type { Metadata } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

export const metadata: Metadata = {
  title: "X Post Assistant",
  description: "Xポスト作成補助ツール",
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
