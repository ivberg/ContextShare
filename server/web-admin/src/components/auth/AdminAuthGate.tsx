'use client';

import React from 'react';
import Navigation from "@/components/layout/Navigation";

export default function AdminAuthGate({ children }: { children: React.ReactNode }) {
  const [isAuthorized, setIsAuthorized] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    // Client-side only check
    const key = localStorage.getItem('admin_api_key');
    const isLoginPage = window.location.pathname === '/admin-ui/login' || window.location.pathname === '/login';
    
    if (!key && !isLoginPage) {
      // Redirect to login page
      const loginPath = window.location.pathname.startsWith('/admin-ui') ? '/admin-ui/login' : '/login';
      window.location.href = loginPath;
      setIsAuthorized(false);
    } else {
      setIsAuthorized(true);
    }
  }, []);

  // Show nothing while checking authorization
  if (isAuthorized === null) {
    return null;
  }

  // Don't render children if not authorized (will redirect)
  if (isAuthorized === false) {
    return null;
  }

  return <Navigation>{children}</Navigation>;
}
