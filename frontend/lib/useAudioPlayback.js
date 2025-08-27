
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

export function useAudioPlayback() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  
  // References for audio handling
  const audioContextRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const pcmBufferRef = useRef([]);
  const isReceivingAudioRef = useRef(false);
  const isProcessingRef = useRef(false);
  const sampleRateRef = useRef(24000);
  
  // Buffer management
  const initialBufferSize = 8;     // Minimum chunks to buffer before playback
  const nextPlayTimeRef = useRef(0); // Next scheduled play time
  
  // Debug counters
  const receivedRef = useRef(0);
  const playedRef = useRef(0);
  
  // Initialize Web Audio API context
  const initAudioContext = useCallback(() => {
    try {
      if (!audioContextRef.current && typeof window !== 'undefined') {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        console.log("Audio context initialized with sample rate:", audioContextRef.current.sampleRate);
      }
      return true;
    } catch (e) {
      console.error('Failed to initialize audio context:', e);
      return false;
    }
  }, []);
  
  // Convert PCM data to AudioBuffer
  const createAudioBuffer = useCallback((pcmData) => {
    if (!audioContextRef.current) return null;
    
    try {
      const numSamples = pcmData.length / 2; // 16-bit = 2 bytes per sample
      const audioBuffer = audioContextRef.current.createBuffer(1, numSamples, sampleRateRef.current);
      const channelData = audioBuffer.getChannelData(0);
      
      // OpenAI PCM format is 16-bit signed little-endian
      let offset = 0;
      for (let i = 0; i < numSamples; i++) {
        // Convert 16-bit PCM to float
        const sample = (pcmData[offset] & 0xff) | ((pcmData[offset + 1] & 0xff) << 8);
        // Handle signed integers (convert to -1.0 to 1.0 range)
        channelData[i] = (sample >= 0x8000) ? -1 + ((sample & 0x7fff) / 0x8000) : sample / 0x7fff;
        offset += 2;
      }
      
      return audioBuffer;
    } catch (e) {
      console.error('Error creating audio buffer:', e);
      return null;
    }
  }, []);
  
  // Play a single chunk with precise scheduling
  const playChunk = useCallback((audioBuffer) => {
    if (!audioContextRef.current || !audioBuffer) return false;
    
    try {
      const ctx = audioContextRef.current;
      const currentTime = ctx.currentTime;
      
      // Create audio source
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      
      // Determine start time - either now or after the previous chunk
      const startTime = Math.max(currentTime, nextPlayTimeRef.current);
      
      // Update next play time
      nextPlayTimeRef.current = startTime + audioBuffer.duration;
      
      // Start playback
      source.start(startTime);
      const playedCount = playedRef.current++;
      
      console.log(`[AUDIO] Playing chunk #${playedCount}: start=${startTime.toFixed(3)}s, duration=${audioBuffer.duration.toFixed(3)}s, buffer=${pcmBufferRef.current.length} remaining, context time=${currentTime.toFixed(3)}`);
      
      return true;
    } catch (e) {
      console.error('[AUDIO] Error playing chunk:', e);
      return false;
    }
  }, []);
  
  // Process audio chunks in the buffer
  const processBuffer = useCallback(() => {
    if (isProcessingRef.current || pcmBufferRef.current.length === 0) {
      console.log(`[AUDIO] Process buffer called but ${isProcessingRef.current ? 'already processing' : 'buffer empty'}`);
      return;
    }
    
    // First time we have enough to start playback
    if (!isPlaying && pcmBufferRef.current.length < initialBufferSize) {
      console.log(`[AUDIO] Buffering: ${pcmBufferRef.current.length}/${initialBufferSize} chunks (${Math.floor(pcmBufferRef.current.length/initialBufferSize*100)}%)`);
      return;
    }
    
    console.log(`[AUDIO] Starting to process ${pcmBufferRef.current.length} buffered chunks`);
    isProcessingRef.current = true;
    
    try {
      // Start playing from buffer - keep playing until buffer is empty
      while (pcmBufferRef.current.length > 0) {
        // Get next chunk
        const pcmData = pcmBufferRef.current.shift();
        console.log(`[AUDIO] Processing chunk: ${pcmData.length} bytes, ${pcmBufferRef.current.length} chunks remaining`);
        
        // Convert to audio buffer
        const audioBuffer = createAudioBuffer(pcmData);
        if (!audioBuffer) {
          console.error('[AUDIO] Failed to create audio buffer, skipping chunk');
          continue;
        }
        
        // Play it
        playChunk(audioBuffer);
        
        // Update UI state if we're starting
        if (!isPlaying) {
          setIsPlaying(true);
          console.log(`[AUDIO] Starting playback with ${initialBufferSize} chunks buffered`);
        }
      }
      
      console.log('[AUDIO] Buffer empty, finished processing');
    } catch (e) {
      console.error('[AUDIO] Error processing buffer:', e);
    } finally {
      isProcessingRef.current = false;
      console.log('[AUDIO] Processing complete, isProcessing=false');
    }
  }, [createAudioBuffer, isPlaying, playChunk]);
  
  // Process incoming PCM chunk
  const processPcmChunk = useCallback((base64data) => {
    if (isMuted || !isReceivingAudioRef.current) return;
    
    try {
      const chunkNumber = receivedRef.current;
      receivedRef.current++;
      
      console.log(`[AUDIO] Received chunk #${chunkNumber} of size ${base64data.length}`);

      // Log buffer state before adding new chunk
      console.log(`[AUDIO] Buffer state before: ${pcmBufferRef.current.length} chunks`);
      
      // Convert base64 to ArrayBuffer
      const binaryString = atob(base64data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Add to buffer
      pcmBufferRef.current.push(bytes);
      
      // Log buffer state after adding new chunk
      console.log(`[AUDIO] Buffer state after: ${pcmBufferRef.current.length} chunks`);
      
      // Process buffer if not already processing
      if (!isProcessingRef.current) {
        console.log(`[AUDIO] Starting buffer processing with ${pcmBufferRef.current.length} chunks`);
        processBuffer();
      } else {
        console.log(`[AUDIO] Already processing buffer, chunk queued`);
      }
    } catch (e) {
      console.error('[AUDIO] Error processing PCM chunk:', e);
    }
  }, [isMuted, processBuffer]);
  
  // Start PCM audio stream
  const startPcmStream = useCallback((sampleRate = 24000) => {
    if (isMuted) return false;
    
    console.log(`[AUDIO] Starting PCM stream with sample rate ${sampleRate}Hz`);
    
    // Initialize audio context
    if (!initAudioContext()) return false;
    
    // Reset state
    pcmBufferRef.current = [];
    isReceivingAudioRef.current = true;
    isProcessingRef.current = false;
    sampleRateRef.current = sampleRate;
    nextPlayTimeRef.current = 0;
    receivedRef.current = 0;
    playedRef.current = 0;
    
    console.log('[AUDIO] PCM stream initialized, waiting for data');
    
    // Update UI state (not actually playing yet, just ready)
    setIsPlaying(false);
    return true;
  }, [isMuted, initAudioContext]);
  
  // End PCM audio stream
  const endPcmStream = useCallback(() => {
    console.log(`[AUDIO] PCM stream ended: received=${receivedRef.current}, played=${playedRef.current}, remaining=${pcmBufferRef.current.length}`);
    isReceivingAudioRef.current = false;
    
    // Process any remaining chunks
    if (pcmBufferRef.current.length > 0 && !isProcessingRef.current) {
      console.log(`[AUDIO] Processing ${pcmBufferRef.current.length} remaining chunks after stream end`);
      processBuffer();
    } else {
      console.log('[AUDIO] No chunks to process after stream end');
    }
  }, [processBuffer]);
  
  // Interrupt playback
  const interruptPlayback = useCallback(() => {
    console.log("[AUDIO] Interrupting playback");
    
    // Reset audio context to stop all sound immediately
    if (audioContextRef.current) {
      try {
        console.log('[AUDIO] Closing audio context');
        audioContextRef.current.close();
        audioContextRef.current = null;
        initAudioContext();
      } catch (e) {
        console.error("[AUDIO] Error resetting audio context:", e);
      }
    }
    
    // Reset everything else
    isReceivingAudioRef.current = false;
    pcmBufferRef.current = [];
    isProcessingRef.current = false;
    nextPlayTimeRef.current = 0;
    
    console.log('[AUDIO] Playback interrupted, all state reset');
    
    // Update UI
    setIsPlaying(false);
    return true;
  }, [initAudioContext]);
  
  // Handle browser interaction for audio playback
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Audio element for standard audio playback if needed
      const audioElement = document.createElement('audio');
      audioElement.style.display = 'none';
      document.body.appendChild(audioElement);
      audioPlayerRef.current = audioElement;
      
      // Init audio context for PCM playback
      initAudioContext();
      
      // Make sure audio context can play by adding user interaction handler
      const handleUserInteraction = () => {
        if (audioContextRef.current && audioContextRef.current.state !== 'running') {
          audioContextRef.current.resume().catch(e => {
            console.error("Error resuming audio context:", e);
          });
        }
      };
      
      // Add event listeners for user interaction
      ['click', 'touchstart', 'keydown'].forEach(event => {
        document.addEventListener(event, handleUserInteraction, { once: false });
      });
      
      return () => {
        // Cleanup
        if (audioElement.parentNode) {
          document.body.removeChild(audioElement);
        }
        
        // Remove event listeners
        ['click', 'touchstart', 'keydown'].forEach(event => {
          document.removeEventListener(event, handleUserInteraction);
        });
        
        // Close audio context
        if (audioContextRef.current) {
          audioContextRef.current.close();
        }
      };
    }
  }, [initAudioContext]);
  
  return {
    isPlaying,
    isMuted,
    toggleMute: useCallback(() => {
      const newMuted = !isMuted;
      setIsMuted(newMuted);
      
      if (newMuted && isPlaying) {
        interruptPlayback();
      }
      
      return newMuted;
    }, [isMuted, isPlaying, interruptPlayback]),
    interruptPlayback,
    startPcmStream,
    endPcmStream,
    processPcmChunk
  };
}

