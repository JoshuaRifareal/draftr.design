// services/CommandService.ts - UPDATED VERSION
import { commandRegistry, type Command } from '../components/CommandBar/commands';
import type { RenderService } from './RenderService';
import { snappingService } from './SnappingService';
import type { ISnappingService } from './SnappingService';
import type { SelectionService } from './SelectionService';
import type { LayerService } from './LayerService';
import type { DrawingPrimitive } from '../types/draftrTypes';

export interface CommandContext {
    renderService: RenderService;
    snappingService: ISnappingService;
    selectionService?: SelectionService;
    layerService: LayerService;
    stateSetters: {
        setPrimitives: (primitives: DrawingPrimitive[]) => void;
        setScale: (scale: number) => void;
        setOffsetX: (offset: number) => void;
        setOffsetY: (offset: number) => void;
        setActiveTool: (tool: string) => void;
        setSelectionStart: (start: { x: number; y: number } | null) => void;
        setSelectionEnd: (end: { x: number; y: number } | null) => void;
        setCurrentStart: (start: { x: number; y: number } | null) => void;
        setPreviewEnd: (end: { x: number; y: number } | null) => void;
        setSelectedPrimitiveIds: (ids: string[]) => void;
    };
    getCurrentState: () => any;
}

export class CommandService {
    private context: CommandContext;
    private layerService: LayerService;
    private history: { command: Command; executeData: any; previousState: any }[] = [];
    private future: { command: Command; executeData: any; previousState: any }[] = [];
    private isUndoing: boolean = false;

    constructor(context: CommandContext, layerService: LayerService) {
        this.context = context;
        this.layerService = layerService;
        console.log('🎯 CommandService initialized with state synchronization');
    }

    async execute(commandId: string, params?: any): Promise<void> {
        if (this.isUndoing) return;
    
        const command = commandRegistry.find(cmd => cmd.id === commandId);
        if (!command) {
            console.error(`❓ Command not found: ${commandId}`);
            return;
        }
    
        try {
            // Capture state right before execution
            const previousState = this.context.getCurrentState();

            // Execute the command
            const executeData = await command.execute(this.context, params);
            
            // Capture state after execution to verify
            const newState = this.context.getCurrentState();
            
            // Add to history with previous state
            if (!this.isUndoing) {
                this.history.push({ command, executeData, previousState });
                this.future = [];
            }
    
        } catch (error) {
            console.error(`❌ Command execution failed: ${commandId}`, error);
            throw error;
        }
    }

    undo(): void {
        if (this.history.length === 0) {
            console.log('⏪ Nothing to undo');
            return;
        }

        this.isUndoing = true;
        const lastAction = this.history.pop()!;

        try {
            if (lastAction.command.undo) {
                // Restore previous state
                this.restoreState(lastAction.previousState);
                this.future.push(lastAction);
                console.log(`⏪ Undo: ${lastAction.command.name}`, {
                    restoredPrimitives: lastAction.previousState.primitives.length
                });
            } else {
                console.warn(`⚠️ Command "${lastAction.command.name}" has no undo implementation`);
            }
        } catch (error) {
            console.error(`Undo failed for ${lastAction.command.name}:`, error);
            this.history.push(lastAction);
        } finally {
            this.isUndoing = false;
        }
    }

    redo(): void {
        if (this.future.length === 0) {
            console.log('⏩ Nothing to redo');
            return;
        }

        const nextAction = this.future.pop()!;
        this.isUndoing = true;
        
        try {
            // Re-execute the command
            nextAction.command.execute(this.context, nextAction.executeData);
            this.history.push(nextAction);
            console.log(`⏩ Redo: ${nextAction.command.name}`);
        } catch (error) {
            console.error(`Redo failed for ${nextAction.command.name}:`, error);
            this.future.push(nextAction);
        } finally {
            this.isUndoing = false;
        }
    }

    private restoreState(previousState: any): void {
        const { stateSetters } = this.context;
        
        // Restore all state properties
        stateSetters.setPrimitives(previousState.primitives || []);
        stateSetters.setScale(previousState.scale || 1);
        stateSetters.setOffsetX(previousState.offsetX || 0);
        stateSetters.setOffsetY(previousState.offsetY || 0);
        stateSetters.setActiveTool(previousState.activeTool || 'SELECTION');
        stateSetters.setSelectionStart(previousState.selectionStart || null);
        stateSetters.setSelectionEnd(previousState.selectionEnd || null);
        stateSetters.setCurrentStart(previousState.currentStart || null);
        stateSetters.setPreviewEnd(previousState.previewEnd || null);
        stateSetters.setSelectedPrimitiveIds(previousState.selectedPrimitiveIds || []);
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
        console.log('📚 Command history cleared');
    }
}