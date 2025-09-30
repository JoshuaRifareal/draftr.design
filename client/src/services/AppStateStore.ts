// services/AppStateStore.ts
import type { DrawingPrimitive } from '../types/DraftrTypes';
import type { Point, ConstraintType } from '../types/ToolTypes';

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
  // Undoable states
  selectionStart: Point | null;
  selectionEnd: Point | null;
  currentStart: Point | null;
  previewEnd: Point | null;
  vertexConstraints: Point[];
  activeConstraint: {x: number, y: number; type: ConstraintType} | null;
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

  // 🎯 Debounce tracking for navigation commands
  private lastNavigationState: AppState | null = null;
  private navigationDebounceTimer: number | null = null;
  private readonly NAVIGATION_DEBOUNCE_MS = 500;

  // 🎯 Memory management improvements
  private readonly MEMORY_LIMIT_MB = 50; // Limit total undo history memory
  private readonly STATE_SIZE_SAMPLE_COUNT = 10;
  private stateSizeSamples: number[] = [];

  constructor(initialState: AppState) {
    this.currentState = initialState;
    console.log('🆕 AppStateStore initialized with', initialState.primitives.length, 'primitives');
  }

  // 🎯 MAIN PUBLIC API
  // Execute command with filtered state for undo
  executeCommand(commandName: string, executeFn: (state: AppState) => AppState): void {
    // For navigation commands, use debounced version
    if (this.isNavigationCommand(commandName)) {
      this.executeNavigationCommand(commandName, executeFn);
      return;
    }

    // 🎯 Memory management: Estimate current state size
    const stateSize = this.estimateStateSize(this.currentState);
    this.stateSizeSamples.push(stateSize);
    
    // Keep only recent samples
    if (this.stateSizeSamples.length > this.STATE_SIZE_SAMPLE_COUNT) {
      this.stateSizeSamples.shift();
    }

    // 🎯 Check memory limit and trim history if needed
    if (this.isMemoryLimitReached() && this.history.length > 10) {
      console.warn('🧠 Memory limit approaching, trimming undo history');
      // Remove oldest 25% of history
      const trimCount = Math.floor(this.history.length * 0.25);
      this.history.splice(0, trimCount);
    }

    const stateForUndo = this.getUndoableState(this.currentState);
    
    this.history.push({
      state: stateForUndo,
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
      primitives: newState.primitives.length,
      estimatedMemoryMB: ((this.history.length * this.getAverageStateSize()) / (1024 * 1024)).toFixed(2)
    });
  }

  private isNavigationCommand(commandName: string): boolean {
    const navigationCommands = ['zoom', 'pan', 'zoom-in', 'zoom-out', 'reset-zoom'];
    return navigationCommands.some(cmd => commandName.includes(cmd));
  }

  // 🎯 Debounced navigation command execution
  private executeNavigationCommand(commandName: string, executeFn: (state: AppState) => AppState): void {
    // Cancel previous debounce timer
    if (this.navigationDebounceTimer !== null) {
      clearTimeout(this.navigationDebounceTimer);
    }

    // If we don't have a saved state for this navigation session, capture one
    if (!this.lastNavigationState) {
      this.lastNavigationState = this.getUndoableState(this.currentState);
    }

    // Execute the navigation change immediately
    const newState = executeFn(this.currentState);
    this.setState(newState);

    // Set debounce timer to capture undo state
    this.navigationDebounceTimer = window.setTimeout(() => {
      if (this.lastNavigationState) {
        this.history.push({
          state: this.lastNavigationState,
          commandName,
          timestamp: Date.now()
        });

        // Limit history size
        if (this.history.length > this.maxHistorySize) {
          this.history.shift();
        }

        // Clear redo stack
        this.future = [];

        console.log(`🎯 Navigation command captured: ${commandName}`, {
          history: this.history.length,
          scale: newState.scale,
          offsetX: newState.offsetX,
          offsetY: newState.offsetY
        });
      }

      // Reset for next navigation session
      this.lastNavigationState = null;
      this.navigationDebounceTimer = null;
    }, this.NAVIGATION_DEBOUNCE_MS);
  }

  // 🎯 Memory management methods
  private estimateStateSize(state: AppState): number {
    // Rough estimation of state size in bytes
    try {
      const jsonString = JSON.stringify(state);
      return new Blob([jsonString]).size;
    } catch (error) {
      console.warn('Failed to estimate state size, using default');
      return 1024; // Default 1KB
    }
  }

  private getAverageStateSize(): number {
    if (this.stateSizeSamples.length === 0) return 1024; // Default 1KB
    return this.stateSizeSamples.reduce((a, b) => a + b, 0) / this.stateSizeSamples.length;
  }

  private isMemoryLimitReached(): boolean {
    const avgStateSize = this.getAverageStateSize();
    const estimatedMemoryMB = (this.history.length * avgStateSize) / (1024 * 1024);
    return estimatedMemoryMB > this.MEMORY_LIMIT_MB;
  }

  // Get only undoable state (exclude temporary visual states)
  private getUndoableState(state: AppState): AppState {
    return {
      ...state,
      // KEEP these (undoable):
      primitives: state.primitives.map(primitive => ({ ...primitive })),
      selectedPrimitiveIds: [...state.selectedPrimitiveIds],
      scale: state.scale,
      offsetX: state.offsetX,
      offsetY: state.offsetY,
      activeTool: state.activeTool,
      
      // RESET these (not undoable):
      selectionStart: null,
      selectionEnd: null,
      currentStart: null,
      previewEnd: null,
      vertexConstraints: [],
      activeConstraint: null
    };
  }

  // Update temporary states without affecting undo history
  updateTemporaryState(updates: Partial<AppState>): void {
    this.currentState = { ...this.currentState, ...updates };
    this.notifyListeners();
  }

  undo(): void {
    if (this.history.length === 0) {
      console.log('⏪ Nothing to undo');
      return;
    }

    const previous = this.history.pop()!;
    this.future.push({
      state: this.getUndoableState(this.currentState), // Use getUndoableState here too
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
      state: this.getUndoableState(this.currentState), // Use getUndoableState here too
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

  // 🎯 DEBUG UTILITIES
  getDebugInfo() {
    const avgStateSize = this.getAverageStateSize();
    const estimatedMemoryMB = (this.history.length * avgStateSize) / (1024 * 1024);
    
    return {
      currentState: {
        primitives: this.currentState.primitives.length,
        selectedIds: this.currentState.selectedPrimitiveIds.length,
        scale: this.currentState.scale,
        activeTool: this.currentState.activeTool
      },
      memory: {
        estimatedMB: estimatedMemoryMB.toFixed(2),
        historyItems: this.history.length,
        averageStateSizeKB: (avgStateSize / 1024).toFixed(2),
        memoryLimitMB: this.MEMORY_LIMIT_MB,
        stateSizeSamples: this.stateSizeSamples.length
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
    this.stateSizeSamples = [];
    console.log('📚 History cleared');
  }

  // 🎯 Memory management public API
  getMemoryInfo() {
    const avgStateSize = this.getAverageStateSize();
    const estimatedMemoryMB = (this.history.length * avgStateSize) / (1024 * 1024);
    
    return {
      estimatedMB: estimatedMemoryMB.toFixed(2),
      historyItems: this.history.length,
      averageStateSizeKB: (avgStateSize / 1024).toFixed(2),
      memoryLimitMB: this.MEMORY_LIMIT_MB,
      stateSizeSamples: this.stateSizeSamples.length,
      isOverLimit: this.isMemoryLimitReached()
    };
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
          layerId: null
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
      
      // Test 5: Memory info
      console.log('📋 Test 5: Memory info');
      console.log('Memory Info:', store.getMemoryInfo());
      
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