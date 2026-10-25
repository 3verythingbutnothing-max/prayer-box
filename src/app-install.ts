import { useEffect, useRef, useState } from "react";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Captures the optional browser event early; only a user click opens a prompt. */
export function useAppInstall() {
  const promptRef = useRef<InstallPrompt | null>(null);
  const mounted = useRef(false);
  const [available, setAvailable] = useState(false);
  const [installed, setInstalled] = useState(isStandalone);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    mounted.current = true;
    const display = window.matchMedia("(display-mode: standalone)");
    const syncDisplay = () => setInstalled(isStandalone());
    const receivePrompt = (event: Event) => {
      const candidate = event as InstallPrompt;
      if (typeof candidate.prompt !== "function" || !candidate.userChoice)
        return;
      event.preventDefault();
      promptRef.current = candidate;
      setAvailable(true);
      setMessage("");
    };
    const installedApp = () => {
      promptRef.current = null;
      setAvailable(false);
      setInstalled(true);
      setMessage(
        "Prayer Box was added. Look for the little box on your home screen.",
      );
    };
    window.addEventListener("beforeinstallprompt", receivePrompt);
    window.addEventListener("appinstalled", installedApp);
    display.addEventListener("change", syncDisplay);
    return () => {
      mounted.current = false;
      window.removeEventListener("beforeinstallprompt", receivePrompt);
      window.removeEventListener("appinstalled", installedApp);
      display.removeEventListener("change", syncDisplay);
    };
  }, []);

  async function install() {
    const prompt = promptRef.current;
    if (!prompt || pending) return;
    promptRef.current = null;
    setPending(true);
    setAvailable(false);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (mounted.current)
        setMessage(
          choice.outcome === "accepted"
            ? "Follow your browser’s steps to finish adding Prayer Box."
            : "No rush. You can keep using Prayer Box here, or follow the steps below later.",
        );
    } catch {
      if (mounted.current)
        setMessage(
          "Your browser couldn’t open the install prompt. Try its menu using the steps below.",
        );
    } finally {
      if (mounted.current) setPending(false);
    }
  }

  return { available, installed, pending, message, install };
}

export type AppInstall = ReturnType<typeof useAppInstall>;
