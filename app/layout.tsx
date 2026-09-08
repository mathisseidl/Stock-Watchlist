import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeColorMeta } from "@/components/theme-color-meta";
import { QueryProvider } from "@/components/query-provider";
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
  title: "MATMAX Stock",
  description: "Track your stock portfolio, watchlist, and market news.",
};

// Without this iOS Safari paints the status bar and toolbar its own grey.
// ThemeColorMeta keeps it in step once the theme is known on the client.
export const viewport: Viewport = {
  themeColor: "#f9fafb",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* The dashboard's boot script paints the gradient onto this element's
          `style` before React hydrates (see `backgroundBootScript`), which is
          a deliberate mismatch with the server HTML — and the flag on <html>
          does not reach here, because React only suppresses the element it is
          written on. Without it every dashboard load logs a hydration error. */}
      <body
        className="min-h-full flex flex-col bg-background"
        suppressHydrationWarning
      >
        {/* Light is the default, and new accounts start on the Dawn gradient
            tuned for it. Anyone who picked dark before keeps it — next-themes
            reads their stored choice first. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <ThemeColorMeta />
          <QueryProvider>{children}</QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
