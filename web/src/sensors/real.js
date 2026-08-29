/**
 * Real sensors: the GPS and BLE heart rate connections the user made on the setup
 * screen (see devices.js). Nothing is connected from here, so a live run never
 * raises a permission prompt; whatever is connected drives the run.
 */
export function createRealSensors({
  devices,
  onPosition,
  onHeartRate,
  onHeartRateStatus,
  onGpsStatus,
}) {
  // Fixes that land before the run starts (the setup screen keeps GPS warm while
  // the questions load) must not add distance or fire a kilometer.
  let running = false;

  devices.attach({
    onPosition: (point) => {
      if (running) onPosition(point);
    },
    onHeartRate,
    onHeartRateStatus,
    onGpsStatus,
  });

  return {
    start() {
      running = true;
    },

    stop() {
      running = false;
      devices.detach();
    },

    /** Must be called from a user gesture (Web Bluetooth requirement). */
    connectHeartRate: devices.connectHeartRate,

    /** Must be called from a user gesture (it raises the location prompt). */
    requestPermission: devices.requestGpsPermission,
  };
}
