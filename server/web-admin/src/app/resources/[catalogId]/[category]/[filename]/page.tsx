'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { resourceApi } from '@/lib/api';
import { ResourceContent, ResourceCategory } from '@/types/api';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Alert from '@/components/ui/Alert';
import CodeEditor from '@/components/ui/CodeEditor';
import { 
  ArrowLeft, 
  Save, 
  FileText, 
  MessageSquare, 
  Zap, 
  Settings,
  Trash2
} from 'lucide-react';

const categoryIcons = {
  instructions: FileText,
  prompts: MessageSquare,
  chatmodes: MessageSquare,
  tasks: Zap,
  mcp: Settings,
};

const getLanguageForCategory = (category: ResourceCategory, filename: string): string => {
  if (filename.endsWith('.json')) return 'json';
  if (filename.endsWith('.md')) return 'markdown';
  if (filename.endsWith('.yaml') || filename.endsWith('.yml')) return 'yaml';
  
  switch (category) {
    case 'tasks':
    case 'mcp':
      return 'json';
    default:
      return 'markdown';
  }
};

export default function ResourceEditPage() {
  const params = useParams();
  const router = useRouter();
  
  const catalogId = parseInt(params.catalogId as string);
  const category = params.category as ResourceCategory;
  const filename = params.filename as string;

  const [resource, setResource] = useState<ResourceContent | null>(null);
  const [content, setContent] = useState('');
  const [metadata, setMetadata] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!catalogId || isNaN(catalogId) || !category || !filename) {
      router.push('/catalogs');
      return;
    }

    const fetchResource = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const resourceData = await resourceApi.getContent(catalogId, category, filename);
        setResource(resourceData);
        setContent(resourceData.content);
        
        // Parse metadata if it exists
        if (resourceData.metadata) {
          try {
            const parsedMetadata = JSON.parse(resourceData.metadata);
            setMetadata(JSON.stringify(parsedMetadata, null, 2));
          } catch {
            setMetadata(resourceData.metadata);
          }
        }
        
      } catch (err: unknown) {
        const errorMessage = err && typeof err === 'object' && 'error' in err 
          ? (err as { error: string }).error 
          : 'Failed to load resource';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchResource();
  }, [catalogId, category, filename, router]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      
      let parsedMetadata;
      if (metadata.trim()) {
        try {
          parsedMetadata = JSON.parse(metadata);
        } catch {
          setError('Invalid JSON in metadata field');
          return;
        }
      }

      await resourceApi.update(catalogId, category, filename, {
        content,
        metadata: parsedMetadata,
      });

      setSuccess('Resource updated successfully');
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
      
    } catch (err: unknown) {
      const errorMessage = err && typeof err === 'object' && 'error' in err 
        ? (err as { error: string }).error 
        : 'Failed to save resource';
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this resource? This action cannot be undone.')) {
      return;
    }

    try {
      setDeleting(true);
      setError(null);
      
      await resourceApi.delete(catalogId, category, filename);
      
      // Redirect back to catalog detail page
      router.push(`/catalogs/${catalogId}`);
      
    } catch (err: unknown) {
      const errorMessage = err && typeof err === 'object' && 'error' in err 
        ? (err as { error: string }).error 
        : 'Failed to delete resource';
      setError(errorMessage);
      setDeleting(false);
    }
  };

  const Icon = categoryIcons[category] || FileText;
  const language = getLanguageForCategory(category, filename);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600">Loading resource...</p>
        </div>
      </div>
    );
  }

  if (error && !resource) {
    return (
      <div className="p-6">
        <Alert
          type="error"
          title="Error Loading Resource"
          message={error}
        />
        <Link
          href={`/catalogs/${catalogId}`}
          className="mt-4 inline-flex items-center text-sm text-blue-600 hover:text-blue-500"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-8">
        <div className="flex items-center">
          <Link
            href={`/catalogs/${catalogId}`}
            className="mr-4 inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Catalog
          </Link>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Icon className="h-8 w-8 text-blue-500" />
            <div className="ml-3">
              <h1 className="text-3xl font-bold text-gray-900">{resource?.title || filename}</h1>
              <p className="text-gray-600">{filename}</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </>
              )}
            </button>
            
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6">
          <Alert
            type="error"
            title="Error"
            message={error}
            onClose={() => setError(null)}
          />
        </div>
      )}

      {success && (
        <div className="mb-6">
          <Alert
            type="success"
            title="Success"
            message={success}
            onClose={() => setSuccess(null)}
          />
        </div>
      )}

      {/* Resource Details */}
      {resource && (
        <div className="mb-6 rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-medium text-gray-900">Resource Information</h2>
          
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-sm font-medium text-gray-700">Category</p>
              <p className="mt-1 text-sm text-gray-600 capitalize">{category}</p>
            </div>
            
            <div>
              <p className="text-sm font-medium text-gray-700">Content Type</p>
              <p className="mt-1 text-sm text-gray-600">{resource.content_type}</p>
            </div>
            
            {resource.title && (
              <div>
                <p className="text-sm font-medium text-gray-700">Title</p>
                <p className="mt-1 text-sm text-gray-600">{resource.title}</p>
              </div>
            )}
            
            {resource.description && (
              <div>
                <p className="text-sm font-medium text-gray-700">Description</p>
                <p className="mt-1 text-sm text-gray-600">{resource.description}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content Editor */}
      <div className="mb-6">
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-medium text-gray-900">Content</h2>
          <CodeEditor
            value={content}
            onChange={(value) => setContent(value || '')}
            language={language}
            height="500px"
          />
        </div>
      </div>

      {/* Metadata Editor */}
      <div>
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-medium text-gray-900">Metadata (JSON)</h2>
          <p className="mb-4 text-sm text-gray-600">
            Optional metadata for the resource in JSON format
          </p>
          <CodeEditor
            value={metadata}
            onChange={(value) => setMetadata(value || '')}
            language="json"
            height="200px"
          />
        </div>
      </div>
    </div>
  );
}