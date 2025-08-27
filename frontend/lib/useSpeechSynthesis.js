'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

export function useSpeechSynthesis(options = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [useOpenAI, setUseOpenAI] = useState(false);
  
  // Audio elements and management
  const audioRef = useRef(null);
  const utteranceRef = useRef(null);
  const abortControllerRef = useRef(null);
  const voicesRef = useRef([]);
  
  // Check if browser speech synthesis is supported
  const browserSynthesisSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  
  // Configuration
  const defaultOptions = {
    voice: 'nova',    // Match TTS API default
    speed: 0.95,      // Match TTS API default
    pitch: 1.05,      // Natural lift for browser TTS
    volume: 1.0
  };
  
  const mergedOptions = { ...defaultOptions, ...options };
  
  // Load available voices for browser TTS
  useEffect(() => {
    function loadVoices() {
      voicesRef.current = window.speechSynthesis.getVoices();
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);
  
  // Create audio element on client
  useEffect(() => {
    if (typeof window !== 'undefined' && !audioRef.current) {
      const audio = new Audio();
      
      audio.addEventListener('play', () => {
        setIsSpeaking(true);
      });
      
      audio.addEventListener('ended', () => {
        setIsSpeaking(false);
        if (audioRef.current) {
          audioRef.current.src = '';
        }
      });
      
      audio.addEventListener('pause', () => {
        setIsSpeaking(false);
      });
      
      audio.addEventListener('error', (e) => {
        console.error('Audio playback error:', e);
        console.error('Audio error details:', {
          error: e.error,
          message: e.message,
          audioSrc: audio.src?.substring(0, 50),
          readyState: audio.readyState,
          networkState: audio.networkState
        });
        setIsSpeaking(false);
        setError('Audio playback failed');
      });
      
      audioRef.current = audio;
    }
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      
      if (browserSynthesisSupported && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);
  
  // Process WebSocket audio chunks directly
  const processAudioChunk = useCallback((base64data) => {
    if (!audioRef.current || !base64data) return;
    
    try {
      // We need to create an audio context on first chunk
      if (!window.audioContext) {
        window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      // Decode base64 to array buffer
      const binaryString = atob(base64data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Create audio buffer from the bytes
      window.audioContext.decodeAudioData(bytes.buffer, (buffer) => {
        // Create audio source
        const source = window.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(window.audioContext.destination);
        source.start(0);
        
        // Set speaking state
        setIsSpeaking(true);
        
        // Handle completion
        source.onended = () => {
          setIsSpeaking(false);
        };
      });
      
    } catch (err) {
      console.error('Error processing audio chunk:', err);
    }
  }, []);
  
  // Toggle between OpenAI TTS and browser TTS
  const toggleSynthesisType = useCallback(() => {
    // Cancel any ongoing speech
    cancel();
    setUseOpenAI(!useOpenAI);
  }, [useOpenAI]);
  
  // Speak using OpenAI TTS
  const speakWithOpenAI = useCallback(async (text, customOptions = {}) => {
    if (!text || text.trim() === '') {
      setError('No text provided to speak');
      return false;
    }
    
    try {
      // Cancel any current speech
      if (isSpeaking) {
        cancel();
      }
      
      // Create new abort controller for this request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();
      
      setIsLoading(true);
      setError(null);
      
      // Prepare request
      const speakOptions = {
        voice: customOptions.voice || mergedOptions.voice,
        speed: customOptions.speed || mergedOptions.speed
      };
      
      // Make API request through backend proxy
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice: speakOptions.voice,
          speed: speakOptions.speed
        }),
        signal: abortControllerRef.current.signal
      });
      
      if (!response.ok) {
        throw new Error(`TTS request failed: ${response.status} ${response.statusText}`);
      }
      
      // Get audio data
      const responseData = await response.json();
      
      if (responseData.audioData) {
        if (!audioRef.current) {
          throw new Error('Audio element not initialized');
        }
        
        // Make sure the audio source is properly set as a data URL
        const audioSrc = `data:audio/mp3;base64,${responseData.audioData}`;
        
        // Make sure we haven't been interrupted during the fetch
        if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
          // Clear any previous source first
          audioRef.current.src = '';
          
          // Set the new source
          audioRef.current.src = audioSrc;
          
          try {
            await audioRef.current.play();
            return true;
          } catch (playError) {
            console.error('Audio playback error:', playError);
            throw new Error('Failed to play audio: ' + playError.message);
          }
        } else {
          // Request was aborted during fetch
          console.log('TTS request was aborted, not playing audio');
          return false;
        }
      } else {
        throw new Error('No audio data received from server');
      }
    } catch (err) {
      // Don't show error if it was just an abort
      if (err.name === 'AbortError') {
        console.log('TTS request aborted');
        return false;
      }
      
      console.error('OpenAI TTS error:', err);
      setError(err.message || 'Failed to generate speech');
      
      // Try browser TTS as fallback
      if (browserSynthesisSupported) {
        console.log('Falling back to browser TTS');
        return speakWithBrowser(text, customOptions);
      }
      
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSpeaking, mergedOptions.voice, mergedOptions.speed]);
  
  // Speak using browser's built-in speech synthesis
  const speakWithBrowser = useCallback((text, customOptions = {}) => {
    if (!text || !browserSynthesisSupported) {
      return false;
    }
    
    try {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      
      // Avoid injecting ellipses; rely on TTS engine's natural pausing
      // Optionally add a thin space after punctuation to hint a pause
      const processedText = text
        .replace(/([.!?])\s+/g, '1 ')
        .replace(/,\s+/g, ', ')
        .replace(/:\s+/g, ': ')
        .replace(/;\s+/g, '; ');
        //.replace(/(\d+)/g, match => match.split('').join(' ')); // space digits to improve clarity
      
      // Split into sentences for better intonation
      const chunks = processedText
        .split(/(?<=[.?!])\s+/)
        .filter(Boolean);
      
      // Select the best voice
      const preferredVoices = [
        'Google UK English Female',
        'Google UK English Male',
        'Google US English Female',
        'Google US English Male',
        'Microsoft David - English (United States)',
        'Microsoft Zira - English (United States)',
        'Samantha', 'Alex', 'Victoria'
      ];
      
      const voices = voicesRef.current.length > 0 ? voicesRef.current : window.speechSynthesis.getVoices();
      let selectedVoice = null;
      
      for (const voiceName of preferredVoices) {
        const voice = voices.find(v => v.name === voiceName);
        if (voice) {
          selectedVoice = voice;
          break;
        }
      }
      
      if (!selectedVoice) {
        selectedVoice = voices.find(v => v.lang.startsWith('en'));
      }
      
      // Speak each chunk
      chunks.forEach(chunk => {
        const utterance = new SpeechSynthesisUtterance(chunk);
        if (selectedVoice) utterance.voice = selectedVoice;
        
        utterance.rate = customOptions.rate || 0.95;  // conversational pace
        utterance.pitch = customOptions.pitch || 1.05; // slight lift
        utterance.volume = customOptions.volume || mergedOptions.volume;
        
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = (e) => {
          console.error('Speech synthesis error:', e);
          setIsSpeaking(false);
          setError('Browser speech synthesis failed');
        };
        
        utteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
      });
      
      return true;
    } catch (err) {
      console.error('Browser speech synthesis error:', err);
      setError('Browser speech synthesis failed: ' + err.message);
      return false;
    }
  }, [browserSynthesisSupported, mergedOptions.volume]);
  
  // Main speak function that uses the appropriate implementation
  const speak = useCallback((text, customOptions = {}) => {
    if (useOpenAI) {
      return speakWithOpenAI(text, customOptions);
    } else {
      return speakWithBrowser(text, customOptions);
    }
  }, [useOpenAI, speakWithOpenAI, speakWithBrowser]);
  
  // Cancel ongoing speech
  const cancel = useCallback(() => {
    // Cancel any pending fetch requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Stop audio element
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    
    // Stop Web Audio API if it's being used
    if (window.audioContext) {
      // Close all audio contexts
      try {
        window.audioContext.close();
        window.audioContext = null;
      } catch (e) {
        console.error('Error closing audio context:', e);
      }
    }
    
    // Cancel browser speech synthesis
    if (browserSynthesisSupported) {
      window.speechSynthesis.cancel();
    }
    
    setIsSpeaking(false);
    setIsLoading(false);
    
    return true;
  }, []);
  
  return {
    speak,
    cancel,
    processAudioChunk,
    toggleSynthesisType,
    isSpeaking,
    isLoading,
    error,
    useOpenAI,
    supported: useOpenAI || browserSynthesisSupported
  };
}

export default useSpeechSynthesis;
