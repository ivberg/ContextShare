'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { catalogApi, resourceApi } from '@/lib/api';
import { Catalog, CreateResourceRequest, ResourceType } from '@/types/api';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Alert from '@/components/ui/Alert';
import CodeEditor from '@/components/ui/CodeEditor';
import { 
  ArrowLeft, 
  Save, 
  FileText, 
  MessageSquare, 
  Zap, 
  Settings
} from 'lucide-react';

const categoryOptions: { value: ResourceType; label: string; icon: typeof FileText }[] = [
  { value: 'instructions', label: 'Instructions', icon: FileText },
  { value: 'prompts', label: 'Prompts', icon: MessageSquare },
  { value: 'chatmodes', label: 'Chat Modes', icon: MessageSquare },
  { value: 'tasks', label: 'Tasks', icon: Zap },
  { value: 'mcp', label: 'MCP Configs', icon: Settings },
];

const getFileExtensionForCategory = (category: ResourceType): string => {
  switch (category) {
    case 'instructions':
      return '.instructions.md';
    case 'prompts':
      return '.prompt.md';
    case 'chatmodes':
      return '.chatmode.md';
    case 'tasks':
      return '.task.json';
    case 'mcp':
      return '.mcp.json';
    default:
      return '.md';
  }
};

const getDefaultContentForCategory = (category: ResourceType, filename: string): string => {
  const name = filename.replace(/\.[^.]+$/, ''); // Remove extension
  
  switch (category) {
    case 'instructions':
      return `# ${name}\n\nThis is a new instruction file.\n\n## Purpose\n\nDescribe what this instruction is for.\n\n## Usage\n\nExplain how to use this instruction.`;
      
    case 'prompts':
      return `# ${name}\n\nThis is a new prompt.\n\n## Description\n\nDescribe what this prompt does.\n\n## Prompt\n\nYour prompt content here.`;
      
    case 'chatmodes':
      return `# ${name}\n\nThis is a new chat mode.\n\n## Description\n\nDescribe what this chat mode does.\n\n## Configuration\n\nChat mode configuration goes here.`;
      
    case 'tasks':
      return JSON.stringify({
        name: name,
        description: "A new task",
        type: "task",
        steps: [
          {
            action: "example",
            parameters: {}
          }
        ]
      }, null, 2);
      
    case 'mcp':
      return JSON.stringify({
        servers: {
          [name]: {
            command: "example-command",
            args: [],
            env: {}
          }
        }
      }, null, 2);
      
    default:
      return `# ${name}\n\nNew resource content.`;
  }
};

const getLanguageForCategory = (category: ResourceType): string => {
  switch (category) {
    case 'tasks':
    case 'mcp':
      return 'json';
    default:
      return 'markdown';
  }
};

// Helper function to transform GitHub URLs to raw content URLs
const transformGitHubUrl = (url: string): string => {
  // Transform github.com/user/repo/blob/branch/path to raw.githubusercontent.com/user/repo/branch/path
  const githubBlobRegex = /^https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+)$/;
  const match = url.match(githubBlobRegex);
  
  if (match) {
    const [, owner, repo, branch, path] = match;
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  }
  
  return url; // Return original URL if no transformation needed
};

function NewResourceForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState<{
    catalogId: number | '';
    category: ResourceType;
    filename: string;
    content: string;
    contentUrl: string;
    resourceType: 'content' | 'url';
    metadata: string;
  }>({
    catalogId: '',
    category: 'instructions',
    filename: '',
    content: '',
    contentUrl: '',
    resourceType: 'content',
    metadata: '',
  });

  useEffect(() => {
    const fetchCatalogs = async () => {
      try {
        setLoading(true);
        setError(null);
        const catalogsData = await catalogApi.list();
        setCatalogs(catalogsData);

        // Set defaults from URL params
        const catalogIdParam = searchParams.get('catalogId');
        const categoryParam = searchParams.get('category') as ResourceType;
        
        if (catalogIdParam) {
          const catalogId = parseInt(catalogIdParam);
          if (!isNaN(catalogId)) {
            setFormData(prev => ({ ...prev, catalogId }));
          }
        }
        
        if (categoryParam && categoryOptions.find(opt => opt.value === categoryParam)) {
          setFormData(prev => ({ 
            ...prev, 
            category: categoryParam,
            content: prev.resourceType === 'content' ? getDefaultContentForCategory(categoryParam, 'new-resource') : '',
          }));
        } else {
          setFormData(prev => ({ 
            ...prev, 
            content: prev.resourceType === 'content' ? getDefaultContentForCategory('instructions', 'new-resource') : '',
          }));
        }
        
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
  }, [searchParams]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (name === 'category') {
      const newCategory = value as ResourceType;
      const newFilename = formData.filename 
        ? formData.filename.replace(/\.[^.]+$/, '') + getFileExtensionForCategory(newCategory)
        : '';
      
      setFormData(prev => ({
        ...prev,
        category: newCategory,
        filename: newFilename,
        content: prev.resourceType === 'content' ? getDefaultContentForCategory(newCategory, newFilename || 'new-resource') : '',
      }));
    } else if (name === 'filename') {
      const baseFilename = value.replace(/\.[^.]+$/, ''); // Remove any extension
      const newFilename = baseFilename + getFileExtensionForCategory(formData.category);
      
      setFormData(prev => ({
        ...prev,
        filename: newFilename,
      }));
    } else if (name === 'resourceType') {
      const newResourceType = value as 'content' | 'url';
      setFormData(prev => ({
        ...prev,
        resourceType: newResourceType,
        content: newResourceType === 'content' ? getDefaultContentForCategory(prev.category, prev.filename || 'new-resource') : '',
        contentUrl: newResourceType === 'url' ? '' : prev.contentUrl,
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: name === 'catalogId' ? (value ? parseInt(value) : '') : value,
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.catalogId || !formData.filename.trim()) {
      setError('Please fill in all required fields');
      return;
    }
    
    if (formData.resourceType === 'content' && !formData.content.trim()) {
      setError('Content is required for content-type resources');
      return;
    }
    
    if (formData.resourceType === 'url' && !formData.contentUrl.trim()) {
      setError('Content URL is required for URL-type resources');
      return;
    }
    
    try {
      setSaving(true);
      setError(null);

      let parsedMetadata;
      if (formData.metadata.trim()) {
        try {
          parsedMetadata = JSON.parse(formData.metadata);
        } catch {
          setError('Invalid JSON in metadata field');
          return;
        }
      }

      const createRequest: CreateResourceRequest = {
        catalogId: formData.catalogId as number,
        type: formData.category,  // formData.category actually contains the resource type
        filename: formData.filename,
        resourceType: formData.resourceType,
      };
      
      if (formData.resourceType === 'content') {
        createRequest.content = formData.content;
      } else {
        // Transform GitHub URLs to raw content URLs for better performance
        createRequest.contentUrl = transformGitHubUrl(formData.contentUrl);
      }
      
      if (parsedMetadata) {
        createRequest.metadata = parsedMetadata;
      }

      const resource = await resourceApi.create(createRequest);
      setSuccess(true);
      
      // Redirect to edit page after a short delay
      setTimeout(() => {
        router.push(`/resources/${resource.catalog_id}/${resource.category}/${resource.filename}`);
      }, 1500);

    } catch (err: unknown) {
      const errorMessage = err && typeof err === 'object' && 'error' in err 
        ? (err as { error: string }).error 
        : 'Failed to create resource';
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
            <Save className="h-6 w-6 text-green-600" />
          </div>
          <h2 className="mt-4 text-lg font-medium text-gray-900">Resource Created Successfully</h2>
          <p className="mt-2 text-gray-600">Redirecting to edit page...</p>
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
        <h1 className="text-3xl font-bold text-gray-900">Create New Resource</h1>
        <p className="mt-2 text-gray-600">
          Add a new resource to your ContextShare catalog
        </p>
      </div>

      {error && (
        <div className="mb-6">
          <Alert
            type="error"
            title="Error Creating Resource"
            message={error}
            onClose={() => setError(null)}
          />
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-medium text-gray-900">Resource Details</h2>
          
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label htmlFor="catalogId" className="block text-sm font-medium text-gray-700">
                Catalog *
              </label>
              <select
                id="catalogId"
                name="catalogId"
                required
                value={formData.catalogId}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select a catalog</option>
                {catalogs.map((catalog) => (
                  <option key={catalog.id} value={catalog.id}>
                    {catalog.display_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="category" className="block text-sm font-medium text-gray-700">
                Category *
              </label>
              <select
                id="category"
                name="category"
                required
                value={formData.category}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {categoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-2">
              <label htmlFor="resourceType" className="block text-sm font-medium text-gray-700">
                Resource Type *
              </label>
              <select
                id="resourceType"
                name="resourceType"
                required
                value={formData.resourceType}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="content">Content (stored locally)</option>
                <option value="url">URL (external reference)</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Choose whether to store content directly or reference an external URL
              </p>
            </div>

            <div className="lg:col-span-2">
              <label htmlFor="filename" className="block text-sm font-medium text-gray-700">
                Filename *
              </label>
              <input
                type="text"
                id="filename"
                name="filename"
                required
                value={formData.filename}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder={`e.g., my-resource${getFileExtensionForCategory(formData.category)}`}
              />
              <p className="mt-1 text-xs text-gray-500">
                The extension will be automatically added based on the category
              </p>
            </div>
          </div>
        </div>

        {formData.resourceType === 'url' && (
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-medium text-gray-900">External URL *</h2>
            <div>
              <label htmlFor="contentUrl" className="block text-sm font-medium text-gray-700">
                Resource URL
              </label>
              <input
                type="url"
                id="contentUrl"
                name="contentUrl"
                required={formData.resourceType === 'url'}
                value={formData.contentUrl}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="https://github.com/github/awesome-copilot/blob/main/instructions/blazor.instructions.md"
              />
              <p className="mt-1 text-xs text-gray-500">
                Enter the URL to the external resource. GitHub URLs will be automatically converted to raw content URLs.
              </p>
            </div>
          </div>
        )}

        {formData.resourceType === 'content' && (
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-medium text-gray-900">Content *</h2>
            <CodeEditor
              value={formData.content}
              onChange={(value) => setFormData(prev => ({ ...prev, content: value || '' }))}
              language={getLanguageForCategory(formData.category)}
              height="400px"
            />
          </div>
        )}

        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-medium text-gray-900">Metadata (JSON)</h2>
          <p className="mb-4 text-sm text-gray-600">
            Optional metadata for the resource in JSON format
          </p>
          <CodeEditor
            value={formData.metadata}
            onChange={(value) => setFormData(prev => ({ ...prev, metadata: value || '' }))}
            language="json"
            height="200px"
          />
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
            disabled={saving}
            className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Creating...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Create Resource
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NewResourcePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <NewResourceForm />
    </Suspense>
  );
}
