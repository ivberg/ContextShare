'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { catalogApi } from '@/lib/api';
import { CreateCatalogRequest } from '@/types/api';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Alert from '@/components/ui/Alert';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';

export default function NewCatalogPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState<CreateCatalogRequest>({
    name: '',
    displayName: '',
    description: '',
    sourceType: 'local',
    sourcePath: '',
    sourceUrl: '',
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      setError(null);

      // Clean up the form data
      const cleanedData: CreateCatalogRequest = {
        name: formData.name,
        displayName: formData.displayName,
        sourceType: formData.sourceType,
      };

      if (formData.description?.trim()) {
        cleanedData.description = formData.description.trim();
      }

      if (formData.sourcePath?.trim()) {
        cleanedData.sourcePath = formData.sourcePath.trim();
      }

      if (formData.sourceUrl?.trim()) {
        cleanedData.sourceUrl = formData.sourceUrl.trim();
      }

      const catalog = await catalogApi.create(cleanedData);
      setSuccess(true);
      
      // Redirect to catalog detail page after a short delay
      setTimeout(() => {
        router.push(`/catalogs/${catalog.id}`);
      }, 1500);

    } catch (err: unknown) {
      const errorMessage = err && typeof err === 'object' && 'error' in err 
        ? (err as { error: string }).error 
        : 'Failed to create catalog';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
            <Save className="h-6 w-6 text-green-600" />
          </div>
          <h2 className="mt-4 text-lg font-medium text-gray-900">Catalog Created Successfully</h2>
          <p className="mt-2 text-gray-600">Redirecting to catalog details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-8">
        <div className="flex items-center">
          <Link
            href="/catalogs"
            className="mr-4 inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Catalogs
          </Link>
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Create New Catalog</h1>
        <p className="mt-2 text-gray-600">
          Create a new catalog to organize your ContextShare resources
        </p>
      </div>

      {error && (
        <div className="mb-6">
          <Alert
            type="error"
            title="Error Creating Catalog"
            message={error}
            onClose={() => setError(null)}
          />
        </div>
      )}

      <div className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-medium text-gray-900">Basic Information</h2>
            
            <div className="grid gap-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Catalog Name *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g., my-catalog"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Unique identifier for the catalog (lowercase, hyphens allowed)
                </p>
              </div>

              <div>
                <label htmlFor="displayName" className="block text-sm font-medium text-gray-700">
                  Display Name *
                </label>
                <input
                  type="text"
                  id="displayName"
                  name="displayName"
                  required
                  value={formData.displayName}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g., My Catalog"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Human-readable name shown in the interface
                </p>
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={3}
                  value={formData.description}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Optional description of the catalog..."
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-medium text-gray-900">Source Configuration</h2>
            
            <div className="grid gap-4">
              <div>
                <label htmlFor="sourceType" className="block text-sm font-medium text-gray-700">
                  Source Type *
                </label>
                <select
                  id="sourceType"
                  name="sourceType"
                  required
                  value={formData.sourceType}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="local">Local</option>
                  <option value="remote">Remote</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Whether this catalog is stored locally or remotely
                </p>
              </div>

              <div>
                <label htmlFor="sourcePath" className="block text-sm font-medium text-gray-700">
                  Source Path
                </label>
                <input
                  type="text"
                  id="sourcePath"
                  name="sourcePath"
                  value={formData.sourcePath}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g., /path/to/catalog"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Optional local file system path
                </p>
              </div>

              <div>
                <label htmlFor="sourceUrl" className="block text-sm font-medium text-gray-700">
                  Source URL
                </label>
                <input
                  type="url"
                  id="sourceUrl"
                  name="sourceUrl"
                  value={formData.sourceUrl}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g., https://example.com/catalog"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Optional remote URL for the catalog source
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <Link
              href="/catalogs"
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Creating...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Create Catalog
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}