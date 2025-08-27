// types/index.ts
export interface Document {
    id: string;
    name: string;
    type: string;
    date: string;
  }
  
  export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    sources?: string[];
  }
  
  export interface NavItem {
    id: string;
    label: string;
    icon: React.ComponentType<any>;
    path?: string;
  }