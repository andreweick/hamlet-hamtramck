/**
 * API Client for Hamlet Hamtramck Custom API
 *
 * This utility provides functions to interact with the custom Cloudflare Workers API.
 * Set the API_BASE_URL environment variable to configure the API endpoint.
 */

const API_BASE_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:8787';

interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
}

interface Document {
  id: string;
  title: string;
  updated_at: number;
}

interface HealthCheck {
  ok: boolean;
  ts: number;
}

/**
 * Check API health status
 */
export async function checkHealth(): Promise<ApiResponse<HealthCheck>> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    const data = await response.json();
    return {
      data,
      status: response.status,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500,
    };
  }
}

/**
 * Initialize the D1 database with sample data
 */
export async function initializeDatabase(): Promise<ApiResponse<{ ok: boolean; at: number }>> {
  try {
    const response = await fetch(`${API_BASE_URL}/d1/init`);
    const data = await response.json();
    return {
      data,
      status: response.status,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500,
    };
  }
}

/**
 * Fetch a document by ID
 */
export async function getDocument(id: string): Promise<ApiResponse<Document>> {
  try {
    const response = await fetch(`${API_BASE_URL}/d1/docs/${id}`);

    if (response.status === 404) {
      return {
        error: 'Document not found',
        status: 404,
      };
    }

    const data = await response.json();
    return {
      data,
      status: response.status,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500,
    };
  }
}

/**
 * Example: Fetch documents for blog posts
 * You can extend this with more API endpoints as needed
 */
export async function getDocuments(ids: string[]): Promise<Document[]> {
  const promises = ids.map(id => getDocument(id));
  const results = await Promise.all(promises);

  return results
    .filter(result => result.data !== undefined)
    .map(result => result.data as Document);
}
