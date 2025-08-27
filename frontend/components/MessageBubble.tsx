// components/MessageBubble.tsx
import { Bot, User, Copy, Share2, Bookmark } from 'lucide-react';
import { Message } from '@/types/index';

interface MessageBubbleProps {
  message: Message;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isAssistant = message.role === 'assistant';
  
  return (
    <div className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}>
      <div className="flex max-w-xs md:max-w-md lg:max-w-lg">
        {isAssistant && (
          <div className="flex-shrink-0 mr-2">
            <div className="w-8 h-8 rounded-full bg-legal-gold flex items-center justify-center">
              <Bot className="h-5 w-5 text-legal-navy" />
            </div>
          </div>
        )}
        
        <div className={`rounded-2xl px-4 py-3 ${isAssistant ? 'bg-gray-100 dark:bg-gray-700 rounded-bl-md' : 'bg-legal-navy text-white rounded-br-md'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium">
              {isAssistant ? 'LegalAI' : 'You'}
            </span>
            <div className="flex space-x-1">
              <button className="p-1 hover:opacity-70">
                <Copy className="h-3 w-3" />
              </button>
              <button className="p-1 hover:opacity-70">
                <Share2 className="h-3 w-3" />
              </button>
              <button className="p-1 hover:opacity-70">
                <Bookmark className="h-3 w-3" />
              </button>
            </div>
          </div>
          
          <div className="text-sm">
            {message.content.split('\n').map((line, i) => (
              <p key={i} className={i > 0 ? 'mt-2' : ''}>{line}</p>
            ))}
          </div>
          
          {message.sources && message.sources.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
              <p className="text-xs font-medium mb-1">Sources:</p>
              <ul className="text-xs space-y-1">
                {message.sources.map((source, index) => (
                  <li key={index} className="flex">
                    <span className="text-legal-sage dark:text-legal-gold mr-1">•</span>
                    <span className="font-mono">{source}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          <div className="text-xs opacity-70 mt-2 text-right">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
        
        {!isAssistant && (
          <div className="flex-shrink-0 ml-2">
            <div className="w-8 h-8 rounded-full bg-legal-sage flex items-center justify-center">
              <User className="h-5 w-5 text-white" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
