import React from 'react';
import './UIOverlay.css';
import { CommandBar } from './CommandBar/CommandBar';
import { type Command } from './CommandBar/commands';
import { commandDispatcher } from '../services/CommandDispatcher';
import { CommandService } from '../services/CommandService'; 
import userIcon1 from '../assets/user-icon1.png';

type ToolType = 'SELECTION' | 'LINE' | 'RECTANGLE' | 'CIRCLE';

interface UIOverlayProps {
    scale: number;
    debug: boolean;
    setDebug: (debug: boolean) => void;
    handleClear: () => void;
    orthoSnapEnabled: boolean;
    setOrthoSnapEnabled: (enabled: boolean) => void;
    shiftHeld: boolean;
    orthoTempDisabled: boolean;
    activeTool: ToolType;
    onToolChange: (tool: ToolType) => void;
    onThemeToggle: () => void;
    selectedPrimitiveIds: string[];
}

export const UIOverlay: React.FC<UIOverlayProps> = (props) => {
  const {
    scale,
    // debug,
    // setDebug,
    // handleClear,
    // orthoSnapEnabled,
    // setOrthoSnapEnabled,
    // shiftHeld,
    // orthoTempDisabled,
    activeTool,
    // onToolChange,
    // onThemeToggle,
    selectedPrimitiveIds,
  } = props;


  // Handle command
  const handleCommandSelect = (command: Command) => {
    console.log('Command selected:', command.name);
    
    let params = undefined;
    if (command.id === 'delete-selected') {
      params = { selectedIds: selectedPrimitiveIds };
    }
    
    commandDispatcher.executeCommand(command.id, params);
  };

  // Handle tool change
  const handleToolChange = (tool: ToolType) => {
    const toolCommandMap: Record<ToolType, string> = {
      'SELECTION': 'selection-tool',
      'LINE': 'line-tool',
      'RECTANGLE': 'rectangle-tool',
      'CIRCLE': 'circle-tool'
    };
    const commandId = toolCommandMap[tool];
    if (commandId) {
      commandDispatcher.executeCommand(commandId);
    }
  };

  // Interface
  return (
    <div className="draftrUI">
      
      {/* Navigation Bar */}
      <div className="nagivationBar">

        <div className="navBarLeft">
          <div className="mainMenu">draftr</div>
          <div className="projectTitle">Project title 🚀</div>
        </div>

        <div className="navBarRight">
          <div className="collabIconsContainer">
            <div className="collabIcon">+3</div>
            <div className="collabIcon"><img src={userIcon1} alt="" /></div>
            <div className="collabIcon"></div>
            <div className="collabIcon"></div>
            <div className="collabIcon"></div>
          </div>
          <div className="shareButton">Share</div>
          <span className="zoomLevelIndicator">{Math.round(scale * 100)}%</span>
        </div>
        

      </div>

      {/* Layers Panel */}
      <div className="layersPanel">
        <div className="panelHeader">Layers</div>
        <div className="panelBody"></div>
      </div>

      {/* Action Bar */}
      <div className="actionBar">
        <div className="toolBar">

          {/* select */}
          <button className={`toolButton select ${activeTool === 'SELECTION' ? 'active' : ''}`} onClick={() => handleToolChange('SELECTION')}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
              <path d="M5.5 3.483c0-1.248 1.436-1.95 2.421-1.184l13.514 10.513c1.128.877.508 2.684-.92 2.684h-6.853c-.505 0-.981.23-1.294.626l-4.191 5.3c-.882 1.116-2.677.492-2.677-.93V3.483Zm15.014 10.513L7 3.483v17.009l4.191-5.3a3.15 3.15 0 0 1 2.47-1.196h6.853Z"/>
            </svg>
          </button>

          {/* line */}
          <button className={`toolButton line ${activeTool === 'LINE' ? 'active' : ''}`} onClick={() => handleToolChange('LINE')}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
              <path d="M19.78 5.28a.75.75 0 0 0-1.06-1.06l-9.472 9.47a4 4 0 1 0 1.06 1.06zM4.5 17a2.5 2.5 0 1 1 5 0a2.5 2.5 0 0 1-5 0"/>
            </svg>
          </button>

          {/* circle */}
          <button className={`toolButton circle ${activeTool === 'CIRCLE' ? 'active' : ''}`} onClick={() => handleToolChange('CIRCLE')}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
              <path d="M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 0 0 0-17ZM2 12C2 6.477 6.477 2 12 2s10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12Z"/>
            </svg>
          </button>

          {/* rectangle  */}
          <button className={`toolButton rectangle ${activeTool === 'RECTANGLE' ? 'active' : ''}`} onClick={() => handleToolChange('RECTANGLE')}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z"></path></svg>
          </button>

          <button className="modeBar"></button>
          
        </div>
      </div>
	  
      {/* Command Bar - This will appear dynamically */}
      <CommandBar onCommandSelect={handleCommandSelect} />

    </div>
  );
};

export default UIOverlay;