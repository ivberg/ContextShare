import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/layout/Navigation";
import React from 'react';

function AdminAuthGate({ children }: { children: React.ReactNode }) {
  if (typeof window !== 'undefined') {
    const key = localStorage.getItem('admin_api_key');
    if (!key && window.location.pathname !== '/login') {
      window.location.replace('/login');
      return null;
    }
  }
  return <>{children}</>;
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ContextShare Admin",
  description: "Admin interface for managing ContextShare catalogs and resources",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AdminAuthGate>
          <Navigation>{children}</Navigation>
        </AdminAuthGate>
      </body>
    </html>
  );
}
