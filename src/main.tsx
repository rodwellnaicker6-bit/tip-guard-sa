import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./styles/fintech.css";
import App from "./App.tsx";
import { validateClientEnv } from "./lib/env";

if (typeof localStorage !== "undefined" && localStorage.getItem("tipguard_theme") === "hc") {
  document.documentElement.dataset.theme = "hc";
}

if (typeof localStorage !== "undefined") {
  if (localStorage.getItem("tipguard_dark") === "0") {
    document.documentElement.classList.remove("dark");
  } else {
    document.documentElement.classList.add("dark");
  }
}

validateClientEnv();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
