import BoltReactNativeSdk from './NativeBoltReactNativeSdk';

export function multiply(a: number, b: number): number {
  return BoltReactNativeSdk.multiply(a, b);
}

export function divide(a: number, b: number): number {
  return a / b;
}
