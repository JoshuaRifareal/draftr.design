import React from 'react';

interface IconProps {
  className?: string;
  size?: number;
}

export const NewLayerIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <svg 
    className={className} 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="currentColor"
  >
    <path fill= "none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M9 15C9 12.1716 9 10.7574 9.87868 9.87868C10.7574 9 12.1716 9 15 9L16 9C18.8284 9 20.2426 9 21.1213 9.87868C22 10.7574 22 12.1716 22 15V16C22 18.8284 22 20.2426 21.1213 21.1213C20.2426 22 18.8284 22 16 22H15C12.1716 22 10.7574 22 9.87868 21.1213C9 20.2426 9 18.8284 9 16L9 15Z" ></path>
    <path fill= "none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M16.9999 9C16.9975 6.04291 16.9528 4.51121 16.092 3.46243C15.9258 3.25989 15.7401 3.07418 15.5376 2.90796C14.4312 2 12.7875 2 9.5 2C6.21252 2 4.56878 2 3.46243 2.90796C3.25989 3.07417 3.07418 3.25989 2.90796 3.46243C2 4.56878 2 6.21252 2 9.5C2 12.7875 2 14.4312 2.90796 15.5376C3.07417 15.7401 3.25989 15.9258 3.46243 16.092C4.51121 16.9528 6.04291 16.9975 9 16.9999" ></path>
    <path fill= "none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M18 15.5L13 15.5M15.5 13V18"></path>
  </svg>
);

export const EyeIcon: React.FC<IconProps> = ({ className = "", size = 16 }) => (
  <svg 
    className={className} 
    width={size} 
    height={size} 
    viewBox="0 0 16 16"
    fill="currentColor"
  >
    <path fill="#ffffff" fillRule="evenodd" d="M3.035 8.07 3.01 8l.026-.07q.064-.155.235-.412a5.6 5.6 0 0 1 1.053-1.121C5.257 5.627 6.54 5 8 5s2.743.628 3.677 1.397c.465.383.821.783 1.053 1.121.116.17.191.31.235.413L12.99 8l-.026.07q-.064.155-.235.412a5.6 5.6 0 0 1-1.053 1.121C10.743 10.373 9.46 11 8 11s-2.743-.628-3.677-1.397A5.6 5.6 0 0 1 3.27 8.482a2.5 2.5 0 0 1-.235-.413M2 8c0-1 2.5-4 6-4s6 3 6 4-2.5 4-6 4-6-3-6-4m6 1a1 1 0 1 0 0-2 1 1 0 0 0 0 2" ></path>
  </svg>
);

export const EyeClosedIcon: React.FC<IconProps> = ({ className = "", size = 16 }) => (
  <svg 
    className={className} 
    width={size} 
    height={size} 
    viewBox="0 0 16 16" 
    fill="currentColor"
  >
    <path fill="#ffffff" fillRule="evenodd" d="M2.159 6.058c-.14-.292.103-.558.427-.558.38 0 .43.08.571.307q.047.076.113.175c.232.338.588.738 1.053 1.121C5.257 7.873 6.54 8.5 8 8.5s2.743-.628 3.677-1.397a5.6 5.6 0 0 0 1.053-1.121l.109-.168c.148-.235.198-.314.575-.314.324 0 .566.266.427.558-.234.491-.718 1.12-1.397 1.706l.972 1.459a.5.5 0 1 1-.832.554l-.94-1.41a7.2 7.2 0 0 1-1.59.784l.43 1.728a.5.5 0 0 1-.97.242l-.429-1.718a6.2 6.2 0 0 1-2.17 0l-.43 1.718a.5.5 0 0 1-.97-.242l.432-1.728a7.2 7.2 0 0 1-1.59-.784l-.941 1.41a.5.5 0 0 1-.832-.554l.972-1.459c-.68-.586-1.163-1.215-1.397-1.706"></path>
  </svg>
);

export const LockIcon: React.FC<IconProps> = ({ className = "", size = 16 }) => (
  <svg 
    className={className} 
    width={size} 
    height={size} 
    viewBox="0 0 16 16" 
    fill="none"
  >
    <path fill="#ffffff" fillRule="evenodd" d="M5 5a3 3 0 0 1 6 0v2.025c.57.116 1 .62 1 1.225v3.5c0 .69-.56 1.25-1.25 1.25h-5.5C4.56 13 4 12.44 4 11.75v-3.5C4 7.56 4.56 7 5.25 7H10V5a2 2 0 1 0-4 0 .5.5 0 0 1-1 0m.25 3a.25.25 0 0 0-.25.25v3.5c0 .138.112.25.25.25h5.5a.25.25 0 0 0 .25-.25v-3.5a.25.25 0 0 0-.25-.25z"></path>
  </svg>
);

export const UnlockIcon: React.FC<IconProps> = ({ className = "", size = 16 }) => (
  <svg 
    className={className} 
    width={size} 
    height={size} 
    viewBox="0 0 16 16" 
    fill="#ffffff"
  >
    <rect width="6" height="4" x="5" y="8" fill="var(--fpl-icon-color-3, var(--color-icon-tertiary))" rx=".25"></rect>
    <path fill="#ffffff" fillRule="evenodd" d="M10.776 8H5.224l-.025.005A.25.25 0 0 0 5 8.25v3.5c0 .138.112.25.25.25h5.5a.25.25 0 0 0 .25-.25v-3.5a.25.25 0 0 0-.199-.245zM7 7H6V6a2 2 0 1 1 4 0v1zM5 6a3 3 0 0 1 6 0v1.025c.57.116 1 .62 1 1.225v3.5c0 .69-.56 1.25-1.25 1.25h-5.5C4.56 13 4 12.44 4 11.75v-3.5c0-.605.43-1.11 1-1.225z"></path>
  </svg>
);

export const ExpandIcon: React.FC<IconProps> = ({ className = "", size = 16 }) => (
  <svg 
    className={className} 
    width={size} 
    height={size} 
    viewBox="0 0 17 17" 
    fill="currentColor"
  >
    <path stroke="none" strokeWidth="1" fill="#ffffff" fillRule="evenodd" d="M6.077,1.162 C6.077,1.387 6.139,1.612 6.273,1.812 L10.429,8.041 L6.232,14.078 C5.873,14.619 6.019,15.348 6.56,15.707 C7.099,16.068 7.831,15.922 8.19,15.382 L12.82,8.694 C13.084,8.3 13.086,7.786 12.822,7.39 L8.233,0.51 C7.873,-0.032 7.141,-0.178 6.601,0.181 C6.26,0.409 6.077,0.782 6.077,1.162 L6.077,1.162 Z"></path>
  </svg>
);

export const CollapseIcon: React.FC<IconProps> = ({ className = "", size = 16 }) => (
  <svg 
    className={className} 
    width={size} 
    height={size} 
    viewBox="0 0 17 17" 
    fill="currentColor"
  >
    <path stroke="none" strokeWidth="1" fill="#ffffff" fillRule="evenodd" d="M2.16,6.246 C2.385,6.246 2.61,6.308 2.81,6.442 L9.039,10.598 L15.076,6.401 C15.617,6.042 16.346,6.188 16.705,6.729 C17.065,7.268 16.92,8 16.38,8.359 L9.692,12.989 C9.298,13.253 8.784,13.254 8.388,12.991 L1.508,8.402 C0.966,8.042 0.82,7.31 1.179,6.77 C1.407,6.429 1.78,6.246 2.16,6.246 L2.16,6.246 Z"></path>
  </svg>
);

export const LayerIcon: React.FC<IconProps> = ({ className = "", size = 16 }) => (
  <svg 
    className={className} 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="currentColor"
  >
    <path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z"/>
  </svg>
);

export const GroupIcon: React.FC<IconProps> = ({ className = "", size = 16 }) => (
  <svg 
    className={className} 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="currentColor"
  >
    <path d="M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zm4 18v-6h2.5l-2.54-7.63A2.01 2.01 0 0 0 18.06 7h-.12a2 2 0 0 0-1.9 1.37l-.86 2.58c1.08.6 1.82 1.73 1.82 3.05v8h3zm-7.5-10.5c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5S11 9.17 11 10s.67 1.5 1.5 1.5zM5.5 6c1.11 0 2-.89 2-2s-.89-2-2-2-2 .89-2 2 .89 2 2 2zm2 16v-7H9V9c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v6h1.5v7h4zm6.5 0v-4h1v-4c0-.82-.68-1.5-1.5-1.5h-2c-.82 0-1.5.68-1.5 1.5v4h1v4h3z"/>
  </svg>
);

export const BlockIcon: React.FC<IconProps> = ({ className = "", size = 16 }) => (
  <svg 
    className={className} 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="currentColor"
  >
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z"/>
  </svg>
);