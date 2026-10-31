import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geologica/full.css";
import "./index.css";
import { App } from "./App";
import { startBackground } from "./lib/store";

startBackground();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
