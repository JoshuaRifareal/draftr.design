// services/AppStateStore.ts
import type { DrawingPrimitive } from '../types/draftrTypes';

declare global {
    interface Window {
      appStateStore: any;
      AppStateStore: any;
      createInitialState: any;
      testAppStateStore: any;
    }
}

export interface AppState {
  primitives: DrawingPrimitive[];
  selectedPrimitiveIds: string[];
  scale: number;
  offsetX: number;
  offsetY: number;
  activeTool: string;
  selectionStart: { x: number; y: number } | null;
  selectionEnd: { x: number; y: number } | null;
  currentStart: { x: number; y: number } | null;
  previewEnd: { x: number; y: number } | null;
  vertexConstraints: {x: number, y: number}[];
  activeConstraint: {x: number, y: number, type: 'horizontal' | 'vertical'} | null;
}

export interface CommandHistoryItem {
  state: AppState;
  commandName: string;
  timestamp: number;
}

export class AppStateStore {
  private currentState: AppState;
  private history: CommandHistoryItem[] = [];
  private future: CommandHistoryItem[] = [];
  private listeners: Set<(state: AppState) => void> = new Set();
  private maxHistorySize: number = 100;

  constructor(initialState: AppState) {
    this.currentState = initialState;
    console.log('🆕 AppStateStore initialized with', initialState.primitives.length, 'primitives');
  }

  // 🎯 MAIN PUBLIC API
  executeCommand(commandName: string, executeFn: (state: AppState) => AppState): void {
    // Capture current state for undo
    this.history.push({
      state: this.deepCloneState(this.currentState),
      commandName,
      timestamp: Date.now()
    });

    // Limit history size
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }

    // Clear redo stack
    this.future = [];

    // Execute command to get new state
    const newState = executeFn(this.currentState);
    this.setState(newState);

    console.log(`✅ Command executed: ${commandName}`, {
      history: this.history.length,
      future: this.future.length,
      primitives: newState.primitives.length
    });
  }

  undo(): void {
    if (this.history.length === 0) {
      console.log('⏪ Nothing to undo');
      return;
    }

    const previous = this.history.pop()!;
    this.future.push({
      state: this.deepCloneState(this.currentState),
      commandName: `undo-${previous.commandName}`,
      timestamp: Date.now()
    });

    console.log(`⏪ Undo: ${previous.commandName}`, {
      restoringPrimitives: previous.state.primitives.length
    });

    this.setState(previous.state);
  }

  redo(): void {
    if (this.future.length === 0) {
      console.log('⏩ Nothing to redo');
      return;
    }

    const next = this.future.pop()!;
    this.history.push({
      state: this.deepCloneState(this.currentState),
      commandName: `redo-${next.commandName}`,
      timestamp: Date.now()
    });

    console.log(`⏩ Redo: ${next.commandName}`, {
      restoringPrimitives: next.state.primitives.length
    });

    this.setState(next.state);
  }

  // 🎯 STATE MANAGEMENT
  getState(): AppState {
    return this.currentState;
  }

  setState(newState: AppState): void {
    this.currentState = newState;
    this.notifyListeners();
  }

  updateState(updates: Partial<AppState>): void {
    this.currentState = { ...this.currentState, ...updates };
    this.notifyListeners();
  }

  // 🎯 SUBSCRIPTION MANAGEMENT
  subscribe(listener: (state: AppState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.currentState));
  }

  // 🎯 DEEP CLONE UTILITY
  private deepCloneState(state: AppState): AppState {
    return {
      ...state,
      primitives: state.primitives.map(primitive => ({ ...primitive })),
      selectedPrimitiveIds: [...state.selectedPrimitiveIds],
      selectionStart: state.selectionStart ? { ...state.selectionStart } : null,
      selectionEnd: state.selectionEnd ? { ...state.selectionEnd } : null,
      currentStart: state.currentStart ? { ...state.currentStart } : null,
      previewEnd: state.previewEnd ? { ...state.previewEnd } : null
    };
  }

  // 🎯 DEBUG UTILITIES
  getDebugInfo() {
    return {
      currentState: {
        primitives: this.currentState.primitives.length,
        selectedIds: this.currentState.selectedPrimitiveIds.length,
        scale: this.currentState.scale,
        activeTool: this.currentState.activeTool
      },
      history: this.history.map((item, index) => ({
        index,
        command: item.commandName,
        primitives: item.state.primitives.length,
        timestamp: new Date(item.timestamp).toLocaleTimeString()
      })),
      future: this.future.length
    };
  }

  canUndo(): boolean {
    return this.history.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  clearHistory(): void {
    this.history = [];
    this.future = [];
    console.log('📚 History cleared');
  }
}

// 🎯 Create initial state - SIMPLIFIED VERSION
export const createInitialState = (): AppState => {
  const state = {
    primitives: [],
    selectedPrimitiveIds: [],
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    activeTool: 'SELECTION',
    selectionStart: null,
    selectionEnd: null,
    currentStart: null,
    previewEnd: null,
    vertexConstraints: [],
    activeConstraint: null
  };
  console.log('🆕 createInitialState called, returning:', state);
  return state;
};

// 🎯 Global instance
const appStateStore = new AppStateStore(createInitialState());

// 🎯 Enhanced window export with error handling
if (typeof window !== 'undefined') {
  console.log('🌐 Setting up AppStateStore on window...');
  
  // Export the instance
  (window as any).appStateStore = appStateStore;
  
  // Export the class and factory function
  (window as any).AppStateStore = AppStateStore;
  (window as any).createInitialState = createInitialState;
  
  // Add a test function directly to window
  (window as any).testAppStateStore = () => {
    console.log('🧪 Testing AppStateStore...');
    
    if (!(window as any).appStateStore) {
      console.error('❌ appStateStore not found on window');
      return false;
    }
    
    const store = (window as any).appStateStore;
    
    try {
      // Test 1: Basic functionality
      console.log('📋 Test 1: Basic store access');
      console.log('Initial primitives:', store.getState().primitives.length);
      
      // Test 2: Execute command
      console.log('📋 Test 2: Execute command');
      store.executeCommand('test-command', (state: any) => ({
        ...state,
        primitives: [...state.primitives, {
          id: 'test-line-1',
          type: 'line',
          data: [0, 0, 100, 100, 1, 1, 1, 1],
          layerId: 'default'
        }]
      }));
      
      console.log('After command - Primitives:', store.getState().primitives.length);
      
      // Test 3: Undo
      console.log('📋 Test 3: Undo');
      store.undo();
      console.log('After undo - Primitives:', store.getState().primitives.length);
      
      // Test 4: Redo
      console.log('📋 Test 4: Redo');
      store.redo();
      console.log('After redo - Primitives:', store.getState().primitives.length);
      
      console.log('🎉 ALL TESTS PASSED!');
      return true;
      
    } catch (error) {
      console.error('❌ Test failed:', error);
      return false;
    }
  };
  
  console.log('✅ AppStateStore setup complete on window');
}

export { appStateStore };