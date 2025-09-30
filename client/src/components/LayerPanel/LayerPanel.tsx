import React, { useState, useEffect } from 'react';
import './LayerPanel.css';
import { layerService, type Layer } from '../../services/LayerService';
import { selectionService } from '../../services/SelectionService';
import newLayerIcon from '../../assets/layer-add-stroke-rounded.svg';


interface LayerPanelProps {
  selectedPrimitiveIds: string[];
}

export const LayerPanel: React.FC<LayerPanelProps> = ({ }) => {
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

      {/* Search Bar and Add New Layer */ }
      <div className="layerSearch">
        <input
          type="text"
          placeholder="Search layers..."
          className="searchInput"
        />
        <button 
          className="addLayerButton"
          onClick={() => setIsAddingLayer(true)}
          title="Add New Layer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" color="#ffffff" fill="none">
            <path stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M9 15C9 12.1716 9 10.7574 9.87868 9.87868C10.7574 9 12.1716 9 15 9L16 9C18.8284 9 20.2426 9 21.1213 9.87868C22 10.7574 22 12.1716 22 15V16C22 18.8284 22 20.2426 21.1213 21.1213C20.2426 22 18.8284 22 16 22H15C12.1716 22 10.7574 22 9.87868 21.1213C9 20.2426 9 18.8284 9 16L9 15Z" ></path>
            <path stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M16.9999 9C16.9975 6.04291 16.9528 4.51121 16.092 3.46243C15.9258 3.25989 15.7401 3.07418 15.5376 2.90796C14.4312 2 12.7875 2 9.5 2C6.21252 2 4.56878 2 3.46243 2.90796C3.25989 3.07417 3.07418 3.25989 2.90796 3.46243C2 4.56878 2 6.21252 2 9.5C2 12.7875 2 14.4312 2.90796 15.5376C3.07417 15.7401 3.25989 15.9258 3.46243 16.092C4.51121 16.9528 6.04291 16.9975 9 16.9999" ></path>
            <path stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M18 15.5L13 15.5M15.5 13V18"></path>
          </svg>
        </button>
      </div>
      
      {/* Panel Body */ }
      <div 
        className="panelBody"
        onDoubleClick={handlePanelBodyDoubleClick}
        title="Double-click empty space to deactivate layer"
        >

        {/* Layers List */}
        <div className="layersList">

          {/* Orphaned Primitives Section */}
          {getOrphanedPrimitivesCount() > 0 && (
            <div className="layerItem orphanedSection">
              <div className="layerInfo">
                <span className="layerName">None</span>
                <span className="primitiveCount">{getOrphanedPrimitivesCount()}</span>
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
              title="Set current layer"
            >
              <div className="layerInfo">
                {activeLayerId === layer.id && (
                  <span className="activeIndicator">✓</span>
                )}
                <span className="layerName">{layer.name}</span>
              </div>
              
              {/* Property Icons (placeholder for Phase 5C) */}
              <div className="layerControls">
                <button className="controlButton visibility" title="Toggle Visibility">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" color="#ffffff">
                    <path fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" d="M2 8C2 8 6.47715 3 12 3C17.5228 3 22 8 22 8"></path>
                    <path fill="none" stroke="#ffffff" stroke-width="1.5" d="M21.544 13.045C21.848 13.4713 22 13.6845 22 14C22 14.3155 21.848 14.5287 21.544 14.955C20.1779 16.8706 16.6892 21 12 21C7.31078 21 3.8221 16.8706 2.45604 14.955C2.15201 14.5287 2 14.3155 2 14C2 13.6845 2.15201 13.4713 2.45604 13.045C3.8221 11.1294 7.31078 7 12 7C16.6892 7 20.1779 11.1294 21.544 13.045Z"></path>
                    <path fill="none" stroke="#ffffff" stroke-width="1.5" d="M15 14C15 12.3431 13.6569 11 12 11C10.3431 11 9 12.3431 9 14C9 15.6569 10.3431 17 12 17C13.6569 17 15 15.6569 15 14Z"></path>
                  </svg>
                </button>
                <button className="controlButton lock" title="Toggle Lock">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                    <path fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" d="M12 16.5V14.5"></path>
                    <path fill="none" stroke="#ffffff" stroke-width="1.5" d="M4.2678 18.8447C4.49268 20.515 5.87612 21.8235 7.55965 21.9009C8.97626 21.966 10.4153 22 12 22C13.5847 22 15.0237 21.966 16.4403 21.9009C18.1239 21.8235 19.5073 20.515 19.7322 18.8447C19.8789 17.7547 20 16.6376 20 15.5C20 14.3624 19.8789 13.2453 19.7322 12.1553C19.5073 10.485 18.1239 9.17649 16.4403 9.09909C15.0237 9.03397 13.5847 9 12 9C10.4153 9 8.97626 9.03397 7.55965 9.09909C5.87612 9.17649 4.49268 10.485 4.2678 12.1553C4.12104 13.2453 3.99999 14.3624 3.99999 15.5C3.99999 16.6376 4.12104 17.7547 4.2678 18.8447Z"></path>
                    <path fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M7.5 9V6.5C7.5 4.01472 9.51472 2 12 2C14.4853 2 16.5 4.01472 16.5 6.5V9"></path>
                  </svg>
                </button>
                <span className="primitiveCount">{getPrimitivesCount(layer.id)}</span>
              </div>
            </div>
          ))}
          
        </div>
      </div>

    </div>
  );
};

export default LayerPanel;