export type FeedbackTone = "success" | "pending" | "error" | "info";
export type FeedbackPreferences = { sound: boolean; vibration: boolean };
export type CueResult = {
  audio: "scheduled" | "muted" | "unavailable" | "blocked" | "cancelled";
  vibration: "requested" | "muted" | "unavailable";
};

export const cueNotes: Record<FeedbackTone, readonly number[]> = {
  success: [523.25, 659.25],
  pending: [440],
  error: [349.23],
  info: [523.25],
};

type CueEnvironment = {
  preferences: () => FeedbackPreferences;
  visible: () => boolean;
  reducedMotion: () => boolean;
  createContext: () => AudioContext | undefined;
  vibrate: (duration: number) => boolean | undefined;
};

/** Local synthesized notes only: no files, microphones, requests or timers. */
export function createCuePlayer(environment: CueEnvironment) {
  let context: AudioContext | undefined;
  let generation = 0;
  let disposed = false;
  let vibrationRequested = false;
  const voices = new Set<{ oscillator: OscillatorNode; gain: GainNode }>();

  function silenceVoices() {
    for (const voice of voices) {
      try {
        voice.gain.gain.cancelScheduledValues(0);
        voice.gain.gain.setValueAtTime(0, context?.currentTime ?? 0);
        voice.oscillator.stop();
      } catch {
        /* A finished voice needs no further stop. */
      }
      voice.oscillator.disconnect();
      voice.gain.disconnect();
    }
    voices.clear();
  }

  function getContext() {
    if (disposed) return undefined;
    try {
      if (!context || context.state === "closed")
        context = environment.createContext();
      return context;
    } catch {
      return undefined;
    }
  }

  function prepare() {
    if (disposed || !environment.visible() || !environment.preferences().sound)
      return;
    const audio = getContext();
    // Invoke resume synchronously within the submitting gesture, before async work.
    try {
      if (audio && audio.state !== "running")
        void audio.resume().catch(() => {});
    } catch {
      /* Optional audio must never prevent the submitting action. */
    }
  }

  function stop() {
    generation += 1;
    silenceVoices();
    if (vibrationRequested) {
      try {
        environment.vibrate(0);
      } catch {
        /* Optional device API. */
      }
      vibrationRequested = false;
    }
  }

  async function play(tone: FeedbackTone): Promise<CueResult> {
    const ticket = ++generation;
    silenceVoices();
    const result: CueResult = { audio: "muted", vibration: "muted" };
    if (disposed || !environment.visible()) return result;
    const preferences = environment.preferences();
    if (preferences.vibration && !environment.reducedMotion()) {
      try {
        const accepted = environment.vibrate(tone === "success" ? 16 : 9);
        result.vibration = accepted ? "requested" : "unavailable";
        vibrationRequested = !!accepted;
      } catch {
        result.vibration = "unavailable";
      }
    }
    if (!preferences.sound) return result;
    const audio = getContext();
    if (!audio) return { ...result, audio: "unavailable" };
    try {
      if (audio.state !== "running") await audio.resume();
      if (ticket !== generation || disposed)
        return { ...result, audio: "cancelled" };
      if (!environment.preferences().sound || !environment.visible())
        return result;
      if (audio.state !== "running") return { ...result, audio: "blocked" };
      const startedAt = audio.currentTime + 0.003;
      cueNotes[tone].forEach((frequency, index) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const start = startedAt + index * 0.085;
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(
          tone === "success" ? 0.04 : 0.025,
          start + 0.009,
        );
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
        oscillator.connect(gain);
        gain.connect(audio.destination);
        const voice = { oscillator, gain };
        voices.add(voice);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
          voices.delete(voice);
        };
        oscillator.start(start);
        oscillator.stop(start + 0.19);
      });
      return { ...result, audio: "scheduled" };
    } catch {
      silenceVoices();
      return { ...result, audio: "blocked" };
    }
  }

  function dispose() {
    stop();
    disposed = true;
    if (context && context.state !== "closed")
      void context.close().catch(() => {});
    context = undefined;
  }

  return { prepare, play, stop, dispose };
}
