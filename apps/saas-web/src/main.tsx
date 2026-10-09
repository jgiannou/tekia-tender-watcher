import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { App } from "@/App";
import { installSensitiveUrlScrubber } from "@/lib/safe-page-path";
import "./index.css";

installSensitiveUrlScrubber();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <TooltipProvider>
        <App />
        <Toaster richColors position="top-center" />
      </TooltipProvider>
    </BrowserRouter>
  </StrictMode>,
);
