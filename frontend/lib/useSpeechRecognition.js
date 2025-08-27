'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import useBrowserSpeechRecognition from './useBrowserSpeechRecognition';

export function useSpeechRecognition(options = {}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [useOpenAI, setUseOpenAI] = useState(false);
  const [transcript, setTranscript] = useState('');
  
  // References for audio recording (OpenAI mode)
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const recordingTimeoutRef = useRef(null);
  const isRecordingRef = useRef(false);
  
  // ADD: Silence detection for OpenAI mode only
  const silenceTimeoutRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  
  // Store the callback in a ref to always have the latest version
  const onTranscriptReadyRef = useRef(options.onTranscriptReady);
  
  // Update the ref when options change
  useEffect(() => {
    onTranscriptReadyRef.current = options.onTranscriptReady;
  }, [options.onTranscriptReady]);
  
  // Configuration
  const apiEndpoint = options.apiEndpoint || '/api/transcribe';
  const maxRecordingDuration = options.maxRecordingDuration || 30000;
  const minRecordingDuration = options.minRecordingDuration || 500;
  
  // Browser's native speech recognition as fallback
  const browserSpeechRecognition = useBrowserSpeechRecognition({
    onTranscriptReady: (text) => {
      // When browser recognition is done, pass the text to the parent
      if (onTranscriptReadyRef.current && text) {
        onTranscriptReadyRef.current(text);
      }
    },
    language: options.language
  });

  // Update our transcript when browser recognition updates
  useEffect(() => {
    if (!useOpenAI) {
      setTranscript(browserSpeechRecognition.transcript);
    }
  }, [browserSpeechRecognition.transcript, useOpenAI]);
  
  // Toggle between OpenAI and browser speech recognition
  const toggleRecognitionType = useCallback(() => {
    // Stop any ongoing recording
    if (browserSpeechRecognition.isListening) {
      browserSpeechRecognition.stopListening();
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      stopOpenAIListening();
    }
    
    setUseOpenAI(!useOpenAI);
    setError(null);
    setTranscript('');
  }, [useOpenAI, browserSpeechRecognition]);
  
  // ADD: Function to monitor silence in OpenAI mode
  const startSilenceDetection = useCallback(() => {
    if (!streamRef.current || !useOpenAI) return;
    
    try {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(streamRef.current);
      source.connect(analyserRef.current);
      
      analyserRef.current.fftSize = 2048;
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      let silenceStart = null;
      let speechStarted = false;
      
      const checkAudioLevel = () => {
        if (!isRecordingRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / bufferLength;
        
        if (average > 30) { // Sound detected
          speechStarted = true;
          silenceStart = null;
          
          // Clear any existing timeout
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
          }
        } else if (speechStarted && !silenceStart) {
          // Start of silence after speech
          silenceStart = Date.now();
        } else if (speechStarted && silenceStart) {
          // Check if silence duration exceeded
          if (Date.now() - silenceStart > 2000) { // 2 seconds of silence
            if (!silenceTimeoutRef.current) {
              silenceTimeoutRef.current = setTimeout(() => {
                console.log('Auto-stopping due to silence');
                stopOpenAIListening();
              }, 100);
            }
            return; // Stop checking
          }
        }
        
        requestAnimationFrame(checkAudioLevel);
      };
      
      checkAudioLevel();
    } catch (err) {
      console.error('Error in silence detection:', err);
    }
  }, [useOpenAI]);
  
  // Transcribe audio with OpenAI Whisper - UNCHANGED
  const transcribeAudio = useCallback(async (audioBlob) => {
    try {
      setIsProcessing(true);
      setError(null);
      
      console.log('Transcribing audio blob:', {
        size: audioBlob.size,
        type: audioBlob.type
      });
      
      if (audioBlob.size === 0) {
        throw new Error('No audio recorded');
      }
      
      // Create form data with audio file
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');
      formData.append('model', options.whisperModel || 'whisper-1');
      
      if (options.language) {
        formData.append('language', options.language);
      }
      
      // Send to backend proxy endpoint
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Transcription failed: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (!result.text) {
        throw new Error('No transcription text received');
      }
      
      const transcribedText = result.text.trim();
      
      console.log('Transcription result:', transcribedText);
      setTranscript(transcribedText);
      
      // Notify parent component using the ref to ensure we have the latest callback
      if (onTranscriptReadyRef.current && transcribedText) {
        console.log('Calling onTranscriptReady with:', transcribedText);
        onTranscriptReadyRef.current(transcribedText);
      }
      
      return transcribedText;
    } catch (err) {
      console.error('Transcription error:', err);
      const errorMessage = err.message || 'Failed to transcribe audio';
      setError(errorMessage);
      
      // Try browser recognition as fallback if OpenAI fails
      console.log('Falling back to browser speech recognition...');
      setUseOpenAI(false);
      setTimeout(() => {
        browserSpeechRecognition.startListening();
      }, 100);
      
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [apiEndpoint, options.whisperModel, options.language, browserSpeechRecognition]);
  
  // Process the recorded audio - UNCHANGED
  const processRecording = useCallback(async () => {
    console.log('Processing recording, chunks:', audioChunksRef.current.length);
    
    if (audioChunksRef.current.length === 0) {
      setError('No audio recorded');
      return;
    }
    
    const audioBlob = new Blob(audioChunksRef.current, { 
      type: mediaRecorderRef.current?.mimeType || 'audio/webm' 
    });
    
    await transcribeAudio(audioBlob);
    audioChunksRef.current = [];
  }, [transcribeAudio]);
  
  // Start recording with OpenAI Whisper - MODIFIED to add silence detection
  const startOpenAIListening = useCallback(async () => {
    if (isRecordingRef.current) {
      console.log('Already recording');
      return false;
    }
    
    // Stop browser recognition if active
    if (browserSpeechRecognition.isListening) {
      browserSpeechRecognition.stopListening();
    }
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Media devices not supported in this browser');
      return false;
    }
    
    try {
      console.log('Starting OpenAI recording...');
      
      // Reset state
      setError(null);
      setTranscript('');
      audioChunksRef.current = [];
      isRecordingRef.current = true;
      
      // Get audio stream
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        } 
      });
      
      console.log('Microphone access granted');
      streamRef.current = stream;
      
      // Determine best mime type
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ];
      
      let selectedMimeType = 'audio/webm';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          console.log('Using mime type:', mimeType);
          break;
        }
      }
      
      // Create media recorder
      const recorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
        audioBitsPerSecond: 128000
      });
      
      mediaRecorderRef.current = recorder;
      
      // Collect audio chunks
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          console.log('Audio chunk received:', event.data.size, 'bytes');
          audioChunksRef.current.push(event.data);
        }
      };
      
      // Handle recording stop - MODIFIED to clean up silence detection
      recorder.onstop = async () => {
        console.log('Recording stopped');
        
        // Clean up silence detection
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
        
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }
        
        if (recordingTimeoutRef.current) {
          clearTimeout(recordingTimeoutRef.current);
          recordingTimeoutRef.current = null;
        }
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => {
            track.stop();
          });
          streamRef.current = null;
        }
        
        await processRecording();
        isRecordingRef.current = false;
      };
      
      recorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        setError('Recording failed');
        stopOpenAIListening();
      };
      
      // Start recording
      recorder.start(100); // Collect data every 100ms
      console.log('Recording started');
      
      // ADD: Start silence detection after a short delay
      setTimeout(() => {
        startSilenceDetection();
      }, 500);
      
      // Set maximum recording duration
      recordingTimeoutRef.current = setTimeout(() => {
        console.log('Max recording duration reached');
        stopOpenAIListening();
      }, maxRecordingDuration);
      
      return true;
      
    } catch (err) {
      console.error('Error starting recording:', err);
      setError(`Failed to start recording: ${err.message}`);
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      isRecordingRef.current = false;
      return false;
    }
  }, [browserSpeechRecognition, maxRecordingDuration, processRecording, startSilenceDetection]);
  
  // Stop OpenAI recording - MODIFIED to clean up silence detection
  const stopOpenAIListening = useCallback(() => {
    if (!isRecordingRef.current) {
      return false;
    }
    
    console.log('Stopping OpenAI recording...');
    
    // Clean up silence detection
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        const recordingDuration = audioChunksRef.current.length * 100;
        if (recordingDuration < minRecordingDuration) {
          setTimeout(() => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
              mediaRecorderRef.current.stop();
            }
          }, minRecordingDuration - recordingDuration);
        } else {
          mediaRecorderRef.current.stop();
        }
        return true;
      } catch (err) {
        console.error('Error stopping recorder:', err);
        setError('Failed to stop recording');
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        isRecordingRef.current = false;
        return false;
      }
    }
    return false;
  }, [minRecordingDuration]);
  
  // Get the current listening state
  const isListening = useOpenAI 
    ? isRecordingRef.current
    : browserSpeechRecognition.isListening;
  
  // Toggle recording based on current mode
  const toggleListening = useCallback(async () => {
    if (useOpenAI) {
      if (isRecordingRef.current) {
        return stopOpenAIListening();
      } else {
        return await startOpenAIListening();
      }
    } else {
      return browserSpeechRecognition.toggleListening();
    }
  }, [useOpenAI, startOpenAIListening, stopOpenAIListening, browserSpeechRecognition]);
  
  // Clean up on unmount - MODIFIED to clean up silence detection
  useEffect(() => {
    return () => {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
      
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
      }
      
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (err) {
          console.error('Error stopping recorder during cleanup:', err);
        }
      }
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, []);
  
  return {
    isListening,
    isProcessing,
    transcript,
    error: error || browserSpeechRecognition.error,
    toggleListening,
    toggleRecognitionType,
    useOpenAI,
    supported: useOpenAI || browserSpeechRecognition.supported,
    // Expose individual start/stop methods for more control
    startListening: useOpenAI ? startOpenAIListening : browserSpeechRecognition.startListening,
    stopListening: useOpenAI ? stopOpenAIListening : browserSpeechRecognition.stopListening
  };
}

export default useSpeechRecognition;
