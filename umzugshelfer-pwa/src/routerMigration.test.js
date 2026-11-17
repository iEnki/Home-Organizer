import React from "react";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { MemoryRouter, BrowserRouter, Routes, Route, Link, Outlet, useLocation, useNavigate, useParams, useSearchParams, matchRoutes } from "react-router";
import JoinHouseholdPage from "./components/JoinHouseholdPage";
import UpdatePasswordPage from "./components/UpdatePasswordPage";
import { supabase } from "./supabaseClient";

jest.mock("./supabaseClient", () => ({ supabase: { rpc: jest.fn(), from: jest.fn(), auth: { onAuthStateChange: jest.fn(), updateUser: jest.fn(), getUser: jest.fn() } }, setActiveHouseholdId: jest.fn() }));
jest.mock("./components/ForcedPasswordChangeModal", () => () => null);
afterEach(() => { cleanup(); jest.useRealTimers(); window.history.replaceState({}, "", "/"); });

function Location() { const l = useLocation(); return <output data-testid="location">{l.pathname}{l.search}{l.hash}</output>; }
function Recipe() {
  const params = useParams(); const [search, setSearch] = useSearchParams(); const navigate = useNavigate();
  return <><p>{params.rezeptId}</p><button onClick={() => setSearch({ filter: "Öl & Salz" })}>Filter</button><button onClick={() => navigate(-1)}>Back</button><output>{search.get("filter")}</output><Location /></>;
}

test("keeps BrowserRouter push, replace, back, parameters, query and hash", async () => {
  window.history.replaceState({}, "", "/home?filter=all#start");
  render(<BrowserRouter><Routes><Route element={<><Location /><Outlet /></>}><Route path="/home" element={<Link to="/home/kochbuch/test%20recipe?filter=old#detail">Recipe</Link>} /><Route path="/home/kochbuch/:rezeptId" element={<Recipe />} /></Route></Routes></BrowserRouter>);
  fireEvent.click(screen.getByText("Recipe"));
  expect(await screen.findByText("test recipe")).toBeInTheDocument();
  expect(window.location.hash).toBe("#detail");
  fireEvent.click(screen.getByText("Filter"));
  expect(await screen.findByText("Öl & Salz")).toBeInTheDocument();
  expect(new URLSearchParams(window.location.search).get("filter")).toBe("Öl & Salz");
  fireEvent.click(screen.getByText("Back"));
  expect(await screen.findByText("old")).toBeInTheDocument();
});

test("matches every actual registered App route including encoded recipe IDs", () => {
  const fs = require("fs"); const path = require("path");
  const source = fs.readFileSync(path.join(__dirname, "App.js"), "utf8");
  const paths = [...source.matchAll(/<Route\s+path="([^"]+)"/g)].map(m => m[1]);
  expect(paths.length).toBeGreaterThan(40);
  const results = paths.map(p => {
    const url = p === "*" ? "/unknown/deep" : p.replace(":rezeptId", "recipe%20with%20space") + "?tab=details#item";
    const match = matchRoutes(paths.map(path => ({ path })), url).at(-1);
    expect(match.route.path).toBe(p);
    return { input: url, path: match.route.path, params: match.params };
  });
  if (process.env.ROUTER_CONTRACT_OUTPUT) fs.writeFileSync(process.env.ROUTER_CONTRACT_OUTPUT, JSON.stringify(results));
});

test("retains encoded invitation token through login and registration links", () => {
  const token = "generated/+&=token";
  render(<MemoryRouter initialEntries={[`/join-household?token=${encodeURIComponent(token)}`]}><JoinHouseholdPage session={null} /></MemoryRouter>);
  for (const name of ["Anmelden", "Neu registrieren"]) {
    const url = new URL(screen.getByRole("link", { name }).href);
    const next = url.searchParams.get("next");
    expect(new URL(next, "http://localhost").searchParams.get("token")).toBe(token);
  }
});

test("keeps invitation validation errors and API token", async () => {
  supabase.rpc.mockResolvedValue({ data: null, error: { message: "Einladung abgelaufen" } });
  render(<MemoryRouter initialEntries={["/join-household?token=generated-token"]}><JoinHouseholdPage session={{ user: { id: "generated-user" } }} /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Einladung annehmen" }));
  expect(await screen.findByText("Dieser Einladungslink ist ungültig oder abgelaufen.")).toBeInTheDocument();
  expect(supabase.rpc).toHaveBeenCalledWith("accept_household_invite", { p_token: "generated-token" });
});

test("keeps missing invitation token state", () => {
  render(<MemoryRouter initialEntries={["/join-household"]}><JoinHouseholdPage session={null} /></MemoryRouter>);
  expect(screen.getByText(/kein gültiger Token/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Einladung annehmen" })).not.toBeInTheDocument();
});

test.each(["/home/kfz?tab=service", "https://external.example.test/", "//external.example.test/", "/" + String.fromCharCode(92) + "external.example.test/", "/" + String.fromCharCode(9) + "/external.example.test/"])("keeps password recovery payload and safe next redirect: %s", async next => {
  jest.useFakeTimers();
  supabase.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } });
  supabase.auth.updateUser.mockResolvedValue({ error: null });
  supabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
  render(<MemoryRouter initialEntries={[`/update-password?next=${encodeURIComponent(next)}#access_token=generated`]}><Location /><Routes><Route path="/update-password" element={<UpdatePasswordPage />} /><Route path="*" element={<p>Destination</p>} /></Routes></MemoryRouter>);
  await act(async () => { jest.advanceTimersByTime(1500); });
  fireEvent.change(screen.getByLabelText("Neues Passwort"), { target: { value: "generated-password" } });
  fireEvent.change(screen.getByLabelText("Neues Passwort bestätigen"), { target: { value: "generated-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Passwort aktualisieren" }));
  await act(async () => {});
  expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: "generated-password", data: { invite_first_login_required: false } });
  await act(async () => { jest.advanceTimersByTime(3000); });
  expect(screen.getByTestId("location").textContent).toBe(next.startsWith("/home") ? next : "/");
});
