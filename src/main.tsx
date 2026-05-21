import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./styles/fintech.css";
import App from "./App.tsx";
import { ClientEnvError } from "./components/ClientEnvError";
import { validateClientEnv } from "./lib/env";
import { initSentry } from "./lib/sentry";

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

const envCheck = validateClientEnv();
initSentry();

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("TipGuard: #root element missing in index.html");
}

const root = createRoot(rootEl);

if (!envCheck.ok) {
  root.render(<ClientEnvError message={envCheck.message} missing={envCheck.missing} />);
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
