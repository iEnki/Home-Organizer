import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import RechnungReviewModal from "./RechnungReviewModal";
import { supabase } from "../../supabaseClient";
jest.mock("../../utils/pushNotifications", () => ({ notifyHouseholdEvent: jest.fn().mockResolvedValue({}) }));
jest.mock("../../utils/kfzFuelImports", () => ({ syncFuelImports: jest.fn().mockResolvedValue({}) }));

jest.mock("../../contexts/LocaleContext", () => ({
  useLocale: () => ({ locale: "de-DE" }),
}));

jest.mock("../../hooks/useToast", () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));

jest.mock("../../supabaseClient", () => ({
  getActiveHouseholdId: () => null,
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
    storage: { from: jest.fn() },
  },
}));

const ergebnis = {
  haendler: "MediaMarkt",
  datum: "2023-02-01",
  gesamt: 196.99,
  positionen: [],
  erkannte_module: ["budget"],
  summary_text: "Testrechnung",
  confidence: 0.9,
};

describe("RechnungReviewModal mobile layout", () => {
  it("rendert als viewport-festes Portal mit eigenem Scrollbereich und Footer", () => {
    const { unmount } = render(
      <RechnungReviewModal
        ergebnis={ergebnis}
        datei={new File(["test"], "rechnung.pdf", { type: "application/pdf" })}
        session={null}
        onAbbrechen={jest.fn()}
        onGespeichert={jest.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Rechnung pruefen" });
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog).toHaveClass("invoice-review-overlay", "fixed", "flex", "overflow-hidden");
    expect(dialog.querySelector(".invoice-review-body")).toHaveClass("flex-1", "overflow-y-auto");
    expect(dialog.querySelector(".invoice-review-footer")).toHaveClass("shrink-0");
    expect(screen.getAllByRole("button", { name: "Speichern" })).toHaveLength(2);
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("");
  });
  it("keeps edited line values when details are closed and opened", () => {
    render(<RechnungReviewModal ergebnis={{ ...ergebnis, positionen: [{ name: "Brot", menge: 1, gesamtpreis: 3, review_noetig: true }, { name: "Milch", menge: 1, gesamtpreis: 2 }] }} datei={new File(["pdf"], "receipt.pdf", { type: "application/pdf" })} session={null} onAbbrechen={jest.fn()} onGespeichert={jest.fn()} />);
    const input = screen.getByLabelText("Name · Position 1");
    const detail = input.closest("details");
    expect(detail.open).toBe(true);
    expect(screen.getByLabelText("Name · Position 2").closest("details").open).toBe(false);
    fireEvent.change(input, { target: { value: "Vollkornbrot" } });
    detail.open = false; detail.open = true;
    expect(input).toHaveValue("Vollkornbrot");
  });

  it("focuses invalid required data without submitting a receipt", () => {
    const saved = jest.fn();
    render(<RechnungReviewModal ergebnis={{ ...ergebnis, datum: "", gesamt: 0 }} datei={new File(["pdf"], "receipt.pdf", { type: "application/pdf" })} session={null} onAbbrechen={jest.fn()} onGespeichert={saved} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Speichern" }).pop());
    expect(screen.getByLabelText("Datum *")).toHaveFocus();
    expect(saved).not.toHaveBeenCalled();
  });

});


test("keeps a long receipt compact and automatically exposes uncertain rows", () => {
 const positions=Array.from({length:80},(_,i)=>({name:`Item ${i}`,menge:1,gesamtpreis:1,review_noetig:i===45}));
 render(<RechnungReviewModal ergebnis={{...ergebnis,positionen:positions}} datei={null} session={null} onAbbrechen={jest.fn()} onGespeichert={jest.fn()}/>);
 expect(screen.getByLabelText("Name · Position 46").closest("details").open).toBe(true);
 expect(screen.getByLabelText("Name · Position 1").closest("details").open).toBe(false);
 expect(screen.getByLabelText("Name · Position 80")).toHaveValue("Item 79");
});

describe("receipt saving regression", () => {
 let inserts, upload;
 beforeEach(() => {
  inserts=[];
  upload=jest.fn().mockResolvedValue({data:{path:"fixture/receipt.pdf"},error:null});
  supabase.storage.from.mockReturnValue({upload,remove:jest.fn().mockResolvedValue({error:null})});
  supabase.rpc.mockResolvedValue({data:[],error:null});
  supabase.from.mockImplementation(table => {
   const q={};
   ["select","eq","limit","order","delete","update","upsert"].forEach(key=>q[key]=jest.fn(()=>q));
   q.insert=jest.fn(payload=>{inserts.push({table,payload});return q;});
   q.single=jest.fn().mockResolvedValue({data:{id:table+"-id",household_id:"household-1"},error:null});
   q.maybeSingle=jest.fn().mockResolvedValue({data:table==="household_members"?{household_id:"household-1"}:table==="dokument_links"?{id:"link-1"}:null,error:null});
   q.then=(resolve,reject)=>Promise.resolve({data:[],error:null}).then(resolve,reject);
   return q;
  });
 });
 const renderReceipt=(saved=jest.fn())=>render(<RechnungReviewModal ergebnis={{...ergebnis,erkannte_module:["budget","vorraete","medikamente","inventar","geraete"],positionen:[{name:"Brot",menge:2,gesamtpreis:3,modul_vorschlag:"vorraete"},{name:"Tabletten",menge:1,gesamtpreis:4,modul_vorschlag:"medikamente"},{name:"Lampe",menge:1,gesamtpreis:5,modul_vorschlag:"inventar"},{name:"Mixer",menge:1,gesamtpreis:6,modul_vorschlag:"geraete"}]}} datei={new File(["pdf"],"receipt.pdf",{type:"application/pdf"})} session={{user:{id:"user-1"}}} onAbbrechen={jest.fn()} onGespeichert={saved}/>);
 test("preserves invoice amounts and every selected destination",async()=>{
  const saved=jest.fn(); renderReceipt(saved);
  fireEvent.click(screen.getAllByRole("button",{name:"Speichern"}).pop());
  await waitFor(()=>expect(saved).toHaveBeenCalledTimes(1));
  expect(inserts.find(r=>r.table==="rechnungen").payload).toMatchObject({brutto:196.99,rechnungsdatum:"2023-02-01",lieferant_name:"MediaMarkt"});
  expect(inserts.map(r=>r.table)).toEqual(expect.arrayContaining(["dokumente","rechnungen","rechnungs_positionen","budget_posten","home_vorraete","home_medikamente","home_objekte","home_geraete"]));
  expect(inserts.find(r=>r.table==="home_vorraete").payload).toMatchObject({name:"Brot",bestand:2});
 });
 test("prevents duplicate writes on rapid save presses",async()=>{
  let finish; upload.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const saved=jest.fn(); renderReceipt(saved);
  const save=screen.getAllByRole("button",{name:"Speichern"}).pop();fireEvent.click(save);fireEvent.click(save);
  await waitFor(()=>expect(upload).toHaveBeenCalledTimes(1));
  await act(async()=>finish({data:{path:"fixture/receipt.pdf"},error:null}));
  await waitFor(()=>expect(saved).toHaveBeenCalledTimes(1));
  expect(inserts.filter(r=>r.table==="rechnungen")).toHaveLength(1);
 });
 test("retains edited fields after upload failure and permits retry",async()=>{
  const consoleError=jest.spyOn(console,"error").mockImplementation(()=>{});
  upload.mockResolvedValueOnce({data:null,error:{message:"offline"}});
  const saved=jest.fn();renderReceipt(saved);
  fireEvent.change(screen.getByLabelText("Haendler / Lieferant"),{target:{value:"Edited merchant"}});
  fireEvent.click(screen.getAllByRole("button",{name:"Speichern"}).pop());
  await waitFor(()=>expect(screen.getAllByRole("button",{name:"Speichern"}).pop()).toBeEnabled());
  expect(screen.getByLabelText("Haendler / Lieferant")).toHaveValue("Edited merchant");expect(saved).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByRole("button",{name:"Speichern"}).pop());
  await waitFor(()=>expect(saved).toHaveBeenCalledTimes(1));consoleError.mockRestore();
 });
});
