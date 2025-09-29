import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [currentMousePos, setCurrentMousePos] = useState({ x: 0, y: 0 });

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
      setCurrentMousePos({ x: e.clientX, y: e.clientY });
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

      // Ctrl+K activation
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();

        if (!isTypingInInput && !isOpen) {
          openCommandBar(currentMousePos.x, currentMousePos.y);
        }
        return;
      }

      // Type-to-activate (ignore if command bar already open)
      if (!isOpen && shouldActivateOnType(e)) {
        e.preventDefault();
        openCommandBar(currentMousePos.x, currentMousePos.y);
        setSearchQuery(e.key); // Start with the typed character
        return;
      }

      // Handle keys when command bar is open
      if (isOpen) {
        switch (e.key) {
          case 'Escape':
            e.preventDefault();
            closeCommandBar();
            break;
          case 'ArrowDown':
            e.preventDefault();
            setSelectedIndex(prev => (prev + 1) % results.length);
            break;
          case 'ArrowUp':
            e.preventDefault();
            setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results.length, currentMousePos]);

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