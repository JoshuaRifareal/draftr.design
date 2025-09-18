import React from 'react';

interface UIOverlayProps {
    scale: number;
    debug: boolean;
    setDebug: (debug: boolean) => void;
    handleClear: () => void;
}

const UIOverlay: React.FC<UIOverlayProps> = ({ scale, debug, setDebug, handleClear }) => {
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
            zIndex: 9999
        }}>
            <div>Zoom: {Math.round(scale * 100)}%</div>
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