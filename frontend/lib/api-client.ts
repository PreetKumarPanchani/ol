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

  // RAG API Methods
  
  async queryWithRAG(
    query: string,
    searchTypes: string[] = ['cases', 'legislation'],
    embeddingModel: string = 'minilm',  // Default to MiniLM
    sessionId?: string,
    kRetrieval: number = 5,
    autoCleanup: boolean = true
  ) {
    const response = await this.client.post('/api/rag/query', {
      query,
      search_types: searchTypes,
      embedding_model: embeddingModel,
      session_id: sessionId,
      k_retrieval: kRetrieval,
      auto_cleanup: autoCleanup
    });
    
    return response.data;
  }

  async createRAGSession() {
    const response = await this.client.post('/api/rag/session/create');
    return response.data;
  }

  async cleanupRAGSession(sessionId: string) {
    const response = await this.client.delete(`/api/rag/session/${sessionId}`);
    return response.data;
  }

  async listRAGSessions() {
    const response = await this.client.get('/api/rag/sessions');
    return response.data;
  }

  async getRAGConfig() {
    const response = await this.client.get('/api/rag/config');
    return response.data;
  }

  async cleanupExpiredRAGSessions() {
    const response = await this.client.post('/api/rag/cleanup/expired');
    return response.data;
  }
}

export const apiClient = new ApiClient();