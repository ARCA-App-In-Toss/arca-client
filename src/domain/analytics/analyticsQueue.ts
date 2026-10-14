import type { ProductEvent } from './productEvent.ts';
export class AnalyticsQueue {
  get pending() {
    return 0;
  }
  record(_event: ProductEvent): boolean {
    return false;
  }
  recordOnce(_key: string, _event: ProductEvent): void {}
  hint(): void {}
  async flush(): Promise<void> {}
  discardAll(): void {}
}
