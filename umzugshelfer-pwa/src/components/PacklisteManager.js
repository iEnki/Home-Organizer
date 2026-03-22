import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import {
  PlusCircle,
  Box,
  Search,
  QrCode,
  Edit3,
  Trash2,
  XCircle,
  AlertTriangle,
  PackagePlus,
  Book,
  Shirt,
  Tv,
  Utensils,
  HelpCircle,
  UploadCloud,
  ScanLine,
  Download,
  ChevronDown,
  ChevronUp,
  BrainCircuit,
  LayoutGrid,
  List,
  PackageCheck,
  MapPin,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { Html5QrcodeScanner } from "html5-qrcode";
import KiHomeAssistent from "./home/KiHomeAssistent";
import { PDFDownloadLink } from "@react-pdf/renderer";
import PacklistePDF from "./PacklistePDF";
import useViewport from "../hooks/useViewport";

const gegenstandIconsDark = {
  buch: <Book size={14} className="mr-1.5 text-gray-400" />,
  bücher: <Book size={14} className="mr-1.5 text-gray-400" />,
  kleidung: <Shirt size={14} className="mr-1.5 text-blue-400" />,
  hemd: <Shirt size={14} className="mr-1.5 text-blue-400" />,
  hose: <Shirt size={14} className="mr-1.5 text-blue-400" />,
  tv: <Tv size={14} className="mr-1.5 text-indigo-400" />,
  fernseher: <Tv size={14} className="mr-1.5 text-indigo-400" />,
  monitor: <Tv size={14} className="mr-1.5 text-indigo-400" />,
  teller: <Utensils size={14} className="mr-1.5 text-green-400" />,
  tasse: <Utensils size={14} className="mr-1.5 text-green-400" />,
  geschirr: <Utensils size={14} className="mr-1.5 text-green-400" />,
  küche: <Utensils size={14} className="mr-1.5 text-green-400" />,
  default: <HelpCircle size={14} className="mr-1.5 text-gray-500" />,
};
const getGegenstandIcon = (beschreibung) => {
  if (!beschreibung) return gegenstandIconsDark.default;
  const lowerBeschreibung = beschreibung.toLowerCase();
  for (const keyword in gegenstandIconsDark) {
    if (lowerBeschreibung.includes(keyword))
      return gegenstandIconsDark[keyword];
  }
  return gegenstandIconsDark.default;
};

const gegenstandKategorieKeywords = {
  Medien: [
    "buch",
    "bücher",
    "cd",
    "dvd",
    "blu-ray",
    "zeitschrift",
    "magazin",
    "zeitung",
    "album",
    "schallplatte",
    "vinyl",
    "comic",
    "manga",
    "noten",
    "partitur",
    "hörbuch",
    "kassette",
    "videospiel",
    "software",
    "lexikon",
    "atlas",
    "karte",
    "stadtplan",
    "reiseführer",
    "roman",
    "krimi",
    "sachbuch",
    "fachbuch",
    "kinderbuch",
    "bilderbuch",
    "tagebuch",
    "poesiealbum",
    "fotoalbum",
    "sammelalbum",
    "kalenderbuch",
    "broschüre",
    "prospekt",
    "flyer",
    "skript",
    "manuskript",
    "filmrolle",
    "negativ",
    "dia",
    "mikrofilm",
    "ebook-reader",
    "kindle",
    "tolino",
    "pocketbook",
    "lesezeichen",
    "buchstütze",
    "cd-ständer",
    "dvd-regal",
    "plattenspielerzubehör",
    "zeitschriftenständer",
    "notenständer",
    "landkarte",
    "globus",
    "wörterbuch",
    "enzyklopädie",
    "fachzeitschrift",
    "tageszeitung",
    "wochenzeitung",
    "illustrierte",
    "rätselheft",
    "sudoku",
    "kochbuch",
    "backbuch",
    "ratgeber",
    "biografie",
    "gedichtband",
    "drehbuch",
    "partiturenmappe",
    "liederbuch",
    "gesangbuch",
    "predigtband",
    "bibel",
    "koran",
    "thóra",
    "philosophiebuch",
    "geschichtsbuch",
    "kunstbuch",
    "architekturbuch",
    "fotoband",
    "reisekatalog",
    "bedienungsanleitung (medienbezogen)",
    "softwarelizenz",
    "game-key",
    "online-kurs unterlagen",
    "podcast-notizen",
    "blog-ausdrucke",
    "wissenschaftliche arbeit",
    "dissertation",
    "masterarbeit",
    "bachelorarbeit",
    "studienunterlagen",
    "vorlesungsskript",
    "schulheft",
    "arbeitsheft",
    "schulbuch",
  ],
  Elektronik: [
    "kabel",
    "ladekabel",
    "usb-kabel",
    "hdmi-kabel",
    "netzwerkkabel",
    "lan-kabel",
    "stromkabel",
    "verlängerungskabel",
    "kabeltrommel",
    "ladegerät",
    "netzteil",
    "powerbank",
    "akku",
    "batterie",
    "knopfzelle",
    "mignon",
    "micro",
    "babyzelle",
    "monozelle",
    "kopfhörer",
    "in-ear",
    "over-ear",
    "on-ear",
    "noise-cancelling",
    "headset",
    "maus",
    "funkmaus",
    "gaming-maus",
    "mauspad",
    "tastatur",
    "funktastatur",
    "mechanische tastatur",
    "gaming-tastatur",
    "monitor",
    "bildschirm",
    "tft",
    "led-monitor",
    "curved monitor",
    "fernseher",
    "tv",
    "smart-tv",
    "led-tv",
    "oled-tv",
    "qled-tv",
    "plasma-tv",
    "konsole",
    "playstation",
    "ps5",
    "ps4",
    "xbox",
    "series x",
    "series s",
    "one",
    "nintendo switch",
    "wii",
    "gamecube",
    "controller",
    "gamepad",
    "joystick",
    "lenkrad (gaming)",
    "pedale (gaming)",
    "lautsprecher",
    "boxen",
    "regallautsprecher",
    "standlautsprecher",
    "center-speaker",
    "bluetooth-speaker",
    "wlan-speaker",
    "multiroom-speaker",
    "soundbar",
    "subwoofer",
    "verstärker",
    "receiver",
    "av-receiver",
    "stereoanlage",
    "hifi-anlage",
    "plattenspieler",
    "cd-player",
    "dvd-player",
    "blu-ray-player",
    "router",
    "modem",
    "dsl-modem",
    "kabelmodem",
    "fritzbox",
    "switch (netzwerk)",
    "repeater",
    "wlan-repeater",
    "access point",
    "adapter",
    "reiseadapter",
    "grafikkarte",
    "soundkarte",
    "motherboard",
    "cpu",
    "ram",
    "arbeitsspeicher",
    "netzwerkkarte",
    "usb-hub",
    "festplatte",
    "externe festplatte",
    "interne festplatte",
    "ssd",
    "nvme",
    "usb-stick",
    "speicherkarte",
    "sd-karte",
    "microsd",
    "compactflash",
    "tablet",
    "ipad",
    "galaxy tab",
    "surface",
    "laptop",
    "notebook",
    "ultrabook",
    "macbook",
    "chromebook",
    "pc",
    "computer",
    "rechner",
    "desktop-pc",
    "all-in-one-pc",
    "server",
    "nas",
    "drucker",
    "laserdrucker",
    "tintendrucker",
    "fotodrucker",
    "scanner",
    "flachbettscanner",
    "einzugsscanner",
    "multifunktionsgerät",
    "faxgerät",
    "webcam",
    "ip-kamera",
    "überwachungskamera",
    "kamera",
    "digitalkamera",
    "kompaktkamera",
    "systemkamera",
    "spiegelreflex",
    "dslr",
    "dslm",
    "actioncam",
    "gopro",
    "objektiv",
    "stativ (kamera)",
    "blitzgerät",
    "mikrofon (extern)",
    "diktiergerät",
    "mp3-player",
    "ipod",
    "radio",
    "digitalradio",
    "dab+",
    "internetradio",
    "wecker",
    "radiowecker",
    "telefon",
    "schnurlostelefon",
    "dect",
    "isdn-telefon",
    "voip-telefon",
    "handy",
    "smartphone",
    "iphone",
    "android handy",
    "tastenhandy",
    "smartwatch",
    "apple watch",
    "galaxy watch",
    "fitness-tracker",
    "fitbit",
    "gps-gerät",
    "navigationsgerät",
    "navi",
    "projektor",
    "beamer",
    "leinwand (projektion)",
    "fernbedienung (universal)",
    "sat-receiver",
    "dvb-t-antenne",
    "dvb-c-receiver",
    "lötkolben",
    "multimeter",
    "vr-brille",
    "virtual reality headset",
    "drohne",
    "quadrocopter",
    "e-reader",
    "taschenrechner",
    "wetterstation",
    "babyphone",
    "elektrische zahnbürste",
    "rasierapparat (elektrisch)",
    "epilierer",
    "massagegerät",
    "heizlüfter",
    "ventilator",
    "klimagerät (mobil)",
    "luftbefeuchter",
    "luftentfeuchter",
    "staubsaugerroboter",
    "fensterputzroboter",
  ],
  Küche: [
    "teller",
    "suppenteller",
    "essteller",
    "dessertteller",
    "frühstücksteller",
    "platzteller",
    "untertasse",
    "tasse",
    "kaffeetasse",
    "teetasse",
    "espressotasse",
    "cappuccinotasse",
    "jumbotasse",
    "becher",
    "kaffeebecher",
    "trinkbecher",
    "glas",
    "trinkglas",
    "weinglas",
    "rotweinglas",
    "weißweinglas",
    "sektglas",
    "champagnerglas",
    "bierglas",
    "weizenbierglas",
    "pilsglas",
    "cocktailglas",
    "longdrinkglas",
    "saftglas",
    "wasserglas",
    "schnapsglas",
    "likörglas",
    "gläser",
    "besteck",
    "gabel",
    "messer",
    "tafelmesser",
    "steakmesser",
    "löffel",
    "esslöffel",
    "suppenlöffel",
    "teelöffel",
    "kaffeelöffel",
    "kuchengabel",
    "servierlöffel",
    "salatbesteck",
    "fischmesser",
    "buttermesser",
    "topf",
    "kochtopf",
    "bratentopf",
    "suppentopf",
    "milchtopf",
    "stielkasserolle",
    "schnellkochtopf",
    "dampfgartopf",
    "spargeltopf",
    "pfanne",
    "bratpfanne",
    "schmorpfanne",
    "wok",
    "grillpfanne",
    "crepespfanne",
    "blinispfanne",
    "schüssel",
    "salatschüssel",
    "rührschüssel",
    "müslischale",
    "dessertschale",
    "obstschale",
    "auflaufform",
    "backform",
    "kuchenform",
    "springform",
    "kastenform",
    "gugelhupfform",
    "muffinform",
    "tarteform",
    "quicheform",
    "pizzablech",
    "backblech",
    "mixer",
    "stabmixer",
    "handmixer",
    "standmixer",
    "smoothie maker",
    "pürierstab",
    "zwiebelschneider",
    "multizerkleinerer",
    "toaster",
    "langschlitztoaster",
    "sandwichmaker",
    "kontaktgrill",
    "waffeleisen",
    "kaffeemaschine",
    "filterkaffeemaschine",
    "padmaschine",
    "kapselmaschine",
    "espressomaschine",
    "siebträger",
    "kaffeevollautomat",
    "kaffeemühle",
    "wasserkocher",
    "teekocher",
    "eierkocher",
    "gewürz",
    "salz",
    "pfeffer",
    "paprika",
    "curry",
    "kräuter",
    "basilikum",
    "oregano",
    "thymian",
    "rosmarin",
    "petersilie",
    "schnittlauch",
    "gewürzstreuer",
    "gewürzmühle",
    "gewürzregal",
    "messerblock",
    "küchenmesser",
    "kochsesser",
    "gemüsemesser",
    "schälmesser",
    "brotmesser",
    "fleischmesser",
    "ausbeinmesser",
    "filetiermesser",
    "wetzstahl",
    "messerschärfer",
    "brotschneidemaschine",
    "brett",
    "schneidebrett (holz)",
    "schneidebrett (kunststoff)",
    "frühstücksbrett",
    "dose",
    "vorratsdose",
    "frischhaltedose",
    "keksdose",
    "kaffeedose",
    "teedose",
    "tupperdose",
    "lunchbox",
    "flasche",
    "trinkflasche",
    "glasflasche",
    "plastikflasche",
    "thermosflasche",
    "ölflasche",
    "essigflasche",
    "geschirrtuch",
    "spültuch",
    "topflappen",
    "grillhandschuh",
    "untersetzer (topf)",
    "untersetzer (glas)",
    "tablett",
    "servierplatte",
    "etagere",
    "krug",
    "karaffe",
    "saftkrug",
    "wasserkaraffe",
    "reibe",
    "gemüsereibe",
    "käsereibe",
    "muskatreibe",
    "hobel",
    "gemüsehobel",
    "mandoline",
    "schäler",
    "sparschaäler",
    "kartoffelschäler",
    "apfelausstecher",
    "kirschentkerner",
    "dosenöffner",
    "büchsenöffner",
    "flaschenöffner",
    "kapselheber",
    "korkenzieher",
    "weinöffner",
    "sieb",
    "mehlsieb",
    "passiersieb",
    "trichter",
    "messbecher",
    "messlöffel",
    "waage",
    "küchenwaage",
    "digitalwaage",
    "nudelholz",
    "backpinsel",
    "teigschaber",
    "teigrolle",
    "ausstechform",
    "plätzchenausstecher",
    "spritzbeutel",
    "garniertülle",
    "eisportionierer",
    "eislöffel",
    "knoblauchpresse",
    "zitronenpresse",
    "orangenpresse",
    "grillzange",
    "pfannenwender",
    "schneebesen",
    "kochlöffel",
    "schöpflöffel",
    "suppenkelle",
    "saucenlöffel",
    "spaghettilöffel",
    "mülleimer",
    "abfalleimer",
    "bioeimer",
    "brotdose",
    "brottopf",
    "butterdose",
    "eierbecher",
    "eierschneider",
    "fondue-set",
    "raclette-grill",
    "fritteuse",
    "heißluftfritteuse",
    "mikrowelle",
    "dampfgarer",
    "entsafter",
    "joghurtbereiter",
    "eismaschine",
    "folienschweißgerät",
    "vakuumierer",
    "küchenrolle",
    "serviette",
    "papierserviette",
    "stoffserviette",
    "tischdecke",
    "tischläufer",
    "platzset",
    "küchenuhr",
    "eieruhr",
    "küchenradio",
    "sodastream",
    "wassersprudler",
    "kaffeefilter",
    "teefilter",
    "tee-ei",
    "mörser",
    "stößel",
    "alufolie",
    "frischhaltefolie",
    "backpapier",
    "müllbeutel",
    "spülbürste",
    "schwamm",
    "stahlwolle",
    "abwaschmittel",
    "spülmaschinentabs",
    "klarspüler",
    "spülmaschinensalz",
  ],
  Bad: [
    "handtuch",
    "duschtuch",
    "badetuch",
    "gästehandtuch",
    "waschlappen",
    "handtücher",
    "seife",
    "stückseife",
    "flüssigseife",
    "seifenspender",
    "seifenschale",
    "shampoo",
    "haarshampoo",
    "anti-schuppen-shampoo",
    "conditioner",
    "haarspülung",
    "haarkur",
    "haarmaske",
    "duschgel",
    "duschbad",
    "duschöl",
    "badezusatz",
    "badeöl",
    "badesalz",
    "schaumbad",
    "badekugel",
    "zahnbürste",
    "handzahnbürste",
    "elektrozahnbürste",
    "schallzahnbürste",
    "zahnpasta",
    "zahncreme",
    "mundwasser",
    "mundspülung",
    "zahnseide",
    "zahnstocher",
    "interdentalbürste",
    "zungenreiniger",
    "föhn",
    "haartrockner",
    "diffusor (föhn)",
    "glätteisen",
    "haarglätter",
    "lockenstab",
    "kreppeisen",
    "warmluftbürste",
    "kosmetik",
    "makeup",
    "schminke",
    "foundation",
    "concealer",
    "abdeckstift",
    "puder",
    "kompaktpuder",
    "loses puder",
    "rouge",
    "bronzer",
    "highlighter",
    "lidschatten",
    "lidschattenpalette",
    "mascara",
    "wimperntusche",
    "eyeliner",
    "kajalstift",
    "augenbrauenstift",
    "augenbrauengel",
    "lippenstift",
    "lipgloss",
    "lipliner",
    "nagellack",
    "überlack",
    "unterlack",
    "nagellackentferner",
    "wattepads",
    "wattestäbchen",
    "kosmetiktücher",
    "abschminktücher",
    "parfüm",
    "eau de toilette",
    "eau de parfum",
    "deo",
    "deodorant",
    "antitranspirant",
    "deoroller",
    "deospray",
    "deostick",
    "creme",
    "gesichtscreme",
    "tagescreme",
    "nachtcreme",
    "augencreme",
    "serum",
    "körperlotion",
    "bodylotion",
    "bodymilk",
    "handcreme",
    "fußcreme",
    "sonnencreme",
    "sonnenschutz",
    "aftersun",
    "selbstbräuner",
    "bürste",
    "haarbürste",
    "rundbürste",
    "paddelbürste",
    "kamm",
    "läusekamm",
    "rasierer",
    "nassrasierer",
    "damenrasierer",
    "herrenrasierer",
    "elektrorasierer",
    "rasierklingen",
    "ersatzklingen",
    "rasierschaum",
    "rasiergel",
    "rasierseife",
    "aftershave",
    "bartöl",
    "bartbalsam",
    "pinzette",
    "nagelschere",
    "hautschere",
    "nagelfeile",
    "glasfeile",
    "sandblattfeile",
    "nagelknipser",
    "nagelzange",
    "hornhautraspel",
    "bimstein",
    "bademantel",
    "duschvorhang",
    "duschstange",
    "badematte",
    "duschmatte",
    "badvorleger",
    "waage",
    "personenwaage",
    "körperfettwaage",
    "toilettenpapier",
    "klopapier",
    "feuchttücher (baby)",
    "feuchtes toilettenpapier",
    "hygieneartikel",
    "damenhygiene",
    "tampons",
    "binden",
    "slipeinlagen",
    "menstruationstasse",
    "mundschutz (medizinisch)",
    "ffp2-maske",
    "desinfektionsmittel",
    "händedesinfektion",
    "flächendesinfektion",
    "erste-hilfe-set",
    "pflaster",
    "verband",
    "wärmflasche",
    "thermometer",
    "kontaktlinsen",
    "kontaktlinsenflüssigkeit",
    "brillenputztuch",
    "waschmittel",
    "weichspüler",
    "wäschekorb",
    "wäscheklammern",
    "toilettenbürste",
    "zahnputzbecher",
    "badewanneneinlage",
    "duschhocker",
    "wc-sitz",
    "spiegel (bad)",
    "kosmetikspiegel",
    "vergrößerungsspiegel",
  ],
  Kleidung: [
    "hose",
    "jeans",
    "stoffhose",
    "kurze hose",
    "shorts",
    "bermudas",
    "leggings",
    "jogginghose",
    "trainingshose",
    "anzughose",
    "chino",
    "cordhose",
    "hemd",
    "oberhemd",
    "freizeithemd",
    "businesshemd",
    "bluse",
    "tunika",
    "shirt",
    "t-shirt",
    "langarmshirt",
    "v-ausschnitt",
    "rundhals",
    "top",
    "tanktop",
    "spaghettiträger",
    "polohemd",
    "pullover",
    "pulli",
    "strickpullover",
    "rollkragenpullover",
    "v-pullover",
    "strickjacke",
    "cardigan",
    "sweatshirt",
    "hoodie",
    "kapuzenpullover",
    "jacke",
    "sommerjacke",
    "winterjacke",
    "übergangsjacke",
    "daunenjacke",
    "steppjacke",
    "softshelljacke",
    "lederjacke",
    "jeansjacke",
    "mantel",
    "wintermantel",
    "trenchcoat",
    "kurzmantel",
    "regenjacke",
    "windjacke",
    "fleecejacke",
    "weste",
    "steppweste",
    "blazer",
    "sakko",
    "socken",
    "strümpfe",
    "kniestrümpfe",
    "sneakersocken",
    "sportsocken",
    "strumpfhose",
    "feinstrumpfhose",
    "unterwäsche",
    "unterhemd",
    "slip",
    "panty",
    "boxershorts",
    "bh",
    "sport-bh",
    "bustier",
    "body",
    "schuhe",
    "sneaker",
    "turnschuhe",
    "laufschuhe",
    "halbschuhe",
    "schnürschuhe",
    "slipper",
    "mokassins",
    "sandalen",
    "sandaletten",
    "flip-flops",
    "badeschuhe",
    "hausschuhe",
    "pantoffeln",
    "stiefel",
    "winterstiefel",
    "stiefeletten",
    "boots",
    "chelsea boots",
    "gummistiefel",
    "wanderschuhe",
    "trekkingschuhe",
    "sportschuhe",
    "fußballschuhe",
    "tanzschuhe",
    "pumps",
    "high heels",
    "ballerinas",
    "kleid",
    "abendkleid",
    "cocktailkleid",
    "sommerkleid",
    "maxikleid",
    "etui-kleid",
    "strickkleid",
    "rock",
    "mini-rock",
    "midi-rock",
    "maxi-rock",
    "jeansrock",
    "bleistiftrock",
    "faltenrock",
    "anzug",
    "business-anzug",
    "smoking",
    "frack",
    "krawatte",
    "fliege",
    "querbinder",
    "einstecktuch",
    "schal",
    "halstuch",
    "loop-schal",
    "mütze",
    "beanie",
    "strickmütze",
    "bommelmütze",
    "hut",
    "filzhut",
    "strohhut",
    "kappe",
    "cap",
    "baseballcap",
    "schirmmütze",
    "stirnband",
    "handschuhe",
    "fingerhandschuhe",
    "fäustlinge",
    "gürtel",
    "ledergürtel",
    "stoffgürtel",
    "hosenträger",
    "bademode",
    "bikini",
    "tankini",
    "badeanzug",
    "badehose",
    "badeshorts",
    "schlafanzug",
    "pyjama",
    "nachthemd",
    "shorty",
    "morgenmantel",
    "bademantel",
    "dirndl",
    "tracht",
    "lederhose",
    "kostüm (beruflich)",
    "faschingskostüm",
    "karnevalskostüm",
    "arbeitskleidung",
    "latzhose",
    "overall",
    "jumpsuit",
    "umstandsmode",
    "babykleidung",
    "strampler",
    "bodysuit",
    "schlafsack (baby)",
    "schneeanzug",
    "regenkleidung",
    "matschhose",
  ],
  Bürowaren: [
    "stift",
    "kugelschreiber",
    "füller",
    "fineliner",
    "marker",
    "permanentmarker",
    "whiteboardmarker",
    "textmarker",
    "bleistift",
    "druckbleistift",
    "minen",
    "buntstift",
    "filzstift",
    "wachsmalstift",
    "kreide",
    "radiergummi",
    "spitzer",
    "anspitzer",
    "block",
    "schreibblock",
    "notizblock",
    "collegeblock",
    "zeichenblock",
    "skizzenblock",
    "ordner",
    "aktenordner",
    "ringbuch",
    "sammelmappe",
    "hefter",
    "schnellhefter",
    "prospekthülle",
    "sichthülle",
    "trennstreifen",
    "trennblätter",
    "register",
    "papier",
    "druckerpapier",
    "kopierpapier",
    "fotopapier",
    "briefpapier",
    "briefumschlag",
    "umschlag",
    "versandtasche",
    "luftpolstertasche",
    "schere",
    "papierschere",
    "bastelschere",
    "cutter",
    "skalpell",
    "lineal",
    "maßstab",
    "geodreieck",
    "zirkel",
    "tacker",
    "heftgerät",
    "heftklammern",
    "heftklammernentferner",
    "locher",
    "büroklammer",
    "reißzwecke",
    "pinnnadel",
    "musterbeutelklammer",
    "klebeband",
    "tesafilm",
    "paketband",
    "abroller",
    "klebestift",
    "flüssigkleber",
    "sekundenkleber",
    "uhu",
    "prittstift",
    "notizbuch",
    "kladde",
    "journal",
    "tagebuch",
    "kalender",
    "wandkalender",
    "tischkalender",
    "terminkalender",
    "organizer",
    "schreibtischunterlage",
    "stempel",
    "datumstempel",
    "firmenstempel",
    "stempelkissen",
    "stempelfarbe",
    "visitenkarten",
    "visitenkartenetui",
    "etiketten",
    "adressetiketten",
    "post-its",
    "haftnotiz",
    "merkzettel",
    "korrekturroller",
    "korrekturfluid",
    "tipp-ex",
    "tintenkiller",
    "patrone",
    "füllertinte",
    "tusche",
    "zeichenfeder",
    "pinnwand",
    "korkwand",
    "whiteboard",
    "magnettafel",
    "flipchart",
    "flipchartpapier",
    "laminiergerät",
    "laminiertasche",
    "folie",
    "aktenvernichter",
    "schredder",
    "schneidemaschine",
    "hebelschneider",
    "rollenschneider",
    "geldkassette",
    "brieföffner",
    "lupe",
    "vergrößerungsglas",
    "mappe",
    "klemmbrettmappe",
    "aktentasche",
    "laptoptasche",
    "schreibmappe",
    "federmäppchen",
    "schlampermäppchen",
    "etui",
    "schulranzen",
    "schultasche",
    "rucksack",
    "usb-stick (leer)",
    "cd-rohling",
    "dvd-rohling",
    "disketten",
    "lochverstärker",
    "buchstützen (büro)",
    "schreibtischorganizer",
    "stifteköcher",
    "papierkorb",
    "dokumentenablage",
    "briefablage",
    "schubladenbox",
  ],
  Werkzeug: [
    "hammer",
    "fäustel",
    "schlosserhammer",
    "latthammer",
    "gummihammer",
    "schonhammer",
    "schraubendreher",
    "schraubenzieher",
    "kreuzschlitz",
    "phillips",
    "pozidriv",
    "schlitzschraubendreher",
    "torx",
    "inbus",
    "innensechskant",
    "bitsatz",
    "bit-halter",
    "zange",
    "kombizange",
    "kneifzange",
    "beißzange",
    "rohrzange",
    "wasserpumpenzange",
    "gripzange",
    "flachzange",
    "rundzange",
    "spitzzange",
    "seitenschneider",
    "kabelschere",
    "abisolierzange",
    "crimpzange",
    "bohrer",
    "holzbohrer",
    "metallbohrer",
    "steinbohrer",
    "betonbohrer",
    "sds-bohrer",
    "forstnerbohrer",
    "senker",
    "bohrmaschine",
    "schlagbohrmaschine",
    "bohrhammer",
    "akkuschrauber",
    "schlagschrauber",
    "säge",
    "handsäge",
    "fuchsschwanz",
    "japansäge",
    "feinsäge",
    "stichsäge",
    "säbelsäge",
    "kreissäge",
    "handkreissäge",
    "tauchsäge",
    "kappsäge",
    "gehrungssäge",
    "kettensäge",
    "bügelsäge",
    "metallsäge",
    "laubsäge",
    "schraubenschlüssel",
    "maulschlüssel",
    "ringschlüssel",
    "gabelschlüssel",
    "rollgabelschlüssel",
    "engländer",
    "knarre",
    "ratsche",
    "steckschlüssel",
    "nuss",
    "nusskasten",
    "drehmomentschlüssel",
    "wasserwaage",
    "richtwaage",
    "laserwasserwaage",
    "maßband",
    "rollbandmaß",
    "zollstock",
    "gliedermaßstab",
    "schieblehre",
    "messschieber",
    "mikrometerschraube",
    "winkel",
    "schreinerwinkel",
    "gehrungswinkel",
    "feile",
    "metallfeile",
    "holzfeile",
    "raspel",
    "schleifpapier",
    "schmirgelpapier",
    "schleifklotz",
    "schleifmaschine",
    "winkelschleifer",
    "flex",
    "exzenterschleifer",
    "bandschleifer",
    "deltaschleifer",
    "multischleifer",
    "meißel",
    "stemmeisen",
    "körner",
    "durchschläger",
    "spachtel",
    "malerspachtel",
    "japanspachtel",
    "kelle",
    "maurerekelle",
    "putzkelle",
    "pinsel",
    "flachpinsel",
    "rundpinsel",
    "lackierpinsel",
    "farbrolle",
    "walze",
    "teleskopstiel",
    "abdeckfolie",
    "plane",
    "malerkrepp",
    "abklebeband",
    "leiter",
    "stehleiter",
    "anlegeleiter",
    "teleskopleiter",
    "trittleiter",
    "gerüstbock",
    "schubkarre",
    "spaten",
    "schaufel",
    "rechen",
    "besen",
    "kehrblech",
    "handfeger",
    "gartenschere",
    "astschere",
    "heckenschere",
    "rasenmäher",
    "trimmer",
    "axt",
    "beil",
    "spaltaxt",
    "schraubstock",
    "werkbank",
    "werkzeugkasten",
    "werkzeugkoffer",
    "werkzeugwagen",
    "sortimentskasten",
    "kleinteilemagazin",
    "schrauben",
    "holzschrauben",
    "metallschrauben",
    "maschinenschrauben",
    "nägel",
    "drahtstifte",
    "dübel",
    "spreizdübel",
    "hohlraumdübel",
    "muttern",
    "sechskantmuttern",
    "hutmuttern",
    "unterlegscheiben",
    "federringe",
    "sicherheitsbrille",
    "schutzbrille",
    "arbeitshandschuhe",
    "montagehandschuhe",
    "gehörschutz",
    "kapselgehörschutz",
    "ohrstöpsel",
    "staubmaske",
    "atemschutzmaske",
    "cuttermesser",
    "teppichmesser",
    "ersatzklingen",
    "lötkolben",
    "lötstation",
    "lötzinn",
    "entlötpumpe",
    "heißklebepistole",
    "klebesticks",
    "kabelbinder",
    "isolierband",
    "panzertape",
    "gaffatape",
    "wd-40",
    "kriechöl",
    "öl",
    "schmierfett",
    "fettpresse",
    "silikon (kartusche)",
    "acryl (kartusche)",
    "kartuschenpresse",
    "fugenkratzer",
    "fliesenschneider",
    "glasschneider",
    "tapetenablöser",
    "igelwalze",
    "tapeziertisch",
    "tapezierbürste",
    "andrückroller",
    "nahtroller",
    "lot",
    "senklot",
    "schlagschnur",
    "reifenflickzeug",
    "spannungsprüfer",
    "stromprüfer",
    "abzieher",
    "nietenzange",
    "blindnieten",
    "gewindeschneider",
    "rohrschneider",
    "rohrbiegezange",
    "schweißgerät",
    "schweißelektroden",
    "schutzgas",
  ],
  Dekoration: [
    "bild",
    "gemälde",
    "kunstdruck",
    "poster",
    "foto",
    "leinwandbild",
    "bilderrahmen",
    "fotorahmen",
    "wechselrahmen",
    "digitaler bilderrahmen",
    "spiegel",
    "wandspiegel",
    "standspiegel",
    "kosmetikspiegel (deko)",
    "vase",
    "blumenvase",
    "bodenvase",
    "dekovase",
    "übertopf",
    "blumentopf",
    "pflanzkübel",
    "ampel (pflanze)",
    "kerze",
    "stumpenkerze",
    "stabkerze",
    "duftkerze",
    "teelicht",
    "kerzenständer",
    "teelichthalter",
    "windlicht",
    "laterne",
    "figur",
    "skulptur",
    "dekoobjekt",
    "büste",
    "tierfigur",
    "schale",
    "dekoschale",
    "obstschale (deko)",
    "dekosteine",
    "dekosand",
    "dekokies",
    "muscheln",
    "treibholz",
    "kissen",
    "sofakissen",
    "zierkissen",
    "sitzkissen",
    "stuhlkissen",
    "decke",
    "wolldecke",
    "kuscheldecke",
    "plaid",
    "tagesdecke",
    "überwurf",
    "teppich",
    "läufer",
    "vorleger",
    "fell",
    "kunstfell",
    "fußmatte (innen)",
    "vorhang",
    "gardine",
    "schlaufenschal",
    "ösenschal",
    "raffrollo",
    "scheibengardine",
    "rollo",
    "verdunklungsrollo",
    "jalousie",
    "lamellenvorhang",
    "plissee",
    "insektenschutz (dekorativ)",
    "lampe",
    "tischlampe",
    "nachttischlampe",
    "stehlampe",
    "bogenlampe",
    "deckenlampe",
    "hängeleuchte",
    "pendelleuchte",
    "wandlampe",
    "spot",
    "strahler",
    "lichterkette",
    "led-band",
    "glühbirne (deko)",
    "led-kerze",
    "lampenschirm",
    "pflanze",
    "zimmerpflanze",
    "grünpflanze",
    "blühpflanze",
    "orchidee",
    "kaktus",
    "sukkulente",
    "bonsai",
    "kunstpflanze",
    "seidenblume",
    "blumenstrauß (künstlich)",
    "trockenblumen",
    "gesteck",
    "kranz",
    "adventskranz",
    "türkranz",
    "girlande",
    "wandtattoo",
    "wallsticker",
    "wandbild",
    "fototapete (klein)",
    "wanduhr",
    "tischuhr",
    "standuhr",
    "wecker (deko)",
    "mobile",
    "traumfänger",
    "duftlampe",
    "aromadiffusor",
    "raumduft",
    "duftstäbchen",
    "potpourri",
    "künstliche blumen",
    "dekokugeln",
    "dekoschalen",
    "tischläufer",
    "tischset (deko)",
    "serviettenringe (deko)",
    "untersetzer (deko)",
    "federn",
    "bänder",
    "schleifen",
    "geschenkband",
    "jahreszeitendeko",
    "weihnachtsdeko",
    "christbaumkugeln",
    "weihnachtsstern",
    "osterdeko",
    "osterhase",
    "ostereier (deko)",
    "herbstdeko",
    "kürbis (deko)",
    "frühlingsdeko",
    "partydeko",
    "luftballons",
    "konfetti",
    "wimpelkette",
    "luftschlangen",
    "tischfeuerwerk",
    "dekoschriftzug",
    "buchstaben (deko)",
    "globus (deko)",
    "sanduhr",
    "maritime deko",
    "anker",
    "schiffsmodell",
    "vintage deko",
    "shabby chic",
    "boho deko",
    "skandinavische deko",
    "minimalistische deko",
    "industrielle deko",
    "landhaus deko",
  ],
  Dokumente: [
    "vertrag",
    "mietvertrag",
    "arbeitsvertrag",
    "kaufvertrag",
    "versicherungsvertrag",
    "handyvertrag",
    "leasingvertrag",
    "kreditvertrag",
    "sparvertrag",
    "bauvertrag",
    "dienstleistungsvertrag",
    "zeugnis",
    "schulzeugnis",
    "abiturzeugnis",
    "universitätszeugnis",
    "arbeitszeugnis",
    "zwischenzeugnis",
    "abschlusszeugnis",
    "zertifikat",
    "fortbildungszertifikat",
    "sprachzertifikat",
    "urkunde",
    "geburtsurkunde",
    "heiratsurkunde",
    "sterbeurkunde",
    "taufschein",
    "meisterbrief",
    "gesellenbrief",
    "pass",
    "reisepass",
    "kinderreisepass",
    "personalausweis",
    "aufenthaltstitel",
    "visum",
    "führerschein",
    "internationaler führerschein",
    "fahrzeugschein",
    "zulassungsbescheinigung teil i",
    "fahrzeugbrief",
    "zulassungsbescheinigung teil ii",
    "rechnung",
    "eingangsrechnung",
    "ausgangsrechnung",
    "quittung",
    "beleg",
    "kassenbon",
    "mahnung",
    "zahlungserinnerung",
    "unterlagen",
    "bewerbungsunterlagen",
    "lebenslauf",
    "anschreiben",
    "steuerunterlagen",
    "steuererklärung",
    "steuerbescheid",
    "lohnsteuerbescheinigung",
    "bankunterlagen",
    "kontoauszug",
    "kreditkartenabrechnung",
    "depotauszug",
    "überweisungsträger",
    "versicherungspolice",
    "police",
    "haftpflichtversicherung",
    "hausratversicherung",
    "kfz-versicherung",
    "rechtsschutzversicherung",
    "lebensversicherung",
    "krankenversicherungskarte",
    "sozialversicherungsausweis",
    "akte",
    "patientenakte",
    "arztunterlagen",
    "röntgenbilder",
    "notarunterlagen",
    "grundbuchauszug",
    "testament",
    "patientenverfügung",
    "vorsorgevollmacht",
    "betriebsanleitung",
    "bedienungsanleitung",
    "garantiekarte",
    "garantieschein",
    "mitgliedsausweis",
    "vereinsausweis",
    "bibliotheksausweis",
    "fahrkarte",
    "monatskarte",
    "jahreskarte",
    "ticket",
    "flugticket",
    "bahnticket",
    "konzertticket",
    "eintrittskarte",
    "gutschein",
    "geschenkgutschein",
    "rezepte (medizinisch)",
    "arztbrief",
    "überweisung (arzt)",
    "impfpass",
    "allergiepass",
    "studienbescheinigung",
    "immatrikulationsbescheinigung",
    "studentenausweis",
    "lohnzettel",
    "gehaltsabrechnung",
    "rentenbescheid",
    "wohngeldbescheid",
    "kindergeldbescheid",
    "bafög-bescheid",
    "baupläne",
    "architektenpläne",
    "statikunterlagen",
    "handbücher (geräte)",
    "notizen (wichtig)",
    "korrespondenz (wichtig)",
    "briefe (wichtig)",
    "postkarten (sentimental)",
    "sammelhefter",
    "klarsichthüllen",
    "aktenhüllen",
    "archivbox",
    "dokumentenbox",
  ],
  Spielzeug: [
    "puppe",
    "barbie",
    "stoffpuppe",
    "babypuppe",
    "actionfigur",
    "superheld",
    "star wars figur",
    "teddybär",
    "kuscheltier",
    "stofftier",
    "plüschtier",
    "auto",
    "spielzeugauto",
    "modellauto",
    "matchbox",
    "siku",
    "hot wheels",
    "ferngesteuertes auto",
    "rc-auto",
    "rennbahn",
    "carrera bahn",
    "eisenbahn",
    "modelleisenbahn",
    "lokomotive",
    "waggon",
    "schienen",
    "lego",
    "lego duplo",
    "lego technik",
    "lego city",
    "lego friends",
    "playmobil",
    "ritterburg",
    "piratenschiff",
    "bauernhof",
    "bausteine",
    "bauklötze",
    "holzbausteine",
    "kapla steine",
    "konstruktionsspielzeug",
    "fischertechnik",
    "knex",
    "brettspiel",
    "gesellschaftsspiel",
    "monopoly",
    "siedler von catan",
    "mensch ärgere dich nicht",
    "schach",
    "dame",
    "mühle",
    "kartenspiel",
    "uno",
    "skip-bo",
    "rommé",
    "poker",
    "skat",
    "quartett",
    "memory",
    "puzzle",
    "kinderpuzzle",
    "ravensburger puzzle",
    "3d-puzzle",
    "ball",
    "fußball (spielzeug)",
    "basketball (spielzeug)",
    "volleyball (spielzeug)",
    "hüpfball",
    "flummi",
    "kaufladen",
    "spielkasse",
    "spielgeld",
    "spielküche",
    "kinderküche",
    "spielzeuggeschirr",
    "spielzeugessen",
    "werkbank für kinder",
    "spielzeugwerkzeug",
    "puppenhaus",
    "puppenmöbel",
    "puppenwagen",
    "puppenbett",
    "kreisel",
    "brummkreisel",
    "jojo",
    "springseil",
    "murmeln",
    "glasmurmeln",
    "knete",
    "play-doh",
    "modelliermasse",
    "malkasten",
    "wasserfarben",
    "deckfarbkasten",
    "fingerfarben",
    "buntstifte für kinder",
    "wachsmalstifte für kinder",
    "sticker",
    "stickerbuch",
    "sammelkarten",
    "pokémon karten",
    "yugioh karten",
    "planschbecken",
    "sandspielzeug",
    "sandförmchen",
    "schaufel (spielzeug)",
    "eimer (spielzeug)",
    "gießkanne (spielzeug)",
    "wasserpistole",
    "seifenblasen",
    "pustefix",
    "drachen",
    "lenkdrachen",
    "frisbee",
    "kinderschlagzeug",
    "kinderkeyboard",
    "kindergitarre",
    "blockflöte",
    "mundharmonika",
    "xylophon",
    "rassel",
    "greifling",
    "spieluhr",
    "bilderbuch für kinder",
    "wimmelbuch",
    "fühlbuch",
    "vorlesebuch",
    "tiptoi stift",
    "tiptoi buch",
    "toniebox",
    "tonies figuren",
    "schaukelpferd",
    "rutscheauto",
    "bobbycar",
    "dreirad",
    "laufrad",
    "kinderroller",
    "skateboard für kinder",
    "inliner für kinder",
    "schutzausrüstung (kinder)",
    "puppengeschirr",
    "arztkoffer für kinder",
    "frisierkopf",
    "experimentierkasten",
    "chemiekasten",
    "mikroskop (kinder)",
    "teleskop (kinder)",
    "zauberkasten",
    "perlen",
    "bügelperlen",
    "bastelset",
    "webrahmen (kinder)",
    "strickliesel",
    "slinky",
    "rubiks cube",
    "zauberwürfel",
    "walkie talkie (kinder)",
  ],
  Sportgeräte: [
    "hantel",
    "kurzhantel",
    "langhantel",
    "hantelscheibe",
    "gewichtsscheibe",
    "kettlebell",
    "medizinball",
    "gymnastikball",
    "pezzi-ball",
    "matte",
    "yogamatte",
    "pilatesmatte",
    "gymnastikmatte",
    "fitnessmatte",
    "isomatte",
    "turnmatte",
    "ball",
    "fußball",
    "handball",
    "volleyball",
    "basketball",
    "tennisball",
    "tischtennisball",
    "golfball",
    "squashball",
    "badmintonball",
    "federball",
    "hockeyball",
    "schläger",
    "tennisschläger",
    "badmintonschläger",
    "federballschläger",
    "tischtennisschläger",
    "golfschläger",
    "hockeyschläger",
    "eishockeyschläger",
    "baseballschläger",
    "cricketschläger",
    "squashschläger",
    "fahrradhelm",
    "skihelm",
    "snowboardhelm",
    "kletterhelm",
    "reithelm",
    "rad",
    "fahrrad",
    "mountainbike",
    "mtb",
    "rennrad",
    "gravelbike",
    "trekkingrad",
    "citybike",
    "hollandrad",
    "ebike",
    "pedelec",
    "kinderfahrrad",
    "fahrradanhänger",
    "fahrradtasche",
    "fahrradkorb",
    "fahrradschloss",
    "luftpumpe (fahrrad)",
    "basketballkorb",
    "fußballtor (klein)",
    "laufband",
    "crosstrainer",
    "ellipsentrainer",
    "ergometer",
    "fahrradergometer",
    "heimtrainer",
    "spinningrad",
    "rudergerät",
    "kraftstation",
    "hantelbank",
    "klimmzugstange",
    "boxsack",
    "boxhandschuhe",
    "bandagen (boxen)",
    "pratzen",
    "springseil",
    "speedrope",
    "fitnessband",
    "theraband",
    "widerstandsband",
    "yogablock",
    "yogagurt",
    "pilatesring",
    "faszienrolle",
    "blackroll",
    "balance board",
    "wackelbrett",
    "puck (eishockey)",
    "inliner",
    "inlineskates",
    "rollschuhe",
    "skateboard",
    "longboard",
    "waveboard",
    "scooter",
    "tretroller",
    "snowboard",
    "ski",
    "alpinski",
    "langlaufski",
    "tourenski",
    "skistöcke",
    "skischuhe",
    "snowboardschuhe",
    "schlittschuhe",
    "eislaufschuhe",
    "taucherbrille",
    "tauchmaske",
    "schnorchel",
    "flossen",
    "schwimmflossen",
    "schwimmbrille",
    "badekappe",
    "schwimmbrett",
    "poolnudel",
    "neoprenanzug",
    "surfbrett",
    "bodyboard",
    "sup-board",
    "stand-up-paddle-board",
    "paddel",
    "kajak",
    "kanu",
    "ruderboot",
    "zelt",
    "kuppelzelt",
    "tunnelzelt",
    "wurfzelt",
    "schlafsack",
    "mumienschlafsack",
    "deckenschlafsack",
    "isomatte (camping)",
    "luftmatratze",
    "rucksack",
    "trekkingrucksack",
    "tagesrucksack",
    "wanderstöcke",
    "nordic-walking-stöcke",
    "klettergurt",
    "kletterseil",
    "karabiner",
    "sicherungsgerät",
    "expressset",
    "kletterschuhe",
    "magnesiabeutel",
    "chalkbag",
    "pfeil und bogen",
    "armbrust",
    "dartscheibe",
    "dartpfeile",
    "boule-kugeln",
    "boccia-kugeln",
    "krocketspiel",
    "frisbee",
    "ultimate frisbee",
    "boomerang",
    "trampolin",
    "gartentrampolin",
    "pulsuhr",
    "sportuhr",
    "schrittzähler",
    "pedometer",
    "trinkflasche sport",
    "trinkblase",
    "sporttasche",
    "schweißband",
    "protektoren",
    "knieschoner",
    "ellenbogenschoner",
    "handgelenkschoner",
    "mundschutz (sport)",
    "tischtennisplatte",
    "tischtennisschläger",
    "tischtennisnetz",
    "badmintonnetz",
    "volleyballnetz",
    "pfeife",
    "stoppuhr",
    "kegel (sport)",
    "hürden (klein)",
    "koordinationsleiter",
  ],
  Sonstiges: [
    "kerzenreste",
    "alte batterien",
    "batterien (leer)",
    "kleinkram",
    "diverses",
    "krimskrams",
    "sammelsurium",
    "fundstücke",
    "erinnerungsstücke",
    "andenken",
    "souvenirs",
    "geschenke (unerwünscht)",
    "mitbringsel",
    "deko (alt)",
    "alte dekoration",
    "putzmittelreste",
    "reinigungsmittel (angebrochen)",
    "medikamentenreste",
    "abgelaufene medikamente",
    "abgelaufene lebensmittel (trocken)",
    "konserven (alt)",
    "schraubengläser (leer)",
    "einmachgläser",
    "verpackungsmaterial (wiederverwendbar)",
    "kartons (klein)",
    "blasenfolie",
    "blumentöpfe (leer)",
    "untersetzer (pflanzen)",
    "gießkanne",
    "pflanzenerde (rest)",
    "blähton",
    "samen",
    "saatgut",
    "dünger",
    "pflanzenschutzmittel (reste)",
    "haustierbedarf (alt)",
    "katzenstreu (rest)",
    "vogelsand (rest)",
    "hundeleine (alt)",
    "katzenspielzeug (alt)",
    "spielzeug (defekt, für ersatzteile)",
    "kabel (unbekannt)",
    "ladekabel (unbekannt)",
    "adapter (unbekannt)",
    "schlüssel (unbekannt)",
    "alte schlüssel",
    "knöpfe",
    "nähgarn",
    "nadeln",
    "sicherheitsnadeln",
    "stoffreste",
    "flicken",
    "wolle",
    "stricknadeln",
    "häkelnadeln",
    "bastelmaterial (reste)",
    "farbreste (basteln)",
    "kleber (alt)",
    "geschenkpapier (reste)",
    "schleifen (reste)",
    "alte zeitungen (zum einwickeln)",
    "packpapier",
    "luftpolsterfolie",
    "umzugskartons (leer, gefaltet)",
    "werkzeug (doppelt)",
    "schreibwaren (doppelt)",
    "bücher (aussortiert)",
    "kleidung (aussortiert)",
    "altkleider",
    "schuhe (aussortiert)",
    "taschen (alt)",
    "handtaschen (alt)",
    "koffer (alt)",
    "reisetasche (alt)",
    "regenschirm",
    "sonnenschirm",
    "sonnenschirmständer",
    "picknickdecke",
    "kühlbox",
    "kühltasche",
    "thermoskanne",
    "isolierkanne",
    "feuerzeug",
    "streichhölzer",
    "aschenbecher",
    "notfallset auto",
    "warndreieck",
    "warnweste",
    "verbandskasten (auto)",
    "eiskratzer",
    "schneebesen (auto)",
    "parkuhr",
    "parkscheibe",
    "fahrradschloss",
    "fahrradpumpe",
    "luftpumpe",
    "flickzeug (fahrrad)",
    "brillenetui",
    "sonnenbrille",
    "lesebrille (alt)",
    "schmuck (modeschmuck)",
    "uhren (alt)",
    "gürtel (alt)",
    "münzen (fremdwährung)",
    "alte münzen",
    "briefmarken (alt)",
    "postkarten (unbeschrieben)",
    "glückwunschkarten (unbeschrieben)",
    "notfallkerzen",
    "taschenlampe",
    "batterien (neu, reserve)",
    "glühbirnen (reserve)",
    "sicherungen (haushalt)",
    "kerzenständer (einfach)",
    "blumenvase (einfach)",
    "kleiderbügel",
    "schuhspanner",
    "mottenkugeln",
    "duftsäckchen",
    "raumlufterfrischer (alt)",
    "fliegenklatsche",
    "mausfalle",
    "insektenfalle",
    "vogelhaus (klein)",
    "futterspender (vogel)",
    "gartenzwerg (klein)",
    "windspiel",
    "aschenbecher (außen)",
    "fußabtreter (alt)",
    "schuhanzieher",
    "kleiderbürste",
    "fusselrolle",
    "nähset (klein)",
    "reiseset (miniaturen)",
    "schlafmaske",
    "ohrstöpsel (reise)",
    "nackenkissen",
    "kofferanhänger",
    "schloss (klein)",
    "vorhängeschloss",
    "feuerlöscher (klein, auto)",
    "löschdecke",
  ],
};
const standardKategorien = [
  "Medien",
  "Elektronik",
  "Küche",
  "Bad",
  "Kleidung",
  "Bürowaren",
  "Werkzeug",
  "Dekoration",
  "Dokumente",
  "Spielzeug",
  "Sportgeräte",
  "Sonstiges",
];
const kategorieBadgeColors = {
  Medien: "bg-blue-500/30 text-blue-300",
  Elektronik: "bg-indigo-500/30 text-indigo-300",
  Küche: "bg-green-500/30 text-green-300",
  Bad: "bg-pink-500/30 text-pink-300",
  Kleidung: "bg-purple-500/30 text-purple-300",
  Bürowaren: "bg-yellow-500/30 text-yellow-300", // Angepasst
  Werkzeug: "bg-amber-500/40 text-amber-200",
  Dekoration: "bg-teal-500/30 text-teal-300", // Angepasst
  Dokumente: "bg-red-500/30 text-red-300",
  Spielzeug: "bg-orange-500/30 text-orange-300",
  Sportgeräte: "bg-lime-500/30 text-lime-300",
  Sonstiges: "bg-sky-600/40 text-sky-200",
};

const raumVorschlaege = [
  "Wohnzimmer",
  "Schlafzimmer",
  "Küche",
  "Bad",
  "Kinderzimmer",
  "Büro",
  "Flur",
  "Keller",
  "Dachboden",
  "Garage",
  "Balkon",
  "Terrasse",
  "Abstellraum",
  "Gästezimmer",
  "Hobbyraum",
  "Waschküche",
  "Sonstiges",
];

const getKategorieBadgeClass = (kategorie) => {
  if (!kategorie) {
    return kategorieBadgeColors["Sonstiges"];
  }
  // Prüfe zuerst auf exakte Übereinstimmung (Groß-/Kleinschreibung irrelevant für Key, aber Wert ist wichtig)
  if (kategorieBadgeColors[kategorie]) {
    return kategorieBadgeColors[kategorie];
  }
  // Fallback für normalisierte Eingabe, falls die Kategorie von der KI leicht abweicht
  const normalizedKategorieInput = kategorie.trim().toLowerCase();
  for (const key in kategorieBadgeColors) {
    if (key.toLowerCase() === normalizedKategorieInput) {
      return kategorieBadgeColors[key];
    }
  }
  // Wenn die Kategorie "Büro/Schreibwaren" oder "Deko/Wohnaccessoires" ist, aber im Badge "Bürowaren" oder "Dekoration" verwendet wird
  if (
    normalizedKategorieInput === "büro/schreibwaren" &&
    kategorieBadgeColors["Bürowaren"]
  ) {
    return kategorieBadgeColors["Bürowaren"];
  }
  if (
    normalizedKategorieInput === "deko/wohnaccessoires" &&
    kategorieBadgeColors["Dekoration"]
  ) {
    return kategorieBadgeColors["Dekoration"];
  }
  return kategorieBadgeColors["Sonstiges"];
};

const RaumInventar = ({ kisten }) => {
  const [open, setOpen] = useState(false);
  const inventarNachRaum = {};
  kisten.forEach((kiste) => {
    const raum = kiste.raum_neu || "Ohne Raum";
    (kiste.inhalt || []).forEach((item) => {
      if (item.ausgepakt_am) {
        if (!inventarNachRaum[raum]) inventarNachRaum[raum] = [];
        inventarNachRaum[raum].push({ ...item, kisteName: kiste.name });
      }
    });
  });

  const raeume = Object.keys(inventarNachRaum).sort();
  const gesamtAusgepackt = raeume.reduce((s, r) => s + inventarNachRaum[r].length, 0);

  return (
    <div className="bg-light-card-bg dark:bg-canvas-2 rounded-card border border-light-border dark:border-dark-border shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-green-500" />
          <span className="font-semibold text-sm text-light-text-main dark:text-dark-text-main">
            Raum-Inventar (ausgepackt)
          </span>
          <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
            {gesamtAusgepackt} Gegenstände in {raeume.length} Räumen
          </span>
        </div>
        {open ? <ChevronUp size={16} className="text-light-text-secondary dark:text-dark-text-secondary" /> : <ChevronDown size={16} className="text-light-text-secondary dark:text-dark-text-secondary" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {raeume.map((raum) => (
            <div key={raum}>
              <h4 className="text-xs font-semibold text-light-text-main dark:text-dark-text-main mb-1 flex items-center gap-1">
                <MapPin size={12} className="text-green-500" /> {raum}
                <span className="text-light-text-secondary dark:text-dark-text-secondary font-normal">
                  ({inventarNachRaum[raum].length} Gegenstände)
                </span>
              </h4>
              <ul className="space-y-0.5">
                {inventarNachRaum[raum].map((item) => (
                  <li key={item.id} className="text-xs text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1.5">
                    <PackageCheck size={11} className="text-green-500 flex-shrink-0" />
                    <span>{item.menge}x {item.beschreibung}</span>
                    {item.kategorie && (
                      <span className={`px-1 py-0.5 rounded-full text-xs ${getKategorieBadgeClass(item.kategorie)}`}>
                        {item.kategorie}
                      </span>
                    )}
                    <span className="opacity-50">({item.kisteName})</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const PacklisteManager = ({ session }) => {
  const { isMobile } = useViewport();
  const [userId, setUserId] = useState(null);
  const [kisten, setKisten] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showKisteModal, setShowKisteModal] = useState(false);
  const [aktuelleKiste, setAktuelleKiste] = useState(null);
  const [neueKisteName, setNeueKisteName] = useState("");
  const [neueKisteRaum, setNeueKisteRaum] = useState("");
  const [neuerGegenstandBeschreibung, setNeuerGegenstandBeschreibung] =
    useState("");
  const [neuerGegenstandMenge, setNeuerGegenstandMenge] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [vorgeschlageneKategorie, setVorgeschlageneKategorie] = useState("");
  const [manuelleKategorie, setManuelleKategorie] = useState("");
  const [showManuelleKategorieInput, setShowManuelleKategorieInput] =
    useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [currentKistePhotoUrl, setCurrentKistePhotoUrl] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const qrScannerId = "qr-scanner-container";

  const [showPhotoSectionInModal, setShowPhotoSectionInModal] = useState(false);
  const [showQrCodeSectionInModal, setShowQrCodeSectionInModal] =
    useState(false);
  const [showPhotoLightbox, setShowPhotoLightbox] = useState(false);
  const [lightboxImageUrl, setLightboxImageUrl] = useState("");
  const [showKiAssistent, setShowKiAssistent] = useState(false);
  const [viewMode, setViewMode] = useState("kacheln");
  const [aufgeklappteKisten, setAufgeklappteKisten] = useState([]);

  useEffect(() => {
    if (isMobile && viewMode !== "kacheln") {
      setViewMode("kacheln");
    }
  }, [isMobile, viewMode]);

  const toggleKisteAufklappen = (kisteId) => {
    setAufgeklappteKisten((prev) =>
      prev.includes(kisteId)
        ? prev.filter((id) => id !== kisteId)
        : [...prev, kisteId]
    );
  };

  const handleKiExtractedItems = async (items) => {
    if (!userId) {
      alert("Bitte einloggen, um Items zu speichern.");
      return;
    }
    if (!items || items.length === 0) {
      alert("Keine Items von KI extrahiert.");
      return;
    }

    console.log("Verarbeite von KI extrahierte Items:", items);
    setLoading(true);
    let kistenWurdenGeaendert = false;
    const kistenIdCache = {};

    for (const item of items) {
      try {
        if (item.aktion === "gegenstand_hinzufuegen") {
          if (!item.gegenstand || !item.kiste) {
            console.warn(
              "Ungültiges 'gegenstand_hinzufuegen' Item von KI erhalten:",
              item
            );
            continue;
          }

          let kisteIdToUse = null;
          const kisteNameNormalized = item.kiste.trim();

          if (kistenIdCache[kisteNameNormalized]) {
            kisteIdToUse = kistenIdCache[kisteNameNormalized];
          } else {
            const localExistingKiste = kisten.find(
              (k) =>
                k.name.toLowerCase() === kisteNameNormalized.toLowerCase() &&
                k.user_id === userId
            );

            if (localExistingKiste) {
              kisteIdToUse = localExistingKiste.id;
              kistenIdCache[kisteNameNormalized] = localExistingKiste.id;
            } else {
              const { data: dbKiste, error: findError } = await supabase
                .from("pack_kisten")
                .select("id")
                .eq("name", kisteNameNormalized)
                .eq("user_id", userId)
                .single();

              if (findError && findError.code !== "PGRST116") {
                console.error("DB Fehler beim Suchen der Kiste:", findError);
                throw findError;
              }

              if (dbKiste) {
                kisteIdToUse = dbKiste.id;
                kistenIdCache[kisteNameNormalized] = dbKiste.id;
              } else {
                const qrWert = `KISTE-${Date.now()}-${Math.floor(
                  Math.random() * 1000
                )}`;
                const { data: neueKisteData, error: kisteError } =
                  await supabase
                    .from("pack_kisten")
                    .insert([
                      {
                        name: kisteNameNormalized,
                        user_id: userId,
                        qr_code_wert: qrWert,
                      },
                    ])
                    .select("id")
                    .single();
                if (kisteError) {
                  console.error(
                    `Fehler beim Erstellen der Kiste "${kisteNameNormalized}":`,
                    kisteError
                  );
                  throw new Error(
                    `Fehler beim Erstellen der Kiste "${kisteNameNormalized}": ${kisteError.message}`
                  );
                }
                if (neueKisteData) {
                  kisteIdToUse = neueKisteData.id;
                  kistenIdCache[kisteNameNormalized] = neueKisteData.id;
                  kistenWurdenGeaendert = true;
                } else {
                  throw new Error(
                    `Konnte Kiste "${kisteNameNormalized}" nicht erstellen oder ID nicht erhalten.`
                  );
                }
              }
            }
          }

          if (kisteIdToUse) {
            const menge =
              item.menge && Number.isInteger(item.menge) && item.menge > 0
                ? item.menge
                : 1;
            const gegenstandDaten = {
              beschreibung: item.gegenstand.trim(),
              menge: menge,
              kiste_id: kisteIdToUse,
              user_id: userId,
              kategorie:
                item.kategorie ||
                schlageKategorieVor(item.gegenstand.trim()) ||
                "Sonstiges",
            };
            const { error: gegenstandError } = await supabase
              .from("pack_gegenstaende")
              .insert([gegenstandDaten]);
            if (gegenstandError)
              console.error(
                `Fehler beim Speichern des Gegenstands "${item.gegenstand}" in Kiste "${kisteNameNormalized}":`,
                gegenstandError
              );
            else kistenWurdenGeaendert = true;
          }
        } else if (item.aktion === "raum_zuweisen") {
          if (!item.kiste_name || !item.raum) {
            console.warn(
              "Ungültiges 'raum_zuweisen' Item von KI erhalten:",
              item
            );
            continue;
          }
          const kisteNameNormalized = item.kiste_name.trim();
          const existingKiste = kisten.find(
            (k) => k.name.toLowerCase() === kisteNameNormalized.toLowerCase()
          );

          if (existingKiste) {
            const { error: updateError } = await supabase
              .from("pack_kisten")
              .update({ raum_neu: item.raum.trim() })
              .match({ id: existingKiste.id, user_id: userId });
            if (updateError)
              console.error(
                `Fehler beim Zuweisen des Raums zur Kiste "${kisteNameNormalized}":`,
                updateError
              );
            else kistenWurdenGeaendert = true;
          } else {
            console.warn(
              `Kiste "${kisteNameNormalized}" für Raumzuweisung nicht gefunden.`
            );
          }
        } else {
          console.warn("Unbekannte Aktion von KI erhalten:", item);
        }
      } catch (loopError) {
        console.error(
          "Fehler in der Schleife beim Verarbeiten eines KI-Items:",
          loopError
        );
        alert(`Ein Fehler ist aufgetreten: ${loopError.message}`);
      }
    }

    if (kistenWurdenGeaendert) {
      await fetchKisten();
    }
    setLoading(false);
    alert("KI-Anweisungen wurden verarbeitet!");
    setShowKiAssistent(false);
  };

  const handleDownloadQrCode = () => {
    const canvas = document.getElementById("kiste-qrcode-canvas");
    if (canvas && aktuelleKiste) {
      const pngUrl = canvas
        .toDataURL("image/png")
        .replace("image/png", "image/octet-stream");
      let downloadLink = document.createElement("a");
      downloadLink.href = pngUrl;
      const fileNameSafe = (aktuelleKiste.name || "kiste")
        .replace(/[^a-z0-9_.-]/gi, "_")
        .toLowerCase();
      downloadLink.download = `QR_Kiste_${fileNameSafe || "unbenannt"}.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } else {
      alert("QR-Code Canvas nicht gefunden oder keine Kiste aktiv.");
    }
  };

  useEffect(() => {
    setUserId(session?.user?.id || null);
  }, [session]);
  const resetGegenstandForm = useCallback(() => {
    setNeuerGegenstandBeschreibung("");
    setNeuerGegenstandMenge(1);
    setVorgeschlageneKategorie("");
    setManuelleKategorie("");
    setShowManuelleKategorieInput(false);
  }, []);
  const resetFotoForm = useCallback(() => {
    setSelectedFile(null);
    setPhotoPreviewUrl(null);
    setCurrentKistePhotoUrl(null);
    setUploadingPhoto(false);
  }, []);

  const resolveKisteFotoUrl = useCallback(async (fotoPfad) => {
    if (!fotoPfad) return null;

    if (
      fotoPfad.startsWith("http://") ||
      fotoPfad.startsWith("https://")
    ) {
      return fotoPfad;
    }

    try {
      const { data: signedData, error: signedError } = await supabase.storage
        .from("kisten-fotos")
        .createSignedUrl(fotoPfad, 3600);

      if (!signedError && signedData?.signedUrl) {
        return signedData.signedUrl;
      }
    } catch (err) {
      console.warn("Signed URL für Kistenfoto konnte nicht erstellt werden:", err);
    }

    const { data: publicData } = supabase.storage
      .from("kisten-fotos")
      .getPublicUrl(fotoPfad);
    return publicData?.publicUrl || null;
  }, []);

  const handleOpenKisteModal = useCallback(
    async (kiste) => {
      setAktuelleKiste(kiste);
      setNeueKisteName(kiste.name);
      setNeueKisteRaum(kiste.raum_neu || "");
      resetGegenstandForm();
      resetFotoForm();
      setShowPhotoSectionInModal(false);
      setShowQrCodeSectionInModal(false);
      setCurrentKistePhotoUrl(await resolveKisteFotoUrl(kiste.foto_pfad));
      setShowKisteModal(true);
    },
    [resetGegenstandForm, resetFotoForm, resolveKisteFotoUrl]
  );

  const fetchKisten = useCallback(async () => {
    if (!userId) {
      setKisten([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: dbError } = await supabase
        .from("pack_kisten")
        .select(
          "*, inhalt:pack_gegenstaende(*)"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (dbError) throw dbError;
      const kistenMitFotoUrls = await Promise.all(
        (data || []).map(async (kiste) => ({
          ...kiste,
          foto_url: await resolveKisteFotoUrl(kiste.foto_pfad),
        }))
      );
      setKisten(kistenMitFotoUrls);
    } catch (err) {
      setError("Packkisten konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [userId, resolveKisteFotoUrl]);
  useEffect(() => {
    if (userId) fetchKisten();
    else {
      setKisten([]);
      setLoading(false);
    }
  }, [userId, fetchKisten]);
  const handleSearchChange = (e) => setSearchTerm(e.target.value);
  const gefilterteKisten = kisten.filter(
    (kiste) =>
      kiste.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (kiste.raum_neu &&
        kiste.raum_neu.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (kiste.inhalt &&
        kiste.inhalt.some(
          (item) =>
            item.beschreibung
              .toLowerCase()
              .includes(searchTerm.toLowerCase()) ||
            (item.kategorie &&
              item.kategorie.toLowerCase().includes(searchTerm.toLowerCase()))
        ))
  );
  const handleAddKiste = () => {
    setAktuelleKiste(null);
    setNeueKisteName("");
    setNeueKisteRaum("");
    resetGegenstandForm();
    resetFotoForm();
    setShowPhotoSectionInModal(false);
    setShowQrCodeSectionInModal(false);
    setShowKisteModal(true);
  };
  const handleSaveKiste = async () => {
    if (!userId || !neueKisteName.trim()) {
      alert(
        !userId
          ? "Bitte einloggen."
          : "Name des Packstücks darf nicht leer sein."
      );
      return;
    }
    const kistenDaten = {
      name: neueKisteName,
      raum_neu: neueKisteRaum || null,
      user_id: userId,
    };
    try {
      let dbError;
      if (aktuelleKiste && aktuelleKiste.id) {
        const { error } = await supabase
          .from("pack_kisten")
          .update({ name: neueKisteName, raum_neu: neueKisteRaum || null })
          .match({ id: aktuelleKiste.id, user_id: userId });
        dbError = error;
      } else {
        const qrWert = `KISTE-${Date.now()}-${Math.floor(
          Math.random() * 1000
        )}`;
        const { error } = await supabase
          .from("pack_kisten")
          .insert([{ ...kistenDaten, qr_code_wert: qrWert, user_id: userId }]);
        dbError = error;
      }
      if (dbError) throw dbError;
      fetchKisten();
      if (!(aktuelleKiste && aktuelleKiste.id)) {
        setShowKisteModal(false);
        resetFotoForm();
        setShowPhotoSectionInModal(false);
        setShowQrCodeSectionInModal(false);
      } else {
        const { data: updatedKiste, error: fetchError } = await supabase
          .from("pack_kisten")
          .select(
            "*, inhalt:pack_gegenstaende(*)"
          )
          .eq("id", aktuelleKiste.id)
          .single();
        if (fetchError)
          console.error("Fehler beim Neuladen der Kiste:", fetchError);
        else if (updatedKiste) setAktuelleKiste(updatedKiste);
      }
    } catch (err) {
      alert(`Fehler beim Speichern: ${err.message}`);
    }
  };
  const schlageKategorieVor = (beschreibung) => {
    if (!beschreibung || beschreibung.length < 3) {
      setVorgeschlageneKategorie("");
      return ""; // Wichtig: Leeren String zurückgeben, damit der Fallback greift
    }
    const lowerBeschreibung = beschreibung.toLowerCase();
    for (const kategorie in gegenstandKategorieKeywords) {
      if (
        gegenstandKategorieKeywords[kategorie].some((keyword) =>
          lowerBeschreibung.includes(keyword)
        )
      ) {
        setVorgeschlageneKategorie(kategorie);
        return kategorie; // Gefundene Kategorie zurückgeben
      }
    }
    setVorgeschlageneKategorie("Sonstiges"); // Für UI-Feedback
    return "Sonstiges"; // Fallback, wenn nichts gefunden wurde
  };
  const handleGegenstandBeschreibungChange = (e) => {
    const beschreibungInput = e.target.value;
    setNeuerGegenstandBeschreibung(beschreibungInput);
    schlageKategorieVor(beschreibungInput);
    if (showManuelleKategorieInput && !manuelleKategorie) {
      setShowManuelleKategorieInput(false);
    }
  };
  const handleSaveGegenstand = async () => {
    if (!neuerGegenstandBeschreibung.trim()) {
      alert("Beschreibung des Gegenstands darf nicht leer sein.");
      return;
    }
    if (!aktuelleKiste || !aktuelleKiste.id) {
      alert("Keine Kiste ausgewählt.");
      return;
    }
    if (!userId) {
      alert("Bitte einloggen.");
      return;
    }
    const finaleKategorie = showManuelleKategorieInput
      ? manuelleKategorie.trim() || "Sonstiges"
      : vorgeschlageneKategorie || "Sonstiges";
    const gegenstandDaten = {
      beschreibung: neuerGegenstandBeschreibung,
      menge: neuerGegenstandMenge,
      kiste_id: aktuelleKiste.id,
      user_id: userId,
      kategorie: finaleKategorie,
    };
    try {
      const { error } = await supabase
        .from("pack_gegenstaende")
        .insert([gegenstandDaten]);
      if (error) throw error;
      const { data: kisteMitNeuemInhalt, error: fetchKisteError } =
        await supabase
          .from("pack_kisten")
          .select(
            "*, inhalt:pack_gegenstaende(*)"
          )
          .eq("id", aktuelleKiste.id)
          .single();
      if (fetchKisteError) throw fetchKisteError;
      if (kisteMitNeuemInhalt) setAktuelleKiste(kisteMitNeuemInhalt);
      fetchKisten();
      resetGegenstandForm();
    } catch (err) {
      alert(`Fehler beim Speichern des Gegenstands: ${err.message}`);
    }
  };
  const handleToggleAusgepakt = async (gegenstandId, aktuellerWert) => {
    const neuerWert = aktuellerWert ? null : new Date().toISOString();
    try {
      await supabase
        .from("pack_gegenstaende")
        .update({ ausgepakt_am: neuerWert })
        .eq("id", gegenstandId)
        .eq("user_id", userId);
      // Lokal updaten ohne Reload
      setAktuelleKiste((prev) => ({
        ...prev,
        inhalt: prev.inhalt.map((item) =>
          item.id === gegenstandId ? { ...item, ausgepakt_am: neuerWert } : item
        ),
      }));
      setKisten((prevKisten) =>
        prevKisten.map((k) =>
          k.id === aktuelleKiste?.id
            ? {
                ...k,
                inhalt: k.inhalt.map((item) =>
                  item.id === gegenstandId
                    ? { ...item, ausgepakt_am: neuerWert }
                    : item
                ),
              }
            : k
        )
      );
    } catch (err) {
      alert(`Fehler: ${err.message}`);
    }
  };

  const handleDeleteGegenstand = async (gegenstandId) => {
    if (!window.confirm("Gegenstand löschen?")) return;
    if (!userId) return;
    try {
      const { error } = await supabase
        .from("pack_gegenstaende")
        .delete()
        .match({ id: gegenstandId, user_id: userId });
      if (error) throw error;
      const { data: kisteMitNeuemInhalt, error: fetchKisteError } =
        await supabase
          .from("pack_kisten")
          .select(
            "*, inhalt:pack_gegenstaende(*)"
          )
          .eq("id", aktuelleKiste.id)
          .single();
      if (fetchKisteError) throw fetchKisteError;
      if (kisteMitNeuemInhalt) setAktuelleKiste(kisteMitNeuemInhalt);
      fetchKisten();
    } catch (err) {
      alert(`Fehler beim Löschen des Gegenstands: ${err.message}`);
    }
  };
  const handleDeleteKiste = async (kisteId) => {
    if (!window.confirm("Packstück und Inhalt (inkl. Foto) löschen?")) return;
    if (!userId) return;
    try {
      const kisteToDelete = kisten.find((k) => k.id === kisteId);
      if (kisteToDelete?.foto_pfad) {
        await supabase.storage
          .from("kisten-fotos")
          .remove([kisteToDelete.foto_pfad]);
      }
      await supabase
        .from("pack_gegenstaende")
        .delete()
        .match({ kiste_id: kisteId, user_id: userId });
      const { error: deleteKisteError } = await supabase
        .from("pack_kisten")
        .delete()
        .match({ id: kisteId, user_id: userId });
      if (deleteKisteError) throw deleteKisteError;
      fetchKisten();
      setShowKisteModal(false);
      setAktuelleKiste(null);
      resetFotoForm();
      setShowPhotoSectionInModal(false);
      setShowQrCodeSectionInModal(false);
    } catch (err) {
      alert(`Fehler beim Löschen: ${err.message}`);
    }
  };
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPhotoPreviewUrl(URL.createObjectURL(file));
    } else {
      setSelectedFile(null);
      setPhotoPreviewUrl(null);
    }
  };
  const handlePhotoUpload = async () => {
    if (!selectedFile || !aktuelleKiste?.id || !userId) {
      alert(
        "Bitte zuerst eine Datei auswählen und sicherstellen, dass eine Kiste aktiv ist."
      );
      return;
    }
    setUploadingPhoto(true);
    const fileExt = selectedFile.name.split(".").pop();
    const fileName = `${aktuelleKiste.id}-${Date.now()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;
    try {
      if (aktuelleKiste.foto_pfad) {
        await supabase.storage
          .from("kisten-fotos")
          .remove([aktuelleKiste.foto_pfad]);
      }
      const { error: uploadError } = await supabase.storage
        .from("kisten-fotos")
        .upload(filePath, selectedFile);
      if (uploadError) {
        console.error("Supabase Storage Upload Fehler:", uploadError);
        throw uploadError;
      }
      console.log("Foto erfolgreich in Storage hochgeladen:", filePath);

      const { data: updateData, error: updateError } = await supabase
        .from("pack_kisten")
        .update({ foto_pfad: filePath })
        .eq("id", aktuelleKiste.id)
        .select(); // Wichtig: .select() hinzufügen, um das Ergebnis zu sehen

      if (updateError) {
        console.error("Supabase DB Update Fehler (foto_pfad):", updateError);
        throw updateError;
      }
      console.log("Datenbank-Update für foto_pfad erfolgreich:", updateData);

      const resolvedFotoUrl = await resolveKisteFotoUrl(filePath);
      setCurrentKistePhotoUrl(resolvedFotoUrl);
      setAktuelleKiste((prev) => ({
        ...prev,
        foto_pfad: filePath,
        foto_url: resolvedFotoUrl,
      }));
      setKisten((prevKisten) =>
        prevKisten.map((k) =>
          k.id === aktuelleKiste.id
            ? { ...k, foto_pfad: filePath, foto_url: resolvedFotoUrl }
            : k
        )
      );
      setSelectedFile(null);
      setPhotoPreviewUrl(null);
      alert("Foto erfolgreich hochgeladen!");
    } catch (error) {
      console.error("Fehler beim Foto-Upload:", error);
      alert(`Fehler beim Foto-Upload: ${error.message}`);
    } finally {
      setUploadingPhoto(false);
    }
  };
  const handleRemovePhoto = async () => {
    if (!aktuelleKiste?.foto_pfad || !aktuelleKiste?.id || !userId) return;
    if (!window.confirm("Foto wirklich entfernen?")) return;
    setUploadingPhoto(true);
    try {
      await supabase.storage
        .from("kisten-fotos")
        .remove([aktuelleKiste.foto_pfad]);
      await supabase
        .from("pack_kisten")
        .update({ foto_pfad: null })
        .eq("id", aktuelleKiste.id);
      setCurrentKistePhotoUrl(null);
      setAktuelleKiste((prev) => ({ ...prev, foto_pfad: null, foto_url: null }));
      setKisten((prevKisten) =>
        prevKisten.map((k) =>
          k.id === aktuelleKiste.id
            ? { ...k, foto_pfad: null, foto_url: null }
            : k
        )
      );
      alert("Foto entfernt.");
    } catch (error) {
      console.error("Fehler beim Entfernen des Fotos:", error);
      alert(`Fehler beim Entfernen des Fotos: ${error.message}`);
    } finally {
      setUploadingPhoto(false);
    }
  };
  useEffect(() => {
    let html5QrcodeScanner;
    if (showScanner && userId) {
      const onScanSuccess = (decodedText, decodedResult) => {
        console.log(`Code matched = ${decodedText}`, decodedResult);
        if (
          html5QrcodeScanner &&
          html5QrcodeScanner.getState &&
          html5QrcodeScanner.getState() === 2
        ) {
          html5QrcodeScanner
            .clear()
            .then(() => {
              setShowScanner(false);
              const gefundeneKiste = kisten.find(
                (k) => k.qr_code_wert === decodedText
              );
              if (gefundeneKiste) {
                handleOpenKisteModal(gefundeneKiste);
              } else {
                alert("Kiste mit diesem QR-Code nicht gefunden.");
              }
            })
            .catch((err) =>
              console.error("Fehler beim Stoppen des Scanners", err)
            );
        } else if (html5QrcodeScanner && html5QrcodeScanner.clear) {
          html5QrcodeScanner
            .clear()
            .catch((err) =>
              console.error(
                "Fehler beim Stoppen des Scanners (ohne getState)",
                err
              )
            );
          setShowScanner(false);
          const gefundeneKiste = kisten.find(
            (k) => k.qr_code_wert === decodedText
          );
          if (gefundeneKiste) {
            handleOpenKisteModal(gefundeneKiste);
          } else {
            alert("Kiste mit diesem QR-Code nicht gefunden.");
          }
        }
      };
      const onScanFailure = (error) => {
        /* console.warn(`Code scan error = ${error}`); */
      };
      try {
        html5QrcodeScanner = new Html5QrcodeScanner(
          qrScannerId,
          { fps: 10, qrbox: { width: 250, height: 250 } },
          false
        );
        html5QrcodeScanner.render(onScanSuccess, onScanFailure);
      } catch (e) {
        console.error("Fehler beim Initialisieren des Html5QrcodeScanners:", e);
        setShowScanner(false);
        alert("QR-Code-Scanner konnte nicht initialisiert werden.");
      }
    }
    return () => {
      if (
        html5QrcodeScanner &&
        typeof html5QrcodeScanner.clear === "function"
      ) {
        if (
          html5QrcodeScanner.getState &&
          html5QrcodeScanner.getState() === 2
        ) {
          html5QrcodeScanner
            .clear()
            .catch((err) =>
              console.error("Fehler beim Aufräumen des Scanners", err)
            );
        } else if (!html5QrcodeScanner.getState) {
          html5QrcodeScanner
            .clear()
            .catch((err) =>
              console.error(
                "Fehler beim Aufräumen des Scanners (ohne getState)",
                err
              )
            );
        }
      }
    };
  }, [showScanner, userId, kisten, handleOpenKisteModal]);
  if (loading)
    return (
      <div className="text-center py-8">
        <p className="text-dark-text-secondary">Lade Packliste...</p>
      </div>
    );
  if (error)
    return (
      <div className="text-center py-8 flex flex-col items-center">
        <AlertTriangle size={40} className="text-red-500 mb-2" />
        <p className="text-red-500">{error}</p>
        <button
          onClick={fetchKisten}
          className="mt-3 px-3 py-1.5 bg-dark-accent-purple text-dark-text-main rounded-card-sm text-sm"
        >
          Erneut versuchen
        </button>
      </div>
    );

  const renderKachelAnsicht = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {gefilterteKisten.map((kiste) => {
        const kisteImageUrl = kiste.foto_url || "/kisten.png";
        return (
          <div
            key={kiste.id}
            className="bg-light-card-bg dark:bg-canvas-2 rounded-card shadow-elevation-2 hover:shadow-elevation-2 transition-shadow duration-200 cursor-pointer flex flex-col self-start border border-light-border dark:border-dark-border/50 overflow-hidden"
            onClick={() => handleOpenKisteModal(kiste)}
          >
            {/* Das img-Tag wird jetzt immer gerendert, kisteImageUrl hat immer einen Wert */}
            <img
              src={kisteImageUrl}
              alt={`Foto von ${kiste.name}`}
              className="w-full h-24 object-cover"
              onError={(e) => {
                const fallbackSrc = "/kisten.png";
                if (!e.target.src.endsWith(fallbackSrc)) {
                  console.error(
                    `Fehler beim Laden des Kachel-Bildes: ${kisteImageUrl}. Fallback wird verwendet.`
                  );
                  e.target.src = fallbackSrc;
                  e.target.alt = "Standard Kistenbild";
                }
              }}
            />
            <div className="p-3 flex flex-col flex-grow justify-between">
              <div>
                {kiste.raum_neu && (
                  <span className="text-xs bg-primary-500/30 text-green-700 dark:bg-primary-600/30 dark:text-green-300 px-1.5 py-0.5 rounded-full font-semibold mb-1 inline-block">
                    {kiste.raum_neu}
                  </span>
                )}
                <h3 className="text-md font-semibold text-light-text-main dark:text-dark-text-main mb-0.5 leading-tight">
                  {kiste.name}
                </h3>
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                  {kiste.inhalt?.length || 0} Gegenstände
                </p>
                {kiste.inhalt && kiste.inhalt.length > 0 && kiste.inhalt.some((i) => i.ausgepakt_am) && (
                  <div className="mt-1.5">
                    <div className="w-full h-1.5 rounded-full bg-light-border dark:bg-dark-border overflow-hidden">
                      <div
                        className="h-1.5 rounded-full bg-green-500 transition-all"
                        style={{ width: `${Math.round((kiste.inhalt.filter((i) => i.ausgepakt_am).length / kiste.inhalt.length) * 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                      {kiste.inhalt.filter((i) => i.ausgepakt_am).length}/{kiste.inhalt.length} ausgepackt
                    </p>
                  </div>
                )}
              </div>
              <div className="mt-2 flex justify-end items-center">
                <div className="flex space-x-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAktuelleKiste(kiste);
                      setShowQrCodeSectionInModal(true);
                      setShowKisteModal(true);
                    }}
                    className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 dark:hover:text-primary-400"
                    title="QR-Code anzeigen"
                  >
                    <QrCode size={18} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenKisteModal(kiste);
                    }}
                    className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 dark:hover:text-primary-400"
                    title="Bearbeiten"
                  >
                    <Edit3 size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderListenAnsicht = () => (
    <div className="bg-light-card-bg dark:bg-canvas-2 p-4 rounded-card shadow-elevation-2 border border-light-border dark:border-dark-border">
      <div className="overflow-x-auto -mx-4 px-4">
      <table className="min-w-full text-sm text-left text-light-text-secondary dark:text-dark-text-secondary">
        <thead className="text-xs text-light-text-main dark:text-dark-text-main uppercase bg-gray-50 dark:bg-canvas-1">
          <tr>
            <th scope="col" className="px-2 py-2 w-10"></th>{" "}
            {/* Spalte für Aufklapp-Button */}
            <th scope="col" className="px-4 py-2">
              Name
            </th>
            <th scope="col" className="px-4 py-2">
              Zielraum
            </th>
            <th scope="col" className="px-4 py-2 text-center">
              Inhalt (Anzahl)
            </th>
            <th scope="col" className="px-4 py-2 text-center">
              Foto
            </th>
            <th scope="col" className="px-4 py-2 text-center">
              Aktionen
            </th>
          </tr>
        </thead>
        <tbody>
          {gefilterteKisten.map((kiste) => {
            const isAufgeklappt = aufgeklappteKisten.includes(kiste.id);
            const spezifischeKisteImageUrl = kiste.foto_url || null;

            return (
              <React.Fragment key={kiste.id}>
                <tr className="border-b border-light-border dark:border-dark-border/50 hover:bg-gray-100 dark:hover:bg-canvas-1/30">
                  <td className="px-2 py-2 text-center">
                    <button
                      onClick={() => toggleKisteAufklappen(kiste.id)}
                      className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-accent-purple dark:hover:text-dark-accent-purple"
                      title={isAufgeklappt ? "Einklappen" : "Aufklappen"}
                    >
                      {isAufgeklappt ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-2 font-medium text-light-text-main dark:text-dark-text-main whitespace-nowrap">
                    {kiste.name}
                  </td>
                  <td className="px-4 py-2">{kiste.raum_neu || "-"}</td>
                  <td className="px-4 py-2 text-center">
                    {kiste.inhalt?.length || 0}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {spezifischeKisteImageUrl ? (
                      <img
                        src={spezifischeKisteImageUrl}
                        alt={`Foto von ${kiste.name}`}
                        className="h-8 w-8 object-cover rounded-sm cursor-pointer mx-auto"
                        onClick={() => {
                          setLightboxImageUrl(spezifischeKisteImageUrl);
                          setShowPhotoLightbox(true);
                        }}
                        onError={(e) => {
                          const parent = e.target.parentNode;
                          if (parent) {
                            e.target.remove();
                            if (
                              !parent.querySelector(".box-icon-fallback-list")
                            ) {
                              console.error(
                                `Fehler beim Laden des Listen-Bildes: ${spezifischeKisteImageUrl}. Fallback wird verwendet.`
                              );
                              const boxIconContainer =
                                document.createElement("div");
                              boxIconContainer.className =
                                "box-icon-fallback-list";
                              boxIconContainer.innerHTML =
                                '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-light-text-secondary dark:text-dark-text-secondary opacity-50 mx-auto"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>';
                              parent.appendChild(boxIconContainer.firstChild);
                            }
                          }
                        }}
                      />
                    ) : (
                      <Box
                        size={18}
                        className="text-light-text-secondary dark:text-dark-text-secondary opacity-50 mx-auto box-icon-fallback-list"
                      />
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <div className="flex items-center justify-center space-x-1">
                      <button
                        onClick={() => {
                          setAktuelleKiste(kiste);
                          setShowQrCodeSectionInModal(true);
                          setShowKisteModal(true);
                        }}
                        className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 dark:hover:text-primary-400"
                        title="QR-Code anzeigen"
                      >
                        <QrCode size={16} />
                      </button>
                      <button
                        onClick={() => handleOpenKisteModal(kiste)}
                        className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 dark:hover:text-primary-400"
                        title="Bearbeiten"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteKiste(kiste.id)}
                        className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-danger-color"
                        title="Löschen"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
                {isAufgeklappt && (
                  <tr className="bg-gray-50 dark:bg-canvas-1/20 border-b border-light-border dark:border-dark-border/30">
                    <td colSpan="6" className="p-0">
                      <div className="p-3 space-y-1 bg-gray-100 dark:bg-canvas-1/30 rounded-b-card-sm shadow-inner">
                        {kiste.inhalt && kiste.inhalt.length > 0 ? (
                          <ul className="list-disc list-inside text-xs text-light-text-secondary dark:text-dark-text-secondary pl-4 space-y-0.5">
                            {kiste.inhalt.map((item) => (
                              <li key={item.id} className="flex items-center">
                                {getGegenstandIcon(item.beschreibung)}
                                <span className="ml-1.5">
                                  {item.menge}x {item.beschreibung}
                                </span>
                                {item.kategorie && (
                                  <span
                                    className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${getKategorieBadgeClass(
                                      item.kategorie
                                    )}`} // Badge-Farben bleiben vorerst
                                  >
                                    {item.kategorie}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary text-center py-2">
                            Diese Kiste ist leer.
                          </p>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      </div>
      {gefilterteKisten.length === 0 && (
        <p className="text-center text-light-text-secondary dark:text-dark-text-secondary py-4">
          Keine Packstücke entsprechen den Filterkriterien.
        </p>
      )}
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4 space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
        <h2 className="text-2xl font-bold text-light-text-main dark:text-dark-text-main">
          Intelligente Packliste
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setViewMode("kacheln")}
            className={`p-1.5 rounded-card-sm ${
              viewMode === "kacheln"
                ? "bg-primary-500 text-white dark:bg-primary-600 dark:text-dark-bg"
                : "bg-light-border text-light-text-secondary dark:bg-dark-border dark:text-dark-text-secondary hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
            title="Kachelansicht"
          >
            <LayoutGrid size={18} />
          </button>
          {!isMobile && (
            <button
              onClick={() => setViewMode("liste")}
              className={`p-1.5 rounded-card-sm ${
                viewMode === "liste"
                  ? "bg-primary-500 text-white dark:bg-primary-600 dark:text-dark-bg"
                  : "bg-light-border text-light-text-secondary dark:bg-dark-border dark:text-dark-text-secondary hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
              title="Listenansicht"
            >
              <List size={18} />
            </button>
          )}
          <button
            onClick={() => setShowScanner(true)}
            disabled={!userId}
            className="flex items-center bg-light-accent-purple text-white dark:bg-dark-accent-purple dark:text-dark-bg px-3 py-1.5 rounded-pill hover:opacity-90 transition-colors shadow-sm text-sm disabled:opacity-50"
          >
            <ScanLine size={18} className="mr-1.5" /> QR Scannen
          </button>
          <button
            onClick={handleAddKiste}
            className="flex items-center bg-primary-500 hover:bg-primary-600 text-white dark:bg-primary-600 dark:text-dark-bg px-3 py-1.5 rounded-pill transition-colors shadow-sm text-sm"
          >
            <PlusCircle size={18} className="mr-1.5" /> Neues Packstück
          </button>
          <button
            onClick={() => setShowKiAssistent(!showKiAssistent)}
            disabled={!userId}
            className="flex items-center bg-purple-500 hover:bg-purple-600 dark:bg-purple-600 dark:hover:bg-purple-700 text-white px-3 py-1.5 rounded-pill transition-colors shadow-sm text-sm disabled:opacity-50"
            title="Packliste mit KI-Assistent füllen"
          >
            <BrainCircuit size={18} className="mr-1.5" /> KI Assistent
          </button>
          {kisten.length > 0 && (
            <PDFDownloadLink
              document={<PacklistePDF kisten={kisten} />}
              fileName={`packliste_${new Date().toISOString().slice(0, 10)}.pdf`}
              className="flex items-center bg-light-border dark:bg-dark-border text-light-text-main dark:text-dark-text-main px-3 py-1.5 rounded-pill hover:opacity-80 transition-colors shadow-sm text-sm"
              title="Packliste als PDF herunterladen"
            >
              {({ loading: pdfLoading }) =>
                pdfLoading ? (
                  <span className="flex items-center"><Download size={18} className="mr-1.5" /> PDF wird erstellt...</span>
                ) : (
                  <span className="flex items-center"><Download size={18} className="mr-1.5" /> PDF Export</span>
                )
              }
            </PDFDownloadLink>
          )}
        </div>
      </div>
      {showKiAssistent && userId && (
        <KiHomeAssistent
          session={session}
          modul="packliste"
          onClose={() => setShowKiAssistent(false)}
          onErgebnis={handleKiExtractedItems}
        />
      )}
      <div className="relative mb-4">
        <input
          type="text"
          placeholder="Suchen (Name, Kiste, Raum, QR, Kategorie)..."
          value={searchTerm}
          onChange={handleSearchChange}
          className="w-full pl-9 pr-3 py-2 border border-light-border dark:border-dark-border rounded-card-sm focus:ring-2 focus:ring-secondary-500 shadow-sm text-sm text-light-text-main dark:text-dark-text-main bg-white dark:bg-dark-border placeholder-light-text-secondary dark:placeholder-dark-text-secondary"
        />
        <Search
          className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary"
          size={18}
        />
      </div>
      {showScanner && (
        <div className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm flex flex-col justify-center items-center p-4 pb-safe z-50">
          {" "}
          <div className="bg-light-card-bg dark:bg-canvas-2 p-4 rounded-card shadow-elevation-3 w-full max-w-md relative border border-light-border dark:border-dark-border">
            {" "}
            <h3 className="text-lg font-semibold text-light-text-main dark:text-dark-text-main mb-3 text-center">
              QR-Code Scanner
            </h3>{" "}
            <div
              id={qrScannerId}
              className="w-full rounded-card-sm overflow-hidden border border-dark-border"
            ></div>{" "}
            <button
              onClick={() => setShowScanner(false)}
              className="mt-4 w-full bg-danger-color text-white px-3 py-1.5 rounded-pill hover:opacity-90 text-sm"
            >
              {" "}
              Schließen{" "}
            </button>{" "}
          </div>{" "}
        </div>
      )}
      {gefilterteKisten.length === 0 && !loading && (
        <p className="text-center text-dark-text-secondary py-6 text-sm">
          Keine Packstücke. Erstelle dein erstes!
        </p>
      )}

      {gefilterteKisten.length > 0 && !loading && (
        <>
          {viewMode === "kacheln" && renderKachelAnsicht()}
          {viewMode === "liste" && renderListenAnsicht()}
        </>
      )}

      {showKisteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex justify-center items-start py-4 px-3 pb-safe z-50 overflow-y-auto">
          <div className="bg-light-card-bg dark:bg-canvas-2 p-4 rounded-card shadow-elevation-3 w-full max-w-lg relative my-auto border border-light-border dark:border-dark-border">
            <button
              onClick={() => {
                setShowKisteModal(false);
                setAktuelleKiste(null);
                resetGegenstandForm();
                resetFotoForm();
                setShowPhotoSectionInModal(false);
                setShowQrCodeSectionInModal(false);
              }}
              className="absolute top-2.5 right-2.5 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-main dark:hover:text-dark-text-main"
            >
              <XCircle size={20} />
            </button>
            <h3 className="text-lg font-semibold text-light-text-main dark:text-dark-text-main mb-3">
              {aktuelleKiste?.id
                ? `Packstück: ${neueKisteName || aktuelleKiste.name}`
                : "Neues Packstück"}
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveKiste();
              }}
              className="space-y-3 mb-4 pb-3 border-b border-light-border dark:border-dark-border/50"
            >
              <div>
                <label
                  htmlFor="kisteNameModal"
                  className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                >
                  Name
                </label>
                <input
                  type="text"
                  id="kisteNameModal"
                  value={neueKisteName}
                  onChange={(e) => setNeueKisteName(e.target.value)}
                  required
                  className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:ring-2 focus:ring-secondary-500 focus:border-primary-500 dark:focus:border-primary-500"
                />
              </div>
              <div>
                <label
                  htmlFor="kisteRaumModal"
                  className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                >
                  Zielraum
                </label>
                <input
                  type="text"
                  id="kisteRaumModal"
                  value={neueKisteRaum}
                  onChange={(e) => setNeueKisteRaum(e.target.value)}
                  placeholder="z.B. Wohnzimmer"
                  list="raumVorschlaegeDatalist"
                  className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-sm bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:ring-2 focus:ring-secondary-500 focus:border-primary-500 dark:focus:border-primary-500"
                />
                <datalist id="raumVorschlaegeDatalist">
                  {raumVorschlaege.map((raum) => (
                    <option key={raum} value={raum} />
                  ))}
                </datalist>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs text-white dark:text-dark-bg bg-primary-500 hover:bg-primary-600 dark:bg-primary-600 rounded-pill"
                >
                  {aktuelleKiste?.id ? "Details speichern" : "Erstellen"}
                </button>
              </div>
            </form>

            {aktuelleKiste?.id && (
              <div className="space-y-3">
                <div className="py-2 border-b border-light-border dark:border-dark-border/50">
                  <button
                    onClick={() =>
                      setShowPhotoSectionInModal(!showPhotoSectionInModal)
                    }
                    className="flex justify-between items-center w-full text-sm text-light-accent-blue dark:text-gray-300 hover:underline"
                  >
                    <span>
                      {showPhotoSectionInModal
                        ? "Foto verbergen"
                        : "Foto anzeigen/verwalten"}
                    </span>
                    {showPhotoSectionInModal ? (
                      <ChevronUp size={18} />
                    ) : (
                      <ChevronDown size={18} />
                    )}
                  </button>
                  {showPhotoSectionInModal && (
                    <div className="mt-2">
                      <h4 className="text-md font-semibold text-light-text-main dark:text-dark-text-main mb-2">
                        Foto der Kiste
                      </h4>
                      {(photoPreviewUrl || currentKistePhotoUrl) && (
                        <div className="mb-2">
                          <div
                            className="cursor-pointer"
                            title="Foto vergrößern"
                            onClick={() => {
                              setLightboxImageUrl(
                                photoPreviewUrl || currentKistePhotoUrl
                              );
                              setShowPhotoLightbox(true);
                            }}
                          >
                            <img
                              src={photoPreviewUrl || currentKistePhotoUrl}
                              alt="Kistenvorschau"
                              className="max-h-40 w-auto rounded-card-sm border border-light-border dark:border-dark-border hover:opacity-80 transition-opacity"
                            />
                          </div>
                        </div>
                      )}
                      <input
                        type="file"
                        id="kistenFotoUpload"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="block w-full text-xs text-light-text-secondary dark:text-dark-text-secondary file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-light-accent-purple file:text-white dark:file:bg-dark-accent-purple dark:file:text-white hover:file:bg-purple-700 mb-2"
                      />
                      {selectedFile && (
                        <button
                          onClick={handlePhotoUpload}
                          disabled={uploadingPhoto}
                          className="flex items-center text-xs bg-primary-500 hover:bg-primary-600 text-white dark:bg-primary-600 dark:text-dark-bg px-2.5 py-1 rounded-pill disabled:opacity-50"
                        >
                          {" "}
                          {uploadingPhoto ? (
                            <UploadCloud
                              size={14}
                              className="mr-1 animate-pulse"
                            />
                          ) : (
                            <UploadCloud size={14} className="mr-1" />
                          )}{" "}
                          {uploadingPhoto
                            ? "Lädt hoch..."
                            : "Foto hochladen/ersetzen"}{" "}
                        </button>
                      )}
                      {currentKistePhotoUrl && !selectedFile && (
                        <button
                          onClick={handleRemovePhoto}
                          disabled={uploadingPhoto}
                          className="flex items-center text-xs bg-danger-color text-white px-2.5 py-1 rounded-pill hover:opacity-90 disabled:opacity-50 ml-2"
                        >
                          {" "}
                          <Trash2 size={14} className="mr-1" /> Foto entfernen{" "}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {aktuelleKiste.qr_code_wert && (
                  <div className="py-2 border-b border-light-border dark:border-dark-border/50">
                    <button
                      onClick={() =>
                        setShowQrCodeSectionInModal(!showQrCodeSectionInModal)
                      }
                      className="flex justify-between items-center w-full text-sm text-light-accent-blue dark:text-gray-300 hover:underline"
                    >
                      <span>
                        {showQrCodeSectionInModal
                          ? "QR-Code verbergen"
                          : "QR-Code anzeigen"}
                      </span>
                      {showQrCodeSectionInModal ? (
                        <ChevronUp size={18} />
                      ) : (
                        <ChevronDown size={18} />
                      )}
                    </button>
                    {showQrCodeSectionInModal && (
                      <div className="mt-2 text-center">
                        <h4 className="text-md font-semibold text-light-text-main dark:text-dark-text-main mb-2">
                          QR-Code für diese Kiste
                        </h4>
                        <div
                          className="flex justify-center p-2 bg-white rounded-card-sm inline-block"
                          title=""
                        >
                          <QRCodeCanvas
                            id="kiste-qrcode-canvas"
                            value={aktuelleKiste.qr_code_wert}
                            size={128}
                            bgColor={"#ffffff"}
                            fgColor={"#1F2937"} // Dunkle Farbe für QR Code, gut auf weiß
                            level={"H"}
                          />
                        </div>
                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1 break-all">
                          {" "}
                          Wert: {aktuelleKiste.qr_code_wert}{" "}
                        </p>
                        <button
                          onClick={handleDownloadQrCode}
                          className="mt-2 flex items-center justify-center text-xs bg-light-accent-blue dark:bg-dark-accent-blue text-white px-2.5 py-1 rounded-pill hover:opacity-90 w-full sm:w-auto mx-auto"
                        >
                          <Download size={14} className="mr-1.5" />{" "}
                          Herunterladen
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {aktuelleKiste?.id && (
              <div>
                {" "}
                <h4 className="text-md font-semibold text-light-text-main dark:text-dark-text-main mt-2 mb-2">
                  Inhalt verwalten
                </h4>{" "}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSaveGegenstand();
                  }}
                  className="space-y-3 mb-3"
                >
                  {" "}
                  <div className="flex items-end gap-1.5">
                    {" "}
                    <div className="flex-grow">
                      <label
                        htmlFor="gegenstandBeschreibung"
                        className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                      >
                        Neuer Gegenstand
                      </label>
                      <input
                        type="text"
                        id="gegenstandBeschreibung"
                        value={neuerGegenstandBeschreibung}
                        onChange={handleGegenstandBeschreibungChange}
                        placeholder="Beschreibung"
                        required
                        className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-xs bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:ring-2 focus:ring-secondary-500 focus:border-primary-500 dark:focus:border-primary-500"
                      />
                    </div>{" "}
                    <div>
                      <label
                        htmlFor="gegenstandMenge"
                        className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                      >
                        Menge
                      </label>
                      <input
                        type="number"
                        id="gegenstandMenge"
                        value={neuerGegenstandMenge}
                        min="1"
                        onChange={(e) =>
                          setNeuerGegenstandMenge(
                            parseInt(e.target.value, 10) || 1
                          )
                        }
                        className="w-16 px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-xs bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main focus:ring-2 focus:ring-secondary-500 focus:border-primary-500 dark:focus:border-primary-500"
                      />
                    </div>{" "}
                    <button
                      type="submit"
                      title="Hinzufügen"
                      className="p-2 text-white dark:text-dark-bg bg-primary-500 hover:bg-primary-600 dark:bg-primary-600 rounded-pill self-end"
                    >
                      <PackagePlus size={18} />
                    </button>{" "}
                  </div>{" "}
                  {!showManuelleKategorieInput && vorgeschlageneKategorie && (
                    <div
                      className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1 p-1.5 bg-light-border dark:bg-dark-border rounded-card-sm flex justify-between items-center"
                      title={`Automatisch als ${vorgeschlageneKategorie} erkannt`}
                    >
                      {" "}
                      <span>
                        Vorschlag:{" "}
                        <span className="font-semibold text-primary-500">
                          {vorgeschlageneKategorie}
                        </span>
                      </span>{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setShowManuelleKategorieInput(true);
                          setManuelleKategorie(vorgeschlageneKategorie);
                        }}
                        className="ml-2 text-xs text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300"
                      >
                        Ändern
                      </button>{" "}
                    </div>
                  )}{" "}
                  {showManuelleKategorieInput && (
                    <div>
                      <label
                        htmlFor="manuelleKategorie"
                        className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-0.5"
                      >
                        Kategorie manuell
                      </label>
                      <input
                        type="text"
                        id="manuelleKategorie"
                        value={manuelleKategorie}
                        onChange={(e) => setManuelleKategorie(e.target.value)}
                        list="kategorieVorschlaege"
                        placeholder="Eigene Kategorie oder Auswahl"
                        className="w-full px-2.5 py-1.5 border-light-border dark:border-dark-border rounded-card-sm text-xs bg-white dark:bg-dark-border text-light-text-main dark:text-dark-text-main placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:ring-2 focus:ring-secondary-500 focus:border-primary-500 dark:focus:border-primary-500"
                      />{" "}
                      <datalist id="kategorieVorschlaege">
                        {standardKategorien.map((kat) => (
                          <option key={kat} value={kat} />
                        ))}
                      </datalist>{" "}
                    </div>
                  )}{" "}
                </form>{" "}
                {(!aktuelleKiste.inhalt ||
                  aktuelleKiste.inhalt.length === 0) && (
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary my-2">
                    Keine Gegenstände in diesem Packstück.
                  </p>
                )}{" "}
                {aktuelleKiste.inhalt && aktuelleKiste.inhalt.length > 0 && (
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                      {aktuelleKiste.inhalt.filter((i) => i.ausgepakt_am).length} / {aktuelleKiste.inhalt.length} ausgepackt
                    </span>
                  </div>
                )}
                <ul className="space-y-1 max-h-48 overflow-y-auto">
                  {aktuelleKiste.inhalt?.map((item) => (
                    <li
                      key={item.id}
                      className={`text-xs p-1.5 rounded-card-sm flex justify-between items-center group hover:bg-gray-100 dark:hover:bg-dark-border/50 ${
                        item.ausgepakt_am
                          ? "bg-green-50 dark:bg-green-900/20 text-light-text-secondary dark:text-dark-text-secondary"
                          : "bg-gray-50 dark:bg-canvas-1/50 text-light-text-secondary dark:text-dark-text-secondary"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <button
                          onClick={() => handleToggleAusgepakt(item.id, item.ausgepakt_am)}
                          className={`flex-shrink-0 ${item.ausgepakt_am ? "text-green-500" : "text-light-text-secondary dark:text-dark-text-secondary hover:text-green-500"}`}
                          title={item.ausgepakt_am ? "Als verpackt markieren" : "Als ausgepackt markieren"}
                        >
                          <PackageCheck size={14} />
                        </button>
                        {getGegenstandIcon(item.beschreibung)}
                        <span className={item.ausgepakt_am ? "line-through opacity-60" : ""}>
                          {item.menge}x {item.beschreibung}{" "}
                          {item.kategorie && (
                            <span
                              className={`ml-1 text-xs px-1 py-0.5 rounded-full ${getKategorieBadgeClass(
                                item.kategorie
                              )}`}
                            >
                              {item.kategorie}
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 flex-shrink-0">
                        <button
                          onClick={() => handleDeleteGegenstand(item.id)}
                          className="p-0.5 text-light-text-secondary dark:text-dark-text-secondary hover:text-danger-color"
                          title="Löschen"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-between items-center pt-4 mt-3 border-t border-light-border dark:border-dark-border/50">
              <div>
                {aktuelleKiste?.id && (
                  <button
                    type="button"
                    onClick={() => handleDeleteKiste(aktuelleKiste.id)}
                    className="px-3 py-1.5 text-xs text-white bg-danger-color hover:opacity-90 rounded-pill flex items-center"
                  >
                    <Trash2 size={14} className="mr-1" /> Packstück löschen
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowKisteModal(false);
                  setAktuelleKiste(null);
                  resetGegenstandForm();
                  resetFotoForm();
                  setShowPhotoSectionInModal(false);
                  setShowQrCodeSectionInModal(false);
                }}
                className="px-3 py-1.5 text-xs text-light-text-secondary dark:text-dark-text-secondary bg-light-border dark:bg-dark-border hover:bg-gray-200 dark:hover:bg-gray-700 rounded-card-sm"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Raum-Inventar: Ausgepackte Gegenstände nach Raum */}
      {kisten.some((k) => k.inhalt?.some((i) => i.ausgepakt_am)) && (
        <RaumInventar kisten={kisten} />
      )}

      {/* Foto Lightbox Modal */}
      {showPhotoLightbox && lightboxImageUrl && (
        <div
          className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-md flex justify-center items-center p-4 pb-safe z-[60]"
          onClick={() => setShowPhotoLightbox(false)}
        >
          <div
            className="relative max-w-full max-h-full"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxImageUrl}
              alt="Vergrößerte Kistenansicht"
              className="block max-w-full max-h-[90vh] object-contain rounded-card-sm"
            />
            <button
              onClick={() => setShowPhotoLightbox(false)}
              className="absolute -top-2 -right-2 bg-light-card-bg dark:bg-canvas-2 text-light-text-main dark:text-dark-text-main rounded-full p-1 shadow-elevation-2 hover:bg-danger-color hover:text-white"
              title="Schließen"
            >
              <XCircle size={28} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PacklisteManager;
