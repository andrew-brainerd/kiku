import { useEffect, useRef, useState, useCallback } from 'react';

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onspeechstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onspeechend: ((this: SpeechRecognition, ev: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionConstructor;
    webkitSpeechRecognition: SpeechRecognitionConstructor;
  }
}

interface UseWebSpeechAPIOptions {
  continuous?: boolean;
  interimResults?: boolean;
  lang?: string;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
}

interface UseWebSpeechAPIReturn {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
}

export function useWebSpeechAPI({
  continuous = true,
  interimResults = true,
  lang = 'en-US',
  onSpeechStart,
  onSpeechEnd,
  onResult,
  onError,
}: UseWebSpeechAPIOptions = {}): UseWebSpeechAPIReturn {
  const [isSupported] = useState(() => {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  });

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isManualStopRef = useRef(false);

  useEffect(() => {
    if (!isSupported) return;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();

    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    recognition.lang = lang;

    recognition.onstart = () => {
      console.log('Web Speech API: Recognition started');
      setIsListening(true);
      setError(null);
    };

    recognition.onend = () => {
      console.log('Web Speech API: Recognition ended');
      setIsListening(false);

      // Automatically restart if it wasn't a manual stop
      if (!isManualStopRef.current && continuous) {
        console.log('Web Speech API: Auto-restarting recognition');
        try {
          recognition.start();
        } catch (err) {
          console.error('Web Speech API: Failed to restart:', err);
        }
      }
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimText = '';
      let finalText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;

        if (result.isFinal) {
          finalText += text;
        } else {
          interimText += text;
        }
      }

      if (finalText) {
        console.log('Web Speech API: Final result:', finalText);
        setTranscript(prev => prev + finalText);
        onResult?.(finalText, true);
      }

      if (interimText) {
        console.log('Web Speech API: Interim result:', interimText);
        setInterimTranscript(interimText);
        onResult?.(interimText, false);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Web Speech API: Error:', event.error);
      const errorMessage = event.error || 'Unknown error';

      // Handle errors that should stop recognition
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError(errorMessage);
        onError?.(errorMessage);
        setIsListening(false);
        return;
      }

      // Ignore "no-speech" errors - they're expected during continuous listening
      // The recognition will automatically restart via onend handler
      if (event.error === 'no-speech') {
        console.log('Web Speech API: No speech detected (timeout) - will auto-restart');
        return;
      }

      // For other errors, log but don't stop
      console.warn('Web Speech API: Non-fatal error:', errorMessage);
    };

    recognition.onspeechstart = () => {
      console.log('Web Speech API: Speech detected');
      onSpeechStart?.();
    };

    recognition.onspeechend = () => {
      console.log('Web Speech API: Speech ended');
      onSpeechEnd?.();
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (err) {
          console.error('Error aborting recognition:', err);
        }
      }
    };
  }, [isSupported, continuous, interimResults, lang, onSpeechStart, onSpeechEnd, onResult, onError]);

  const startListening = useCallback(() => {
    if (!isSupported) {
      const errorMsg = 'Web Speech API is not supported in this browser';
      setError(errorMsg);
      onError?.(errorMsg);
      return;
    }

    if (recognitionRef.current && !isListening) {
      try {
        isManualStopRef.current = false;
        setTranscript('');
        setInterimTranscript('');
        setError(null);
        recognitionRef.current.start();
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to start recognition';
        console.error('Web Speech API: Failed to start:', errorMsg);
        setError(errorMsg);
        onError?.(errorMsg);
      }
    }
  }, [isSupported, isListening, onError]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      try {
        isManualStopRef.current = true;
        recognitionRef.current.stop();
      } catch (err) {
        console.error('Web Speech API: Failed to stop:', err);
      }
    }
  }, [isListening]);

  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
  };
}
