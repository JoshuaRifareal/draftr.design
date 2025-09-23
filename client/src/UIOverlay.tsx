import React from 'react';
import './UIOverlay.css';

interface UIOverlayProps {
    scale: number;
    debug: boolean;
    setDebug: (debug: boolean) => void;
    handleClear: () => void;
    orthoSnapEnabled: boolean;
    setOrthoSnapEnabled: (enabled: boolean) => void;
    shiftHeld: boolean;
    orthoTempDisabled: boolean;
    activeTool: string;
    handleToolChange: (tool: string) => void;
}

const UIOverlay: React.FC<UIOverlayProps> = ({ 
  scale, 
  debug, 
  setDebug, 
  handleClear, 
  orthoSnapEnabled, 
  setOrthoSnapEnabled,
  shiftHeld,
  orthoTempDisabled,
  activeTool,
  handleToolChange
  }) => {

  // Determine the display status for orthogonal snapping
  const getOrthoStatus = () => {
      if (shiftHeld) return "TEMP (Shift)";
      if (orthoTempDisabled) return "DISABLED (Vertex)";
      return orthoSnapEnabled ? "ON" : "OFF";
  };

  // Determine the color for orthogonal status
  const getOrthoStatusColor = () => {
      if (shiftHeld) return "#4CAF50"; // Green for temporary override
      if (orthoTempDisabled) return "#FF9800"; // Orange for vertex priority
      return orthoSnapEnabled ? "#4CAF50" : "#F44336"; // Green for on, red for off
  };

  return (
    <div className="draftrUI">
      
      {/* Navigation Bar */}
      <div className="nagivationBar">

        <div className="navBarLeft">
          <div className="mainMenu"></div>
          <div className="projectTitle">Project title 🚀</div>
        </div>

        <div className="navBarRight">
          <div className="collabIconsContainer">
            <div className="collabIcon"></div>
            <div className="collabIcon"></div>
            <div className="collabIcon"></div>
            <div className="collabIcon"></div>
          </div>
          <div className="shareButton">Share</div>
          <span className="zoomLevelIndicator">{Math.round(scale * 100)}%</span>
        </div>
        

      </div>

      {/* Properties Panel */}
      <div className="layersPanel">
        <div className="panelHeader">Layers</div>
        <div className="panelBody"></div>
      </div>

      {/* Action Bar */}
      <div className="actionBar">
        <div className="toolBar">
            <div className={`toolButton select ${activeTool === 'SELECTION' ? 'active' : ''}`} onClick={() => handleToolChange('SELECTION')}>
            </div>

            <div className={`toolButton line ${activeTool === 'LINE' ? 'active' : ''}`} onClick={() => handleToolChange('LINE')}>
            </div>

            <div className={`toolButton circle ${activeTool === 'CIRCLE' ? 'active' : ''}`} onClick={() => handleToolChange('CIRCLE')}>
            </div>

            <div className={`toolButton rectangle ${activeTool === 'RECTANGLE' ? 'active' : ''}`} onClick={() => handleToolChange('RECTANGLE')}>
            </div>
          <div className="modeBar"></div>
        </div>
      </div>
    </div>
  );
};

export default UIOverlay;