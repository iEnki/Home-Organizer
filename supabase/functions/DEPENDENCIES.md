# Edge dependency checks

Remote SDK imports are exact versions: Supabase JS2.119.0 and Web Push4.0.0.
Web Push4 uses named ESM exports; the sending flow and VAPID credentials stay the
same. The scoped `deno.json` uses the repository's checksum lock in frozen mode.

From the repository root, with reviewed Deno2.9.6:

```sh
deno check --config supabase/functions/deno.json supabase/functions/*/index.ts
deno test --config supabase/functions/deno.json --allow-net=127.0.0.1 --allow-env supabase/functions/_shared/*_test.ts
```

The new SDK checks use a temporary loopback server and generated data for Auth,
household queries, RPC, Storage and Edge errors. Web Push generates encrypted
VAPID request details without sending a notification. No personal credentials
or external API requests are needed during the tests.

The lock is enforced by these local Deno commands. The self-hosted Edge runtime
loads workers through its existing dispatcher and must be checked separately;
no unverified claim is made that this dispatcher enforces the local Deno lock.
Exact import URLs also apply to deployed workers. The management deployment
flow, payloads, providers, model names and account/storage behavior are unchanged.

To deliberately change dependencies, update exact imports and refresh the lock
with the scoped config and `--frozen=false`, then rerun checks and real isolated
Edge integration/rollback. Keep the previous function source and cache/runtime
images together for rollback. Real push delivery and devices are separate checks.
