import axios, { AxiosResponse } from 'axios';
import {
  Catalog,
  CreateCatalogRequest,
  Resource,
  CreateResourceRequest,
  UpdateResourceRequest,
  ResourceContent,
  ResourceType,
  ApiError
} from '@/types/api';

// Configure the base URL for the ContextShare server
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add authentication header
api.interceptors.request.use(
  (config) => {
    // Add API key from localStorage if available
    if (typeof window !== 'undefined') {
      const apiKey = localStorage.getItem('admin_api_key');
      if (apiKey) {
        config.headers['X-Admin-API-Key'] = apiKey;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle authentication errors by redirecting to login
    if (error.response?.status === 401 || error.response?.status === 403) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('admin_api_key');
        const loginPath = window.location.pathname.startsWith('/admin-ui') ? '/admin-ui/login' : '/login';
        window.location.href = loginPath;
      }
    }
    
    if (error.response?.data) {
      throw error.response.data as ApiError;
    }
    throw { error: 'network_error', details: [error.message] } as ApiError;
  }
);

// Catalog API methods
export const catalogApi = {
  // List all catalogs
  async list(): Promise<Catalog[]> {
    const response: AxiosResponse<Catalog[]> = await api.get('/admin/catalogs');
    return response.data;
  },

  // Create a new catalog
  async create(catalog: CreateCatalogRequest): Promise<Catalog> {
    const response: AxiosResponse<Catalog> = await api.post('/admin/catalogs', catalog);
    return response.data;
  },

  // List resources in a catalog
  async getResources(catalogId: number): Promise<Resource[]> {
    const response: AxiosResponse<Resource[]> = await api.get(`/admin/catalogs/${catalogId}/resources`);
    return response.data;
  },
};

// Resource API methods
export const resourceApi = {
  // Create a new resource
  async create(resource: CreateResourceRequest): Promise<Resource> {
    const response: AxiosResponse<Resource> = await api.post('/admin/resources', resource);
    return response.data;
  },

  // Update a resource
  async update(
    catalogId: number,
    category: ResourceType,
    filename: string,
    update: UpdateResourceRequest
  ): Promise<{ message: string }> {
    const response = await api.put(`/admin/resources/${catalogId}/${category}/${filename}`, update);
    return response.data;
  },

  // Delete a resource
  async delete(
    catalogId: number,
    category: ResourceType,
    filename: string
  ): Promise<{ message: string }> {
    const response = await api.delete(`/admin/resources/${catalogId}/${category}/${filename}`);
    return response.data;
  },

  // Get resource content
  async getContent(
    catalogId: number,
    category: ResourceType,
    filename: string
  ): Promise<ResourceContent> {
    const response: AxiosResponse<ResourceContent> = await api.get(
      `/admin/resources/${catalogId}/${category}/${filename}`
    );
    return response.data;
  },
};

// Health check
export const healthApi = {
  async check(): Promise<{ status: string }> {
    const response = await api.get('/healthz');
    return response.data;
  },
};

export default api;
