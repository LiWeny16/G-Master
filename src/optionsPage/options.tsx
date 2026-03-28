import React from "react";
import ReactDOM from "react-dom/client";
import "../i18n"; // Force i18n initialization
import OptionsApp from "./OptionsApp";

ReactDOM.createRoot(document.getElementById('options-root')!).render(
  <React.StrictMode>
    <OptionsApp />
  </React.StrictMode>,
)
