import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import DokumentFilterBar from "./DokumentFilterBar";
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key, options) => key === "documents:archiveLayout.removeFilter" ? `Remove ${options.filter}` : key }) }));
const props = { suchbegriff:"", onSuche:jest.fn(), kategorieFilter:"Alle", onKategorie:jest.fn(), statusFilter:"alle", onStatus:jest.fn(), monatFilter:"alle", onMonat:jest.fn(), jahrFilter:"alle", onJahr:jest.fn(), sortierung:"neueste", onSortierung:jest.fn(), viewMode:"archiv", onViewMode:jest.fn(), verfuegbareJahre:["2026"], verfuegbareMonate:["2026-11"], kategorieZaehlung:{Rechnung:3,Vertrag:2,"Eigene Kategorie":1}, anzahlGefiltert:6,onUpload:jest.fn() };
beforeEach(()=>jest.clearAllMocks());
test("desktop categories and mobile category picker pass the original category values",()=>{
 render(<DokumentFilterBar {...props}/>);
 fireEvent.click(screen.getByRole("button",{name:/documents:categories.Rechnung/}));expect(props.onKategorie).toHaveBeenLastCalledWith("Rechnung");
 fireEvent.change(screen.getByLabelText("documents:archiveLayout.categories",{selector:"select"}),{target:{value:"Eigene Kategorie"}});expect(props.onKategorie).toHaveBeenLastCalledWith("Eigene Kategorie");
 fireEvent.click(screen.getByRole("button",{name:"documents:upload"}));expect(props.onUpload).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole("button",{name:"documents:archiveLayout.cardView"}));expect(props.onViewMode).toHaveBeenCalledWith("karten");
});
test("collapsing additional filters and changing viewport presentation preserve all controlled values",()=>{
 const {container,rerender}=render(<DokumentFilterBar {...props} jahrFilter="2026" monatFilter="2026-11" statusFilter="budget" sortierung="name_az"/>);
 const details=container.querySelector("details");details.open=true;fireEvent(details,new Event("toggle"));details.open=false;fireEvent(details,new Event("toggle"));
 rerender(<DokumentFilterBar {...props} jahrFilter="2026" monatFilter="2026-11" statusFilter="budget" sortierung="name_az"/>);
 for(const el of screen.getAllByLabelText("documents:archiveLayout.year"))expect(el).toHaveValue("2026");
 for(const el of screen.getAllByLabelText("documents:archiveLayout.month"))expect(el).toHaveValue("2026-11");
 expect(props.onJahr).not.toHaveBeenCalled();expect(props.onMonat).not.toHaveBeenCalled();expect(props.onStatus).not.toHaveBeenCalled();expect(props.onSortierung).not.toHaveBeenCalled();
});
test("search, individual chips and reset retain the original callback contract",()=>{
 render(<DokumentFilterBar {...props} suchbegriff="Test" kategorieFilter="Vertrag" jahrFilter="2026"/>);
 fireEvent.change(screen.getByRole("textbox"),{target:{value:"Handbuch"}});expect(props.onSuche).toHaveBeenLastCalledWith("Handbuch");
 fireEvent.click(screen.getByRole("button",{name:"Remove 2026"}));expect(props.onJahr).toHaveBeenLastCalledWith("alle");
 fireEvent.click(screen.getByRole("button",{name:"documents:archiveLayout.clearSearch"}));expect(props.onSuche).toHaveBeenLastCalledWith("");
 fireEvent.click(screen.getByRole("button",{name:"documents:archiveLayout.reset"}));
 expect(props.onKategorie).toHaveBeenLastCalledWith("Alle");expect(props.onMonat).toHaveBeenLastCalledWith("alle");expect(props.onJahr).toHaveBeenLastCalledWith("alle");expect(props.onSortierung).toHaveBeenLastCalledWith("neueste");expect(props.onStatus).toHaveBeenLastCalledWith("alle");
});
