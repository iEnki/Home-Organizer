import React from "react";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import LoginForm from "./LoginForm";
import RegisterPage from "./RegisterPage";
import { supabase } from "../supabaseClient";

const mockNavigate = jest.fn();
let mockSearch = "";
jest.mock("react-router", () => ({ ...jest.requireActual("react-router"), useNavigate: () => mockNavigate, useLocation: () => ({ search: mockSearch }) }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock("../supabaseClient", () => ({ supabase: { auth: { signInWithPassword: jest.fn(), signUp: jest.fn() } } }));
afterEach(() => { cleanup(); jest.useRealTimers(); mockSearch = ""; });

const targets = [
  ["//outside.example.test/", "/dashboard"],
  ["/" + String.fromCharCode(92) + "outside.example.test/", "/dashboard"],
  ["/" + String.fromCharCode(9) + "/outside.example.test/", "/dashboard"],
  ["https://outside.example.test/", "/dashboard"],
  ["/home/kfz?tab=service#receipt", "/home/kfz?tab=service#receipt"],
  ["/join-household?token=generated%2F%2B%26%3Dtoken", "/join-household?token=generated%2F%2B%26%3Dtoken"],
];

for (const mode of ["login", "register"]) {
  test.each(targets)(`${mode} passes only the validated next target to the router: %s`, async (next, expected) => {
    jest.useFakeTimers();
    mockSearch = `?${new URLSearchParams({ next })}`;
    const session = { user: { id: "generated-user" } };
    supabase.auth.signInWithPassword.mockResolvedValue({ data: { session }, error: null });
    supabase.auth.signUp.mockResolvedValue({ data: { session, user: session.user }, error: null });
    const setSession = jest.fn(), success = jest.fn();
    const { container } = render(<MemoryRouter>{mode === "login" ? <LoginForm setSession={setSession} onLoginSuccess={success} /> : <RegisterPage />}</MemoryRouter>);
    fireEvent.change(container.querySelector("#email-address"), { target: { value: "generated@example.test" } });
    fireEvent.change(container.querySelector("#password"), { target: { value: "generated-password" } });
    if (mode === "register") fireEvent.change(container.querySelector("#confirm-password"), { target: { value: "generated-password" } });
    fireEvent.submit(container.querySelector("form"));
    await act(async () => {});
    if (mode === "register") await act(async () => { jest.advanceTimersByTime(2000); });
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(expected);
    const method = mode === "login" ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    expect(method).toHaveBeenCalledWith({ email: "generated@example.test", password: "generated-password" });
    if (mode === "login") { expect(setSession).toHaveBeenCalledWith(session); expect(success).toHaveBeenCalledTimes(1); }
  });
}

test("registration without an immediate session keeps email confirmation and does not navigate", async () => {
  mockSearch = "?next=%2F%2Foutside.example.test";
  supabase.auth.signUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: null }, error: null });
  const { container } = render(<MemoryRouter><RegisterPage /></MemoryRouter>);
  for (const [id, value] of [["email-address", "generated@example.test"], ["password", "generated-password"], ["confirm-password", "generated-password"]]) fireEvent.change(container.querySelector(`#${id}`), { target: { value } });
  fireEvent.submit(container.querySelector("form"));
  expect(await screen.findByText(/Bitte bestätige deine E-Mail-Adresse/)).toBeInTheDocument();
  expect(mockNavigate).not.toHaveBeenCalled();
});
