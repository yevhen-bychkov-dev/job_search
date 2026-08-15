import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Job Search OS", template: "%s · Job Search OS" },
  description: "A private workspace for organizing a focused job search.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
