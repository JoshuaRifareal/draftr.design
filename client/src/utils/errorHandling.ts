// src/utils/errorHandling.ts

export interface ErrorWithMessage {
    message: string;
    stack?: string;
  }
  
  export function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
    return (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof (error as Record<string, unknown>).message === 'string'
    );
  }
  
  export function toErrorWithMessage(maybeError: unknown): ErrorWithMessage {
    if (isErrorWithMessage(maybeError)) return maybeError;
  
    try {
      return new Error(JSON.stringify(maybeError));
    } catch {
      // fallback in case there's an error stringifying the maybeError
      // like with circular references for example.
      return new Error(String(maybeError));
    }
  }
  
  export function getErrorMessage(error: unknown): string {
    return toErrorWithMessage(error).message;
  }
  
  export function getErrorStack(error: unknown): string | undefined {
    return isErrorWithMessage(error) ? error.stack : undefined;
  }
  
  // Safe try-catch wrapper for async operations
  export async function safeAsync<T>(
    operation: () => Promise<T>,
    fallback?: T
  ): Promise<{ result: T | null; error: string | null }> {
    try {
      const result = await operation();
      return { result, error: null };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      console.error('🚨 Async operation failed:', errorMessage);
      return { result: fallback || null, error: errorMessage };
    }
  }
  
  // Safe try-catch wrapper for sync operations
  export function safeSync<T>(
    operation: () => T,
    fallback?: T
  ): { result: T | null; error: string | null } {
    try {
      const result = operation();
      return { result, error: null };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      console.error('🚨 Sync operation failed:', errorMessage);
      return { result: fallback || null, error: errorMessage };
    }
  }