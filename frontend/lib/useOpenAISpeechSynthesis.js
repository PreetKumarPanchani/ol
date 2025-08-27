'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

export function useOpenAISpeechSynthesis(options = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const audioRef = useRef(null);
  const currentTextRef = useRef('');

  const apiEndpoint = options.apiEndpoint || '/api/tts';
  const voice = options.voice || 'nova';

  // Load available voices once
  const voicesRef = useRef([]);
  useEffect(() => {
    function loadVoices() {
      voicesRef.current = window.speechSynthesis.getVoices();
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && !audioRef.current) {
      const audio = new Audio();

      audio.addEventListener('play', () => {
        setIsSpeaking(true);
      });

      audio.addEventListener('ended', () => {
        setIsSpeaking(false);
        audioRef.current.src = '';
      });

      audio.addEventListener('pause', () => {
        setIsSpeaking(false);
      });

      audio.addEventListener('error', (e) => {
        console.error('Audio playback error:', e);
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
    };
  }, []);

  const speak = useCallback(async (text, customOptions = {}) => {
    if (!text || text.trim() === '') {
      setError('No text provided to speak');
      return false;
    }

    try {
      if (isSpeaking) {
        cancel();
      }

      setIsLoading(true);
      setError(null);
      currentTextRef.current = text;

      const speakOptions = {
        voice: customOptions.voice || voice,
        speed: customOptions.speed || 0.95,
        model: 'tts-1-hd'
      };

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice: speakOptions.voice,
          speed: speakOptions.speed,
          model: speakOptions.model
        })
      });

      if (!response.ok) {
        throw new Error(`TTS request failed: ${response.status} ${response.statusText}`);
      }

      const responseData = await response.json();

      if (responseData.audioUrl) {
        if (!audioRef.current) {
          throw new Error('Audio element not initialized');
        }

        audioRef.current.src = responseData.audioUrl;
        audioRef.current.play().catch(e => {
          console.error('Error playing audio:', e);
          setError('Failed to play audio');
        });
      } else if (responseData.audioData) {
        if (!audioRef.current) {
          throw new Error('Audio element not initialized');
        }

        const audioSrc = `data:audio/mp3;base64,${responseData.audioData}`;
        audioRef.current.src = audioSrc;
        audioRef.current.play().catch(e => {
          console.error('Error playing audio:', e);
          setError('Failed to play audio');
        });
      } else {
        throw new Error('No audio data received from server');
      }

      return true;
    } catch (err) {
      console.error('TTS error:', err);
      setError(err.message || 'Failed to generate speech');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [apiEndpoint, voice, isSpeaking]);

  const cancel = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      setIsSpeaking(false);
      return true;
    }
    return false;
  }, []);

  // --- Improved Natural-Sounding Fallback ---
  const speakFallback = useCallback((text) => {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) {
      return false;
    }

    try {
      window.speechSynthesis.cancel();

      // Avoid ellipsis injection to prevent "dot dot dot" being spoken
      const processedText = text
        .replace(/([.!?])\s+/g, '$1 ')
        .replace(/,\s+/g, ', ')
        .replace(/:\s+/g, ': ')
        .replace(/;\s+/g, '; ');
        
        // Remove digits processing for now
        //.replace(/(\d+)/g, match => match.split('').join(' ')); 

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

      const availableVoices = voicesRef.current;
      let selectedVoice = null;

      for (const voiceName of preferredVoices) {
        const v = availableVoices.find(v => v.name === voiceName);
        if (v) {
          selectedVoice = v;
          break;
        }
      }

      if (!selectedVoice) {
        selectedVoice = availableVoices.find(v => v.lang.startsWith('en'));
      }

      // Speak each chunk
      chunks.forEach(chunk => {
        const utterance = new SpeechSynthesisUtterance(chunk);
        if (selectedVoice) utterance.voice = selectedVoice;
        utterance.rate = 0.95; // conversational pace
        utterance.pitch = 1.05; // slight lift
        utterance.volume = 1.0;

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = (e) => {
          console.error('Speech synthesis error:', e);
          setIsSpeaking(false);
          setError('Fallback speech synthesis failed');
        };

        window.speechSynthesis.speak(utterance);
      });

      return true;
    } catch (err) {
      console.error('Fallback speech synthesis error:', err);
      return false;
    }
  }, []);

  const speakWithFallback = useCallback(async (text, options = {}) => {
    try {
      const success = await speak(text, options);

      if (!success && !options.noFallback) {
        console.log('Falling back to browser speech synthesis');
        return speakFallback(text);
      }

      return success;
    } catch (err) {
      console.error('Speech synthesis error:', err);

      if (!options.noFallback) {
        console.log('Falling back to browser speech synthesis after error');
        return speakFallback(text);
      }

      return false;
    }
  }, [speak, speakFallback]);

  return {
    speak: speakWithFallback,
    cancel,
    isSpeaking,
    isLoading,
    error,
  };
}

export default useOpenAISpeechSynthesis;