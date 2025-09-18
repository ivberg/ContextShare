'use client';

import React, { useEffect, useState } from 'react';
import { healthApi } from '@/lib/api';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Alert from '@/components/ui/Alert';
import { Activity, CheckCircle, XCircle, Clock, Server, Database } from 'lucide-react';

interface HealthStatus {
  status: string;
  timestamp: string;
  responseTime: number;
}

export default function HealthPage() {
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkHealth = async () => {
    const startTime = Date.now();
    try {
      setError(null);
      await healthApi.check();
      const responseTime = Date.now() - startTime;
      
      setHealthStatus({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        responseTime,
      });
      setLastChecked(new Date());
    } catch (err: unknown) {
      const responseTime = Date.now() - startTime;
      setHealthStatus({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        responseTime,
      });
      const errorMessage = err && typeof err === 'object' && 'error' in err 
        ? (err as { error: string }).error 
        : 'Health check failed';
      setError(errorMessage);
      setLastChecked(new Date());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
    
    // Set up automatic health checks every 30 seconds
    const interval = setInterval(checkHealth, 30000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Server Health Check</h1>
        <p className="mt-2 text-gray-600">
          Monitor the status and performance of the ContextShare server
        </p>
      </div>

      {/* Main Status Card */}
      <div className="mb-8">
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Activity className="h-8 w-8 text-gray-500" />
              <div className="ml-4">
                <h2 className="text-lg font-medium text-gray-900">Server Status</h2>
                <p className="text-sm text-gray-600">Current health check status</p>
              </div>
            </div>
            
            <button
              onClick={checkHealth}
              disabled={loading}
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Checking...
                </>
              ) : (
                'Check Now'
              )}
            </button>
          </div>

          {loading && !healthStatus ? (
            <div className="mt-6 text-center">
              <LoadingSpinner size="lg" />
              <p className="mt-4 text-gray-600">Performing health check...</p>
            </div>
          ) : healthStatus ? (
            <div className="mt-6">
              <div className="flex items-center">
                {healthStatus.status === 'healthy' ? (
                  <CheckCircle className="h-6 w-6 text-green-500" />
                ) : (
                  <XCircle className="h-6 w-6 text-red-500" />
                )}
                <div className="ml-3">
                  <p className={`text-lg font-medium ${
                    healthStatus.status === 'healthy' ? 'text-green-900' : 'text-red-900'
                  }`}>
                    {healthStatus.status === 'healthy' ? 'Server is Healthy' : 'Server is Unhealthy'}
                  </p>
                  <p className="text-sm text-gray-600">
                    Response time: {healthStatus.responseTime}ms
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {lastChecked && (
            <div className="mt-4 flex items-center text-sm text-gray-500">
              <Clock className="mr-1 h-4 w-4" />
              Last checked: {lastChecked.toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-8">
          <Alert
            type="error"
            title="Health Check Failed"
            message={error}
            onClose={() => setError(null)}
          />
        </div>
      )}

      {/* Server Information */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-center">
            <Server className="h-6 w-6 text-blue-500" />
            <h3 className="ml-2 text-lg font-medium text-gray-900">Server Information</h3>
          </div>
          
          <div className="mt-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-700">Base URL</p>
              <p className="text-sm text-gray-600 font-mono">
                {process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000'}
              </p>
            </div>
            
            <div>
              <p className="text-sm font-medium text-gray-700">Health Endpoint</p>
              <p className="text-sm text-gray-600 font-mono">/healthz</p>
            </div>
            
            <div>
              <p className="text-sm font-medium text-gray-700">Admin API</p>
              <p className="text-sm text-gray-600 font-mono">/admin/*</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-center">
            <Database className="h-6 w-6 text-green-500" />
            <h3 className="ml-2 text-lg font-medium text-gray-900">Expected Features</h3>
          </div>
          
          <div className="mt-4 space-y-3">
            <div className="flex items-center">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="ml-2 text-sm text-gray-600">Health monitoring (/healthz)</span>
            </div>
            
            <div className="flex items-center">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="ml-2 text-sm text-gray-600">Catalog management</span>
            </div>
            
            <div className="flex items-center">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="ml-2 text-sm text-gray-600">Resource CRUD operations</span>
            </div>
            
            <div className="flex items-center">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="ml-2 text-sm text-gray-600">SQLite database support</span>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      {healthStatus && (
        <div className="mt-8">
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="text-lg font-medium text-gray-900">Performance Metrics</h3>
            
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-sm font-medium text-gray-700">Response Time</p>
                <p className={`text-2xl font-bold ${
                  healthStatus.responseTime < 100 ? 'text-green-600' :
                  healthStatus.responseTime < 500 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {healthStatus.responseTime}ms
                </p>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-700">Status</p>
                <p className={`text-2xl font-bold ${
                  healthStatus.status === 'healthy' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {healthStatus.status === 'healthy' ? 'UP' : 'DOWN'}
                </p>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-700">Auto Check</p>
                <p className="text-2xl font-bold text-blue-600">30s</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-8">
        <div className="rounded-lg bg-blue-50 p-6">
          <h3 className="text-lg font-medium text-blue-900">Server Setup Instructions</h3>
          <div className="mt-4 text-sm text-blue-800">
            <p className="mb-2">To start the ContextShare server in database mode:</p>
            <pre className="bg-blue-100 p-3 rounded font-mono text-xs overflow-x-auto">
{`cd server
$env:MODE = "database"
$env:DATABASE_PATH = "./catalog.db"
$env:PORT = "3000"
npm run build
npm start`}
            </pre>
            <p className="mt-2">
              The server should be accessible at{' '}
              <code className="bg-blue-100 px-1 py-0.5 rounded">
                {process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000'}
              </code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}