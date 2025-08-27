'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

export function useOpenAISpeechRecognition(options = {}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  
  // References for audio recording
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const recordingTimeoutRef = useRef(null);
  const isRecordingRef = useRef(false);
  
  // ADD: Silence detection references
  const silenceTimeoutRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  
  // Callback function for when transcript is ready
  const onTranscriptReady = options.onTranscriptReady || (() => {});
  
  // Configuration for recording
  const apiEndpoint = options.apiEndpoint || '/api/transcribe';
  const maxRecordingDuration = options.maxRecordingDuration || 30000; // 30 seconds max by default
  const minRecordingDuration = options.minRecordingDuration || 500; // 500ms minimum
  
  // ADD: Function to monitor silence for auto-stop
  const startSilenceDetection = useCallback(() => {
    if (!streamRef.current) return;
    
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
          
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
          }
        } else if (speechStarted && !silenceStart) {
          // Start of silence after speech
          silenceStart = Date.now();
        } else if (speechStarted && silenceStart) {
          // Check if silence duration exceeded 2 seconds
          if (Date.now() - silenceStart > 2000) {
            if (!silenceTimeoutRef.current) {
              silenceTimeoutRef.current = setTimeout(() => {
                console.log('Auto-stopping due to silence');
                stopListening();
              }, 100);
            }
            return;
          }
        }
        
        requestAnimationFrame(checkAudioLevel);
      };
      
      checkAudioLevel();
    } catch (err) {
      console.error('Error in silence detection:', err);
    }
  }, []);
  
  // Send audio to OpenAI Whisper via backend proxy - UNCHANGED
  const transcribeAudio = async (audioBlob) => {
    try {
      setIsProcessing(true);
      setError(null);
      
      console.log('Transcribing audio blob:', {
        size: audioBlob.size,
        type: audioBlob.type
      });
      
      // Check if blob has content
      if (audioBlob.size === 0) {
        console.error('Audio blob is empty');
        setError('No audio recorded');
        return null;
      }
      
      // Create form data with audio file
      const formData = new FormData();
      
      // Try to use the best format for OpenAI
      // Convert webm to wav if possible, or send as is
      const fileName = 'recording.webm';
      formData.append('file', audioBlob, fileName);
      formData.append('model', options.model || 'whisper-1'); // Use whisper-1 or gpt-4o-transcribe
      
      // Add language hint if provided
      if (options.language) {
        formData.append('language', options.language);
      }
      
      // Prompt support intentionally disabled for now
      
      console.log('Sending transcription request to:', apiEndpoint);
      
      // Send to backend proxy endpoint
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Transcription API error:', errorText);
        throw new Error(`Transcription failed: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.text) {
        console.warn('No text in transcription result');
        return null;
      }
      
      const transcribedText = result.text.trim();
      
      console.log('Transcription successful:', transcribedText);
      setTranscript(transcribedText);
      
      // Notify parent component
      if (transcribedText) {
        onTranscriptReady(transcribedText);
      }
      
      return transcribedText;
    } catch (err) {
      console.error('Transcription error:', err);
      setError(err.message || 'Failed to transcribe audio');
      return null;
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Process the recorded audio - UNCHANGED
  const processRecording = useCallback(async () => {
    console.log('Processing recording, chunks:', audioChunksRef.current.length);
    
    if (audioChunksRef.current.length === 0) {
      console.warn('No audio chunks to process');
      setError('No audio recorded');
      return;
    }
    
    // Create blob from chunks
    const audioBlob = new Blob(audioChunksRef.current, { 
      type: mediaRecorderRef.current?.mimeType || 'audio/webm' 
    });
    
    console.log('Created audio blob:', {
      size: audioBlob.size,
      type: audioBlob.type,
      chunks: audioChunksRef.current.length
    });
    
    // Transcribe the audio
    await transcribeAudio(audioBlob);
    
    // Clear chunks for next recording
    audioChunksRef.current = [];
  }, []);
  
  // Start recording - MODIFIED to add silence detection
  const startListening = useCallback(async () => {
    if (isRecordingRef.current) {
      console.log('Already recording');
      return false;
    }
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Media devices not supported in this browser');
      return false;
    }
    
    try {
      console.log('Requesting microphone access...');
      
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
          sampleRate: 16000 // Optimal for speech
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
      
      // Create and configure media recorder
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
        
        // Clear timeout
        if (recordingTimeoutRef.current) {
          clearTimeout(recordingTimeoutRef.current);
          recordingTimeoutRef.current = null;
        }
        
        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => {
            track.stop();
            console.log('Track stopped:', track.kind);
          });
          streamRef.current = null;
        }
        
        // Process the recording
        await processRecording();
        
        setIsListening(false);
        isRecordingRef.current = false;
      };
      
      // Handle errors
      recorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        setError('Recording failed: ' + event.error);
        stopListening();
      };
      
      // Start recording
      recorder.start(100); // Collect data every 100ms
      setIsListening(true);
      console.log('Recording started');
      
      // ADD: Start silence detection after a short delay
      setTimeout(() => {
        startSilenceDetection();
      }, 500);
      
      // Set maximum recording duration timeout
      recordingTimeoutRef.current = setTimeout(() => {
        console.log('Max recording duration reached, stopping...');
        stopListening();
      }, maxRecordingDuration);
      
      return true;
      
    } catch (err) {
      console.error('Error starting recording:', err);
      setError(`Failed to start recording: ${err.message}`);
      
      // Clean up
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      isRecordingRef.current = false;
      setIsListening(false);
      return false;
    }
  }, [maxRecordingDuration, processRecording, startSilenceDetection]);
  
  // Stop recording - MODIFIED to clean up silence detection
  const stopListening = useCallback(() => {
    if (!isRecordingRef.current) {
      console.log('Not currently recording');
      return false;
    }
    
    console.log('Stopping recording...');
    
    // Clear all timeouts
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    
    // Stop the media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        // Check if we have a minimum amount of recording
        const recordingDuration = audioChunksRef.current.length * 100; // Approximate based on timeslice
        if (recordingDuration < minRecordingDuration) {
          console.log('Recording too short, waiting a bit more...');
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
        setError('Failed to stop recording: ' + err.message);
        
        // Force cleanup
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        setIsListening(false);
        isRecordingRef.current = false;
        return false;
      }
    }
    
    return false;
  }, [minRecordingDuration]);
  
  // Toggle recording
  const toggleListening = useCallback(async () => {
    if (isRecordingRef.current) {
      return stopListening();
    } else {
      return await startListening();
    }
  }, [startListening, stopListening]);
  
  // Clean up on unmount - MODIFIED to clean up silence detection
  useEffect(() => {
    return () => {
      // Clear timeouts
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
      
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
      }
      
      // Close audio context
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      
      // Stop recording if active
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (err) {
          console.error('Error stopping recorder during cleanup:', err);
        }
      }
      
      // Stop all tracks
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
    error,
    toggleListening,
    startListening,
    stopListening,
  };
}

export default useOpenAISpeechRecognition;
