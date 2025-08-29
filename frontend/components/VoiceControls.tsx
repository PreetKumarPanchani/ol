'use client'

import { Mic, MicOff, Volume2, VolumeX, Settings } from 'lucide-react'
import { motion } from 'framer-motion'
import useSpeechRecognition from '@/lib/useSpeechRecognition'
import useSpeechSynthesis from '@/lib/useSpeechSynthesis'

interface VoiceControlsProps {
  onTranscriptReady?: (text: string) => void;
  onSpeakText?: (text: string) => void;
}

export default function VoiceControls({ onTranscriptReady, onSpeakText }: VoiceControlsProps) {
  // Advanced Speech Recognition
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
      if (onTranscriptReady) {
        onTranscriptReady(text);
      }
    },
    language: 'en-GB'
  });

  // Advanced Speech Synthesis
  const {
    speak,
    cancel: cancelSpeech,
    isSpeaking,
    toggleSynthesisType,
    useOpenAI: useOpenAITTS,
    error: ttsError
  } = useSpeechSynthesis({
    voice: 'nova',
    speed: 0.95
  });
  
  // Voice Interrupt Handler
  const handleInterrupt = () => {
    // Stop all voice activity
    if (isListening) {
      stopListening();
    }
    if (isSpeaking) {
      cancelSpeech();
    }
  };
  
  return (
    <div className="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
      {/* Main Microphone Control */}
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={toggleListening}
        className={`p-3 rounded-lg transition-all ${
          isListening 
            ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' 
            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
        }`}
        title={isListening ? 'Stop listening' : 'Start listening'}
      >
        {isListening ? (
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            <Mic className="w-5 h-5" />
          </motion.div>
        ) : (
          <MicOff className="w-5 h-5" />
        )}
      </motion.button>
      
      {/* Voice Interrupt Button (Emergency Stop) */}
      {(isListening || isSpeaking) && (
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          onClick={handleInterrupt}
          className="p-3 bg-red-500 text-white rounded-lg hover:bg-red-600"
          title="Stop all voice activity"
        >
          <VolumeX className="w-5 h-5" />
        </motion.button>
      )}
      
      {/* Speech Status Indicator */}
      {isSpeaking && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-2 px-3 py-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg"
        >
          <Volume2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span className="text-xs text-blue-600 dark:text-blue-400">Speaking...</span>
          <button
            onClick={cancelSpeech}
            className="ml-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}
      
      {/* Engine Settings */}
      <div className="flex items-center gap-1 ml-auto">
        {/* Recognition Engine Toggle */}
        <button
          onClick={toggleRecognitionType}
          className={`text-xs px-2 py-1 rounded transition-colors ${
            useOpenAIRecognition 
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
          }`}
          title={`Using ${useOpenAIRecognition ? 'OpenAI Whisper' : 'Browser'} for speech recognition`}
        >
          STT: {useOpenAIRecognition ? 'Whisper' : 'Browser'}
        </button>
        
        {/* TTS Engine Toggle */}
        <button
          onClick={toggleSynthesisType}
          className={`text-xs px-2 py-1 rounded transition-colors ${
            useOpenAITTS 
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
          }`}
          title={`Using ${useOpenAITTS ? 'OpenAI TTS' : 'Browser'} for speech synthesis`}
        >
          TTS: {useOpenAITTS ? 'OpenAI' : 'Browser'}
        </button>
      </div>
      
      {/* Transcript Display (for debugging) */}
      {transcript && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-full mt-2 left-0 right-0 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700"
        >
          <p className="text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium">Transcript:</span> {transcript}
          </p>
        </motion.div>
      )}
      
      {/* Error Display */}
      {(speechError || ttsError) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute top-full mt-2 left-0 right-0 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg"
        >
          <p className="text-xs text-red-600 dark:text-red-400">
            {speechError || ttsError}
          </p>
        </motion.div>
      )}
    </div>
  )
}