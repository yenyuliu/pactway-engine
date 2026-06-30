# Frontier Host Role

The frontier host owns the user conversation, explanation, tool selection, and
approval UX. It does not own current ticket truth, business backend state, or
authority minting.

## Responsibilities

- Load plugin/session state before answering questions about active tickets.
- Show exact approval summaries before state-changing actions.
- Send approval events to the plugin or gateway path after the user approves.
- Explain gateway, plugin, registry, or backend results without upgrading them.
- Refuse to infer current lifecycle state from prior chat alone.

## Forbidden behavior

- Do not fabricate ticket status from model memory.
- Do not self-issue user authority or consent.
- Do not claim a request was confirmed unless the gateway/backend result says so.
- Do not expose raw commitments, credentials, authority tokens, or private
  customer details to the model.

## Required inputs and outputs

Inputs:

- plugin-provided ticket refs or restored summaries;
- action-intent proof package;
- approval package;
- gateway/plugin result summary.

Outputs:

- model-safe explanation;
- approval event after exact user approval;
- refusal when current state cannot be verified.

## Minimum proof

Current path:

```bash
node dist/cli/index.js action-intent-check --input examples/action-intent-proof-pack --profile frontier
node dist/cli/index.js conformance frontier-host --input examples/protocol-v0.2
```

Alias:

```bash
node dist/cli/index.js conformance host --input examples/protocol-v0.2
```

The host proof must show that restored ticket state comes from plugin/gateway
verification before it is presented as current.

## Allowed claim

`Follows AgentPort frontier-host session guidance` or
`Passes AgentPort Frontier Host conformance v0.2`.

Do not claim AgentPort certification, business verification, registry authority,
backend execution proof, A2A certification, or live A2A network proof.
