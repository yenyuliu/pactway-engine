import type { BackendBinding } from "./types.js";

export function deriveBindingId(binding: BackendBinding, index: number): string {
  const configured = binding.bindingId;
  return configured?.trim() ? configured : `${binding.platform}#${index}`;
}
