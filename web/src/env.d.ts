/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

/** The Capacitor plugins this app calls through `window.Capacitor.Plugins`. */
interface CapacitorPlugins {
  App?: {
    addListener(event: 'appUrlOpen', listener: (event: { url: string }) => void): Promise<unknown>;
    getLaunchUrl?(): Promise<{ url?: string } | undefined>;
  };
  Browser?: {
    open(options: { url: string }): Promise<void>;
    close?(): Promise<void>;
  };
  Geolocation?: {
    requestPermissions(): Promise<unknown>;
    watchPosition(
      options: PositionOptions,
      callback: (position: GeolocationPosition | null, err?: Error) => void,
    ): Promise<string>;
    clearWatch(options: { id: string }): Promise<void>;
    getCurrentPosition(options: PositionOptions): Promise<GeolocationPosition>;
  };
  /** @capacitor-community/bluetooth-le; only ever handed to the native heart-rate monitor. */
  BluetoothLe?: unknown;
}

interface Window {
  Capacitor?: {
    isNativePlatform?(): boolean;
    Plugins?: CapacitorPlugins;
  };
  webkitAudioContext?: typeof AudioContext;
}

/** The part of Web Bluetooth (not in lib.dom) the heart-rate monitor uses. */
interface Bluetooth {
  requestDevice(options: {
    filters?: { services: number[] }[];
    optionalServices?: number[];
  }): Promise<EventTarget & { name?: string }>;
}

interface Navigator {
  bluetooth?: Bluetooth;
}
