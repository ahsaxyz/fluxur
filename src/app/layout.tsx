import type { Metadata } from "next";
import "./globals.css";
import WalletProvider from "@/components/WalletProvider";
import AuthProvider from "@/components/AuthProvider";

export const metadata: Metadata = {
  title: "Fluxur",
  description: "Lock your pump.fun creator fees in a time-locked vault. Generate a dedicated vault address, redirect fees, and unlock them at a date you choose.",
  icons: {
    icon: "/fluxur-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-[#0a0a0a]">
        <WalletProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
