import type {
  AdapterCapabilities,
  AvailabilityRequest,
  AvailabilityResult,
  AvailabilitySlot,
  BackendBinding,
  BookingAdapter,
  BookRequest,
  BookResult,
  NormalizedService
} from "../../../core/src/index.js";

export interface SquareCatalogResponse {
  objects?: Array<{
    id: string;
    item_data?: {
      name?: string;
      description?: string;
      variations?: Array<{
        id: string;
        item_variation_data?: {
          name?: string;
          service_duration?: number;
          price_money?: {
            amount?: number;
            currency?: string;
          };
        };
      }>;
    };
  }>;
}

export interface SquareAvailabilityResponse {
  availabilities?: Array<{
    start_at?: string;
    location_id?: string;
    appointment_segments?: Array<{
      duration_minutes?: number;
      team_member_id?: string;
    }>;
  }>;
}

export interface SquareBookingResponse {
  booking?: {
    id?: string;
    start_at?: string;
  };
}

export type SquareConnectionStatus =
  | {
      ok: true;
      code: "ready";
    }
  | {
      ok: false;
      code: "missing_token" | "missing_location";
      reason: string;
    };

export interface SquareApiErrorBody {
  errors?: Array<{
    category?: string;
    code?: string;
    detail?: string;
  }>;
}

export interface SquareRestGatewayOptions {
  apiBase?: string;
  fetch?: typeof fetch;
}

export interface SquareGateway {
  listCatalogServices(binding: BackendBinding): Promise<SquareCatalogResponse>;
  searchAvailability(binding: BackendBinding, req: AvailabilityRequest): Promise<SquareAvailabilityResponse>;
  createBooking(binding: BackendBinding, req: BookRequest): Promise<SquareBookingResponse>;
}

export class SquareApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly errors: NonNullable<SquareApiErrorBody["errors"]> = []
  ) {
    super(`Square API failed ${status}`);
    this.name = "SquareApiError";
  }

  get primaryCode(): string | undefined {
    return this.errors[0]?.code;
  }

  get primaryCategory(): string | undefined {
    return this.errors[0]?.category;
  }
}

export class SquareAdapter implements BookingAdapter {
  readonly platform = "square";

  constructor(private readonly gateway: SquareGateway = new SquareRestGateway()) {}

  async capabilities(binding: BackendBinding): Promise<AdapterCapabilities> {
    const preflight = squareConnectionStatus(binding);
    const ready = preflight.ok;
    return {
      readServices: Boolean(binding.credentials?.accessToken),
      readAvailability: ready,
      confirmBooking: ready,
      cancelBooking: false,
      rescheduleBooking: false
    };
  }

  async listServices(binding: BackendBinding): Promise<NormalizedService[]> {
    if (!binding.credentials?.accessToken) {
      return binding.staticServices ?? [];
    }

    const res = await this.gateway.listCatalogServices(binding);
    return (res.objects ?? []).flatMap((item) =>
      (item.item_data?.variations ?? []).map((variation) => ({
        id: variation.id,
        name: item.item_data?.name ?? variation.item_variation_data?.name ?? variation.id,
        description: item.item_data?.description,
        durationMin: variation.item_variation_data?.service_duration
          ? Math.round(variation.item_variation_data.service_duration / 60_000)
          : undefined,
        price: variation.item_variation_data?.price_money?.amount
          ? {
              amount: variation.item_variation_data.price_money.amount,
              currency: variation.item_variation_data.price_money.currency ?? "USD"
            }
          : undefined
      }))
    );
  }

  async getAvailability(binding: BackendBinding, req: AvailabilityRequest): Promise<AvailabilityResult> {
    const preflight = squareConnectionStatus(binding);
    if (!preflight.ok) {
      return {
        supported: false,
        reason: preflight.reason,
        source: this.platform
      };
    }

    const res = await this.gateway.searchAvailability(binding, req);

    const slots: AvailabilitySlot[] = (res.availabilities ?? [])
      .filter((slot) => slot.start_at)
      .map((slot) => {
        const durationMin = slot.appointment_segments?.[0]?.duration_minutes ?? 0;
        const start = new Date(slot.start_at as string);
        const end = new Date(start.getTime() + durationMin * 60_000);
        return {
          start: start.toISOString(),
          end: end.toISOString(),
          staffId: slot.appointment_segments?.[0]?.team_member_id,
          metadata: { locationId: slot.location_id }
        };
      });

    return {
      supported: true,
      serviceId: req.serviceId,
      slots,
      source: this.platform
    };
  }

  async book(binding: BackendBinding, req: BookRequest): Promise<BookResult> {
    const preflight = squareConnectionStatus(binding);
    if (!preflight.ok || !req.slotStart) {
      return {
        type: "rejected",
        reason: "missing_square_credentials_location_or_slot"
      };
    }

    const res = await this.gateway.createBooking(binding, req);

    if (!res.booking?.id) {
      return {
        type: "rejected",
        reason: "square_missing_confirmation_id"
      };
    }

    return {
      type: "confirmed",
      confirmationId: res.booking.id,
      serviceId: req.serviceId,
      start: res.booking.start_at,
      source: this.platform
    };
  }
}

export class SquareRestGateway implements SquareGateway {
  private readonly apiBase: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SquareRestGatewayOptions | string = {}) {
    if (typeof options === "string") {
      this.apiBase = options;
      this.fetchImpl = fetch;
      return;
    }

    this.apiBase = options.apiBase ?? "https://connect.squareup.com/v2";
    this.fetchImpl = options.fetch ?? fetch;
  }

  async listCatalogServices(binding: BackendBinding): Promise<SquareCatalogResponse> {
    return this.request<SquareCatalogResponse>(binding, "/catalog/list?types=ITEM");
  }

  async searchAvailability(binding: BackendBinding, req: AvailabilityRequest): Promise<SquareAvailabilityResponse> {
    const body = {
      query: {
        filter: {
          location_id: binding.locationId,
          segment_filters: [{ service_variation_id: req.serviceId }],
          start_at_range: {
            start_at: req.from,
            end_at: req.to
          }
        }
      }
    };

    return this.request<SquareAvailabilityResponse>(binding, "/bookings/availability/search", {
      method: "POST",
      body: JSON.stringify(body)
    });
  }

  async createBooking(binding: BackendBinding, req: BookRequest): Promise<SquareBookingResponse> {
    return this.request<SquareBookingResponse>(binding, "/bookings", {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: squareIdempotencyKey(req),
        booking: {
          location_id: binding.locationId,
          start_at: req.slotStart,
          appointment_segments: [{ service_variation_id: req.serviceId }],
          customer_note: req.notes,
          seller_note: `AgentPort booking for ${req.customer.name}`
        }
      })
    });
  }

  private async request<T>(
    binding: BackendBinding,
    path: string,
    init: RequestInit = {}
  ): Promise<T> {
    const accessToken = binding.credentials?.accessToken;
    if (!accessToken) {
      throw new Error("Square access token is required");
    }

    const response = await this.fetchImpl(`${this.apiBase}${path}`, {
      ...init,
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Square-Version": binding.credentials?.squareVersion ?? "2026-06-14",
        ...init.headers
      }
    });

    if (!response.ok) {
      const body = await response.text();
      throw new SquareApiError(response.status, body, parseSquareErrorBody(body).errors ?? []);
    }

    return (await response.json()) as T;
  }
}

export function squareConnectionStatus(binding: BackendBinding): SquareConnectionStatus {
  if (!binding.credentials?.accessToken) {
    return {
      ok: false,
      code: "missing_token",
      reason: "missing_square_credentials_or_location"
    };
  }

  if (!binding.locationId) {
    return {
      ok: false,
      code: "missing_location",
      reason: "missing_square_credentials_or_location"
    };
  }

  return { ok: true, code: "ready" };
}

export function squareIdempotencyKey(req: BookRequest): string {
  const raw = [
    "agentport",
    req.businessId,
    req.serviceId,
    req.slotStart ?? "no-slot",
    req.customer.name
  ].join(":");
  return raw.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 128);
}

function parseSquareErrorBody(body: string): SquareApiErrorBody {
  try {
    const parsed = JSON.parse(body) as SquareApiErrorBody;
    return Array.isArray(parsed.errors) ? parsed : {};
  } catch {
    return {};
  }
}
