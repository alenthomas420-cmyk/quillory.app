import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Try Jobs — prove it on a paid try-day",
  description:
    "Skip the resume. A short phone screening and a paid trial shift connect hourly workers with employers who want to see real work.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="site">
          <div className="inner">
            <Link href="/" className="brand">
              Try Jobs
            </Link>
            <nav>
              <Link href="/">Openings</Link>
              <Link href="/employer/dashboard">For employers</Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
