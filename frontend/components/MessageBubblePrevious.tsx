import React from 'react';
import { Bot, User, FileText, Scale, Book, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface Source {
  type: 'document' | 'case' | 'legislation'
  citation_num?: number
  id?: string
  title?: string
  page?: number
  relevance?: number
  excerpt?: string
  citation?: string
  court?: string
  date?: string
  url?: string
  summary?: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
  timestamp: Date
}

interface MessageBubbleProps {
  message: Message
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const [showSources, setShowSources] = useState(false);
  const isUser = message.role === 'user';
  
  // Function to render content with properly formatted citations
  const renderContentWithCitations = (content: string) => {
    // Parse HTML-like citations in the content
    const parts = content.split(/(<sup>.*?<\/sup>)/g);
    
    return parts.map((part, index) => {
      // Check if this part is a citation
      if (part.match(/<sup>.*?<\/sup>/)) {
        // Extract the citation number
        const match = part.match(/href="#ref(\d+)">(\d+)/);
        if (match) {
          const citationNum = match[1];
          const displayNum = match[2];
          return (
            <sup key={index} className="text-blue-600 hover:text-blue-800 cursor-pointer ml-0.5">
              <a 
                href={`#ref${citationNum}`}
                onClick={(e) => {
                  e.preventDefault();
                  // Scroll to reference or show tooltip
                  setShowSources(true);
                }}
                className="text-xs font-medium"
              >
                [{displayNum}]
              </a>
            </sup>
          );
        }
      }
      
      // Check for reference section
      if (part.includes('### References')) {
        return (
          <div key={index} className="mt-4 pt-4 border-t border-gray-200">
            <h3 className="font-semibold text-sm text-gray-700 mb-2">References</h3>
            {renderReferences(part)}
          </div>
        );
      }
      
      // Regular text - check for markdown formatting
      return <span key={index} dangerouslySetInnerHTML={{ __html: formatMarkdown(part) }} />;
    });
  };
  
  // Format basic markdown
  const formatMarkdown = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br />');
  };
  
  // Render references section
  const renderReferences = (referencesText: string) => {
    const refs = referencesText.split(/<span id='ref\d+'>/).slice(1);
    return (
      <div className="space-y-1 text-xs text-gray-600">
        {refs.map((ref, idx) => {
          const cleanRef = ref.replace(/<\/span>.*/, '');
          return (
            <div key={idx} id={`ref${idx + 1}`} className="pl-4">
              {cleanRef}
            </div>
          );
        })}
      </div>
    );
  };
  
  // Get icon for source type
  const getSourceIcon = (type: string) => {
    switch (type) {
      case 'case':
        return <Scale className="w-3 h-3" />;
      case 'legislation':
        return <Book className="w-3 h-3" />;
      default:
        return <FileText className="w-3 h-3" />;
    }
  };
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`flex items-start max-w-3xl ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar */}
        <div className={`flex-shrink-0 ${isUser ? 'ml-3' : 'mr-3'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            isUser ? 'bg-blue-500' : 'bg-amber-500'
          }`}>
            {isUser ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-white" />}
          </div>
        </div>
        
        {/* Message Content */}
        <div className="flex-1">
          <div className={`rounded-lg px-4 py-3 ${
            isUser 
              ? 'bg-blue-500 text-white' 
              : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
          }`}>
            <div className="prose prose-sm max-w-none">
              {isUser ? (
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              ) : (
                <div className="space-y-2">
                  {renderContentWithCitations(message.content)}
                </div>
              )}
            </div>
          </div>
          
          {/* Sources Section - Only for assistant messages with sources */}
          {!isUser && message.sources && message.sources.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowSources(!showSources)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                {showSources ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                View {message.sources.length} source{message.sources.length !== 1 ? 's' : ''}
              </button>
              
              {showSources && (
                <div className="mt-2 space-y-2 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  {message.sources.map((source, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs">
                      <div className="flex items-center gap-1 mt-0.5">
                        {getSourceIcon(source.type)}
                        {source.citation_num && (
                          <span className="font-semibold text-blue-600">[{source.citation_num}]</span>
                        )}
                      </div>
                      <div className="flex-1">
                        {source.type === 'case' ? (
                          <div>
                            <div className="font-medium text-gray-900 dark:text-gray-100">
                              {source.title}
                            </div>
                            <div className="text-gray-500 dark:text-gray-400">
                              {source.citation && <span className="font-mono">{source.citation}</span>}
                              {source.court && <span> • {source.court}</span>}
                              {source.date && <span> • {new Date(source.date).toLocaleDateString()}</span>}
                            </div>
                            {source.summary && (
                              <div className="mt-1 text-gray-600 dark:text-gray-300">{source.summary}</div>
                            )}
                          </div>
                        ) : source.type === 'document' ? (
                          <div>
                            <div className="font-medium text-gray-900 dark:text-gray-100">
                              Document - Page {source.page}
                              {source.relevance && (
                                <span className="ml-2 text-blue-600">
                                  ({Math.round(source.relevance * 100)}% relevant)
                                </span>
                              )}
                            </div>
                            {source.excerpt && (
                              <div className="mt-1 text-gray-600 dark:text-gray-300">{source.excerpt}</div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div className="font-medium text-gray-900 dark:text-gray-100">
                              {source.title || 'Legislation'}
                            </div>
                            {source.citation && (
                              <div className="text-gray-500 dark:text-gray-400 font-mono">{source.citation}</div>
                            )}
                          </div>
                        )}
                        {source.url && (
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 mt-1 text-blue-600 hover:text-blue-800"
                          >
                            View source <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {/* Timestamp */}
          <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            {new Date(message.timestamp).toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;