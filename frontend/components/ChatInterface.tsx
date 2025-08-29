import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, Mic, MicOff, Volume2, VolumeX, Paperclip, Bot, User, Loader2, Zap, FileText } from 'lucide-react';
import MessageBubble from './MessageBubble';
import { Document, Message, Source, Citation } from '@/types';
import { apiClient } from '@/lib/api-client';
import useSpeechRecognition from '@/lib/useSpeechRecognition';
import useSpeechSynthesis from '@/lib/useSpeechSynthesis';

interface ChatInterfaceProps {
  documents: Document[];
}

export default function ChatInterface({ documents }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true);
  const [useRAG, setUseRAG] = useState<boolean>(true); // Use RAG by default
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Advanced Speech Recognition with OpenAI Whisper fallback
  const {
    isListening,
    transcript,
    error: speechError,
    toggleListening,
    toggleRecognitionType,
    useOpenAI: useOpenAIRecognition,
    stopListening
  } = useSpeechRecognition({
    onTranscriptReady: (text: string) => {
      // When transcript is ready, set it as input
      if (text && text.trim()) {
        setInput(text);
        // Optionally auto-send after voice input
        // sendMessage(text);
      }
    },
    language: 'en-GB' // UK English for legal context
  });

  // Advanced Speech Synthesis with OpenAI TTS fallback
  const {
    speak,
    cancel: cancelSpeech,
    isSpeaking,
    toggleSynthesisType,
    useOpenAI: useOpenAITTS,
    error: ttsError
  } = useSpeechSynthesis({
    voice: 'nova', // Professional voice for legal content
    speed: 0.95
  });

  useEffect(() => {
    // Welcome message
    const welcomeMessage: Message = {
      id: 'welcome',
      role: 'assistant',
      content: `Legal research with citations and references.
• UK Case Law from National Archives
• UK Legislation database
• ${documents.length} uploaded document(s) for analysis
• ${useRAG ? '🚀 RAG Mode: AI-powered research with citations' : '📁 Document Mode: Traditional search'}
`,
      timestamp: new Date()
    };
    setMessages([welcomeMessage]);
    
    // Optionally speak welcome message
    if (voiceEnabled) {
      speak("Welcome to Legal AI. I can help you with legal research including UK case law and legislation.");
    }
  }, [documents.length, useRAG]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Update input when transcript changes
  useEffect(() => {
    if (transcript && transcript.trim()) {
      setInput(transcript);
    }
  }, [transcript]);

  const sendMessage = async (messageText?: string): Promise<void> => {
    const textToSend = messageText || input;
    if (!textToSend.trim() || loading) return;
    
    // Stop listening if still active
    if (isListening) {
      stopListening();
    }
    
    // Cancel any ongoing speech
    if (isSpeaking) {
      cancelSpeech();
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: textToSend,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      let response;
      
      if (useRAG) {
        // Use stateless RAG pipeline with citations
        response = await apiClient.queryWithRAG(
          textToSend,
          ['cases', 'legislation'], // Default search types
          'minilm' // Default to MiniLM for local processing
        );
        
        const assistantMessage: Message = {
          id: Date.now().toString() + '-assistant',
          role: 'assistant',
          content: response.response, // Already has [1][2] citations
          citations: response.citations, // Store RAG citations
          sources: response.citations?.map((citation: Citation) => 
            `${citation.number}. ${citation.type}: ${citation.content_excerpt}`
          ) as string[] || [],
          timestamp: new Date()
        };
        
        setMessages(prev => [...prev, assistantMessage]);
        
        // Speak response if voice is enabled
        if (voiceEnabled && response.response) {
          // Extract first important part for speech (limit to prevent long speeches)
          const speechText = response.response.substring(0, 300);
          speak(speechText);
        }
        
      } else {
        // Use existing chat endpoint
        response = await apiClient.sendMessage(textToSend, documents.length > 0);

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
        
        // Speak response if voice is enabled
        if (voiceEnabled && response.response) {
          // Extract first important part for speech (limit to prevent long speeches)
          const speechText = response.response.substring(0, 300);
          speak(speechText);
        }
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
      
      if (voiceEnabled) {
        speak("I encountered an error. Please try again.");
      }
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
    // Cancel speech when starting to listen
    if (!isListening && isSpeaking) {
      cancelSpeech();
    }
    toggleListening();
  };

  const handleVoiceToggle = () => {
    setVoiceEnabled(!voiceEnabled);
    // Cancel any ongoing speech when disabling
    if (voiceEnabled && isSpeaking) {
      cancelSpeech();
    }
  };

  const handleInterruptSpeech = () => {
    if (isSpeaking) {
      cancelSpeech();
    }
  };

  const handleRAGToggle = () => {
    setUseRAG(!useRAG);
    // Update welcome message when switching modes
    const updatedWelcome = messages.find(msg => msg.id === 'welcome');
    if (updatedWelcome) {
      const newWelcomeMessage: Message = {
        ...updatedWelcome,
        content: `Legal research with citations and references.
• UK Case Law from National Archives
• UK Legislation database
• ${documents.length} uploaded document(s) for analysis
• ${!useRAG ? '🚀 RAG Mode: AI-powered research with citations' : '📁 Document Mode: Traditional search'}
`
      };
      setMessages(prev => prev.map(msg => msg.id === 'welcome' ? newWelcomeMessage : msg));
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-lg shadow-md">
      {/* Chat Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center">
                <Bot className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="ml-3">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Legal Research Chat</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {documents.length} document{documents.length !== 1 ? 's' : ''} 
                {/* Voice: {useOpenAIRecognition ? 'Whisper' : 'Browser'} • */}
                {/* TTS: {useOpenAITTS ? 'OpenAI' : 'Browser'} */}
              </p>
            </div>
          </div>
          
          {/* RAG Toggle and Voice Controls */}
          <div className="flex items-center gap-2">
            {/* RAG Mode Toggle */}
            <button
              onClick={handleRAGToggle}
              className={`px-3 py-2 rounded-lg transition-all flex items-center gap-2 ${
                useRAG 
                  ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-md' 
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300'
              }`}
              title={useRAG ? 'Switch to Document Mode' : 'Switch to RAG Mode'}
            >
              {useRAG ? (
                <>
                  <Zap className="w-4 h-4" />
                  <span className="text-xs font-medium">RAG Mode</span>
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  <span className="text-xs font-medium">Doc Mode</span>
                </>
              )}
            </button>
            
            {/* Voice Output Toggle */}
          <button
              onClick={handleVoiceToggle}
              className={`p-2 rounded-lg transition-colors ${
                voiceEnabled 
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' 
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
              }`}
              title={voiceEnabled ? 'Disable voice output' : 'Enable voice output'}
            >
              {voiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
            
            {/* Interrupt Speech Button (only show when speaking) */}
            {isSpeaking && (
              <button
                onClick={handleInterruptSpeech}
                className="p-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg animate-pulse"
                title="Stop speaking"
              >
                <VolumeX className="w-5 h-5" />
              </button>
            )}
            
            {/* Switch Recognition Type */}
            <button
              onClick={toggleRecognitionType}
              className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded"
              title="Toggle recognition engine"
            >
              {useOpenAIRecognition ? 'Whisper' : 'Browser'}
            </button>
            
            {/* Switch TTS Type */}
            <button
              onClick={toggleSynthesisType}
              className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded"
              title="Toggle TTS engine"
            >
              {useOpenAITTS ? 'OpenAI' : 'Browser'}
            </button>
              </div>
            </div>

        {/* Error Display */}
        {(speechError || ttsError) && (
          <div className="mt-2 text-xs text-red-500">
            {speechError || ttsError}
        </div>
      )}
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
                <span className="text-sm">
                  {useRAG 
                    ? '🚀 RAG: Searching case law and legislation...' 
                    : '📁 Searching case law and documents...'
                  }
                </span>
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
              placeholder={
                isListening 
                  ? "Listening..." 
                  : useRAG 
                    ? "Ask about case law, legislation, or legal concepts (RAG Mode)..." 
                    : "Ask about case law, legislation, or your documents..."
              }
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-amber-500 dark:bg-gray-800 dark:text-white"
              rows={1}
              disabled={isListening}
            />
          </div>
          
          <div className="flex space-x-2">
            <button 
              className={`p-2 rounded-lg transition-all ${
                isListening 
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 animate-pulse' 
                  : 'text-gray-500 dark:text-gray-400 hover:text-amber-500'
              }`}
              onClick={handleMicClick}
              title={isListening ? 'Stop listening' : 'Start voice input'}
            >
              {isListening ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </button>
            
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading || isListening}
              className="p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
        
        <div className="mt-2 text-xs text-center text-gray-500 dark:text-gray-400">
          {isListening && <span className="text-red-500 font-medium">🎤 Listening... Speak now</span>}
          {!isListening && (
            <>
              {input.length}/5000 • 
              {voiceEnabled ? ' Voice ON' : ' Voice OFF'} • 
              {useRAG ? ' RAG Mode' : ' Document Mode'} • 
              {isSpeaking && ' Speaking...'}
            </>
          )}
        </div>
      </div>
    </div>
  );
}