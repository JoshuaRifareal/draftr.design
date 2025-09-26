export type Theme = 'dark' | 'light';

export interface ThemeColors {
  // Rendering colors (for App.tsx)
  constraintColor: { r: number; g: number; b: number; a: number };
  orthoColor: { r: number; g: number; b: number; a: number };
  gridColor: { r: number; g: number; b: number; a: number };
  canvasColor: { r: number; g: number; b: number; a: number };
  selectionColor: { r: number; g: number; b: number; a: number };
  lineColor: { r: number; g: number; b: number; a: number };
  snapColor: { r: number; g: number; b: number; a: number };

  // CSS Variables (for UIOverlay.css)
  cssVariables: {
    '--mainMenu-bg': string;
    '--shareButton-bg': string;
    '--zoomLevelIndicator-color': string;
    '--panelHeader-bg': string;
    '--panelBody-bg': string;
    '--actionBar-bg': string;
    '--toolButton-bg': string;
    '--toolButton-active-bg': string;
    '--modeBar-bg': string;
    // Extended colors
    '--text-primary': string;
    '--text-secondary': string;
    '--border-color': string;
    '--shadow-color': string;
    // Icons
    '--svg-fill-color': string;
    '--svg-stroke-color': string;
    '--svg-active-color': string;
  };
}

export class ThemeManager {
  private currentTheme: Theme = 'dark';
  private themes: Record<Theme, ThemeColors>;
  private lastAppliedTheme: Theme | null = null; // Track last applied theme

  constructor() {
    this.themes = {
      dark: this.getDarkTheme(),
      light: this.getLightTheme()
    };
  }

  // DARK THEME \\
  private getDarkTheme(): ThemeColors {
    return {
      constraintColor: { r: 128, g: 0, b: 128, a: 1.0 },
      orthoColor: { r: 0, g: 255, b: 0, a: 1.0 },
      gridColor: { r: 0, g: 0, b: 0, a: 0.1 },
      canvasColor: { r: 0.17, g: 0.17, b: 0.19, a: 1.0 },
      selectionColor: { r: 0.0, g: 0.0, b: 1.0, a: 0.25 },
      lineColor: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 }, // White lines
      snapColor: { r: 1.0, g: 0.8, b: 0.0, a: 1.0 },
      
      cssVariables: {
        '--mainMenu-bg': '#1c1c1e',
        '--shareButton-bg': '#5f51ff',
        '--zoomLevelIndicator-color': '#ffffff',
        '--panelHeader-bg': '#262628',
        '--panelBody-bg': '#1c1c1e',
        '--actionBar-bg': '#1c1c1e',
        '--toolButton-bg': '#262628',
        '--toolButton-active-bg': '#5f51ff',
        '--modeBar-bg': '#3c3c3c',
        '--text-primary': '#ffffff',
        '--text-secondary': '#cccccc',
        '--border-color': '#444444',
        '--shadow-color': 'rgba(0, 0, 0, 0.3)',
        '--svg-fill-color': '#ffffff',      
        '--svg-stroke-color': '#ffffff',
        '--svg-active-color': '#ffffff',
      }
    };
  }

  // LIGHT THEME \\
  private getLightTheme(): ThemeColors {
    return {
      constraintColor: { r: 128, g: 0, b: 128, a: 1.0 },
      orthoColor: { r: 0, g: 150, b: 0, a: 1.0 },
      gridColor: { r: 0, g: 0, b: 0, a: 0.4 },
      canvasColor: { r: 0.95, g: 0.95, b: 0.96, a: 1.0 },
      selectionColor: { r: 0.0, g: 0.0, b: 1.0, a: 0.50 },
      lineColor: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }, // Black lines
      snapColor: { r: 1.0, g: 0.0, b: 0.0, a: 1.0 },
      
      cssVariables: {
        '--mainMenu-bg': '#d6d6d9',
        '--shareButton-bg': '#5f51ff',
        '--zoomLevelIndicator-color': '#000000',
        '--panelHeader-bg': '#d6d6d9',
        '--panelBody-bg': '#f5f5f5',
        '--actionBar-bg': 'rgba(255, 255, 255, 0.95)',
        '--toolButton-bg': '#f5f5f5',
        '--toolButton-active-bg': '#5f51ff',
        '--modeBar-bg': '#f5f5f5',
        '--text-primary': '#000000',
        '--text-secondary': '#666666',
        '--border-color': '#dddddd',
        '--shadow-color': 'rgba(0, 0, 0, 0.1)',
        '--svg-fill-color': '#000000',
        '--svg-stroke-color': '#000000',
        '--svg-active-color': '#ffffff',
      }
    };
  }


  // Setters and Getters \\
  setTheme(theme: Theme): void {
    if (this.currentTheme === theme && this.lastAppliedTheme === theme) {
      return;
    }
    
    this.currentTheme = theme;
    this.applyTheme(theme);
  }

  toggleTheme(): void {
    this.setTheme(this.currentTheme === 'dark' ? 'light' : 'dark');
  }

  getCurrentTheme(): Theme {
    return this.currentTheme;
  }

  getCurrentColors(): ThemeColors {
    return this.themes[this.currentTheme];
  }

  private applyTheme(theme: Theme): void {
    const colors = this.themes[theme];
    
    const root = document.documentElement;
    Object.entries(colors.cssVariables).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
    
    root.style.transition = 'all 0.3s ease-in-out';
    
    this.lastAppliedTheme = theme;
    console.log(`Theme Manager: ${theme} theme applied.`);
  }
}