import { useState, useEffect } from 'react';
import Head from 'next/head';
import Layout from '@/components/Layout';
import ChatInterface from '@/components/ChatInterface';
import DocumentUpload from '@/components/DocumentUpload';
import CaseSearch from '@/components/CaseSearch';
import { Document } from '@/types';

// Placeholder components for additional views
const LegislationSearch = () => (
  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
    <h2 className="text-2xl font-bold mb-4">Legislation Search</h2>
    <p className="text-gray-600 dark:text-gray-400">
      Search UK legislation and statutes. Coming soon...
    </p>
  </div>
);

const Settings = () => (
  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
    <h2 className="text-2xl font-bold mb-4">Settings</h2>
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">API Configuration</label>
        <input type="text" placeholder="OpenAI API Key" className="w-full p-2 border rounded" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">Theme</label>
        <select className="w-full p-2 border rounded">
          <option>Light</option>
          <option>Dark</option>
          <option>System</option>
        </select>
      </div>
    </div>
  </div>
);

export default function Home() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeView, setActiveView] = useState<string>('chat');
  
  // Load documents from localStorage or API
  useEffect(() => {
    const loadDocuments = async () => {
      try {
        // Try to get uploaded documents from localStorage
        const storedDocs = localStorage.getItem('uploadedDocuments');
        if (storedDocs) {
          setDocuments(JSON.parse(storedDocs));
        }
      } catch (error) {
        console.error('Error loading documents:', error);
      }
    };
    
    loadDocuments();
  }, []);

  const handleDocumentUpload = (newDocs: Document[]) => {
    setDocuments(newDocs);
    localStorage.setItem('uploadedDocuments', JSON.stringify(newDocs));
    setActiveView('chat'); // Switch back to chat after upload
  };

  const renderView = () => {
    switch(activeView) {
      case 'chat':
        return <ChatInterface documents={documents} />;
      case 'upload':
        return <DocumentUpload onUpload={handleDocumentUpload} />;
      case 'search':
        return <CaseSearch />;
      case 'legislation':
        return <LegislationSearch />;
      case 'settings':
        return <Settings />;
      default:
        return <ChatInterface documents={documents} />;
    }
  };

  return (
    <>
      <Head>
        <title>LegalAI - Professional Legal Research Assistant</title>
        <meta name="description" content="AI-powered legal research with real case law and legislation access" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      
      <Layout activeView={activeView} setActiveView={setActiveView}>
        {renderView()}
      </Layout>
    </>
  );
}