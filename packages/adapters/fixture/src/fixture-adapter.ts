import type {
  AdapterCapabilities,
  AvailabilityRequest,
  AvailabilityResult,
  BackendBinding,
  BookingAdapter,
  BookRequest,
  BookResult,
  CancelRequest,
  CancelResult,
  NormalizedService,
  RescheduleRequest,
  RescheduleResult
} from "../../../core/src/index.js";

export const FIXTURE_SLOTS = [
  { start: "2026-07-01T15:00:00.000Z", end: "2026-07-01T16:00:00.000Z" },
  { start: "2026-07-01T17:00:00.000Z", end: "2026-07-01T18:00:00.000Z" }
];

export class FixtureAdapter implements BookingAdapter {
  readonly platform = "fixture";

  async capabilities(): Promise<AdapterCapabilities> {
    return {
      readServices: true,
      readAvailability: true,
      confirmBooking: true,
      cancelBooking: true,
      rescheduleBooking: true
    };
  }

  async listServices(binding: BackendBinding): Promise<NormalizedService[]> {
    return [...(binding.staticServices ?? [])];
  }

  async getAvailability(_binding: BackendBinding, req: AvailabilityRequest): Promise<AvailabilityResult> {
    return {
      supported: true,
      serviceId: req.serviceId,
      slots: FIXTURE_SLOTS,
      source: "fixture"
    };
  }

  async book(_binding: BackendBinding, req: BookRequest): Promise<BookResult> {
    if (req.slotStart && !FIXTURE_SLOTS.some((slot) => slot.start === req.slotStart)) {
      return {
        type: "rejected",
        reason: "slot_unavailable"
      };
    }

    const start = req.slotStart ?? FIXTURE_SLOTS[0].start;
    return {
      type: "confirmed",
      confirmationId: `fixture-${req.serviceId}-0001`,
      serviceId: req.serviceId,
      start,
      source: "fixture"
    };
  }

  async cancel(_binding: BackendBinding, req: CancelRequest): Promise<CancelResult> {
    if (req.confirmationId !== fixtureConfirmationId(req.serviceId)) {
      return {
        type: "rejected",
        reason: "confirmation_not_found"
      };
    }

    return {
      type: "cancelled",
      confirmationId: req.confirmationId,
      serviceId: req.serviceId,
      source: "fixture"
    };
  }

  async reschedule(_binding: BackendBinding, req: RescheduleRequest): Promise<RescheduleResult> {
    if (req.confirmationId !== fixtureConfirmationId(req.serviceId)) {
      return {
        type: "rejected",
        reason: "confirmation_not_found"
      };
    }

    if (!FIXTURE_SLOTS.some((slot) => slot.start === req.newSlotStart)) {
      return {
        type: "rejected",
        reason: "slot_unavailable"
      };
    }

    return {
      type: "rescheduled",
      confirmationId: req.confirmationId,
      serviceId: req.serviceId,
      start: req.newSlotStart,
      source: "fixture"
    };
  }
}

function fixtureConfirmationId(serviceId: string): string {
  return `fixture-${serviceId}-0001`;
}
