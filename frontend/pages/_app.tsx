import '@/styles/globals.css';
import { ThemeProvider } from 'next-themes';
import type { AppProps } from 'next/app';
import { useEffect, useState } from 'react';
import { VoiceProvider } from '@/hooks/useVoice';

export default function App({ Component, pageProps }: AppProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null; // Prevent hydration mismatch
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <VoiceProvider>
        <Component {...pageProps} />
      </VoiceProvider>
    </ThemeProvider>
  );
}