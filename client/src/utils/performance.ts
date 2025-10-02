// src/utils/performance.ts

export interface PerformanceMetrics {
  redrawCount: number;
  averageRedrawTime: number;
  lastRedrawTime: number;
  frameRate: number;
  memoryUsage?: number;
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics = {
    redrawCount: 0,
    averageRedrawTime: 0,
    lastRedrawTime: 0,
    frameRate: 0
  };
  
  private redrawTimes: number[] = [];
  private frameCount = 0;
  private lastFrameTime = performance.now();

  startMeasurement(label: string): number {
    return performance.now();
  }

  endMeasurement(label: string, startTime: number): number {
    return performance.now() - startTime;
  }

  recordRedraw(duration: number) {
    this.metrics.redrawCount++;
    this.metrics.lastRedrawTime = duration;
    this.redrawTimes.push(duration);
    
    // Keep only last 100 measurements
    if (this.redrawTimes.length > 100) {
      this.redrawTimes.shift();
    }
    
    this.metrics.averageRedrawTime = this.redrawTimes.reduce((a, b) => a + b, 0) / this.redrawTimes.length;
  }

  updateFrameRate() {
    this.frameCount++;
    const now = performance.now();
    const elapsed = now - this.lastFrameTime;
    
    if (elapsed >= 1000) {
      this.metrics.frameRate = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.lastFrameTime = now;
    }
  }

  getMetrics(): PerformanceMetrics {
    // Try to get memory usage if available
    if (typeof (performance as any).memory !== 'undefined') {
      this.metrics.memoryUsage = (performance as any).memory.usedJSHeapSize / (1024 * 1024);
    }
    
    return { ...this.metrics };
  }

  reset() {
    this.metrics = {
      redrawCount: 0,
      averageRedrawTime: 0,
      lastRedrawTime: 0,
      frameRate: 0
    };
    this.redrawTimes = [];
  }
}

// Simple debounce function
export const debounce = <T extends (...args: any[]) => void>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(null, args), delay);
  };
};

// Throttle function for high-frequency events
export const throttle = <T extends (...args: any[]) => void>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func.apply(null, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};