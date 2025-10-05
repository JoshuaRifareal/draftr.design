// components/LayerPanel/LayerPanel.tsx
import React, { useState, useEffect, useRef } from 'react';
import './LayerPanel.css';
import { layerService, type Layer } from '../../services/LayerService';
import { selectionService } from '../../services/SelectionService';
import { ColorPicker } from '../ColorPicker/ColorPicker';
import { 
  EyeIcon, 
  EyeClosedIcon, 
  LockIcon, 
  UnlockIcon, 
  ExpandIcon, 
  CollapseIcon,
  NewLayerIcon,
  LayerIcon,
  GroupIcon,
  BlockIcon
} from '../Icons';

interface LayerPanelProps {
  selectedPrimitiveIds: string[];
}

interface LayerItemProps {
  layer: Layer;
  depth: number;
  isActive: boolean;
  isSelected: boolean;
  isHovered: boolean;
  autoEditLayerId: string | null;
  onSelect: (layerId: string, event: React.MouseEvent) => void;
  onActivate: (layerId: string) => void;
  onHover: (layerId: string | null) => void;
  onToggleExpand: (layerId: string) => void;
  onContextMenu: (layerId: string, event: React.MouseEvent) => void;
  onEditComplete: () => void;
  onColorSwatchClick: (layerId: string, position: { x: number; y: number }) => void;
}

const LayerItem: React.FC<LayerItemProps> = ({
  layer,
  depth,
  isActive,
  isSelected,
  isHovered,
  autoEditLayerId,
  onSelect,
  onActivate,
  onHover,
  onToggleExpand,
  onContextMenu,
  onEditComplete,
  onColorSwatchClick
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(layer.properties.name);
  const [isEditingOpacity, setIsEditingOpacity] = useState(false);
  const [editOpacity, setEditOpacity] = useState(layer.properties.opacity.toString());
  const inputRef = useRef<HTMLInputElement>(null);
  const opacityInputRef = useRef<HTMLInputElement>(null);
  const colorSwatchRef = useRef<HTMLDivElement>(null);

  const effectiveProperties = layerService.getEffectiveProperties(layer.id);
  const primitiveCount = layerService.getPrimitivesByLayer(layer.id).length;
  const canDraw = layer.type === 'layer' && !effectiveProperties.locked;
  const hasChildren = layer.children.length > 0;

  // Auto-start editing when this layer is marked for auto-edit
  useEffect(() => {
    if (autoEditLayerId === layer.id && !isEditing) {
      setIsEditing(true);
      onEditComplete();
    }
  }, [autoEditLayerId, layer.id, isEditing, onEditComplete]);

  // Auto-focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (isEditingOpacity && opacityInputRef.current) {
      opacityInputRef.current.focus();
      opacityInputRef.current.select();
    }
  }, [isEditingOpacity]);

  // Handle name editing
  const handleNameEdit = () => {
    if (editName.trim() && editName !== layer.properties.name) {
      layerService.updateLayerProperties(layer.id, { name: editName.trim() });
    } else {
      setEditName(layer.properties.name);
    }
    setIsEditing(false);
  };

  // Handle opacity editing
  const handleOpacityEdit = () => {
    const opacityValue = parseFloat(editOpacity);
    if (!isNaN(opacityValue) && opacityValue >= 0 && opacityValue <= 1) {
      layerService.updateLayerProperties(layer.id, { opacity: opacityValue });
    } else {
      setEditOpacity(layer.properties.opacity.toString());
    }
    setIsEditingOpacity(false);
  };

  // Handle color swatch click
  const handleColorSwatchClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (colorSwatchRef.current) {
      const rect = colorSwatchRef.current.getBoundingClientRect();
      onColorSwatchClick(layer.id, {
        x: rect.left,
        y: rect.bottom + 4
      });
    }
  };

  return (
    <div
      className={`
        layer-item 
        ${isActive ? 'active' : ''} 
        ${isSelected ? 'selected' : ''}
        ${isHovered ? 'hovered' : ''}
        ${!effectiveProperties.visible ? 'hidden' : ''}
        ${effectiveProperties.locked ? 'locked' : ''}
        ${layer.type !== 'layer' ? 'non-activatable' : ''}
        type-${layer.type}
      `}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
      onClick={(e) => onSelect(layer.id, e)}
      onDoubleClick={() => {
        if (layer.type === 'layer') {
          onActivate(layer.id);
        }
      }}
      onMouseEnter={() => onHover(layer.id)}
      onMouseLeave={() => onHover(null)}
      onContextMenu={(e) => onContextMenu(layer.id, e)}
      title={`${layer.properties.name} (${layer.type}) - ${primitiveCount} primitives`}
    >
      {/* Expand/Collapse toggle for groups/blocks */}
      {hasChildren && (
        <button
          className="expand-toggle"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand(layer.id);
          }}
        >
          {layer.properties.expanded ? <CollapseIcon /> : <ExpandIcon />}
        </button>
      )}

      {/* Layer Name */}
      <div className="layer-info">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleNameEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNameEdit();
              if (e.key === 'Escape') {
                setEditName(layer.properties.name);
                setIsEditing(false);
              }
            }}
            className="layer-name-input"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span 
            className="layer-name"
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (layer.type === 'layer') {
                onActivate(layer.id);
              } else {
                setIsEditing(true);
              }
            }}
          >
            {layer.isBlockInstance && '📦 '}
            {layer.type === 'group' && '📁 '}
            {layer.type === 'block' && !layer.isBlockInstance && '🧱 '}
            {layer.properties.name}
          </span>
        )}
      </div>

      {/* Visibility Toggle */}
      <button
        className="control-button visibility"
        onClick={(e) => {
          e.stopPropagation();
          layerService.updateLayerProperties(layer.id, { 
            visible: !layer.properties.visible 
          });
        }}
        title={effectiveProperties.visible ? 'Hide layer' : 'Show layer'}
      >
        {effectiveProperties.visible ? <EyeIcon /> : <EyeClosedIcon />}
      </button>

      {/* Lock Toggle */}
      <button
        className="control-button lock"
        onClick={(e) => {
          e.stopPropagation();
          layerService.updateLayerProperties(layer.id, { 
            locked: !layer.properties.locked 
          });
        }}
        title={effectiveProperties.locked ? 'Unlock layer' : 'Lock layer'}
      >
        {!effectiveProperties.locked ? <LockIcon /> : <UnlockIcon />}
      </button>

      {/* Color Swatch */}
      <div 
        ref={colorSwatchRef}
        className="color-swatch"
        style={{
          backgroundColor: `rgba(${Math.round(effectiveProperties.color.r * 255)}, ${Math.round(effectiveProperties.color.g * 255)}, ${Math.round(effectiveProperties.color.b * 255)}, ${effectiveProperties.color.a})`,
          border: `2px solid ${isActive ? '#5f51ff' : isSelected ? '#888' : 'transparent'}`
        }}
        onClick={handleColorSwatchClick}
        title="Click to change color"
      />

      {/* Opacity Editor */}
      <div className="opacity-control">
        {isEditingOpacity ? (
          <input
            ref={opacityInputRef}
            type="number"
            min="0"
            max="1"
            step="0.1"
            value={editOpacity}
            onChange={(e) => setEditOpacity(e.target.value)}
            onBlur={handleOpacityEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleOpacityEdit();
              if (e.key === 'Escape') {
                setEditOpacity(layer.properties.opacity.toString());
                setIsEditingOpacity(false);
              }
            }}
            className="opacity-input"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span 
            className="opacity-value"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setIsEditingOpacity(true);
            }}
            title="Double-click to edit opacity"
          >
            {Math.round(layer.properties.opacity * 100)}%
          </span>
        )}
      </div>

      {/* Primitive Count */}
      {/* <span className="primitive-count">{primitiveCount}</span> */}

      {/* Active Layer Indicator */}
      {/* {isActive && layer.type === 'layer' && <div className="active-indicator" title="Active layer">✏️</div>} */}
    
    </div>
  );
};

export const LayerPanel: React.FC<LayerPanelProps> = ({ selectedPrimitiveIds }) => {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [selectedLayerIds, setSelectedLayerIds] = useState<Set<string>>(new Set());
  const [hoveredLayerId, setHoveredLayerId] = useState<string | null>(null);
  const [isAddingLayer, setIsAddingLayer] = useState(false);
  const [newLayerName, setNewLayerName] = useState('');
  const [contextMenu, setContextMenu] = useState<{x: number, y: number, layerId: string} | null>(null);
  const [autoEditLayerId, setAutoEditLayerId] = useState<string | null>(null);

  // Color palette state at panel level
  const [colorEditingLayerId, setColorEditingLayerId] = useState<string | null>(null);
  const [showColorPalette, setShowColorPalette] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [originalColor, setOriginalColor] = useState<{ r: number; g: number; b: number; a: number } | null>(null);
  const [palettePosition, setPalettePosition] = useState({ x: 0, y: 0 });

  // Ref for the panel to detect clicks outside
  const panelRef = useRef<HTMLDivElement>(null);

  // Predefined colors (black is theme-aware)
  const getBlackWhiteColor = () => {
    const isDarkTheme = document.body.classList.contains('theme-dark');
    return isDarkTheme 
      ? { r: 1, g: 1, b: 1, a: 1 }  // White in dark mode
      : { r: 0, g: 0, b: 0, a: 1 }; // Black in light mode
  };

  const PREDEFINED_COLORS = [
    { r: 1, g: 0, b: 0, a: 1 },     // Red
    { r: 1, g: 1, b: 0, a: 1 },     // Yellow
    { r: 0, g: 1, b: 0, a: 1 },     // Green
    { r: 0, g: 1, b: 1, a: 1 },     // Cyan
    { r: 0, g: 0, b: 1, a: 1 },     // Blue
    { r: 1, g: 0, b: 1, a: 1 },     // Magenta
    getBlackWhiteColor(),            // Black/White (theme-aware)
  ];

  // Load layers and subscribe to changes
  useEffect(() => {
    const updateLayers = () => {
      setLayers(layerService.getLayerHierarchy());
      setActiveLayerId(layerService.getActiveLayerId());
    };

    updateLayers();
    
    const eventTypes = layerService.getEventTypes();
    const unsubscribeLayersChanged = layerService.subscribe(eventTypes.LAYERS_CHANGED, updateLayers);
    const unsubscribeActiveLayerChanged = layerService.subscribe(eventTypes.ACTIVE_LAYER_CHANGED, updateLayers);
    const unsubscribePropertiesChanged = layerService.subscribe(eventTypes.LAYER_PROPERTIES_CHANGED, updateLayers);
    
    return () => {
      unsubscribeLayersChanged();
      unsubscribeActiveLayerChanged();
      unsubscribePropertiesChanged();
    };
  }, []);

  // 🎯 UNIFIED CLICK OUTSIDE HANDLER
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      
      // Check if click is inside color tools (palette, picker, or swatch)
      const isInsideColorTools = target.closest('.color-palette-popover, .color-picker-popover, .color-swatch');
      
      // Check if click is inside layer panel (excluding color tools)
      const isInsidePanel = panelRef.current && panelRef.current.contains(target);
      const isInsidePanelExcludingColorTools = isInsidePanel && !isInsideColorTools;
      
      // Check if click is inside context menu
      const isInsideContextMenu = target.closest('.context-menu');

      // 🎯 1. Handle Color Tools Closing
      // Close color tools when clicking ANYWHERE except inside the color tools themselves
      if (!isInsideColorTools && (showColorPalette || showColorPicker)) {
        console.log('👆 Click outside color tools - closing');
        handleCancelColor();
      }

      // 🎯 2. Handle Context Menu Closing
      // Close context menu when clicking outside it (even inside panel)
      if (contextMenu && !isInsideContextMenu) {
        console.log('👆 Click outside context menu - closing');
        setContextMenu(null);
      }

      // 🎯 3. Handle Layer Selection Clearing
      // Only clear layer selection when clicking outside the ENTIRE panel
      if (!isInsidePanel && selectedLayerIds.size > 0) {
        console.log('👆 Click outside panel - clearing layer selection');
        setSelectedLayerIds(new Set());
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showColorPalette, showColorPicker, selectedLayerIds, contextMenu]);

  // Auto-edit effect for blocks and groups
  useEffect(() => {
    const checkAutoEdit = () => {
      const autoEditId = layerService.getAutoEditLayerId();
      if (autoEditId && autoEditId !== autoEditLayerId) {
        setAutoEditLayerId(autoEditId);
        layerService.clearAutoEditLayerId();
      }
    };

    checkAutoEdit();
    
    const eventTypes = layerService.getEventTypes();
    const unsubscribe = layerService.subscribe(eventTypes.LAYERS_CHANGED, checkAutoEdit);
    
    return unsubscribe;
  }, [autoEditLayerId]);

  // Handle layer selection
  const handleLayerSelect = (layerId: string, event: React.MouseEvent) => {
    const newSelected = new Set(selectedLayerIds);
    
    if (event.ctrlKey || event.metaKey) {
      // Ctrl+Click: Toggle selection
      if (newSelected.has(layerId)) {
        newSelected.delete(layerId);
      } else {
        newSelected.add(layerId);
      }
    } else if (event.shiftKey && selectedLayerIds.size > 0) {
      // Shift+Click: Range selection
      const allLayerIds = getAllLayerIdsFlattened();
      const lastSelected = Array.from(selectedLayerIds).pop()!;
      const startIndex = allLayerIds.indexOf(lastSelected);
      const endIndex = allLayerIds.indexOf(layerId);
      
      if (startIndex !== -1 && endIndex !== -1) {
        const rangeStart = Math.min(startIndex, endIndex);
        const rangeEnd = Math.max(startIndex, endIndex);
        
        for (let i = rangeStart; i <= rangeEnd; i++) {
          newSelected.add(allLayerIds[i]);
        }
      }
    } else {
      // Single click: Replace selection
      newSelected.clear();
      newSelected.add(layerId);
    }
    
    setSelectedLayerIds(newSelected);
  };

  // Handle layer activation (double-click)
  const handleLayerActivate = (layerId: string) => {
    const layer = layerService.getLayer(layerId);
    if (!layer) return;
    
    // Only activate if it's a layer (not group/block)
    if (layer.type !== 'layer') {
      console.log(`🚫 Cannot activate ${layer.type} - only layers can be active`);
      return;
    }
    
    layerService.setActiveLayer(layerId);
    setActiveLayerId(layerId);
  };

  // Handle adding new layer
  const handleAddLayer = () => {
    if (newLayerName.trim()) {
      layerService.createLayer(newLayerName.trim(), 'layer');
      setNewLayerName('');
      setIsAddingLayer(false);
    } else {
      setIsAddingLayer(false);
    }
  };

  // Handle context menu
  const handleContextMenu = (layerId: string, event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      layerId
    });
  };

  const handleContextMenuAction = (action: string) => {
    if (!contextMenu) return;

    const layerId = contextMenu.layerId;
    const selectedIds = selectedLayerIds.size > 0 ? Array.from(selectedLayerIds) : [layerId];

    switch (action) {
      case 'create-group':
        const groupId = layerService.createGroupFromLayers(selectedIds);
        setAutoEditLayerId(groupId);
        break;
      case 'create-block':
        const blockId = layerService.createBlockFromLayers(selectedIds);
        setAutoEditLayerId(blockId);
        break;
      case 'ungroup':
        layerService.ungroupLayers(selectedIds.filter(id => {
          const layer = layerService.getLayer(id);
          return layer?.type === 'group';
        }));
        break;
      case 'duplicate':
        console.log('Duplicate layers:', selectedIds);
        break;
      case 'delete':
        selectedIds.forEach(id => {
          const layer = layerService.getLayer(id);
          if (layer) {
            console.log('🗑️ Deleting layer:', { id, type: layer.type, isBlockInstance: layer.isBlockInstance });
            
            // Special handling for blocks
            if (layer.type === 'block' || layer.isBlockInstance) {
              console.log('🧱 Deleting block:', id);
              layerService.deleteLayer(id);
            } else {
              // Normal deletion for layers and groups
              layerService.deleteLayer(id);
            }
          }
        });
        break;
      case 'rename':
        setAutoEditLayerId(layerId);
        break;
    }

    setContextMenu(null);
  };

  // Open color palette for a specific layer
  const handleColorSwatchClick = (layerId: string, position: { x: number; y: number }) => {
    const layer = layerService.getLayer(layerId);
    if (!layer) return;

    setColorEditingLayerId(layerId);
    setOriginalColor(layer.properties.color);
    setPalettePosition(position);
    setShowColorPalette(true);
    setShowColorPicker(false);
  };

  // Handle color selection from palette
  const handleColorSelect = (color: { r: number; g: number; b: number; a: number }) => {
    if (colorEditingLayerId) {
      layerService.updateLayerProperties(colorEditingLayerId, { color });
    }
    closeColorPicker();
  };

  // Open color picker
  const handleCustomColorClick = () => {
    setShowColorPicker(true);
  };

  // Close everything
  const closeColorPicker = () => {
    setShowColorPalette(false);
    setShowColorPicker(false);
    setColorEditingLayerId(null);
    setOriginalColor(null);
  };

  // Cancel color changes
  const handleCancelColor = () => {
    if (colorEditingLayerId && originalColor) {
      layerService.updateLayerProperties(colorEditingLayerId, { color: originalColor });
    }
    closeColorPicker();
  };

  // Get current editing layer's color
  const getEditingLayerColor = () => {
    if (!colorEditingLayerId) return { r: 0, g: 0, b: 0, a: 1 };
    const layer = layerService.getLayer(colorEditingLayerId);
    return layer ? layer.properties.color : { r: 0, g: 0, b: 0, a: 1 };
  };

  // Check if a color is currently selected for editing layer
  const isColorSelected = (color: { r: number; g: number; b: number; a: number }) => {
    if (!colorEditingLayerId) return false;
    const layer = layerService.getLayer(colorEditingLayerId);
    if (!layer) return false;

    return (
      Math.abs(color.r - layer.properties.color.r) < 0.01 &&
      Math.abs(color.g - layer.properties.color.g) < 0.01 &&
      Math.abs(color.b - layer.properties.color.b) < 0.01 &&
      Math.abs(color.a - layer.properties.color.a) < 0.01
    );
  };

  // Check if current color is custom (not in predefined colors)
  const isCustomColor = () => {
    const currentColor = getEditingLayerColor();
    return !PREDEFINED_COLORS.some(color => 
      Math.abs(color.r - currentColor.r) < 0.01 &&
      Math.abs(color.g - currentColor.g) < 0.01 &&
      Math.abs(color.b - currentColor.b) < 0.01
    );
  };

  // Helper to get all layer IDs in flattened order for range selection
  const getAllLayerIdsFlattened = (): string[] => {
    const result: string[] = [];
    
    const traverse = (layerList: Layer[]) => {
      layerList.forEach(layer => {
        result.push(layer.id);
        if (layer.properties.expanded) {
          traverse(layer.children);
        }
      });
    };
    
    traverse(layers);
    return result;
  };

  // Recursive layer renderer
  const renderLayerTree = (layerList: Layer[], depth: number = 0): JSX.Element[] => {
    return layerList.map(layer => (
      <React.Fragment key={layer.id}>
        <LayerItem
          layer={layer}
          depth={depth}
          isActive={activeLayerId === layer.id}
          isSelected={selectedLayerIds.has(layer.id)}
          isHovered={hoveredLayerId === layer.id}
          autoEditLayerId={autoEditLayerId}
          onSelect={handleLayerSelect}
          onActivate={handleLayerActivate}
          onHover={setHoveredLayerId}
          onToggleExpand={(id) => {
            const layer = layerService.getLayer(id);
            if (layer) {
              layerService.updateLayerProperties(id, { 
                expanded: !layer.properties.expanded 
              });
            }
          }}
          onContextMenu={handleContextMenu}
          onEditComplete={() => setAutoEditLayerId(null)}
          onColorSwatchClick={handleColorSwatchClick}
        />
        {layer.properties.expanded && layer.children.length > 0 && (
          <div className="layer-children">
            {renderLayerTree(layer.children, depth + 1)}
          </div>
        )}
      </React.Fragment>
    ));
  };

  return (
    <div className="layers-panel" ref={panelRef}>
      {/* Search Bar and Add New Layer */}
      <div className="layer-search">
        <input
          type="text"
          placeholder="Search layers..."
          className="search-input"
        />
        <button 
          className="add-layer-button"
          onClick={() => setIsAddingLayer(true)}
          title="Add New Layer"
        >
          <NewLayerIcon />
        </button>
      </div>
      
      {/* Panel Body */}
      <div className="panel-body">
        {/* Layers List */}
        <div className="layers-list">
          {/* Add New Layer Input */}
          {isAddingLayer && (
            <div className="layer-item adding-layer">
              <input
                type="text"
                value={newLayerName}
                onChange={(e) => setNewLayerName(e.target.value)}
                onBlur={handleAddLayer}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddLayer();
                  if (e.key === 'Escape') setIsAddingLayer(false);
                }}
                placeholder="Layer name"
                autoFocus
                className="layer-name-input"
              />
            </div>
          )}

          {/* Layer Tree */}
          {renderLayerTree(layers)}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="context-menu-item" onClick={() => handleContextMenuAction('create-group')}>
            Create Group
          </div>
          <div className="context-menu-item" onClick={() => handleContextMenuAction('create-block')}>
            Create Block
          </div>
          <div className="context-menu-item" onClick={() => handleContextMenuAction('ungroup')}>
            Ungroup
          </div>
          <div className="context-menu-divider" />
          <div className="context-menu-item" onClick={() => handleContextMenuAction('duplicate')}>
            Duplicate
          </div>
          <div className="context-menu-item" onClick={() => handleContextMenuAction('rename')}>
            Rename
          </div>
          <div className="context-menu-divider" />
          <div className="context-menu-item destructive" onClick={() => handleContextMenuAction('delete')}>
            Delete
          </div>
        </div>
      )}

      {/* Color Palette Popover - Now at panel level */}
      {showColorPalette && (
        <div 
          className="color-palette-popover"
          style={{
            position: 'fixed',
            left: palettePosition.x,
            top: palettePosition.y,
            zIndex: 10000
          }}
        >
          <div className="color-palette-grid">
            {PREDEFINED_COLORS.map((color, index) => (
              <button
                key={index}
                className={`color-palette-swatch ${isColorSelected(color) ? 'selected' : ''}`}
                style={{
                  backgroundColor: `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${color.a})`
                }}
                onClick={() => handleColorSelect(color)}
                title={`RGB(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)})`}
              />
            ))}
            <button
              className="color-palette-custom"
              style={{
                backgroundColor: isCustomColor() 
                  ? `rgba(${Math.round(getEditingLayerColor().r * 255)}, ${Math.round(getEditingLayerColor().g * 255)}, ${Math.round(getEditingLayerColor().b * 255)}, ${getEditingLayerColor().a})`
                  : 'var(--toolButton-bg)'
              }}
              onClick={handleCustomColorClick}
              title="Custom color"
            >
              +
            </button>
          </div>

          {/* Color Picker (shown when + is clicked) */}
          {showColorPicker && colorEditingLayerId && (
            <ColorPicker
              currentColor={getEditingLayerColor()}
              onColorChange={(color) => {
                if (colorEditingLayerId) {
                  layerService.updateLayerProperties(colorEditingLayerId, { color });
                }
              }}
              onApply={closeColorPicker}
              onCancel={handleCancelColor}
              position={{
                x: palettePosition.x,
                y: palettePosition.y + 40 // Below the palette
              }}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default LayerPanel;