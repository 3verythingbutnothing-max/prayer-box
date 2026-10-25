import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ActionFeedbackProvider } from "./action-feedback";
import "./styles.css";
import "./card-surfaces.css";
import "./control-feedback.css";
import "./mobile-shell.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActionFeedbackProvider>
      <App />
    </ActionFeedbackProvider>
  </StrictMode>,
);
