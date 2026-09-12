import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { SileoToasterWrapper } from "@/components/SileoToaster";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KPI | Producción Industrial",
  description:
    "Sistema de control de producción industrial. Gestión táctil de pallets, formatos, noblejas y cola de producción en tiempo real.",
  icons: {
    icon: [
      { url: "/images/favicon.png", type: "image/png", sizes: "512x512" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/images/favicon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                let isGold = false;
                const store = localStorage.getItem('production-store');
                if (store) {
                  const parsed = JSON.parse(store);
                  if (parsed && parsed.state && parsed.state.goldMode) {
                    isGold = true;
                  }
                }
                if (isGold) {
                  document.documentElement.classList.add('dark');
                  document.documentElement.style.backgroundColor = '#0b0802';
                } else {
                  document.documentElement.classList.remove('dark');
                  document.documentElement.style.backgroundColor = '#f3f8f4';
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body 
        className="min-h-full flex flex-col touch-manipulation relative overflow-x-hidden text-foreground"
        suppressHydrationWarning
      >
        {/* iOS 27 glassmorphic background glow blobs — clase glass-bg-blobs para poder ocultarlos */}
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none select-none glass-bg-blobs">
          <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] sm:w-[750px] sm:h-[750px] rounded-full bg-emerald-500/20 blur-[110px] sm:blur-[140px] animate-pulse" style={{ animationDuration: '8s' }} />
          <div className="absolute bottom-[-10%] right-[-10%] w-[700px] h-[700px] sm:w-[850px] sm:h-[850px] rounded-full bg-teal-500/15 blur-[130px] sm:blur-[160px] animate-pulse" style={{ animationDuration: '12s' }} />
          <div className="absolute top-[20%] right-[-20%] w-[500px] h-[500px] sm:w-[600px] sm:h-[600px] rounded-full bg-indigo-500/15 blur-[100px] sm:blur-[130px] animate-pulse" style={{ animationDuration: '10s' }} />
          <div className="absolute bottom-[30%] left-[-15%] w-[550px] h-[550px] sm:w-[650px] sm:h-[650px] rounded-full bg-purple-500/15 blur-[110px] sm:blur-[150px] animate-pulse" style={{ animationDuration: '15s' }} />
          <div className="absolute top-[45%] left-[35%] w-[300px] h-[300px] rounded-full bg-cyan-500/10 blur-[90px] animate-pulse" style={{ animationDuration: '20s' }} />
        </div>
        {children}
        <SileoToasterWrapper />
      </body>
    </html>
  );
}
