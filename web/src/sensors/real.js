/**
 * Real sensors: the GPS and BLE heart rate connections the user made on the setup
 * screen (see devices.js). Nothing is connected from here, so a live run never
 * raises a permission prompt; whatever is connected drives the run.
 */
export function createRealSensors({
  devices,
  onPosition,
  onHeartRate,
  onHeartRateStatus = () => {},
}) {
  devices.attach({ onPosition, onHeartRate, onHeartRateStatus });

  return {
    stop() {
      devices.detach();
    },

    /** Must be called from a user gesture (Web Bluetooth requirement). */
    connectHeartRate: devices.connectHeartRate,
  };
}
