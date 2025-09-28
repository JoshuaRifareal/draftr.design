export interface CommandEvent {
  type: 'EXECUTE_COMMAND' | 'COMMAND_COMPLETED' | 'COMMAND_FAILED';
  commandId: string;
  params?: any;
  timestamp: number;
}

export type EventListener = (event: CommandEvent) => void;

export class CommandDispatcher {
  private listeners: Set<EventListener> = new Set();

  dispatch(event: CommandEvent): void {
    this.listeners.forEach(listener => listener(event));
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  executeCommand(commandId: string, params?: any): void {
    this.dispatch({
      type: 'EXECUTE_COMMAND',
      commandId,
      params,
      timestamp: Date.now()
    });
  }
}

export const commandDispatcher = new CommandDispatcher();