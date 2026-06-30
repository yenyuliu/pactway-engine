import type {
  AdapterCapabilities,
  AvailabilityRequest,
  AvailabilityResult,
  BackendBinding,
  BookRequest,
  BookResult,
  CancelRequest,
  CancelResult,
  NormalizedService,
  RescheduleRequest,
  RescheduleResult
} from "./types.js";

export interface BookingAdapter {
  readonly platform: string;

  capabilities(binding: BackendBinding): Promise<AdapterCapabilities>;
  listServices(binding: BackendBinding): Promise<NormalizedService[]>;
  getAvailability(binding: BackendBinding, req: AvailabilityRequest): Promise<AvailabilityResult>;
  book(binding: BackendBinding, req: BookRequest): Promise<BookResult>;
  cancel?(binding: BackendBinding, req: CancelRequest): Promise<CancelResult>;
  reschedule?(binding: BackendBinding, req: RescheduleRequest): Promise<RescheduleResult>;
}
