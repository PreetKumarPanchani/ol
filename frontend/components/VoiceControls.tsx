'use client'

import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react'
import { useVoice } from '@/hooks/useVoice'
import { motion } from 'framer-motion'

export default function VoiceControls() {
  const { 
    isListening, 
    toggleListening, 
    isSpeaking, 
    cancelSpeech,
    voiceEnabled,
    setVoiceEnabled 
  } = useVoice()
  
  return (
    <div className="flex items-center gap-2">
      {/* Voice Toggle */}
      <button
        onClick={() => setVoiceEnabled(!voiceEnabled)}
        className={`p-2 rounded-lg transition-colors ${
          voiceEnabled 
            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' 
            : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
        }`}
        title={voiceEnabled ? 'Disable voice' : 'Enable voice'}
      >
        {voiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
      </button>
      
      {voiceEnabled && (
        <>
          {/* Microphone */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={toggleListening}
            className={`p-2 rounded-lg transition-colors ${
              isListening 
                ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' 
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
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
          
          {/* Stop Speaking */}
          {isSpeaking && (
            <motion.button
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              onClick={cancelSpeech}
              className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-600 dark:text-gray-400"
              title="Stop speaking"
            >
              <VolumeX className="w-5 h-5" />
            </motion.button>
          )}
        </>
      )}
    </div>
  )
}