import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IncidentDesk for GenLayer",
  description: "An operational console for creating and inspecting GenLayer consensus service-incident receipts.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
