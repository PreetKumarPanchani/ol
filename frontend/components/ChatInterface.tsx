import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, Mic, Paperclip, Bot, User, Loader2 } from 'lucide-react';
import MessageBubble from './MessageBubble';
import { Document, Message } from '@/types';
import { apiClient } from '@/lib/api-client';
import { useVoice } from '@/hooks/useVoice';

interface ChatInterfaceProps {
  documents: Document[];
}

export default function ChatInterface({ documents }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Voice integration
  const { 
    isListening, 
    transcript, 
    startListening, 
    stopListening,
    speak 
  } = useVoice();

  useEffect(() => {
    // Welcome message
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: `Welcome to LegalAI Research Assistant. I have access to:
• UK Case Law via National Archives API
• UK Legislation database
• ${documents.length} uploaded document(s) for analysis

I can provide legal research with proper citations and references. How may I assist you today?`,
      timestamp: new Date()
    }]);
  }, [documents.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle voice transcript
  useEffect(() => {
    if (transcript) {
      setInput(transcript);
    }
  }, [transcript]);

  const sendMessage = async (): Promise<void> => {
    if (!input.trim() || loading) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    
    try {
      // Call real backend API
      const response = await apiClient.sendMessage(input, documents.length > 0);
      
      const assistantMessage: Message = {
        id: Date.now().toString() + '-assistant',
        role: 'assistant',
        content: response.response,
        sources: response.sources?.map((s: any) => {
          if (s.type === 'case') {
            return `${s.title} [${s.citation}] - ${s.court}`;
          } else if (s.type === 'document') {
            return `Document: Page ${s.page} (${Math.round(s.relevance * 100)}% relevance)`;
          }
          return s.title || 'Unknown source';
        }),
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
      // Speak first part of response
      if (response.response) {
        speak(response.response.substring(0, 200));
      }
    } catch (error) {
      console.error('API Error:', error);
      
      const errorMessage: Message = {
        id: Date.now().toString() + '-error',
        role: 'assistant',
        content: 'I apologize, but I encountered an error processing your request. Please ensure the backend server is running and try again.',
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleMicClick = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-lg shadow-md">
      {/* Chat Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-t-lg">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center">
              <Bot className="h-6 w-6 text-white" />
            </div>
          </div>
          <div className="ml-3">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Legal Research Chat</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {documents.length} document{documents.length !== 1 ? 's' : ''} indexed • Real-time case law access
            </p>
          </div>
        </div>
      </div>
      
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        
        {loading && (
          <div className="flex items-center justify-start">
            <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl rounded-bl-md px-4 py-3 max-w-xs md:max-w-md">
              <div className="flex items-center space-x-2">
                <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                <span className="text-sm">Searching case law and documents...</span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input Area */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-b-lg">
        <div className="flex items-center">
          <button 
            className="p-2 text-gray-500 dark:text-gray-400 hover:text-amber-500"
            onClick={() => document.getElementById('file-upload')?.click()}
          >
            <Paperclip className="h-5 w-5" />
            <input 
              id="file-upload" 
              type="file" 
              hidden 
              accept=".pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  // Handle file upload
                  console.log('File selected:', file.name);
                }
              }}
            />
          </button>
          
          <div className="flex-1 mx-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about case law, legislation, or your documents..."
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-amber-500 dark:bg-gray-800 dark:text-white"
              rows={1}
            />
          </div>
          
          <div className="flex space-x-2">
            <button 
              className={`p-2 ${isListening ? 'text-red-500 animate-pulse' : 'text-gray-500 dark:text-gray-400'} hover:text-amber-500`}
              onClick={handleMicClick}
            >
              <Mic className="h-5 w-5" />
            </button>
            
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
        
        <div className="mt-2 text-xs text-center text-gray-500 dark:text-gray-400">
          {input.length} / 5000 | Shift+Enter for new line | {isListening ? 'Listening...' : 'Click mic to speak'}
        </div>
      </div>
    </div>
  );
}