import type { Metadata } from "next";
import { Fraunces, Outfit } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  style: ["normal", "italic"],
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
});

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
    <html lang="en" className={`${fraunces.variable} ${outfit.variable}`}>
      <body>
        <header className="site">
          <div className="inner">
            <Link href="/" className="brand">
              <span className="mark" aria-hidden />
              Try Jobs
            </Link>
            <nav>
              <Link href="/">Openings</Link>
              <Link href="/employer/dashboard" className="cta">
                For employers
              </Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site">
          <div className="inner">
            <span>© {new Date().getFullYear()} Try Jobs · Yukon &amp; BC</span>
            <span>Hiring, proven on the floor — not on paper.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
