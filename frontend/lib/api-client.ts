import axios, { AxiosInstance, AxiosProgressEvent } from 'axios';

class ApiClient {
  private client: AxiosInstance;
  private sessionId: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  // Chat API
  async sendMessage(message: string, searchDocuments: boolean = true) {
    const response = await this.client.post('/api/chat', {
      message,
      session_id: this.sessionId,
      search_documents: searchDocuments
    });
    
    this.sessionId = response.data.session_id;
    return response.data;
  }

  // Document Upload
  async uploadDocument(formData: FormData, onProgress?: (event: AxiosProgressEvent) => void) {
    return this.client.post('/api/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress
    });
  }

  // Case Law Search (Real National Archives API)
  async searchCases(params: { query: string; limit?: number }) {
    return this.client.post('/api/search/cases', {
      query: params.query,
      limit: params.limit || 10
    });
  }

  // Document Search
  async searchDocuments(params: { query: string; limit?: number; threshold?: number }) {
    return this.client.post('/api/search/documents', {
      query: params.query,
      limit: params.limit || 10,
      threshold: params.threshold || 0.7
    });
  }

  // Legislation Search
  async searchLegislation(params: { query: string; limit?: number }) {
    return this.client.post('/api/search/legislation', {
      query: params.query,
      limit: params.limit || 10
    });
  }
}

export const apiClient = new ApiClient();