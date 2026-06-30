import { createHash } from "node:crypto";
import type {
  AdapterCapabilities,
  AvailabilityRequest,
  AvailabilityResult,
  BackendBinding,
  BookingAdapter,
  BookRequest,
  BookResult,
  NormalizedService
} from "../../../core/src/index.js";

export class ManualAdapter implements BookingAdapter {
  readonly platform = "manual";

  async capabilities(binding: BackendBinding): Promise<AdapterCapabilities> {
    const requestMode = binding.metadata?.requestMode === true;
    return {
      readServices: requestMode,
      readAvailability: false,
      confirmBooking: false,
      cancelBooking: false,
      rescheduleBooking: false
    };
  }

  async listServices(binding: BackendBinding): Promise<NormalizedService[]> {
    return binding.staticServices ?? [];
  }

  async getAvailability(_binding: BackendBinding, _req: AvailabilityRequest): Promise<AvailabilityResult> {
    return {
      supported: false,
      reason: "backend_no_availability_api",
      source: this.platform
    };
  }

  async book(binding: BackendBinding, req: BookRequest): Promise<BookResult> {
    if (binding.metadata?.requestMode === true && (req.requestedType === "request" || req.requestedType === undefined)) {
      return {
        type: "request",
        requestId: manualRequestId(binding, req),
        serviceId: req.serviceId,
        source: this.platform,
        reason: "owner_request"
      };
    }

    return {
      type: "handoff",
      serviceId: req.serviceId,
      bookingUrl: binding.bookingUrl,
      phone: binding.phone,
      reason: "no_integration"
    };
  }
}

function manualRequestId(binding: BackendBinding, req: BookRequest): string {
  const business = binding.businessId ?? req.businessId;
  const requestedTime = req.slotStart ?? "unspecified";
  return `manual-request-${slugPart(business)}-${slugPart(req.serviceId)}-${slugPart(requestedTime)}-${requestDigest(req)}`;
}

function slugPart(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return slug || "unknown";
}

function requestDigest(req: BookRequest): string {
  return createHash("sha256")
    .update(JSON.stringify({
      name: req.customer.name,
      email: req.customer.email ?? "",
      phone: req.customer.phone ?? "",
      notes: req.notes ?? ""
    }))
    .digest("hex")
    .slice(0, 12);
}
