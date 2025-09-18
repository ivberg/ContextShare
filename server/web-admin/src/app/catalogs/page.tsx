'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { catalogApi } from '@/lib/api';
import { Catalog } from '@/types/api';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Alert from '@/components/ui/Alert';
import { Database, Plus, Eye, Calendar, Users } from 'lucide-react';

export default function CatalogsPage() {
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCatalogs = async () => {
      try {
        setLoading(true);
        setError(null);
        const catalogsData = await catalogApi.list();
        setCatalogs(catalogsData);
      } catch (err: unknown) {
        const errorMessage = err && typeof err === 'object' && 'error' in err 
          ? (err as { error: string }).error 
          : 'Failed to load catalogs';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchCatalogs();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600">Loading catalogs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Catalogs</h1>
          <p className="mt-2 text-gray-600">
            Manage your ContextShare catalog collections
          </p>
        </div>
        <Link
          href="/catalogs/new"
          className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Catalog
        </Link>
      </div>

      {error && (
        <div className="mb-6">
          <Alert
            type="error"
            title="Error Loading Catalogs"
            message={error}
            onClose={() => setError(null)}
          />
        </div>
      )}

      {catalogs.length === 0 ? (
        <div className="rounded-lg bg-white p-12 text-center shadow">
          <Database className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No catalogs found</h3>
          <p className="mt-2 text-gray-600">
            Get started by creating your first catalog to organize your resources.
          </p>
          <Link
            href="/catalogs/new"
            className="mt-4 inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Your First Catalog
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {catalogs.map((catalog) => (
            <div
              key={catalog.id}
              className="overflow-hidden rounded-lg bg-white shadow hover:shadow-md transition-shadow"
            >
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Database className="h-8 w-8 text-blue-500" />
                    <div className="ml-3">
                      <h3 className="text-lg font-medium text-gray-900">
                        {catalog.display_name}
                      </h3>
                      <p className="text-sm text-gray-500">{catalog.name}</p>
                    </div>
                  </div>
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

                {catalog.description && (
                  <p className="mt-3 text-sm text-gray-600 line-clamp-2">
                    {catalog.description}
                  </p>
                )}

                <div className="mt-4 flex items-center text-sm text-gray-500">
                  <Users className="mr-1 h-4 w-4" />
                  <span className="mr-4">{catalog.resource_count || 0} resources</span>
                  <Calendar className="mr-1 h-4 w-4" />
                  <span>
                    {new Date(catalog.created_at).toLocaleDateString()}
                  </span>
                </div>

                <div className="mt-4 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-gray-500">
                      <div>Source: {catalog.source_type}</div>
                      {catalog.source_path && (
                        <div className="truncate">Path: {catalog.source_path}</div>
                      )}
                      {catalog.source_url && (
                        <div className="truncate">URL: {catalog.source_url}</div>
                      )}
                    </div>
                    <Link
                      href={`/catalogs/${catalog.id}`}
                      className="inline-flex items-center rounded-md bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                    >
                      <Eye className="mr-1 h-3 w-3" />
                      View
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}