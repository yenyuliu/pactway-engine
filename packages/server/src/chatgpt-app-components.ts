export const chatGptAppComponentMimeType = "text/html;profile=mcp-app";

export const chatGptAppComponentUris = {
  status: "ui://agentport/status-card.html",
  approval: "ui://agentport/approval-card.html",
  receipt: "ui://agentport/receipt-card.html",
  handoff: "ui://agentport/handoff-card.html",
  resume: "ui://agentport/resume-card.html"
} as const;

export type ChatGptAppComponentKind = keyof typeof chatGptAppComponentUris;

export interface ChatGptAppComponentResource {
  name: ChatGptAppComponentKind;
  uri: string;
  title: string;
  description: string;
  mimeType: typeof chatGptAppComponentMimeType;
}

export const chatGptAppComponentResources: ChatGptAppComponentResource[] = [
  {
    name: "status",
    uri: chatGptAppComponentUris.status,
    title: "Pactway status card",
    description: "Shows verified current state and safe next actions.",
    mimeType: chatGptAppComponentMimeType
  },
  {
    name: "approval",
    uri: chatGptAppComponentUris.approval,
    title: "Pactway approval card",
    description: "Shows the exact bounded action and captures explicit approval.",
    mimeType: chatGptAppComponentMimeType
  },
  {
    name: "receipt",
    uri: chatGptAppComponentUris.receipt,
    title: "Pactway receipt card",
    description: "Shows the gateway outcome, receipt refs, and resume handle.",
    mimeType: chatGptAppComponentMimeType
  },
  {
    name: "handoff",
    uri: chatGptAppComponentUris.handoff,
    title: "Pactway handoff card",
    description: "Shows honest request or handoff outcomes without calling them confirmed.",
    mimeType: chatGptAppComponentMimeType
  },
  {
    name: "resume",
    uri: chatGptAppComponentUris.resume,
    title: "Pactway resume card",
    description: "Shows restored context after re-verifying through the gateway.",
    mimeType: chatGptAppComponentMimeType
  }
];

export function chatGptAppComponentResourceForUri(uri: string) {
  return chatGptAppComponentResources.find((resource) => resource.uri === uri);
}

export function createChatGptAppComponentHtml(kind: ChatGptAppComponentKind) {
  const title = componentTitle(kind);
  const empty = componentEmptyState(kind);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root {
      color-scheme: light dark;
      --bg: #ffffff;
      --panel: #f6f7f9;
      --text: #16181d;
      --muted: #5d6470;
      --line: #d9dee7;
      --accent: #2457d6;
      --ok: #167a45;
      --warn: #9a5b00;
      --danger: #9f1239;
      --radius: 8px;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #171a1f;
        --panel: #202630;
        --text: #f3f5f8;
        --muted: #aab2bf;
        --line: #323a46;
        --accent: #7aa2ff;
        --ok: #74d69a;
        --warn: #f1bd64;
        --danger: #f87171;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .card {
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--bg);
      overflow: hidden;
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
    }
    h1 {
      margin: 0;
      font-size: 14px;
      font-weight: 720;
      letter-spacing: 0;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 0 8px;
      border: 1px solid var(--line);
      border-radius: 999px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 650;
      white-space: nowrap;
    }
    .body {
      display: grid;
      gap: 10px;
      padding: 14px;
    }
    .summary {
      margin: 0;
      color: var(--text);
      font-size: 15px;
      font-weight: 650;
    }
    .muted { color: var(--muted); }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .field {
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 9px 10px;
      background: var(--panel);
    }
    .stack {
      display: grid;
      gap: 8px;
    }
    .item {
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 10px;
      background: var(--panel);
    }
    .item-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
      font-weight: 720;
    }
    .item-title span:first-child {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .mini {
      color: var(--muted);
      font-size: 12px;
      font-weight: 620;
      overflow-wrap: anywhere;
    }
    .label {
      display: block;
      margin-bottom: 3px;
      color: var(--muted);
      font-size: 11px;
      font-weight: 720;
      text-transform: uppercase;
    }
    .value {
      display: block;
      overflow-wrap: anywhere;
      color: var(--text);
      font-weight: 620;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 2px;
    }
    button {
      min-height: 34px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 0 11px;
      background: var(--accent);
      color: #fff;
      font-weight: 680;
      cursor: pointer;
    }
    button.secondary {
      background: transparent;
      color: var(--text);
    }
    .ok { color: var(--ok); }
    .warn { color: var(--warn); }
    .danger { color: var(--danger); }
    @media (max-width: 420px) {
      .grid { grid-template-columns: 1fr; }
      .head { align-items: flex-start; flex-direction: column; }
    }
  </style>
</head>
<body>
  <main class="card">
    <section class="head">
      <h1>${escapeHtml(title)}</h1>
      <span id="badge" class="badge">Pactway</span>
    </section>
    <section id="body" class="body">
      <p class="summary">${escapeHtml(empty)}</p>
      <p class="muted">Waiting for verified Pactway tool output.</p>
    </section>
  </main>
  <script>
    const kind = ${JSON.stringify(kind)};
    const body = document.getElementById("body");
    const badge = document.getElementById("badge");
    const api = window.openai || {};
    let latestData = null;

    function getData() {
      if (latestData && Object.keys(latestData).length > 0) return latestData;
      return normalizeData(
        api.toolOutput ||
        api.structuredContent ||
        api.toolResponseMetadata?.structuredContent ||
        api.toolResponseMetadata?.mcp_tool_result?.structuredContent ||
        api.toolResponseMetadata?.call_tool_result?.structuredContent ||
        api.toolResponseMetadata?.mcp_tool_result ||
        api.toolResponseMetadata?.call_tool_result ||
        api.output ||
        api.result ||
        {}
      );
    }

    function normalizeData(value) {
      if (!value || typeof value !== "object") return {};
      if (value.structuredContent && typeof value.structuredContent === "object") {
        return value.structuredContent;
      }
      if (value.result && typeof value.result === "object") {
        return normalizeData(value.result);
      }
      return value;
    }

    function setData(value) {
      const normalized = normalizeData(value);
      if (!normalized || Object.keys(normalized).length === 0) return false;
      latestData = normalized;
      render();
      return true;
    }

    function text(value, fallback = "Not provided") {
      if (value === undefined || value === null || value === "") return fallback;
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
    }

    function field(label, value, className = "") {
      return '<div class="field"><span class="label">' + escapeHtml(label) + '</span><span class="value ' + className + '">' + escapeHtml(text(value)) + '</span></div>';
    }

    function compactField(label, value) {
      return '<div class="mini"><strong>' + escapeHtml(label) + ':</strong> ' + escapeHtml(text(value)) + '</div>';
    }

    function item(title, badgeText, detailHtml) {
      return '<div class="item"><div class="item-title"><span>' + escapeHtml(text(title, "Pactway item")) + '</span><span class="badge">' + escapeHtml(text(badgeText, "ready")) + '</span></div>' + detailHtml + '</div>';
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }

    function first(...values) {
      return values.find((value) => value !== undefined && value !== null && value !== "");
    }

    function render() {
      const data = getData();
      if (!data || Object.keys(data).length === 0) return;
      const type = text(data.type || data.outcome || data.status, "ready");
      badge.textContent = type;
      if (kind === "approval") renderApproval(data);
      else if (kind === "receipt") renderReceipt(data);
      else if (kind === "handoff") renderHandoff(data);
      else if (kind === "resume") renderResume(data);
      else renderStatus(data);
      api.notifyIntrinsicHeight?.();
    }

    function renderStatus(data) {
      const actions = Array.isArray(data.allowedActions) ? data.allowedActions.join(", ") : undefined;
      body.innerHTML = '<p class="summary">Current state verified through Pactway.</p><div class="grid">'
        + field("Status", first(data.status, data.type, data.outcome, data.found ? "found" : undefined), "ok")
        + field("Source", first(data.statusSource, data.truthSource, data.boundaries?.gatewayIsLifecycleAuthority ? "gateway" : undefined, "agent_gateway"))
        + field("Reference", first(data.commitmentId, data.businessId, data.serviceId, data.deliveryId))
        + field("Next", first(actions, data.reason, data.nextStep, "No unsafe next action suggested"))
        + '</div>';
    }

    function renderApproval(data) {
      const approval = data.approvalPackage || data.approval || data;
      const card = approval.approvalCard || approval;
      body.innerHTML = '<p class="summary">Review the exact action before approving.</p><div class="grid">'
        + field("Business", first(card.businessName, card.businessId, data.businessId, data.actionIntent?.businessId))
        + field("Action", first(card.actionLabel, card.action, data.action, data.actionIntent?.action))
        + field("Effect", first(card.effect, card.summary, card.approvalText, data.actionIntent?.customerIntent))
        + field("Hash", first(card.actionIntentHash, approval.approvedActionIntentHash))
        + field("Intent", first(approval.intentId, data.intentId, data.lifecycle?.intentId))
        + field("Backend changed", first(card.backendMutation, approval.backendMutation, data.backendMutation, false))
        + '</div><p class="muted">Only this exact action package may be forwarded to a state-changing tool with explicit user consent.</p>';
    }

    function renderReceipt(data) {
      body.innerHTML = '<p class="summary">Pactway returned an outcome receipt.</p><div class="grid">'
        + field("Result", first(data.type, data.resultType, data.status), data.type === "confirmed" || data.type === "sent" ? "ok" : "")
        + field("Reason", first(data.reason, data.statusSource, "gateway_result"))
        + field("Receipt", first(data.receiptId, data.receipt?.receiptId, data.deliveryId, data.actionReceiptRef))
        + field("Resume ref", first(data.commitmentId, data.intentId, data.deliveryId))
        + field("Backend changed", first(data.backendMutation, data.receipt?.backendMutation, false))
        + field("Destination", first(data.destination?.label, data.destination?.target, data.delivery?.destination?.label))
        + '</div>';
    }

    function renderHandoff(data) {
      body.innerHTML = '<p class="summary">Pactway cannot honestly confirm this as a backend outcome.</p><div class="grid">'
        + field("Outcome", first(data.type, data.outcome, "handoff"), "warn")
        + field("Reason", first(data.reason, "backend_not_confirmable"))
        + field("Destination", first(data.destination?.label, data.destination?.kind, data.handoff?.type))
        + field("Next step", first(data.nextStep, data.message, "Use the provided handoff path"))
        + '</div>';
    }

    function renderResume(data) {
      const tickets = Array.isArray(data.tickets) ? data.tickets : [];
      const requests = Array.isArray(data.requests) ? data.requests : [];
      const rows = [
        ...tickets.map((ticket) => item(
          first(ticket.title, ticket.label, ticket.displayCode, ticket.walletTicketId, ticket.commitmentId),
          first(ticket.status, ticket.type, "ticket"),
          compactField("Commitment", first(ticket.commitmentId, ticket.displayCode, ticket.walletTicketId))
            + compactField("Evidence", ticket.evidence ? "available for follow-up" : "hidden until needed")
            + compactField("Current", ticket.verifiedCurrent === true ? "verified" : "needs gateway check")
        )),
        ...requests.map((request) => item(
          first(request.title, request.label, request.intentId, request.serviceId),
          first(request.status, request.lifecycleStatus, "request"),
          compactField("Intent", first(request.intentId, request.lifecycle?.intentId))
            + compactField("Next", first(request.nextStep, request.reason, request.status))
            + compactField("Updated", first(request.updatedAt, request.createdAt))
        ))
      ];
      const summary = first(data.counts?.total, data.count, rows.length, data.type, "checked");
      body.innerHTML = '<p class="summary">Pactway restored gateway-verified context.</p><div class="grid">'
        + field("Found", summary)
        + field("Tickets", first(data.counts?.tickets, tickets.length))
        + field("Requests", first(data.counts?.requests, requests.length))
        + field("Boundary", data.ticketEvidenceHiddenByDefault || data.boundaries?.ticketEvidenceHiddenByDefault ? "proof hidden by default" : "gateway checked")
        + '</div>'
        + (rows.length ? '<div class="stack">' + rows.join("") + '</div>' : '<p class="muted">No matching ticket or request was restored.</p>');
    }

    window.addEventListener("message", (event) => {
      if (event.source !== window.parent) return;
      const message = event.data;
      if (!message || message.jsonrpc !== "2.0") return;
      if (message.method === "ui/notifications/tool-result") {
        setData(message.params);
      }
    }, { passive: true });

    window.addEventListener("openai:set_globals", (event) => {
      const globals = event.detail?.globals || {};
      setData(
        globals.toolOutput ||
        globals.structuredContent ||
        globals.toolResponseMetadata?.mcp_tool_result ||
        globals.toolResponseMetadata?.call_tool_result ||
        globals.toolResponseMetadata
      );
    }, { passive: true });

    render();
    api.onToolOutput?.(setData);
    let attempts = 0;
    const hydrate = window.setInterval(() => {
      attempts += 1;
      const rendered = setData(getData());
      if (rendered || attempts >= 20) window.clearInterval(hydrate);
    }, 250);
  </script>
</body>
</html>`;
}

function componentTitle(kind: ChatGptAppComponentKind) {
  switch (kind) {
    case "approval":
      return "Pactway approval";
    case "receipt":
      return "Pactway receipt";
    case "handoff":
      return "Pactway handoff";
    case "resume":
      return "Pactway resume";
    case "status":
      return "Pactway status";
  }
}

function componentEmptyState(kind: ChatGptAppComponentKind) {
  switch (kind) {
    case "approval":
      return "Approval details will appear here.";
    case "receipt":
      return "Gateway outcome will appear here.";
    case "handoff":
      return "Handoff details will appear here.";
    case "resume":
      return "Resumable context will appear here.";
    case "status":
      return "Verified status will appear here.";
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
