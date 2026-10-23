import type { Metadata } from "next";
import "./globals.css";
import localFont from "next/font/local";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

const spaceGroteskHeading = localFont({
  src: "../../public/fonts/space-grotesk-latin.woff2",
  variable: "--font-space-grotesk",
  weight: "500 600",
  display: "swap",
});

const manrope = localFont({
  src: "../../public/fonts/manrope-latin.woff2",
  variable: "--font-manrope",
  weight: "400 600",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Explore — Higgsfield creative workspace",
  description:
    "Find a visual direction in a thoughtfully curated creative workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={cn(
        "dark",
        "font-sans",
        manrope.variable,
        spaceGroteskHeading.variable,
      )}
    >
      <body>
        <TooltipProvider>
          <WorkspaceShell>{children}</WorkspaceShell>
        </TooltipProvider>
      </body>
    </html>
  );
}
