import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { FIREBASE_EMULATOR_HOST, FIREBASE_EMULATOR_PORTS, shouldUseFirebaseEmulators } from 'shared/app-environment';
import { getFirebaseApp } from 'shared/firebase-config';

const functionsByRegion = new Map<string, Functions>();

export function getCallableFunctions(region: string): Functions {
  const existing = functionsByRegion.get(region);
  if (existing) return existing;

  const functions = getFunctions(getFirebaseApp(), region);
  if (shouldUseFirebaseEmulators()) {
    connectFunctionsEmulator(functions, FIREBASE_EMULATOR_HOST, FIREBASE_EMULATOR_PORTS.functions);
  }
  functionsByRegion.set(region, functions);
  return functions;
}
