// types/index.ts
export interface Document {
  id: string;
  name: string;
  type: string;
  date: string;
}

export interface Source {
  type: string;
  title?: string;
  citation?: string;
  court?: string;
  page?: number;
  relevance?: number;
}

export interface Citation {
  number: number;
  source_id: string;
  type: string;
  content_excerpt: string;
  metadata: any;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: string[] | Source[]; // Support both string arrays and Source arrays
  citations?: Citation[]; // Support RAG citations
}

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
  path?: string;
}