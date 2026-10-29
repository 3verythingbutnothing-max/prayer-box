import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { ActionFeedbackProvider } from "./action-feedback";
import "./styles.css";
import "./card-surfaces.css";
import "./control-feedback.css";
import "./mobile-shell.css";
import "./founder-refinements.css";
import "./button-palette.css";

// Vite replaces MODE at build time, so the backend bundle excludes the fictional demo.
const App = import.meta.env.MODE === "backend"
  ? lazy(() => import("./BackendApp"))
  : lazy(() => import("./App"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionFeedbackProvider>
      <Suspense fallback={<p className="backend-boot" role="status">Opening Prayer Box…</p>}>
        <App />
      </Suspense>
    </ActionFeedbackProvider>
  </StrictMode>,
);
