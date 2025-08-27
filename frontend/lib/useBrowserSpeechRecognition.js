'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export function useBrowserSpeechRecognition(options = {}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState(null);
  
  const recognitionRef = useRef(null);
  const finalTranscriptRef = useRef('');
  const silenceTimerRef = useRef(null);
  const lastInterimRef = useRef('');
  const resultsMapRef = useRef(new Map()); // Track processed results by index
  const lastSpeechTimeRef = useRef(Date.now());
  const startTimeRef = useRef(null);
  
  const browserSupportsSpeechRecognition = typeof window !== 'undefined' && 
    (window.SpeechRecognition || window.webkitSpeechRecognition);
  
  const onTranscriptReady = options.onTranscriptReady || (() => {});
  
  // Helper to find common prefix between two strings
  const findCommonPrefix = (str1, str2) => {
    let i = 0;
    while (i < str1.length && i < str2.length && str1[i] === str2[i]) {
      i++;
    }
    return i;
  };
  
  // Helper to remove duplicate words at boundaries
  const mergeSpeechSegments = (existing, newSegment) => {
    if (!existing) return newSegment;
    if (!newSegment) return existing;
    
    const existingWords = existing.trim().split(/\s+/);
    const newWords = newSegment.trim().split(/\s+/);
    
    // Check for word-level overlap at the boundary
    let overlapStart = -1;
    const maxOverlap = Math.min(existingWords.length, newWords.length, 10);
    
    for (let overlap = 1; overlap <= maxOverlap; overlap++) {
      let matches = true;
      for (let j = 0; j < overlap; j++) {
        if (existingWords[existingWords.length - overlap + j].toLowerCase() !== 
            newWords[j].toLowerCase()) {
          matches = false;
          break;
        }
      }
      if (matches) {
        overlapStart = overlap;
      }
    }
    
    if (overlapStart > 0) {
      // Remove overlapping words from the beginning of new segment
      const nonOverlapping = newWords.slice(overlapStart).join(' ');
      return existing + (nonOverlapping ? ' ' + nonOverlapping : '');
    }
    
    return existing + ' ' + newSegment;
  };
  
  const applyHumanWordLimitLogic = (fullTranscript) => {
    const words = fullTranscript.trim().split(/\s+/);
    const elapsedSeconds =
      (Date.now() - (startTimeRef.current || Date.now())) / 1000;

    const wordsPerSecond = options.wordsPerSecond || 2; // adjustable
    const n = Math.floor(elapsedSeconds * wordsPerSecond);

    if (words.length > n + 3) {
      const firstWord = words[0].toLowerCase();
      const targetPositions = [n - 2, n - 1, n, n + 1, n + 2].filter(
        (idx) => idx >= 0 && idx < words.length
      );

      let foundIndex = null;

      // Search from the back with preference to earlier backward indexes
      for (let target of targetPositions) {
        const wordAtTarget = words[target]?.toLowerCase();
        if (wordAtTarget === firstWord) {
          foundIndex = target;
          break;
        }
      }

      if (foundIndex === null) {
        // Fallback: search from the end for first occurrence
        for (let i = words.length - 1; i >= 0; i--) {
          if (words[i].toLowerCase() === firstWord) {
            foundIndex = i;
            break;
          }
        }
      }

      if (foundIndex !== null && foundIndex < words.length) {
        return words.slice(foundIndex).join(' ');
      }
    }

    return fullTranscript;
  };


  const initRecognition = useCallback(() => {
    if (!browserSupportsSpeechRecognition) {
      setError('Browser does not support speech recognition');
      return false;
    }
    
    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = options.language || 'en-US';
      recognition.maxAlternatives = 1;
      
      recognition.onstart = () => {
        console.log('Speech recognition started');
        setIsListening(true);
        setTranscript('');
        setError(null);
        finalTranscriptRef.current = '';
        lastInterimRef.current = '';
        resultsMapRef.current.clear();
        startTimeRef.current = Date.now();
      };
      
      recognition.onresult = (event) => {
        let currentFinal = finalTranscriptRef.current;
        let currentInterim = '';
        
        // Process each result
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcriptText = result[0].transcript;
          
          if (result.isFinal) {
            // Check if we've already processed this final result
            const resultKey = `final-${i}`;
            if (!resultsMapRef.current.has(resultKey)) {
              resultsMapRef.current.set(resultKey, transcriptText);
              
              // Merge with existing final transcript, removing duplicates
              if (lastInterimRef.current) {
                // If the final result matches our last interim, just replace it
                const lastInterimLower = lastInterimRef.current.toLowerCase().trim();
                const transcriptLower = transcriptText.toLowerCase().trim();
                
                if (lastInterimLower === transcriptLower || 
                    transcriptLower.startsWith(lastInterimLower)) {
                  // Don't add anything, it's already in the transcript as interim
                  lastInterimRef.current = '';
                } else {
                  // Merge intelligently
                  currentFinal = mergeSpeechSegments(currentFinal, transcriptText);
                }
              } else {
                // No interim to compare with, merge normally
                currentFinal = mergeSpeechSegments(currentFinal, transcriptText);
              }
              
              finalTranscriptRef.current = currentFinal;
              lastInterimRef.current = '';
            }
          } else {
            // Interim result - only keep the latest one for this index
            const resultKey = `interim-${i}`;
            resultsMapRef.current.set(resultKey, transcriptText);
            currentInterim = transcriptText;
          }
        }
        
        // Update display transcript
        if (currentInterim) {
          // Check if interim is not already part of final
          const finalLower = currentFinal.toLowerCase().trim();
          const interimLower = currentInterim.toLowerCase().trim();
          
          if (!finalLower.endsWith(interimLower)) {
            lastInterimRef.current = currentInterim;
            setTranscript(currentFinal + (currentFinal ? ' ' : '') + currentInterim);
          } else {
            setTranscript(currentFinal);
          }
        } else {
          setTranscript(currentFinal);
        }
        
        // Update last speech time for ANY result (final or interim)
        lastSpeechTimeRef.current = Date.now();
        
        // Handle silence detection - but only reset timer if we have new content
        // This prevents premature cutting off of speech
        if (currentFinal !== finalTranscriptRef.current || currentInterim) {
          // Clear existing timer
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }
          
          // Set new timer for 2-second silence
          silenceTimerRef.current = setTimeout(() => {
            // Check actual silence duration since last speech
            const silenceDuration = Date.now() - lastSpeechTimeRef.current;
            console.log(`Silence check: ${silenceDuration}ms since last speech`);
            
            // Only trigger if we've actually had silence
            if (silenceDuration >= 2000 && finalTranscriptRef.current.trim()) {
              console.log('Silence detected, sending transcript');
              let completeTranscript = finalTranscriptRef.current.trim();
              
              // Apply human word limit logic before sending
              completeTranscript = applyHumanWordLimitLogic(completeTranscript);
              
              onTranscriptReady(completeTranscript);
              
              // Stop recognition
              if (recognitionRef.current) {
                try {
                  recognitionRef.current.stop();
                } catch (err) {
                  console.error('Error stopping recognition:', err);
                }
              }
            }
          }, 2000);
        }
      };
      
      recognition.onerror = (event) => {
        if (event.error === 'no-speech' || event.error === 'aborted') {
          return;
        }
        console.error('Speech recognition error:', event.error);
        setError(event.error);
        setIsListening(false);
        
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }
      };
      
      recognition.onend = () => {
        console.log('Speech recognition ended');
        setIsListening(false);
        
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }
        
        // Send final transcript if exists
        if (finalTranscriptRef.current.trim()) {
          let completeTranscript = finalTranscriptRef.current.trim();
          
          // Apply human word limit logic before sending
          completeTranscript = applyHumanWordLimitLogic(completeTranscript);
          
          onTranscriptReady(completeTranscript);
        }
      };
      
      recognitionRef.current = recognition;
      return true;
    } catch (err) {
      console.error('Error initializing speech recognition:', err);
      setError('Failed to initialize speech recognition');
      return false;
    }
  }, [browserSupportsSpeechRecognition, options.language, onTranscriptReady]);
  
  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      if (!initRecognition()) {
        return false;
      }
    }
    
    try {
      recognitionRef.current.start();
      return true;
    } catch (err) {
      if (err.message && err.message.includes('already started')) {
        return true;
      }
      console.error('Error starting speech recognition:', err);
      setError('Failed to start speech recognition');
      return false;
    }
  }, [initRecognition]);
  
  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        return true;
      } catch (err) {
        console.error('Error stopping speech recognition:', err);
        return false;
      }
    }
    return false;
  }, []);
  
  const toggleListening = useCallback(() => {
    if (isListening) {
      return stopListening();
    } else {
      return startListening();
    }
  }, [isListening, startListening, stopListening]);
  
  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      
      if (recognitionRef.current && isListening) {
        try {
          recognitionRef.current.stop();
        } catch (err) {
          console.error('Error stopping recognition on unmount:', err);
        }
      }
    };
  }, [isListening]);
  
  return {
    isListening,
    transcript,
    error,
    toggleListening,
    startListening,
    stopListening,
    supported: browserSupportsSpeechRecognition
  };
}

export default useBrowserSpeechRecognition;

