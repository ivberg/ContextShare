'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { catalogApi, healthApi } from '@/lib/api';
import { Catalog } from '@/types/api';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Alert from '@/components/ui/Alert';
import { Database, FileText, Plus, Activity, TrendingUp } from 'lucide-react';

export default function Dashboard() {
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<'healthy' | 'unhealthy' | 'checking'>('checking');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Check server health
        try {
          await healthApi.check();
          setServerStatus('healthy');
        } catch {
          setServerStatus('unhealthy');
        }

        // Fetch catalogs
        const catalogsData = await catalogApi.list();
        setCatalogs(catalogsData);
      } catch (err: unknown) {
        const errorMessage = err && typeof err === 'object' && 'error' in err 
          ? (err as { error: string }).error 
          : 'Failed to load dashboard data';
        setError(errorMessage);
        setServerStatus('unhealthy');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const totalResources = catalogs.reduce((sum, catalog) => sum + (catalog.resource_count || 0), 0);
  const activeCatalogs = catalogs.filter(catalog => catalog.enabled).length;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">ContextShare Admin Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Manage your ContextShare catalogs and resources
        </p>
      </div>

      {error && (
        <div className="mb-6">
          <Alert
            type="error"
            title="Error Loading Dashboard"
            message={error}
            onClose={() => setError(null)}
          />
        </div>
      )}

      {/* Server Status */}
      <div className="mb-8">
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-center">
            <Activity className="h-6 w-6 text-gray-500" />
            <h2 className="ml-2 text-lg font-medium text-gray-900">Server Status</h2>
          </div>
          <div className="mt-4">
            <div className="flex items-center">
              <div
                className={`h-3 w-3 rounded-full ${
                  serverStatus === 'healthy'
                    ? 'bg-green-500'
                    : serverStatus === 'unhealthy'
                    ? 'bg-red-500'
                    : 'bg-yellow-500'
                }`}
              />
              <span className="ml-2 text-sm text-gray-600">
                {serverStatus === 'healthy'
                  ? 'Server is running normally'
                  : serverStatus === 'unhealthy'
                  ? 'Server is not responding'
                  : 'Checking server status...'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-center">
            <Database className="h-8 w-8 text-blue-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Catalogs</p>
              <p className="text-2xl font-bold text-gray-900">{catalogs.length}</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-center">
            <TrendingUp className="h-8 w-8 text-green-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Active Catalogs</p>
              <p className="text-2xl font-bold text-gray-900">{activeCatalogs}</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-center">
            <FileText className="h-8 w-8 text-purple-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Resources</p>
              <p className="text-2xl font-bold text-gray-900">{totalResources}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-medium text-gray-900">Quick Actions</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/catalogs/new"
            className="flex items-center rounded-lg border-2 border-dashed border-gray-300 p-6 text-center hover:border-gray-400 hover:bg-gray-50"
          >
            <div className="mx-auto">
              <Plus className="mx-auto h-8 w-8 text-gray-400" />
              <span className="mt-2 block text-sm font-medium text-gray-900">Create Catalog</span>
            </div>
          </Link>

          <Link
            href="/resources/instructions"
            className="flex items-center rounded-lg border border-gray-300 p-6 hover:bg-gray-50"
          >
            <div className="mx-auto">
              <FileText className="mx-auto h-8 w-8 text-blue-500" />
              <span className="mt-2 block text-sm font-medium text-gray-900">Manage Instructions</span>
            </div>
          </Link>

          <Link
            href="/resources/prompts"
            className="flex items-center rounded-lg border border-gray-300 p-6 hover:bg-gray-50"
          >
            <div className="mx-auto">
              <FileText className="mx-auto h-8 w-8 text-green-500" />
              <span className="mt-2 block text-sm font-medium text-gray-900">Manage Prompts</span>
            </div>
          </Link>

          <Link
            href="/health"
            className="flex items-center rounded-lg border border-gray-300 p-6 hover:bg-gray-50"
          >
            <div className="mx-auto">
              <Activity className="mx-auto h-8 w-8 text-red-500" />
              <span className="mt-2 block text-sm font-medium text-gray-900">Health Check</span>
            </div>
          </Link>
        </div>
      </div>

      {/* Recent Catalogs */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900">Your Catalogs</h2>
          <Link
            href="/catalogs"
            className="text-sm font-medium text-blue-600 hover:text-blue-500"
          >
            View all →
          </Link>
        </div>

        {catalogs.length === 0 ? (
          <div className="rounded-lg bg-white p-12 text-center shadow">
            <Database className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No catalogs yet</h3>
            <p className="mt-2 text-gray-600">
              Get started by creating your first catalog.
            </p>
            <Link
              href="/catalogs/new"
              className="mt-4 inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Catalog
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg bg-white shadow">
            <ul className="divide-y divide-gray-200">
              {catalogs.slice(0, 5).map((catalog) => (
                <li key={catalog.id}>
                  <Link
                    href={`/catalogs/${catalog.id}`}
                    className="block hover:bg-gray-50"
                  >
                    <div className="px-6 py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <Database className="h-5 w-5 text-gray-400" />
                          <div className="ml-3">
                            <p className="text-sm font-medium text-gray-900">
                              {catalog.display_name}
                            </p>
                            <p className="text-sm text-gray-500">
                              {catalog.resource_count || 0} resources
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center">
                          {catalog.enabled ? (
                            <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                              Inactive
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
