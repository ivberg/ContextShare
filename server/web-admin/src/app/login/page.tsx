'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Key, AlertCircle } from 'lucide-react';
import Alert from '@/components/ui/Alert';

export default function LoginPage() {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // Check if already logged in
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const existingKey = localStorage.getItem('admin_api_key');
      if (existingKey) {
        // Already logged in, redirect to dashboard
        router.push('/');
      }
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // Validate the API key by making a test request
      const response = await fetch('/admin/catalogs', {
        headers: {
          'X-Admin-API-Key': apiKey,
        },
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('Invalid API key. Please check and try again.');
        }
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      // API key is valid, store it and redirect
      localStorage.setItem('admin_api_key', apiKey);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to authenticate');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div>
          <div className="flex justify-center">
            <div className="rounded-full bg-blue-100 p-3">
              <Key className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
            ContextShare Admin
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Enter your admin API key to continue
          </p>
        </div>

        {error && (
          <Alert
            type="error"
            title="Authentication Failed"
            message={error}
            onClose={() => setError(null)}
          />
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="api-key" className="block text-sm font-medium text-gray-700">
              Admin API Key
            </label>
            <div className="mt-1 relative">
              <input
                id="api-key"
                name="api-key"
                type="password"
                autoComplete="current-password"
                required
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                placeholder="Enter your API key"
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="rounded-md bg-blue-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <AlertCircle className="h-5 w-5 text-blue-400" />
              </div>
              <div className="ml-3 flex-1 md:flex md:justify-between">
                <p className="text-sm text-blue-700">
                  The admin API key is configured when deploying the server. Check your deployment
                  configuration for the ADMIN_API_KEY value.
                </p>
              </div>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading || !apiKey.trim()}
              className="group relative flex w-full justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? 'Authenticating...' : 'Sign In'}
            </button>
          </div>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-gray-50 px-2 text-gray-500">Security Notice</span>
            </div>
          </div>
          <div className="mt-4 text-center text-xs text-gray-500">
            Your API key is stored locally in your browser and sent with each request. Never share
            your API key with others.
          </div>
        </div>
      </div>
    </div>
  );
}
