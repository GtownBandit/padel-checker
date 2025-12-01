import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SpinnerService {
  private readonly _isSpinning = signal(false);

  readonly isSpinning = this._isSpinning.asReadonly();

  show(): void {
    this._isSpinning.set(true);
  }

  hide(): void {
    this._isSpinning.set(false);
  }
}
