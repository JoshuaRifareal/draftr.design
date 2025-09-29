import { useState, useEffect } from 'react';
import { CURSORS } from './cursors';
import { layerService } from '../../services/LayerService';

export const useCursor = (
  activeTool: string, 
  shiftHeld: boolean, 
  isDrawing: boolean, 
  isPanning: boolean,
  theme: 'dark' | 'light'
) => {
  const [cursor, setCursor] = useState<string>(CURSORS.DEFAULT(theme));

  useEffect(() => {
    const activeLayer = layerService.getActiveLayer();
    const isLayerLocked = activeLayer?.properties.locked ?? false;

    if (isPanning) {
      setCursor(CURSORS.PANNING);
      return;
    }

    if ((activeTool === 'LINE' || activeTool === 'RECTANGLE' || activeTool === 'CIRCLE') && isLayerLocked) {
      setCursor(CURSORS.DISABLED);
      return;
    }

    if (activeTool === 'SELECTION' && shiftHeld) {
      setCursor(CURSORS.SELECT_SUBTRACT(theme));
    } else if (activeTool === 'LINE' || activeTool === 'RECTANGLE' || activeTool === 'CIRCLE') {
      setCursor(CURSORS.CROSSHAIR); // 🎯 Built-in crosshair
    } else {
      setCursor(CURSORS.DEFAULT(theme));
    }
  }, [activeTool, shiftHeld, isDrawing, isPanning, theme]);

  return cursor;
};