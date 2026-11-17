import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.0";
import * as webpush from "https://esm.sh/web-push@4.0.0";

const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
Deno.test("pinned Supabase Edge SDK preserves generated HTTP contracts", async () => {
  const calls: { path: string; method: string; apikey: string | null }[] = [];
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async req => {
    const url = new URL(req.url);
    calls.push({ path: url.pathname, method: req.method, apikey: req.headers.get("apikey") });
    const response = url.pathname === "/auth/v1/user" ? { id: "generated-user" }
      : url.pathname === "/rest/v1/tasks" ? [{ id: "generated-task", household_id: "generated-household" }]
      : url.pathname === "/rest/v1/rpc/generated_contract" ? 42
      : url.pathname.startsWith("/storage/v1/object/sign/") ? { signedURL: "/object/sign/documents/generated.txt?token=generated" }
      : url.pathname.startsWith("/storage/v1/object/") ? { Key: "documents/generated.txt" }
      : { error: "generated error" };
    if (req.body) await req.arrayBuffer();
    return Response.json(response, { status: url.pathname.startsWith("/functions/") ? 422 : 200 });
  });
  try {
    const client = createClient("http://127.0.0.1:" + server.addr.port, "generated-anon", { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const user = await client.auth.getUser("generated-session");
    assert(user.data.user?.id === "generated-user", "auth user");
    const rows = await client.from("tasks").select("*").eq("household_id", "generated-household");
    assert(rows.data?.[0]?.id === "generated-task", "household query");
    const rpc = await client.rpc("generated_contract");
    assert(rpc.data === 42, "RPC result");
    const upload = await client.storage.from("documents").upload("generated.txt", new Blob(["generated"]));
    assert(!upload.error && upload.data.path === "generated.txt", "storage upload");
    const signed = await client.storage.from("documents").createSignedUrl("generated.txt", 60);
    assert(signed.data?.signedUrl.includes("generated.txt?token=generated"), "signed storage URL");
    const edge = await client.functions.invoke("generated-contract", { body: { generated: true } });
    assert(edge.error?.context?.status === 422, "edge errors preserve response status");
    await edge.error.context.text();
    assert(calls.length === 6 && calls.every(call => call.apikey === "generated-anon"), "request headers and count");
    client.realtime.disconnect();
  } finally { await server.shutdown(); }
});

Deno.test("web-push4 retains encrypted VAPID request generation without sending", () => {
  const sender = webpush.generateVAPIDKeys();
  const subscriber = webpush.generateVAPIDKeys();
  webpush.setVapidDetails("mailto:generated@example.test", sender.publicKey, sender.privateKey);
  const auth = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  const details = webpush.generateRequestDetails({ endpoint: "https://push.example.test/generated", keys: { p256dh: subscriber.publicKey, auth } }, JSON.stringify({ title: "Generated", body: "Generated message" }), { TTL: 60 }) as unknown as { endpoint: string; headers: Record<string, string>; body: Uint8Array };
  assert(details.endpoint === "https://push.example.test/generated", "endpoint");
  assert(details.headers["Content-Encoding"] === "aes128gcm", "encrypted payload");
  assert(details.headers.Authorization?.startsWith("vapid "), "VAPID authentication");
  assert(details.body.length > 0, "encrypted body");
});
