// components/ColorPicker/ColorPicker.tsx
import React, { useState, useRef, useEffect } from 'react';
import { HexColorPicker } from 'react-colorful';
import './ColorPicker.css';

interface ColorPickerProps {
  currentColor: { r: number; g: number; b: number; a: number };
  onColorChange: (color: { r: number; g: number; b: number; a: number }) => void;
  onApply: () => void;
  onCancel: () => void;
  position: { x: number; y: number };
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  currentColor,
  onColorChange,
  onApply,
  onCancel,
  position
}) => {
  const [hexColor, setHexColor] = useState(colorToHex(currentColor));
  const [customHex, setCustomHex] = useState(colorToHex(currentColor));
  const popoverRef = useRef<HTMLDivElement>(null);

  // Convert our color object to hex string
  function colorToHex(color: { r: number; g: number; b: number; a: number }): string {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  // Convert hex string to our color object
  function hexToColor(hex: string): { r: number; g: number; b: number; a: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return { r: 0, g: 0, b: 0, a: 1 };
    
    return {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255,
      a: 1
    };
  }

  // Handle color change from picker
  const handleColorChange = (newHex: string) => {
    setHexColor(newHex);
    setCustomHex(newHex);
    onColorChange(hexToColor(newHex));
  };

  // Handle manual hex input
  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCustomHex(value);
    
    if (/^#[0-9A-F]{6}$/i.test(value)) {
      setHexColor(value);
      onColorChange(hexToColor(value));
    }
  };

  // Handle hex input blur (finalize)
  const handleHexBlur = () => {
    if (!/^#[0-9A-F]{6}$/i.test(customHex)) {
      setCustomHex(hexColor); // Revert to valid color
    }
  };

  // Handle apply
  const handleApply = () => {
    onApply();
  };

  // Handle escape key and click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onCancel();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onCancel]);

  return (
    <div 
      ref={popoverRef}
      className="color-picker-popover"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 10001 // Higher than palette
      }}
    >
      <div className="color-picker-header">
        <span>Choose Color</span>
        <button 
          className="color-picker-close"
          onClick={onCancel}
          title="Cancel and close"
        >
          ×
        </button>
      </div>
      
      <div className="color-picker-body">
        <HexColorPicker 
          color={hexColor} 
          onChange={handleColorChange}
        />
        
        <div className="hex-input-container">
          {/* <label>Hex Color:</label> */}
          <div className="hex-input-wrapper">
            <input
              type="text"
              value={customHex}
              onChange={handleHexChange}
              onBlur={handleHexBlur}
              className="hex-input"
              placeholder="#000000"
            />
          </div>
        </div>

        <div className="color-picker-actions">
          <button 
            className="color-picker-apply"
            onClick={handleApply}
          >
            Apply
          </button>
          <button 
            className="color-picker-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};