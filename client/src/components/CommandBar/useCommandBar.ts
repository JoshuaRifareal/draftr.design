import { useState, useEffect, useRef, useCallback } from 'react';
import { type Command, commandRegistry, searchCommands } from './commands';

interface UseCommandBarReturn {
  isOpen: boolean;
  position: { x: number; y: number };
  searchQuery: string;
  results: Command[];
  selectedIndex: number;
  openCommandBar: (x: number, y: number) => void;
  closeCommandBar: () => void;
  setSearchQuery: (query: string) => void;
  setSelectedIndex: (index: number) => void;
}

export const useCommandBar = (): UseCommandBarReturn => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<Command[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Track current mouse position
  const currentMousePosRef = useRef({ x: 0, y: 0 });

  // Search when query changes
  useEffect(() => {
    if (isOpen) {
      const searchResults = searchCommands(searchQuery, commandRegistry);
      setResults(searchResults);
      setSelectedIndex(0); // Reset selection when results change
    }
  }, [searchQuery, isOpen]);

  // Track mouse movement for positioning
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      currentMousePosRef.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Global keyboard listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isTypingInInput = activeElement?.tagName === 'INPUT' || 
                              activeElement?.tagName === 'TEXTAREA';

      // 🎯 IGNORE ESC in command bar - let App.tsx handle it
      if (e.key === 'Escape') {
        // If command bar is open, close it but don't prevent default
        console.log('🔍 ESC in useCommandBar listener - isOpen:', isOpen);
        if (isOpen) {
          e.preventDefault();
          closeCommandBar();
        }
        // If command bar is closed, DO NOTHING - let event bubble to App.tsx
        return;
      }

      // Ctrl+K activation
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        if (!isTypingInInput && !isOpen) {
          openCommandBar(currentMousePosRef.current.x, currentMousePosRef.current.y);
        }
        return;
      }

      // Type-to-activate (ignore if command bar already open OR user is typing)
      if (!isOpen && shouldActivateOnType(e) && !isTypingInInput) {
        e.preventDefault();
        openCommandBar(currentMousePosRef.current.x, currentMousePosRef.current.y);
        setSearchQuery(e.key);
        return;
      }

      // Handle keys when command bar is open (except ESC which we handled above)
      if (isOpen) {
        switch (e.key) {
          case 'ArrowDown':
            console.log("Arrow down from commandbar")
            e.preventDefault();
            setSelectedIndex(prev => (prev + 1) % results.length);
          break;
          case 'ArrowUp':
            console.log("Arrow up from commandbar")
            e.preventDefault();
            setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    
  }, [isOpen, results.length]);

  const openCommandBar = useCallback((x: number, y: number) => {
    setPosition({ x, y });
    setIsOpen(true);
    setSearchQuery('');
    setResults([]);
  }, []);

  const closeCommandBar = useCallback(() => {
    setIsOpen(false);
    setSearchQuery('');
    setResults([]);
    setSelectedIndex(0);
  }, []);

  return {
    isOpen,
    position,
    searchQuery,
    results,
    selectedIndex,
    openCommandBar,
    closeCommandBar,
    setSearchQuery,
    setSelectedIndex,
  };
};

// Helper function to determine if typing should activate command bar
const shouldActivateOnType = (e: KeyboardEvent): boolean => {
  // Ignore modifier keys, function keys, numbers, symbols
  if (e.ctrlKey || e.altKey || e.metaKey) return false;
  if (e.key.length !== 1) return false; // Function keys, arrows, etc.
  if (e.key >= '0' && e.key <= '9') return false; // Numbers
  if ('!@#$%^&*()_+-=[]{}|;:",.<>?/'.includes(e.key)) return false; // Symbols
  
  // Only activate on letters
  return /[a-zA-Z]/.test(e.key);
};