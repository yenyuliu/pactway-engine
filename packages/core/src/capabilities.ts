import type { ActionCapability, AdapterCapabilities } from "./types.js";

export function resolveActionCapability(caps: AdapterCapabilities): ActionCapability {
  if (caps.confirmBooking) {
    return "confirm";
  }

  if (caps.readServices || caps.readAvailability) {
    return "request";
  }

  return "inform";
}
