import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import DokumentZeile from "./DokumentZeile";
jest.mock("react-i18next",()=>({useTranslation:()=>({t:(key,options)=>options?.defaultValue||key})}));
const dok={id:"document-1",dateiname:"invoice.pdf",kategorie:"Rechnung",storage_pfad:"test/invoice.pdf",erstellt_am:"2026-11-14T00:00:00Z",rechnung_info:{lieferant_name:"Testlieferant",brutto:125.5,rechnungsdatum:"2026-11-13"}};
const props={dok,onLoadVorschau:jest.fn().mockResolvedValue(),onVorschau:jest.fn(),onBearbeiten:jest.fn(),onLoeschen:jest.fn(),onWissen:jest.fn(),onBudget:jest.fn()};
beforeEach(()=>jest.clearAllMocks());
test("preview and edit keep their document arguments and do not fire the row action twice",async()=>{
 render(<DokumentZeile {...props}/>);
 fireEvent.click(screen.getByRole("button",{name:"Testlieferant"}));expect(props.onVorschau).toHaveBeenCalledTimes(1);expect(props.onVorschau).toHaveBeenLastCalledWith(dok);
 fireEvent.click(screen.getByRole("button",{name:"documents:preview"}));await waitFor(()=>expect(props.onVorschau).toHaveBeenCalledTimes(2));expect(props.onLoadVorschau).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole("button",{name:"documents:archiveLayout.edit"}));expect(props.onBearbeiten).toHaveBeenCalledWith(dok);expect(props.onVorschau).toHaveBeenCalledTimes(2);
});
test("menu preserves knowledge, budget and deletion callbacks and Escape returns focus",()=>{
 render(<DokumentZeile {...props}/>);const menu=screen.getByRole("button",{name:"documents:archiveLayout.moreActions"});
 fireEvent.click(menu);fireEvent.click(screen.getByRole("button",{name:"Als Wissen"}));expect(props.onWissen).toHaveBeenCalledWith(dok);
 fireEvent.click(menu);fireEvent.click(screen.getByRole("button",{name:"Zum Budget"}));expect(props.onBudget).toHaveBeenCalledWith(dok);
 fireEvent.click(menu);fireEvent.keyDown(window,{key:"Escape"});expect(menu).toHaveFocus();
 fireEvent.click(menu);fireEvent.click(screen.getByRole("button",{name:"Löschen"}));expect(props.onLoeschen).toHaveBeenCalledWith(dok.id,dok.storage_pfad,dok.dateiname);
 expect(props.onVorschau).not.toHaveBeenCalled();
});
test("assigned invoices retain their original action availability",()=>{
 render(<DokumentZeile {...props} dok={{...dok,im_budget:true,hat_wissen:true}}/>);
 fireEvent.click(screen.getByRole("button",{name:"documents:archiveLayout.moreActions"}));
 expect(screen.queryByRole("button",{name:"Zum Budget"})).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:"Als Wissen"})).not.toBeInTheDocument();expect(screen.getByRole("button",{name:"Löschen"})).toBeInTheDocument();
});
