import test from "node:test";
import assert from "node:assert/strict";
import { createCuePlayer } from "./feedback-cues.ts";

function fixture() {
  let preferences = { sound: true, vibration: true };
  let visible = true;
  let reduced = false;
  let state = "running";
  let created = 0;
  let resumes = 0;
  let closes = 0;
  let resume: () => Promise<void> = async () => {
    state = "running";
  };
  const pulses: number[] = [];
  const notes: {
    frequency: number;
    connected: boolean;
    gainConnected: boolean;
    starts: number[];
    stops: number[];
    values: number[];
    finish: () => void;
  }[] = [];
  const context = {
    get state() {
      return state;
    },
    currentTime: 2,
    destination: {},
    resume: () => {
      resumes++;
      return resume();
    },
    close: async () => {
      closes++;
      state = "closed";
    },
    createOscillator: () => {
      const note = {
        frequency: 0,
        connected: false,
        gainConnected: false,
        starts: [] as number[],
        stops: [] as number[],
        values: [] as number[],
        finish: () => {},
      };
      const oscillator = {
        type: "",
        frequency: {
          setValueAtTime(value: number) {
            note.frequency = value;
          },
        },
        connect() {
          note.connected = true;
        },
        disconnect() {
          note.connected = false;
        },
        start(at: number) {
          note.starts.push(at);
        },
        stop(at?: number) {
          note.stops.push(at ?? 2);
        },
        onended: null as (() => void) | null,
      };
      note.finish = () => oscillator.onended?.();
      notes.push(note);
      return oscillator;
    },
    createGain: () => {
      const note = notes.at(-1)!;
      return {
        gain: {
          setValueAtTime(value: number) {
            note.values.push(value);
          },
          exponentialRampToValueAtTime(value: number) {
            note.values.push(value);
          },
          cancelScheduledValues() {},
        },
        connect() {
          note.gainConnected = true;
        },
        disconnect() {
          note.gainConnected = false;
        },
      };
    },
  };
  const environment = {
    preferences: () => preferences,
    visible: () => visible,
    reducedMotion: () => reduced,
    createContext: () => {
      created++;
      return context as unknown as AudioContext;
    },
    vibrate: (duration: number) => {
      pulses.push(duration);
      return true;
    },
  };
  const player = createCuePlayer(environment);
  return {
    player,
    environment,
    notes,
    pulses,
    setPreferences: (value: typeof preferences) => {
      preferences = value;
    },
    setVisible: (value: boolean) => {
      visible = value;
    },
    setReduced: (value: boolean) => {
      reduced = value;
    },
    setResume: (value: typeof resume) => {
      state = "suspended";
      resume = value;
    },
    markRunning: () => {
      state = "running";
    },
    counts: () => ({ created, resumes, closes }),
  };
}

test("page setup is silent; gesture preparation only unlocks audio", async () => {
  const f = fixture();
  assert.deepEqual(f.counts(), { created: 0, resumes: 0, closes: 0 });
  f.setResume(async () => {
    f.markRunning();
  });
  f.player.prepare();
  await Promise.resolve();
  assert.equal(f.counts().created, 1);
  assert.equal(f.counts().resumes, 1);
  assert.equal(f.notes.length, 0);
  assert.deepEqual(f.pulses, []);
  f.player.dispose();
});

test("success schedules a short quiet ascending cue and cleans completed nodes", async () => {
  const f = fixture();
  const result = await f.player.play("success");
  assert.deepEqual(result, { audio: "scheduled", vibration: "requested" });
  assert.equal(f.notes.length, 2);
  assert.ok(f.notes[1].frequency > f.notes[0].frequency);
  assert.ok(f.notes.every((note) => note.stops[0] - note.starts[0] < 0.3));
  assert.ok(f.notes.every((note) => Math.max(...note.values) <= 0.05));
  assert.ok(f.pulses.every((duration) => duration > 0 && duration <= 20));
  f.notes.forEach((note) => note.finish());
  assert.ok(f.notes.every((note) => !note.connected && !note.gainConnected));
});

test("muted preferences leave visual callers free without allocating audio or vibrating", async () => {
  const f = fixture();
  f.setPreferences({ sound: false, vibration: false });
  f.player.prepare();
  assert.deepEqual(await f.player.play("success"), {
    audio: "muted",
    vibration: "muted",
  });
  assert.equal(f.counts().created, 0);
  assert.deepEqual(f.pulses, []);
});

test("unavailable or rejecting device APIs never reject an outcome", async () => {
  const f = fixture();
  const unavailable = createCuePlayer({
    ...f.environment,
    createContext: () => undefined,
    vibrate: () => undefined,
  });
  assert.deepEqual(await unavailable.play("pending"), {
    audio: "unavailable",
    vibration: "unavailable",
  });
  const rejecting = createCuePlayer({
    ...f.environment,
    createContext: () => {
      throw new Error("Device unavailable");
    },
    vibrate: () => {
      throw new Error("No vibration");
    },
  });
  assert.deepEqual(await rejecting.play("error"), {
    audio: "unavailable",
    vibration: "unavailable",
  });
  f.setResume(async () => {
    throw new Error("Browser policy denied resume");
  });
  f.player.prepare();
  assert.equal((await f.player.play("pending")).audio, "blocked");
  assert.equal(f.notes.length, 0);
});

test("muting during a delayed resume cancels the obsolete cue", async () => {
  const f = fixture();
  let resolve!: () => void;
  f.setResume(
    () =>
      new Promise<void>((done) => {
        resolve = () => {
          f.markRunning();
          done();
        };
      }),
  );
  const result = f.player.play("success");
  f.setPreferences({ sound: false, vibration: false });
  f.player.stop();
  resolve();
  assert.equal((await result).audio, "cancelled");
  assert.equal(f.notes.length, 0);
  assert.equal(f.pulses.at(-1), 0);
});

test("a newer outcome replaces delayed audio instead of replaying stale success", async () => {
  const f = fixture();
  const resolvers: (() => void)[] = [];
  f.setResume(
    () =>
      new Promise<void>((done) => {
        resolvers.push(() => {
          f.markRunning();
          done();
        });
      }),
  );
  const first = f.player.play("success");
  const second = f.player.play("pending");
  resolvers.forEach((resolve) => resolve());
  assert.equal((await first).audio, "cancelled");
  assert.equal((await second).audio, "scheduled");
  assert.equal(f.notes.length, 1);
});

test("rapid outcomes do not stack voices and disposal releases the context", async () => {
  const f = fixture();
  for (let i = 0; i < 30; i++) {
    await f.player.play(i % 2 ? "success" : "pending");
    assert.ok(f.notes.filter((note) => note.connected).length <= 2);
  }
  f.player.dispose();
  assert.ok(f.notes.every((note) => !note.connected && !note.gainConnected));
  assert.equal(f.counts().closes, 1);
  const count = f.notes.length;
  f.player.prepare();
  await f.player.play("success");
  assert.equal(f.notes.length, count);
});

test("hidden pages stay quiet and reduced motion suppresses vibration", async () => {
  const f = fixture();
  f.setVisible(false);
  f.player.prepare();
  assert.deepEqual(await f.player.play("success"), {
    audio: "muted",
    vibration: "muted",
  });
  assert.equal(f.counts().created, 0);
  f.setVisible(true);
  f.setReduced(true);
  assert.deepEqual(await f.player.play("success"), {
    audio: "scheduled",
    vibration: "muted",
  });
  assert.deepEqual(f.pulses, []);
});
