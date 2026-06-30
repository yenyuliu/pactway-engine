import { timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import type { AgentPortCommitment } from "../../core/src/index.js";

export interface BusinessPrincipal {
  actorKind: "business_operator";
  principalId: string;
  businessIds: string[];
  scopes: string[];
}

export interface TicketHolderPrincipal {
  actorKind: "customer_holder";
  principalId: string;
  holderRefs: string[];
  scopes: string[];
}

export interface HostWalletPrincipal {
  actorKind: "plugin_host";
  principalId: string;
  walletIds: string[];
  scopes: string[];
  accountId?: string;
  agentSessionIds?: string[];
}

export type ActorKind =
  | "business_operator"
  | "customer_holder"
  | "plugin_host"
  | "gateway"
  | "backend_adapter";

export interface ActorContext {
  actorKind: ActorKind;
  principalId: string;
  scopes?: string[];
  businessId?: string;
  holderRef?: string;
  commitmentId?: string;
  authProvider?: string;
}

export type IdentityResult<T> =
  | { ok: true; principal: T }
  | { ok: false; reason: string };

export interface BusinessIdentityProvider {
  authenticate(input: {
    headers: IncomingHttpHeaders;
    businessId?: string;
    scope: string;
  }): IdentityResult<BusinessPrincipal>;
}

export interface TicketHolderIdentityProvider {
  authenticate(input: {
    holderRef?: string;
    commitment?: AgentPortCommitment;
    scope: string;
  }): IdentityResult<TicketHolderPrincipal>;
}

export interface HostWalletIdentityProvider {
  authenticate(input: {
    headers: IncomingHttpHeaders;
    walletRef?: string;
    agentSessionId?: string;
    scope: string;
  }): IdentityResult<HostWalletPrincipal>;
}

export interface StaticBusinessTokenIdentityProviderOptions {
  token?: string;
  headerName?: string;
  principalId?: string;
  businessIds?: string[];
  scopes?: string[];
}

export class StaticBusinessTokenIdentityProvider implements BusinessIdentityProvider {
  readonly #token?: string;
  readonly #headerName: string;
  readonly #principal: BusinessPrincipal;

  constructor(options: StaticBusinessTokenIdentityProviderOptions = {}) {
    this.#token = options.token;
    this.#headerName = (options.headerName ?? "x-agentport-business-token").toLowerCase();
    this.#principal = {
      actorKind: "business_operator",
      principalId: options.principalId ?? "business_operator:mvp",
      businessIds: options.businessIds?.length ? [...options.businessIds] : ["verified-spa"],
      scopes: options.scopes?.length ? [...options.scopes] : ["business_inbox:read"]
    };
  }

  authenticate(input: {
    headers: IncomingHttpHeaders;
    businessId?: string;
    scope: string;
  }): IdentityResult<BusinessPrincipal> {
    if (!this.#token) {
      return { ok: false, reason: "business_identity_unconfigured" };
    }

    if (!constantTimeEqual(headerValue(input.headers[this.#headerName]), this.#token)) {
      return { ok: false, reason: "business_inbox_token_required" };
    }

    if (!this.#principal.scopes.includes(input.scope)) {
      return { ok: false, reason: "business_scope_denied" };
    }

    if (input.businessId && !principalAllowsBusiness(this.#principal, input.businessId)) {
      return { ok: false, reason: "business_scope_denied" };
    }

    return { ok: true, principal: structuredClone(this.#principal) };
  }
}

export interface StaticTicketHolderIdentityProviderOptions {
  holderRefs?: string[];
  principalId?: string;
  scopes?: string[];
}

export class StaticTicketHolderIdentityProvider implements TicketHolderIdentityProvider {
  readonly #principal: TicketHolderPrincipal;

  constructor(options: StaticTicketHolderIdentityProviderOptions = {}) {
    this.#principal = {
      actorKind: "customer_holder",
      principalId: options.principalId ?? "customer_holder:mvp",
      holderRefs: options.holderRefs?.length ? [...options.holderRefs] : ["user_ticket_456"],
      scopes: options.scopes?.length ? [...options.scopes] : ["ticket:read", "ticket:send"]
    };
  }

  authenticate(input: {
    holderRef?: string;
    commitment?: AgentPortCommitment;
    scope: string;
  }): IdentityResult<TicketHolderPrincipal> {
    const holderRef = input.holderRef ?? input.commitment?.subject?.holderRef;
    if (!holderRef) {
      return { ok: false, reason: "ticket_holder_identity_required" };
    }

    if (!this.#principal.scopes.includes(input.scope)) {
      return { ok: false, reason: "ticket_holder_scope_denied" };
    }

    if (!this.#principal.holderRefs.includes(holderRef)) {
      return { ok: false, reason: "ticket_holder_scope_denied" };
    }

    return { ok: true, principal: structuredClone(this.#principal) };
  }
}

export interface StaticHostWalletIdentityProviderOptions {
  token?: string;
  headerName?: string;
  principalId?: string;
  walletIds?: string[];
  scopes?: string[];
  agentSessionIds?: string[];
}

export class StaticHostWalletIdentityProvider implements HostWalletIdentityProvider {
  readonly #token?: string;
  readonly #headerName: string;
  readonly #principal: HostWalletPrincipal;

  constructor(options: StaticHostWalletIdentityProviderOptions = {}) {
    this.#token = options.token;
    this.#headerName = (options.headerName ?? "x-agentport-wallet-token").toLowerCase();
    this.#principal = {
      actorKind: "plugin_host",
      principalId: options.principalId ?? "plugin_host:mvp",
      walletIds: options.walletIds?.length ? [...options.walletIds] : ["wallet:chatgpt-demo"],
      scopes: options.scopes?.length ? [...options.scopes] : ["wallet:read"],
      ...(options.agentSessionIds?.length ? { agentSessionIds: [...options.agentSessionIds] } : {})
    };
  }

  authenticate(input: {
    headers: IncomingHttpHeaders;
    walletRef?: string;
    agentSessionId?: string;
    scope: string;
  }): IdentityResult<HostWalletPrincipal> {
    if (!this.#token) {
      return { ok: false, reason: "host_wallet_identity_unconfigured" };
    }

    if (!constantTimeEqual(headerValue(input.headers[this.#headerName]), this.#token)) {
      return { ok: false, reason: "host_wallet_token_required" };
    }

    if (!this.#principal.scopes.includes(input.scope)) {
      return { ok: false, reason: "host_wallet_scope_denied" };
    }

    if (input.agentSessionId && this.#principal.agentSessionIds && !this.#principal.agentSessionIds.includes(input.agentSessionId)) {
      return { ok: false, reason: "host_wallet_session_denied" };
    }

    if (input.walletRef && !principalAllowsWallet(this.#principal, input.walletRef)) {
      return { ok: false, reason: "host_wallet_scope_denied" };
    }

    if (!input.walletRef && this.#principal.walletIds.length === 0) {
      return { ok: false, reason: "host_wallet_required" };
    }

    return { ok: true, principal: structuredClone(this.#principal) };
  }
}

export interface StaticAccountSessionHostWalletAccount {
  accountId: string;
  sessionProof: string;
  walletIds?: string[];
  principalId?: string;
  scopes?: string[];
  agentSessionIds?: string[];
}

export interface StaticAccountSessionHostWalletIdentityProviderOptions {
  accounts?: StaticAccountSessionHostWalletAccount[];
  headerName?: string;
}

export class StaticAccountSessionHostWalletIdentityProvider implements HostWalletIdentityProvider {
  readonly #headerName: string;
  readonly #accounts: Array<{
    sessionProof: string;
    principal: HostWalletPrincipal;
  }>;

  constructor(options: StaticAccountSessionHostWalletIdentityProviderOptions = {}) {
    this.#headerName = (options.headerName ?? "x-agentport-account-session-proof").toLowerCase();
    this.#accounts = (options.accounts ?? []).map((account) => ({
      sessionProof: account.sessionProof,
      principal: {
        actorKind: "plugin_host",
        principalId: account.principalId ?? `account:${account.accountId}`,
        accountId: account.accountId,
        walletIds: account.walletIds?.length ? [...account.walletIds] : [`wallet:${account.accountId}`],
        scopes: account.scopes?.length ? [...account.scopes] : ["wallet:read"],
        ...(account.agentSessionIds?.length ? { agentSessionIds: [...account.agentSessionIds] } : {})
      }
    }));
  }

  authenticate(input: {
    headers: IncomingHttpHeaders;
    walletRef?: string;
    agentSessionId?: string;
    scope: string;
  }): IdentityResult<HostWalletPrincipal> {
    if (this.#accounts.length === 0) {
      return { ok: false, reason: "account_session_unconfigured" };
    }

    const principal = this.#principalForSessionProof(headerValue(input.headers[this.#headerName]));
    if (!principal) {
      return { ok: false, reason: "account_session_required" };
    }

    if (!principal.scopes.includes(input.scope)) {
      return { ok: false, reason: "host_wallet_scope_denied" };
    }

    if (input.agentSessionId && principal.agentSessionIds && !principal.agentSessionIds.includes(input.agentSessionId)) {
      return { ok: false, reason: "host_wallet_session_denied" };
    }

    if (input.walletRef && !principalAllowsWallet(principal, input.walletRef)) {
      return { ok: false, reason: "host_wallet_scope_denied" };
    }

    if (!input.walletRef && principal.walletIds.length === 0) {
      return { ok: false, reason: "host_wallet_required" };
    }

    return { ok: true, principal: structuredClone(principal) };
  }

  #principalForSessionProof(sessionProof: string) {
    for (const account of this.#accounts) {
      if (constantTimeEqual(sessionProof, account.sessionProof)) {
        return account.principal;
      }
    }
    return undefined;
  }
}

export function principalAllowsBusiness(principal: BusinessPrincipal, businessId: string) {
  return principal.businessIds.includes("*") || principal.businessIds.includes(businessId);
}

export function principalAllowsWallet(principal: HostWalletPrincipal, walletId: string) {
  return principal.walletIds.includes("*") || principal.walletIds.includes(walletId);
}

export function businessPrincipalActor(principal: BusinessPrincipal, businessId?: string): ActorContext {
  return {
    actorKind: principal.actorKind,
    principalId: principal.principalId,
    scopes: [...principal.scopes],
    ...(businessId ? { businessId } : {}),
    authProvider: "business_identity"
  };
}

export function ticketHolderPrincipalActor(
  principal: TicketHolderPrincipal,
  input: {
    holderRef?: string;
    commitmentId?: string;
  } = {}
): ActorContext {
  return {
    actorKind: principal.actorKind,
    principalId: principal.principalId,
    scopes: [...principal.scopes],
    ...(input.holderRef ? { holderRef: input.holderRef } : {}),
    ...(input.commitmentId ? { commitmentId: input.commitmentId } : {}),
    authProvider: "ticket_holder_identity"
  };
}

export function pluginHostActor(principalId: string, scopes: string[] = ["ticket:send"]): ActorContext {
  return {
    actorKind: "plugin_host",
    principalId,
    scopes,
    authProvider: "action_facade"
  };
}

export function gatewayActor(scope: string, commitmentId?: string): ActorContext {
  return {
    actorKind: "gateway",
    principalId: "agentport-gateway",
    scopes: [scope],
    ...(commitmentId ? { commitmentId } : {}),
    authProvider: "agentport"
  };
}

function headerValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function constantTimeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
