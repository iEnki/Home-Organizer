import { fireEvent, waitFor } from "@testing-library/react";
import { installInteractionAccessibility } from "./InteractionAccessibility";

describe("modal interaction stack", () => {
  let cleanup;
  beforeEach(() => {
    jest.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}]);
    document.body.innerHTML = '<button id="launch">Open</button><div id="host"></div>';
    document.querySelector("#launch").focus();
    cleanup = installInteractionAccessibility();
  });
  afterEach(() => { cleanup(); jest.restoreAllMocks(); document.body.innerHTML = ""; });
  const addDialog = (id, z = 100) => {
    const modal = document.createElement("div"); modal.dataset.appDialog = ""; modal.id = id; modal.style.zIndex = z;
    modal.innerHTML = `<h2>${id}</h2><button id="${id}-first">First</button><button id="${id}-last"><svg class="lucide-x"></svg></button>`;
    modal.lastElementChild.onclick = () => modal.remove(); document.body.append(modal); return modal;
  };
  test("traps focus, names the dialog and returns focus to its trigger", async () => {
    const modal = addDialog("form");
    await waitFor(() => expect(modal).toHaveAttribute("role", "dialog"));
    expect(modal).toHaveAttribute("aria-labelledby");
    expect(document.querySelector("#form-last")).toHaveAttribute("aria-label", "Close");
    document.querySelector("#form-first").focus(); fireEvent.keyDown(document.activeElement, { key: "Tab", shiftKey: true });
    expect(document.querySelector("#form-last")).toHaveFocus();
    fireEvent.keyDown(document.activeElement, { key: "Escape" });
    await waitFor(() => expect(document.querySelector("#launch")).toHaveFocus());
  });
  test("Escape closes only the top modal and permits a portalled select", async () => {
    const parent = addDialog("parent"); await waitFor(() => expect(parent).toHaveAttribute("role", "dialog"));
    const child = addDialog("child", 150); await waitFor(() => expect(child).toHaveAttribute("role", "dialog"));
    const portal = document.createElement("div"); portal.dataset.overlayPortal = ""; portal.innerHTML = '<input aria-label="Select search">'; document.body.append(portal);
    await waitFor(() => expect(portal.inert).not.toBe(true));
    portal.firstElementChild.focus(); expect(portal.firstElementChild).toHaveFocus();
    fireEvent.keyDown(portal.firstElementChild, { key: "Escape" }); expect(child.isConnected).toBe(true);
    portal.remove(); document.querySelector("#child-first").focus(); fireEvent.keyDown(document.activeElement, { key: "Escape" });
    await waitFor(() => expect(child.isConnected).toBe(false)); expect(parent.isConnected).toBe(true);
  });
  test("raises nested dialogs above older overlays and navigation", async () => {
    const parent = addDialog("raised-parent", 180);
    await waitFor(() => expect(parent).toHaveAttribute("role", "dialog"));
    const child = addDialog("raised-child", 50);
    await waitFor(() => expect(child).toHaveAttribute("role", "dialog"));
    expect(Number(child.style.zIndex)).toBeGreaterThan(Number(parent.style.zIndex));
    fireEvent.keyDown(document.activeElement, {key:"Escape"});
    await waitFor(() => expect(child.isConnected).toBe(false));
    expect(parent.isConnected).toBe(true);
  });
  test("keeps status announcements accessible while the background is inert", async () => {
    const live = document.createElement("div");live.dataset.liveRegion="";live.setAttribute("aria-live","polite");document.body.append(live);
    const modal=addDialog("announcements");
    await waitFor(()=>expect(modal).toHaveAttribute("role","dialog"));
    expect(live.inert).not.toBe(true);
    expect(document.querySelector("#host").inert).toBe(true);
  });
  test("skips hidden native picker controls when wrapping keyboard focus", async () => {
    const modal=addDialog("picker");const input=document.createElement("input");input.type="date";input.tabIndex=-1;modal.append(input);
    await waitFor(()=>expect(modal).toHaveAttribute("role","dialog"));
    document.querySelector("#picker-first").focus();fireEvent.keyDown(document.activeElement,{key:"Tab",shiftKey:true});
    expect(document.querySelector("#picker-last")).toHaveFocus();
  });
  test("wraps forward focus in forms without counting input and select controls twice", async () => {
    const modal = addDialog("fields");
    const input = document.createElement("input");
    const select = document.createElement("select");
    modal.insertBefore(input, modal.lastElementChild);
    modal.insertBefore(select, modal.lastElementChild);
    await waitFor(() => expect(modal).toHaveAttribute("role", "dialog"));
    document.querySelector("#fields-last").focus();
    fireEvent.keyDown(document.activeElement, { key: "Tab" });
    expect(document.querySelector("#fields-first")).toHaveFocus();
  });
  test("preserves a protected dialog's Escape policy", async () => {
    const modal = addDialog("protected"); modal.dataset.dialogEscape = "false";
    await waitFor(() => expect(modal).toHaveAttribute("role", "dialog"));
    fireEvent.keyDown(document.activeElement, { key: "Escape" }); expect(modal.isConnected).toBe(true);
  });
});
