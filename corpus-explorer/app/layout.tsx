import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Literature: Workstream 1",
  description:
    "Workstream 1 literature: protocol, two machine readings of the triad, and the working paper corpus.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
