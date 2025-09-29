import React, { useState, useEffect } from 'react';
import './LayerPanel.css';
import { layerService, type Layer } from '../../services/LayerService';
import { selectionService } from '../../services/SelectionService';

interface LayerPanelProps {
  selectedPrimitiveIds: string[];
}

export const LayerPanel: React.FC<LayerPanelProps> = ({ selectedPrimitiveIds }) => {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [isAddingLayer, setIsAddingLayer] = useState(false);
  const [newLayerName, setNewLayerName] = useState('');

  // Load layers and subscribe to changes
  useEffect(() => {
    const updateLayers = () => {
      setLayers(layerService.getLayerHierarchy());
      setActiveLayerId(layerService.getActiveLayerId());
    };

    updateLayers();
    
    // Subscribe to layer changes (we'll implement this in LayerService)
    // For now, we'll poll - we'll implement proper events in next phase
    const interval = setInterval(updateLayers, 500);
    
    return () => clearInterval(interval);
  }, []);

  // Handle adding new layer
  const handleAddLayer = () => {
    if (newLayerName.trim()) {
      layerService.createLayer(newLayerName.trim());
      setNewLayerName('');
      setIsAddingLayer(false);
    } else {
      setIsAddingLayer(false);
    }
  };

  // Handle layer activation
  const handleLayerActivate = (layerId: string) => {
    layerService.setActiveLayer(layerId);
    setActiveLayerId(layerId);
  };
  // Double-click Empty space to deactivate
  const handlePanelBodyDoubleClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      layerService.setActiveLayer(null);
      setActiveLayerId(null);
      console.log('🎯 Active layer deactivated (orphaning enabled)');
    }
  };

  // Get primitives count for a layer
  const getPrimitivesCount = (layerId: string): number => {
    return layerService.getPrimitivesByLayer(layerId).length;
  };

  // Get orphaned primitives count
  const getOrphanedPrimitivesCount = (): number => {
    const allPrimitives = selectionService.getAllPrimitives();
    return allPrimitives.filter(p => !p.layerId).length;
  };

  return (
    <div className="layersPanel">
      <div className="panelHeader">
        <span>Layers</span>
        <button 
          className="addLayerButton"
          onClick={() => setIsAddingLayer(true)}
          title="Add New Layer"
        >
          +
        </button>
      </div>
      
      <div 
        className="panelBody"
        onDoubleClick={handlePanelBodyDoubleClick}
        title="Double-click empty space to deactivate layer (primitives will be orphaned)"
        >

        {/* Search Bar (placeholder for Phase 5C) */}
        <div className="layerSearch">
          <input
            type="text"
            placeholder="Search layers..."
            className="searchInput"
          />
        </div>

        {/* Layers List */}
        <div className="layersList">
          {/* Orphaned Primitives Section */}
          {getOrphanedPrimitivesCount() > 0 && (
            <div className="layerItem orphanedSection">
              <div className="layerInfo">
                <span className="layerName">None</span>
                <span className="primitiveCount">({getOrphanedPrimitivesCount()})</span>
              </div>
            </div>
          )}

          {/* Add New Layer Input */}
          {isAddingLayer && (
            <div className="layerItem addingLayer">
              <input
                type="text"
                value={newLayerName}
                onChange={(e) => setNewLayerName(e.target.value)}
                onBlur={handleAddLayer}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddLayer();
                  if (e.key === 'Escape') setIsAddingLayer(false);
                }}
                onFocus={() => {
                    // Close command bar when focusing on layer name input
                    const commandBar = document.querySelector('.command-bar');
                    if (commandBar) {
                      commandBar.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                    }
                }}
                placeholder="Layer name"
                autoFocus
                className="layerNameInput"
              />
            </div>
          )}

          {/* Layers */}
          {layers.map(layer => (
            <div 
              key={layer.id}
              className={`layerItem ${activeLayerId === layer.id ? 'active' : ''}`}
              onDoubleClick={() => handleLayerActivate(layer.id)}
            >
              <div className="layerInfo">
                {activeLayerId === layer.id && (
                  <span className="activeIndicator">✓</span>
                )}
                <span className="layerName">{layer.name}</span>
              </div>
              
              {/* Property Icons (placeholder for Phase 5C) */}
              <div className="layerControls">
                <button className="controlButton visibility" title="Toggle Visibility">👁</button>
                <button className="controlButton lock" title="Toggle Lock">🔒</button>
                <span className="primitiveCount">({getPrimitivesCount(layer.id)})</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LayerPanel;