import React, { useRef, useEffect } from 'react';
import './CommandBar.css';
import { useCommandBar } from './useCommandBar';
import { type Command } from './commands';

interface CommandBarProps {
  onCommandSelect: (command: Command) => void;
}

export const CommandBar: React.FC<CommandBarProps> = ({ onCommandSelect }) => {
  const {
    isOpen,
    position,
    searchQuery,
    results,
    selectedIndex,
    closeCommandBar,
    setSearchQuery,
    setSelectedIndex,
  } = useCommandBar();

  // Click outside detection
  const commandBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (commandBarRef.current && !commandBarRef.current.contains(e.target as Node)) {
        closeCommandBar();
      }
    };

    if (isOpen) {
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 10);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, closeCommandBar]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  // SIMPLIFIED: Direct command execution
  const handleCommandSelect = (command: Command) => {
    console.log('🎯 Executing command:', command.name);
    
    command.execute()
      .then(() => {
        console.log('✅ Command executed successfully:', command.name);
        closeCommandBar();
        
        // Notify parent component if needed
        if (onCommandSelect) {
          onCommandSelect(command);
        }
      })
      .catch(error => {
        console.error('❌ Command failed:', command.name, error);
      });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeCommandBar();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((selectedIndex + 1) % results.length);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((selectedIndex - 1 + results.length) % results.length);
      return;
    }

    if ((e.key === 'Enter' || e.key === ' ') && results[selectedIndex]) {
      e.preventDefault();
      handleCommandSelect(results[selectedIndex]);
      return;
    }
  };

  if (!isOpen) return null;

  // Position with offset (lower right of cursor)
  const style = {
    left: position.x + 10,
    top: position.y + 10,
    transform: 'translate(0, 0)',
  };

  // Adjust position if near screen edges
  if (position.x + 330 > window.innerWidth) {
    style.left = position.x - 320 - 10;
  }
  if (position.y + 410 > window.innerHeight) {
    style.top = position.y - 400 - 10;
  }

  return (
    <div className="command-bar-overlay">
      <div ref={commandBarRef} className="command-bar" style={style}>
        <input
          type="text"
          className="command-input"
          placeholder="Search commands..."
          value={searchQuery}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        
        <div className="command-results">
          {results.length === 0 ? (
            <div className="no-results">
              {searchQuery ? 'No commands found' : 'Start typing to search...'}
            </div>
          ) : (
            results.map((command, index) => (
              <div
                key={command.id}
                className={`command-item ${index === selectedIndex ? 'selected' : ''}`}
                onClick={() => handleCommandSelect(command)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className="command-label">{command.name}</span>
                {/* <span className="command-description">{command.description}</span> */}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};