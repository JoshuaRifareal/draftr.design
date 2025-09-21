import React from 'react';

interface UIOverlayProps {
    scale: number;
    debug: boolean;
    setDebug: (debug: boolean) => void;
    handleClear: () => void;
    orthoSnapEnabled: boolean;
    setOrthoSnapEnabled: (enabled: boolean) => void;
    shiftHeld: boolean;
    orthoTempDisabled: boolean;
}

const UIOverlay: React.FC<UIOverlayProps> = ({ 
    scale, 
    debug, 
    setDebug, 
    handleClear, 
    orthoSnapEnabled, 
    setOrthoSnapEnabled,
    shiftHeld,
    orthoTempDisabled
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
        <div style={{
            position: "absolute",
            right: 12,
            top: 12,
            background: "rgba(0,0,0,0.6)",
            color: "white",
            padding: "8px 10px",
            borderRadius: 6,
            fontFamily: "monospace",
            fontSize: 13,
            zIndex: 9999,
            minWidth: "180px"
        }}>
            <div>Zoom: {Math.round(scale * 100)}%</div>
            
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>Ortho Snap:</span>
                <span style={{ 
                    color: getOrthoStatusColor(),
                    fontWeight: "bold",
                    marginLeft: "8px"
                }}>
                    {getOrthoStatus()}
                </span>
            </div>
            
            <div style={{ marginTop: 6, fontSize: "11px", opacity: 0.7 }}>
                {shiftHeld ? "Shift overriding" : "F8 to toggle"}
            </div>

            <div style={{ marginTop: 6 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" checked={debug} onChange={() => setDebug(d => !d)} />
                    Debug
                </label>
            </div>

            <div style={{ marginTop: 6 }}>
                <button onClick={handleClear}>Clear</button>
            </div>
        </div>
    );
};

export default UIOverlay;