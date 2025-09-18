'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { catalogApi, resourceApi } from '@/lib/api';
import { Catalog, CreateResourceRequest, ResourceCategory } from '@/types/api';
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

const categoryOptions: { value: ResourceCategory; label: string; icon: typeof FileText }[] = [
  { value: 'instructions', label: 'Instructions', icon: FileText },
  { value: 'prompts', label: 'Prompts', icon: MessageSquare },
  { value: 'chatmodes', label: 'Chat Modes', icon: MessageSquare },
  { value: 'tasks', label: 'Tasks', icon: Zap },
  { value: 'mcp', label: 'MCP Configs', icon: Settings },
];

const getFileExtensionForCategory = (category: ResourceCategory): string => {
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

const getDefaultContentForCategory = (category: ResourceCategory, filename: string): string => {
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

const getLanguageForCategory = (category: ResourceCategory): string => {
  switch (category) {
    case 'tasks':
    case 'mcp':
      return 'json';
    default:
      return 'markdown';
  }
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
    category: ResourceCategory;
    filename: string;
    content: string;
    metadata: string;
  }>({
    catalogId: '',
    category: 'instructions',
    filename: '',
    content: '',
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
        const categoryParam = searchParams.get('category') as ResourceCategory;
        
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
            content: getDefaultContentForCategory(categoryParam, 'new-resource')
          }));
        } else {
          setFormData(prev => ({ 
            ...prev, 
            content: getDefaultContentForCategory('instructions', 'new-resource')
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
      const newCategory = value as ResourceCategory;
      const newFilename = formData.filename 
        ? formData.filename.replace(/\.[^.]+$/, '') + getFileExtensionForCategory(newCategory)
        : '';
      
      setFormData(prev => ({
        ...prev,
        category: newCategory,
        filename: newFilename,
        content: getDefaultContentForCategory(newCategory, newFilename || 'new-resource'),
      }));
    } else if (name === 'filename') {
      const baseFilename = value.replace(/\.[^.]+$/, ''); // Remove any extension
      const newFilename = baseFilename + getFileExtensionForCategory(formData.category);
      
      setFormData(prev => ({
        ...prev,
        filename: newFilename,
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
    
    if (!formData.catalogId || !formData.filename.trim() || !formData.content.trim()) {
      setError('Please fill in all required fields');
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
        category: formData.category,
        filename: formData.filename,
        content: formData.content,
      };
      
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

        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-medium text-gray-900">Content *</h2>
          <CodeEditor
            value={formData.content}
            onChange={(value) => setFormData(prev => ({ ...prev, content: value || '' }))}
            language={getLanguageForCategory(formData.category)}
            height="400px"
          />
        </div>

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