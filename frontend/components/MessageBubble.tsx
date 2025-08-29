import React, { useState, useRef, useEffect } from 'react';
import { Bot, User, FileText, Scale, Book, ExternalLink, ChevronDown, ChevronUp, Info, X } from 'lucide-react';

interface Citation {
  number: number;
  source_id: string;
  type: string;
  chunk_content: string;  // Full chunk text
  content_excerpt: string;  // Short excerpt
  metadata: {
    title?: string;
    citation?: string;
    court?: string;
    date?: string;
    url?: string;
    page?: number;
  };
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  sources?: any[];
  timestamp: Date;
}

interface MessageBubbleProps {
  message: Message;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const [showSources, setShowSources] = useState(false);
  const [hoveredCitation, setHoveredCitation] = useState<number | null>(null);
  const [expandedCitation, setExpandedCitation] = useState<number | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const isUser = message.role === 'user';
  
  // Tooltip ref for positioning
  const tooltipRef = useRef<HTMLDivElement>(null);
  
  // Handle citation hover
  const handleCitationHover = (citationNum: number, event: React.MouseEvent) => {
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    setTooltipPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 10
    });
    setHoveredCitation(citationNum);
  };
  
  // Handle citation click to expand
  const handleCitationClick = (citationNum: number, event: React.MouseEvent) => {
    event.preventDefault();
    setExpandedCitation(expandedCitation === citationNum ? null : citationNum);
    setHoveredCitation(null);
  };
  
  // Function to render content with interactive citations
  const renderContentWithCitations = (content: string) => {
    if (!message.citations || message.citations.length === 0) {
      return <span>{content}</span>;
    }
    
    // Split content by citation pattern [1], [2], etc.
    const parts = content.split(/(\[\d+\])/g);
    
    return parts.map((part, index) => {
      // Check if this part is a citation
      const citationMatch = part.match(/\[(\d+)\]/);
      if (citationMatch) {
        const citationNum = parseInt(citationMatch[1]);
        const citation = message.citations?.find(c => c.number === citationNum);
        
        if (citation) {
          return (
            <span key={index} className="relative inline-block">
              <sup 
                className="text-blue-600 hover:text-blue-800 cursor-pointer ml-0.5 font-medium hover:bg-blue-50 px-1 rounded transition-all"
                onMouseEnter={(e) => handleCitationHover(citationNum, e)}
                onMouseLeave={() => setHoveredCitation(null)}
                onClick={(e) => handleCitationClick(citationNum, e)}
              >
                [{citationNum}]
              </sup>
            </span>
          );
        }
      }
      
      // Regular text
      return <span key={index}>{part}</span>;
    });
  };
  
  // Get icon for source type
  const getSourceIcon = (type: string) => {
    switch (type) {
      case 'case':
        return <Scale className="w-4 h-4" />;
      case 'legislation':
        return <Book className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };
  
  // Get citation by number
  const getCitationByNumber = (num: number) => {
    return message.citations?.find(c => c.number === num);
  };
  
  return (
    <>
      {/* Main message bubble */}
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
            
            {/* Expanded Citation Display */}
            {expandedCitation && getCitationByNumber(expandedCitation) && (
              <div className="mt-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {getSourceIcon(getCitationByNumber(expandedCitation)!.type)}
                    <span className="font-semibold text-sm">
                      Citation [{expandedCitation}]
                    </span>
                    {getCitationByNumber(expandedCitation)!.metadata.title && (
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        - {getCitationByNumber(expandedCitation)!.metadata.title}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setExpandedCitation(null)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                {/* Full chunk content */}
                <div className="bg-white dark:bg-gray-800 rounded p-3 max-h-64 overflow-y-auto">
                  <pre className="whitespace-pre-wrap text-xs font-mono text-gray-700 dark:text-gray-300">
                    {getCitationByNumber(expandedCitation)!.chunk_content}
                  </pre>
                </div>
                
                {/* Metadata */}
                <div className="mt-3 text-xs text-gray-600 dark:text-gray-400 space-y-1">
                  {getCitationByNumber(expandedCitation)!.metadata.citation && (
                    <div>Citation: {getCitationByNumber(expandedCitation)!.metadata.citation}</div>
                  )}
                  {getCitationByNumber(expandedCitation)!.metadata.court && (
                    <div>Court: {getCitationByNumber(expandedCitation)!.metadata.court}</div>
                  )}
                  {getCitationByNumber(expandedCitation)!.metadata.date && (
                    <div>Date: {new Date(getCitationByNumber(expandedCitation)!.metadata.date).toLocaleDateString()}</div>
                  )}
                </div>
              </div>
            )}
            
            {/* Compact Sources Section */}
            {!isUser && message.citations && message.citations.length > 0 && (
              <div className="mt-2">
                <button
                  onClick={() => setShowSources(!showSources)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {showSources ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  View all {message.citations.length} citation{message.citations.length !== 1 ? 's' : ''}
                </button>
                
                {showSources && (
                  <div className="mt-2 space-y-2 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                    {message.citations.map((citation) => (
                      <div key={citation.number} className="flex items-start gap-2 text-xs">
                        <div className="flex items-center gap-1 mt-0.5">
                          {getSourceIcon(citation.type)}
                          <span className="font-semibold text-blue-600">[{citation.number}]</span>
                        </div>
                        <div className="flex-1">
                          {citation.type === 'case' ? (
                            <div>
                              <div className="font-medium text-gray-900 dark:text-gray-100">
                                {citation.metadata.title}
                              </div>
                              <div className="text-gray-500 dark:text-gray-400">
                                {citation.metadata.citation && <span className="font-mono">{citation.metadata.citation}</span>}
                                {citation.metadata.court && <span> • {citation.metadata.court}</span>}
                              </div>
                              <div className="mt-1 text-gray-600 dark:text-gray-300">
                                {citation.content_excerpt}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="font-medium text-gray-900 dark:text-gray-100">
                                {citation.type === 'legislation' ? 'Legislation' : 'Document'}
                              </div>
                              <div className="mt-1 text-gray-600 dark:text-gray-300">
                                {citation.content_excerpt}
                              </div>
                            </div>
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
      
      {/* Hover Tooltip */}
      {hoveredCitation && getCitationByNumber(hoveredCitation) && (
        <div
          ref={tooltipRef}
          className="fixed z-50 pointer-events-none"
          style={{
            left: tooltipPosition.x,
            top: tooltipPosition.y,
            transform: 'translate(-50%, -100%)'
          }}
        >
          <div className="bg-gray-900 text-white rounded-lg p-3 max-w-md shadow-xl mb-2">
            <div className="flex items-center gap-1 mb-2 text-xs font-semibold">
              {getSourceIcon(getCitationByNumber(hoveredCitation)!.type)}
              <span>Citation [{hoveredCitation}]</span>
            </div>
            <div className="text-xs">
              {/* Show first 3 lines of chunk content */}
              <pre className="whitespace-pre-wrap font-sans">
                {getCitationByNumber(hoveredCitation)!.chunk_content
                  .split('\n')
                  .slice(0, 3)
                  .join('\n')}
                {getCitationByNumber(hoveredCitation)!.chunk_content.split('\n').length > 3 && '...'}
              </pre>
            </div>
            <div className="text-xs text-gray-400 mt-2">
              Click to view full text
            </div>
          </div>
          {/* Arrow pointing down */}
          <div className="absolute left-1/2 -translate-x-1/2 -bottom-2">
            <div className="w-0 h-0 border-l-8 border-l-transparent border-r-8 border-r-transparent border-t-8 border-t-gray-900"></div>
          </div>
        </div>
      )}
    </>
  );
};

export default MessageBubble;