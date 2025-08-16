"use client";

import { useEffect } from 'react';

// Import the Lit element definition to ensure it's registered
import './gdm-live-audio';

export default function HomePage() {
  useEffect(() => {
    // This ensures the custom element is defined when the component mounts
    // In a real application, you might want to handle this more robustly
    // to avoid re-defining if already defined.
    if (!customElements.get('gdm-live-audio')) {
      // This part should ideally not be reached if the import above works correctly
      // but it's a safeguard.
      console.warn('gdm-live-audio custom element not defined. Check import.');
    }
  }, []);

  return (
    <main>
      <gdm-live-audio></gdm-live-audio>
    </main>
  );
}