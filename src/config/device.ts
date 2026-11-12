import { detectQuality, readDeviceSignals } from './quality';

/** Read once at startup: what this device is, and the quality level that suits it. */
export const deviceSignals = readDeviceSignals();
export const webglAvailable = deviceSignals.renderer !== undefined;
export const detectedQuality = detectQuality(deviceSignals);
