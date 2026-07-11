import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { IdbCleanup } from "@/components/idb-cleanup";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GrowEasy AI Excel Cleaner",
  description: "Clean Excel and CSV imports with AI, review, export, and analytics.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background text-foreground" suppressHydrationWarning>
        <Script
          id="upload-reload-cleanup"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (() => {
                try {
                  const path = window.location.pathname;
                  const match = path.match(/^\\/upload\\/([^/]+)/);
                  if (!match) return;

                  const nav = performance.getEntriesByType("navigation")[0];
                  if (nav?.type !== "reload") return;

                  const draftKey = "groweasy-upload-draft";
                  if (!sessionStorage.getItem(draftKey)) return;

                  const importId = match[1];
                  sessionStorage.removeItem(draftKey);
                  sessionStorage.removeItem("groweasy-upload-reset-on-reload");
                  sessionStorage.removeItem("groweasy-validation-preview:" + importId);
                  sessionStorage.removeItem("groweasy-validate-state:" + importId);
                  window.location.replace("/upload");
                } catch {
                  // Ignore storage access errors and let the app render normally.
                }
              })();
            `,
          }}
        />
        <TooltipProvider>
          <IdbCleanup />
          {children}
          <Toaster richColors closeButton />
        </TooltipProvider>
      </body>
    </html>
  );
}
