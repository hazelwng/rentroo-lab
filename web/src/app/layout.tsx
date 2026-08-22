import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import "./globals.css";

export const metadata: Metadata = {
  title: "RENTROO",
  description: "Compare rental listings by commute and winter sunlight.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b-2 border-per-200 bg-paper">
          <div className="mx-auto flex min-h-14 max-w-5xl items-center gap-6 px-4 py-2">
            <Logo height={18} />
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
