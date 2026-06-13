import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import GlassSurface, {
  glassCollapseVariants,
  GlassModule,
  glassPageVariants,
  glassSurfaceClass,
} from "./GlassSurface";

describe("GlassSurface", () => {
  test("renders the shared glass styling and pointer sheen", () => {
    render(
      <GlassSurface data-testid="surface">
        Inhalt
      </GlassSurface>,
    );

    const surface = screen.getByTestId("surface");
    expect(surface).toHaveClass("glass-surface", "glass-hover-card", "rounded-card");
    expect(surface.querySelector(".glass-card-sheen")).toBeInTheDocument();

    surface.getBoundingClientRect = () => ({
      left: 10,
      top: 20,
      right: 210,
      bottom: 120,
      width: 200,
      height: 100,
      x: 10,
      y: 20,
      toJSON: () => {},
    });
    fireEvent.mouseMove(surface, { clientX: 65, clientY: 70 });

    expect(surface.style.getPropertyValue("--glass-pointer-x")).toBe("55px");
    expect(surface.style.getPropertyValue("--glass-pointer-y")).toBe("50px");
  });

  test("supports non-interactive toolbar and dialog surfaces", () => {
    render(
      <GlassSurface interactive={false} data-testid="surface">
        Werkzeugleiste
      </GlassSurface>,
    );

    const surface = screen.getByTestId("surface");
    expect(surface).toHaveClass("glass-surface");
    expect(surface).not.toHaveClass("glass-hover-card");
    expect(surface.querySelector(".glass-card-sheen")).not.toBeInTheDocument();
  });

  test("exports the layout and collapse animation contracts", () => {
    expect(glassSurfaceClass).toContain("dark:bg-[#07161d]/30");
    expect(glassPageVariants.show.transition.staggerChildren).toBe(0.045);
    expect(glassCollapseVariants.show.height).toBe("auto");
    expect(glassCollapseVariants.exit.height).toBe(0);
  });

  test("delegates pointer sheen updates across automatic module cards", () => {
    render(
      <GlassModule data-testid="module">
        <div data-testid="card" className="bg-light-card rounded-card">
          Karte
        </div>
      </GlassModule>,
    );

    const card = screen.getByTestId("card");
    card.getBoundingClientRect = () => ({
      left: 20,
      top: 30,
      right: 220,
      bottom: 130,
      width: 200,
      height: 100,
      x: 20,
      y: 30,
      toJSON: () => {},
    });

    const pointerMove = new MouseEvent("pointermove", {
      bubbles: true,
      clientX: 75,
      clientY: 90,
    });
    Object.defineProperty(pointerMove, "pointerType", { value: "mouse" });
    fireEvent(card, pointerMove);

    expect(screen.getByTestId("module")).toHaveClass("glass-module", "auto-glass-cards", "max-w-full");
    expect(card.style.getPropertyValue("--glass-pointer-x")).toBe("55px");
    expect(card.style.getPropertyValue("--glass-pointer-y")).toBe("60px");
  });
});
