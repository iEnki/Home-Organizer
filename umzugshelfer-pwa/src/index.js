import { Buffer } from "buffer";
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import i18n from "./i18n";
import { installUiAutoTranslation } from "./i18n/uiAutoTranslate";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import { BrowserRouter } from "react-router-dom";
import { registerServiceWorker } from "./serviceWorkerRegistration";
import { LocaleProvider } from "./contexts/LocaleContext";

// Make Buffer available globally for libraries that might expect it (e.g., for PDF generation)
window.Buffer = Buffer;
installUiAutoTranslation(i18n);

// Keep the PWA viewport stable on mobile: no pinch zoom, no double-tap zoom,
// while preserving normal vertical scrolling inside pages and modals.
if (typeof window !== "undefined" && typeof document !== "undefined") {
  let lastTouchEnd = 0;
  document.addEventListener("gesturestart", (event) => event.preventDefault(), { passive: false });
  document.addEventListener("gesturechange", (event) => event.preventDefault(), { passive: false });
  document.addEventListener("touchmove", (event) => {
    if (event.touches && event.touches.length > 1) event.preventDefault();
  }, { passive: false });
  document.addEventListener("touchend", (event) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) event.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <LocaleProvider>
        <App />
      </LocaleProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// Service Worker für Push-Benachrichtigungen registrieren
registerServiceWorker();

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
