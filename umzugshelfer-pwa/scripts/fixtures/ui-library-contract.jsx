// Local browser regression fixture. Not imported by the application or production build.
import "../../src/i18n";
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { motion, useReducedMotion, MotionConfig } from "framer-motion";
import { DndContext, KeyboardSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import { SortableContext, useSortable, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import useDropzone from "../../src/hooks/useSingleFileDropzone";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { de } from "date-fns/locale";
import { QRCodeCanvas } from "qrcode.react";
import { Html5Qrcode } from "html5-qrcode";
import { pdf } from "@react-pdf/renderer";
import PacklistePDF from "../../src/components/PacklistePDF";
import { IOSBottomSheet } from "../../src/components/ui/ios/IOSBottomSheet";
import useBottomSheetDrag from "../../src/hooks/useBottomSheetDrag";
import "../../src/index.css";
import "../../src/design-system.css";

ChartJS.register(ArcElement, Tooltip, Legend);
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales: { de } });
const payload = "generated-box/123?item=test";
function Sortable({ id }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  return <button ref={setNodeRef} {...attributes} {...listeners} style={{ transform: CSS.Transform.toString(transform), transition, display: "block", width: "100%", height: 60 }}>{id}</button>;
}
function Fixture() {
  const reduced = useReducedMotion();
  const [selected, setSelected] = useState(""), [sheet, setSheet] = useState(false), [draft, setDraft] = useState("keep me"), [lightbox, setLightbox] = useState(false), [order, setOrder] = useState(["first", "second"]), [qr, setQr] = useState(""), [pdfBytes, setPdfBytes] = useState(0), [event, setEvent] = useState("");
  const { getRootProps, getInputProps } = useDropzone({ multiple: false, onDrop: files => setSelected(files.map(file => file.name).join(",")) });
  const drag = useBottomSheetDrag({ initialSnap: 0.45, reducedMotion: !!reduced });
  const sensors = useSensors(useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const image = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#008066"/></svg>');
  const scan = async () => {
    const blob = await new Promise(resolve => document.querySelector("#fixture-qr canvas").toBlob(resolve));
    const scanner = new Html5Qrcode("fixture-scan");
    try { setQr(await scanner.scanFile(new File([blob], "generated-qr.png", { type: "image/png" }), false)); }
    finally { scanner.clear(); }
  };
  const exportPdf = async () => {
    const blob = await pdf(<PacklistePDF kisten={[{ id: "fixture", name: "Generated Box", inhalt: [] }]} />).toBlob();
    setPdfBytes(blob.size);
  };
  return <main style={{ maxWidth: 800, margin: "auto", padding: 16, background: "#fff", color: "#182028" }}>
    <h1>UI library contract</h1>
    <section {...getRootProps()} style={{ border: "1px solid", padding: 16 }}><input {...getInputProps({ "aria-label": "Generated file" })} /><p>File selection</p></section><output data-testid="file">{selected}</output>
    <button onClick={() => setSheet(true)}>Open sheet</button><button onClick={() => setLightbox(true)}>Open image</button>
    <IOSBottomSheet open={sheet} onClose={() => setSheet(false)} title="Generated sheet"><input aria-label="Sheet draft" value={draft} onChange={e => setDraft(e.target.value)} /><button onClick={() => setSheet(false)}>Close sheet</button></IOSBottomSheet>
    <Lightbox open={lightbox} close={() => setLightbox(false)} slides={[{ src: image }]} />
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => { if (over && active.id !== over.id) setOrder(items => arrayMove(items, items.indexOf(active.id), items.indexOf(over.id))); }}><SortableContext items={order} strategy={verticalListSortingStrategy}>{order.map(id => <Sortable key={id} id={id} />)}</SortableContext></DndContext><output data-testid="order">{order.join(",")}</output>
    <div data-testid="chart" style={{ height: 180 }}><Doughnut data={{ labels: ["Generated A", "Generated B"], datasets: [{ data: [12, 34], backgroundColor: ["#008066", "#2460a0"] }] }} options={{ animation: false, maintainAspectRatio: false }} /></div>
    <div style={{ height: 420 }}><Calendar localizer={localizer} culture="de" defaultDate={new Date(2026, 10, 15)} views={["month"]} defaultView="month" events={[{ title: "Generated event", start: new Date(2026, 10, 15, 10), end: new Date(2026, 10, 15, 11) }]} onSelectEvent={item => setEvent(item.title)} /></div><output data-testid="event">{event}</output>
    <div id="fixture-qr"><QRCodeCanvas value={payload} size={200} marginSize={4} /></div><div id="fixture-scan" /><button onClick={scan}>Verify QR</button><output data-testid="qr">{qr}</output>
    <button onClick={exportPdf}>Export PDF</button><output data-testid="pdf">{pdfBytes}</output>
    <motion.div data-testid="snap-sheet" style={{ ...drag.sheetStyle, background: "#e8f1f0", overflow: "hidden" }}><button data-testid="snap-handle" {...drag.handleProps}>Drag snap</button><output data-testid="snap">{drag.currentSnap}</output></motion.div>
  </main>;
}
createRoot(document.getElementById("root")).render(<MotionConfig reducedMotion="user"><Fixture /></MotionConfig>);
