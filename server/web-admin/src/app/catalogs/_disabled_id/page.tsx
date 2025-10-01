'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { catalogApi } from '@/lib/api';
import { Catalog, Resource } from '@/types/api';

// Static export configuration: generate a placeholder page
// The actual catalog data will be fetched client-side
export async function generateStaticParams() {
  // Return a single placeholder - the real data loads client-side
  return [{ id: '0' }];
}

// Disable dynamic params to allow client-side routing for other IDs
export const dynamicParams = true;
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Alert from '@/components/ui/Alert';
import { 
  ArrowLeft, 
  Database, 
  Plus, 
  FileText, 
  MessageSquare, 
  Zap, 
  Settings,
  Calendar,
  Users,
  ExternalLink
} from 'lucide-react';

const categoryIcons = {
  instructions: FileText,
  prompts: MessageSquare,
  chatmodes: MessageSquare,
  tasks: Zap,
  mcp: Settings,
};

const categoryColors = {
  instructions: 'text-blue-500',
  prompts: 'text-green-500',
  chatmodes: 'text-purple-500',
  tasks: 'text-yellow-500',
  mcp: 'text-red-500',
};

export default function CatalogDetailPage() {
  const params = useParams();
  const router = useRouter();
  const catalogId = parseInt(params.id as string);

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!catalogId || isNaN(catalogId)) {
      router.push('/catalogs');
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get all catalogs to find the one we want
        const catalogs = await catalogApi.list();
        const targetCatalog = catalogs.find(c => c.id === catalogId);
        
        if (!targetCatalog) {
          setError('Catalog not found');
          return;
        }

        setCatalog(targetCatalog);

        // Get resources for this catalog
        const catalogResources = await catalogApi.getResources(catalogId);
        setResources(catalogResources);

      } catch (err: unknown) {
        const errorMessage = err && typeof err === 'object' && 'error' in err 
          ? (err as { error: string }).error 
          : 'Failed to load catalog details';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [catalogId, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600">Loading catalog details...</p>
        </div>
      </div>
    );
  }

  if (error || !catalog) {
    return (
      <div className="p-6">
        <Alert
          type="error"
          title="Error Loading Catalog"
          message={error || 'Catalog not found'}
        />
        <Link
          href="/catalogs"
          className="mt-4 inline-flex items-center text-sm text-blue-600 hover:text-blue-500"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Catalogs
        </Link>
      </div>
    );
  }

  // Group resources by type (chatmodes, instructions, etc.)
  const resourcesByType = resources.reduce((acc, resource) => {
    if (!acc[resource.type]) {
      acc[resource.type] = [];
    }
    acc[resource.type].push(resource);
    return acc;
  }, {} as Record<string, Resource[]>);

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
        
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Database className="h-8 w-8 text-blue-500" />
            <div className="ml-3">
              <h1 className="text-3xl font-bold text-gray-900">{catalog.display_name}</h1>
              <p className="text-gray-600">{catalog.name}</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {catalog.enabled ? (
              <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
                Active
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-800">
                Inactive
              </span>
            )}
            <Link
              href={`/resources/new?catalogId=${catalog.id}`}
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Resource
            </Link>
          </div>
        </div>
      </div>

      {/* Catalog Information */}
      <div className="mb-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-medium text-gray-900">Catalog Details</h2>
            
            {catalog.description && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-700">Description</h3>
                <p className="mt-1 text-sm text-gray-600">{catalog.description}</p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="text-sm font-medium text-gray-700">Source Type</h3>
                <p className="mt-1 text-sm text-gray-600 capitalize">{catalog.source_type}</p>
              </div>
              
              {catalog.source_path && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700">Source Path</h3>
                  <p className="mt-1 text-sm text-gray-600 font-mono">{catalog.source_path}</p>
                </div>
              )}
              
              {catalog.source_url && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700">Source URL</h3>
                  <a
                    href={catalog.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center text-sm text-blue-600 hover:text-blue-500"
                  >
                    {catalog.source_url}
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-medium text-gray-900">Statistics</h2>
            
            <div className="space-y-4">
              <div className="flex items-center">
                <Users className="h-5 w-5 text-gray-400" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">Total Resources</p>
                  <p className="text-lg font-bold text-blue-600">{resources.length}</p>
                </div>
              </div>
              
              <div className="flex items-center">
                <Calendar className="h-5 w-5 text-gray-400" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">Created</p>
                  <p className="text-sm text-gray-600">
                    {new Date(catalog.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center">
                <Calendar className="h-5 w-5 text-gray-400" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">Last Updated</p>
                  <p className="text-sm text-gray-600">
                    {new Date(catalog.updated_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Resources by Category */}
      <div>
        <h2 className="mb-6 text-lg font-medium text-gray-900">Resources</h2>
        
        {resources.length === 0 ? (
          <div className="rounded-lg bg-white p-12 text-center shadow">
            <FileText className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No resources yet</h3>
            <p className="mt-2 text-gray-600">
              Start by adding your first resource to this catalog.
            </p>
            <Link
              href={`/resources/new?catalogId=${catalog.id}`}
              className="mt-4 inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Resource
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(resourcesByType).map(([resourceType, typeResources]) => {
              const Icon = categoryIcons[resourceType as keyof typeof categoryIcons] || FileText;
              const iconColor = categoryColors[resourceType as keyof typeof categoryColors] || 'text-gray-500';
              
              return (
                <div key={resourceType} className="rounded-lg bg-white shadow">
                  <div className="border-b border-gray-200 px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <Icon className={`h-5 w-5 ${iconColor}`} />
                        <h3 className="ml-2 text-lg font-medium text-gray-900 capitalize">
                          {resourceType}
                        </h3>
                        <span className="ml-2 inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                          {typeResources.length}
                        </span>
                      </div>
                      <Link
                        href={`/resources/new?catalogId=${catalog.id}&category=${resourceType}`}
                        className="text-sm text-blue-600 hover:text-blue-500"
                      >
                        Add {resourceType.slice(0, -1)}
                      </Link>
                    </div>
                  </div>
                  
                  <div className="divide-y divide-gray-200">
                    {typeResources.map((resource) => (
                      <div key={resource.id} className="px-6 py-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {resource.title || resource.filename}
                            </p>
                            <p className="text-sm text-gray-500">
                              {resource.filename}
                            </p>
                            {resource.description && (
                              <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                                {resource.description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center space-x-2">
                            {resource.enabled ? (
                              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
                                Inactive
                              </span>
                            )}
                            <Link
                              href={`/resources/${catalog.id}/${resourceType}/${resource.filename}`}
                              className="text-sm text-blue-600 hover:text-blue-500"
                            >
                              Edit
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}