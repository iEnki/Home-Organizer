/** Query parameters are decoded once by URLSearchParams before reaching here.
 * Keep internal paths (including query/hash and encoded invitation tokens) verbatim.
 * `fallback` is a trusted, caller-owned internal route, never another query value.
 */
export function getSafeRedirectPath(value, fallback = "/dashboard") {
  // eslint-disable-next-line no-control-regex -- Reject URL-parser controls before trimming.
  if (typeof value !== "string" || /[\\\u0000-\u001f\u007f-\u009f]/.test(value)) return fallback;
  const path = value.trim();
  return path.startsWith("/") && !path.startsWith("//") ? path : fallback;
}
