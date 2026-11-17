import { getSafeRedirectPath } from "./safeRedirect";

const unsafe = [
  undefined, null, 1, {}, "", " ", "https://outside.example.test/", "http://outside.example.test/",
  "javascript:alert(1)", "data:text/html,test", "//outside.example.test/", "///outside.example.test/",
  "/\\outside.example.test/", "\\\\outside.example.test/", "/home\\outside", "/\n/outside.example.test/",
  "/\r/outside.example.test/", "/\t/outside.example.test/", "\n/home", "/home\u0000", "/home\u007f", "/home\u0085",
];

test.each(unsafe.map((value, index) => [index, value]))("rejects unsafe decoded target %s", (_, value) => {
  expect(getSafeRedirectPath(value)).toBe("/dashboard");
  expect(getSafeRedirectPath(value, "/")).toBe("/");
});

test.each(["/", "/dashboard", "/home/kfz?tab=service#receipt", "/home/kochbuch/recipe%20id?filter=%C3%96l#detail", "/join-household?token=generated%2F%2B%26%3Dtoken", "/home?next=https%3A%2F%2Fexample.test%2F"])("preserves safe internal target verbatim: %s", target => {
  expect(getSafeRedirectPath(target)).toBe(target);
  expect(new URL(getSafeRedirectPath(target), "https://app.example.test").origin).toBe("https://app.example.test");
});

test("handles a query decoded once without decoding a nested invitation token again", () => {
  const target = "/join-household?token=generated%2F%2B%26%3Dtoken";
  const query = new URLSearchParams({ next: target });
  expect(getSafeRedirectPath(new URLSearchParams(query.toString()).get("next"))).toBe(target);
  for (const next of ["%2F%2Foutside.example.test", "%2F%5Coutside.example.test", "%2F%09%2Foutside.example.test"]) {
    expect(getSafeRedirectPath(new URLSearchParams(`next=${next}`).get("next"))).toBe("/dashboard");
  }
});


test.each([0, 9, 10, 13, 31, 127, 133, 159])("rejects actual control U+%s before any trimming", code => {
  expect(getSafeRedirectPath("/" + String.fromCharCode(code) + "/outside.example.test")).toBe("/dashboard");
  expect(getSafeRedirectPath(String.fromCharCode(code) + "/home")).toBe("/dashboard");
});
