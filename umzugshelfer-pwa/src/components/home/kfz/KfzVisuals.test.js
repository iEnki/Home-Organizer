import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  KfzAnalytics,
  KfzOverview,
  VehicleHero,
  VehicleSwitcher,
} from "./KfzVisuals";
import { loadVehiclePhotoUrl } from "../../../utils/kfzPhotos";

jest.mock("react-chartjs-2", () => ({
  Bar: ({ data, options }) => (
    <div
      data-testid="bar-chart"
      data-index-axis={options?.indexAxis || "x"}
      data-max-bar-thickness={data?.datasets?.[0]?.maxBarThickness || ""}
    />
  ),
  Doughnut: () => <div data-testid="doughnut-chart" />,
  Line: () => <div data-testid="line-chart" />,
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, values) => values?.count != null ? `${key}:${values.count}` : key,
  }),
}));

jest.mock("../../../hooks/useViewport", () => () => ({
  width: 390,
  isMobile: true,
  isTablet: false,
  isDesktop: false,
}));

jest.mock("../../../utils/kfzPhotos", () => ({
  loadVehiclePhotoUrl: jest.fn().mockResolvedValue("blob:vehicle-photo"),
}));

const vehicle = {
  id: "vehicle-1",
  name: "Sehr langer Fahrzeugname fuer den mobilen Umbruch",
  kennzeichen: "W-91211D",
  marke: "KIA",
  modell: "Rio",
  baujahr: 2010,
  kilometerstand: 158038,
  kraftstoffart: "Benzin",
  versicherung: "Sehr lange Versicherungsbezeichnung",
  pickerl_termin: "2027-06-02",
};

describe("KfzVisuals mobile layout", () => {
  test("renders KPI cards in a non-scrolling two-column grid", () => {
    render(
      <KfzOverview
        stats={{
          totalCost: 1033.66,
          costPerKm: null,
          averageConsumption: null,
          totalDistance: 0,
          monthly: [["2026-06", 1033.66]],
          comparison: { totalCostChange: 100 },
          transactions: [],
        }}
        selectedVehicle={vehicle}
        coverPhoto={null}
        photoCount={0}
        period="12"
        setPeriod={jest.fn()}
        dueItems={[]}
        onEditVehicle={jest.fn()}
        onOpenGallery={jest.fn()}
        onShowCosts={jest.fn()}
        money={(value) => `${value.toFixed(2)} EUR`}
        formatDate={(value) => value}
      />,
    );

    const kpiGrid = screen.getByTestId("kpi-grid");
    expect(kpiGrid).toBeInTheDocument();
    expect(kpiGrid.className).not.toContain("overflow-x-auto");
  });

  test("uses a compact mobile vehicle image and keeps long values wrappable", () => {
    render(
      <VehicleHero
        vehicle={vehicle}
        coverPhoto={null}
        photoCount={1}
        onEdit={jest.fn()}
        onGallery={jest.fn()}
      />,
    );

    expect(screen.getByText(/Sehr langer Fahrzeugname/)).toHaveClass("break-words");
    expect(screen.getByTestId("vehicle-hero-layout")).toHaveClass("grid-cols-[minmax(0,120px)_minmax(0,1fr)]");
    expect(screen.getAllByText("Sehr lange Versicherungsbezeichnung")).toHaveLength(2);
    screen.getAllByText("Sehr lange Versicherungsbezeichnung").forEach((element) => {
      expect(element).toHaveClass("break-words");
    });
  });

  test("invokes vehicle editing despite decorative hero layers", () => {
    const onEdit = jest.fn();
    render(
      <VehicleHero
        vehicle={vehicle}
        coverPhoto={null}
        photoCount={1}
        onEdit={onEdit}
        onGallery={jest.fn()}
      />,
    );
    expect(screen.getByTestId("vehicle-hero-glow")).toHaveClass("pointer-events-none");
    fireEvent.click(screen.getByRole("button", { name: "Fahrzeug bearbeiten" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  test("shows the complete title image without cropping it to the hero frame", async () => {
    loadVehiclePhotoUrl.mockResolvedValueOnce("blob:vehicle-photo");

    render(
      <VehicleHero
        vehicle={vehicle}
        coverPhoto={{ id: "photo-1", storage_path: "vehicle/photo.webp" }}
        photoCount={1}
        onEdit={jest.fn()}
        onGallery={jest.fn()}
      />,
    );

    const image = await screen.findByRole("img", { name: vehicle.name });
    expect(image).toHaveClass("object-contain", "object-center");
    expect(image).not.toHaveClass("object-cover");
  });

  test("hides the graphical vehicle switcher below the desktop breakpoint", () => {
    render(
      <VehicleSwitcher
        vehicles={[vehicle, { ...vehicle, id: "vehicle-2", name: "Zweitfahrzeug" }]}
        selectedVehicleId={vehicle.id}
        coverByVehicleId={{}}
        onSelect={jest.fn()}
      />,
    );

    const switcher = screen.getByTestId("vehicle-switcher");
    expect(switcher).toHaveClass("hidden", "md:flex");
    expect(switcher.className).not.toContain("overflow-x-auto");
  });

  test("switches between charts, insights and booking views", () => {
    render(
      <KfzAnalytics
        stats={{
          totalCost: 300,
          monthly: [["2026-05", 100], ["2026-06", 200]],
          categoryShares: [{ label: "Service", value: 200, share: 2 / 3 }],
          consumptionSegments: [],
          vehicleRanking: [{ vehicleId: "v1", label: "Rio", cost: 300, rank: 1 }],
          transactions: [{
            id: "service:1",
            date: "2026-06-01",
            category: "Service",
            description: "Oelwechsel",
            amount: 200,
          }],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "analytics.views.insights" }));
    expect(screen.getByText("analytics.insights.monthlyAverage")).toBeInTheDocument();
    expect(screen.getByText("analytics.insights.categoryRanking")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "analytics.views.ledger" }));
    expect(screen.getByText("analytics.ledger.months")).toBeInTheDocument();
    expect(screen.getByText("Ölwechsel")).toBeInTheDocument();
  });

  test("keeps the analytics donut centre readable and ranking bars compact", () => {
    render(
      <KfzAnalytics
        stats={{
          totalCost: 1033.88,
          monthly: [["2026-06", 1033.88]],
          categoryShares: [
            { label: "Service", value: 827.1, share: 0.8 },
            { label: "Tanken", value: 206.78, share: 0.2 },
          ],
          consumptionSegments: [],
          vehicleRanking: [{ vehicleId: "v1", label: "Rio", cost: 1033.88, rank: 1 }],
          transactions: [],
        }}
      />,
    );

    expect(screen.getByText(/1\.033,88/)).toBeInTheDocument();
    expect(screen.getByText("analytics.categories: 2")).toBeInTheDocument();
    const ranking = screen.getByTestId("bar-chart");
    expect(ranking).toHaveAttribute("data-index-axis", "y");
    expect(ranking).toHaveAttribute("data-max-bar-thickness", "44");
  });
});
