import { useState, useEffect } from 'react';
import Head from 'next/head';
import Layout from '@/components/Layout';
import ChatInterface from '@/components/ChatInterface';
import DocumentUpload from '@/components/DocumentUpload';
import CaseSearch from '@/components/CaseSearch';
import { Document } from '@/types';

export default function Home() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeView, setActiveView] = useState<'chat' | 'upload' | 'search'>('chat');
  
  // Load documents from localStorage or API
  useEffect(() => {
    const loadDocuments = async () => {
      try {
        // Try to get uploaded documents from backend
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

  return (
    <>
      <Head>
        <title>LegalAI - Professional Legal Research Assistant</title>
        <meta name="description" content="AI-powered legal research with real case law and legislation access" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      
      <Layout activeView={activeView} setActiveView={setActiveView}>
        {activeView === 'chat' && (
          <ChatInterface documents={documents} />
        )}
        
        {activeView === 'upload' && (
          <DocumentUpload 
            documents={documents}
            onUpload={handleDocumentUpload}
          />
        )}
        
        {activeView === 'search' && (
          <CaseSearch />
        )}
      </Layout>
    </>
  );
}