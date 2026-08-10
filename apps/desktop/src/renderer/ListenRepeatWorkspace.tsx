import {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  ArrowLeft,
  AudioLines,
  Check,
  CircleAlert,
  CircleStop,
  Clock3,
  Headphones,
  LoaderCircle,
  LockKeyhole,
  Mic2,
  Play,
  Route,
  ShieldCheck,
  Sparkles,
  Trash2,
  Waves
} from "lucide-react";
import type {
  ListenRepeatAudioResult,
  ListenRepeatChunk,
  ListenRepeatDesktopApi,
  ListenRepeatMode,
  ListenRepeatShortChunkLength,
  ListenRepeatSnapshot
} from "../shared/listen-repeat-contracts";
import {
  countListenRepeatGraphemes,
  validateListenRepeatMaterial
} from "../shared/listen-repeat-contracts";
import {
  advanceVoiceActivity,
  continuousPreparationWindow,
  createVoiceActivityState,
  findResumeChunkId,
  flattenListenRepeatPractice,
  hasRecordingAtOrAfter,
  recordingCompletion
} from "./listen-repeat-flow";

interface Props {
  api: ListenRepeatDesktopApi;
  active: boolean;
  onOpenAiVoice(): void;
}

type ContinuousPhase =
  | "Preparing"
  | "AI playback"
  | "Countdown"
  | "Recording"
  | "Saving";

interface ContinuousState {
  chunkId: string;
  phase: ContinuousPhase;
  countdown: number | null;
  level: number;
  elapsedMs: number;
  index: number;
  total: number;
}

interface RecordingSession {
  stop(save: boolean): void;
}

function emptySnapshot(): ListenRepeatSnapshot {
  return {
    practice: null,
    progress: {
      shortCompleted: 0,
      shortTotal: 0,
      longCompleted: 0,
      longTotal: 0,
      complete: false
    },
    hasAiVoice: false
  };
}

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function audioUrl(result: ListenRepeatAudioResult) {
  const bytes = new Uint8Array(result.audio.byteLength);
  bytes.set(result.audio);
  return URL.createObjectURL(new Blob([bytes.buffer], { type: result.mimeType }));
}

async function playAudio(result: ListenRepeatAudioResult, waitForEnd: boolean) {
  const url = audioUrl(result);
  const audio = new Audio(url);
  if (!waitForEnd) {
    audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
    try {
      await audio.play();
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
    return;
  }
  await new Promise<void>((resolve, reject) => {
    audio.addEventListener("ended", () => {
      URL.revokeObjectURL(url);
      resolve();
    }, { once: true });
    audio.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("Audio playback failed."));
    }, { once: true });
    void audio.play().catch((error) => {
      URL.revokeObjectURL(url);
      reject(error);
    });
  });
}

function supportedRecordingMime() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4"
  ];
  return candidates.find((mime) =>
    typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)
  );
}

function chunkLabel(chunk: ListenRepeatChunk, index: number) {
  return `${chunk.kind === "short" ? "short" : "long"} chunk ${index + 1}`;
}

function formatProcessingTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function processingFeedback(seconds: number) {
  if (seconds < 10) {
    return {
      title: "Sending your material to AI",
      detail: "Keep this page open while the practice is prepared."
    };
  }
  if (seconds < 30) {
    return {
      title: "Finding natural practice breaks",
      detail: "Your original wording and punctuation will be preserved."
    };
  }
  return {
    title: "Still working—your practice is being prepared",
    detail: "Some passages can take around 1–2 minutes. This is normal."
  };
}

const shortChunkLengthOptions: Array<{
  value: ListenRepeatShortChunkLength;
  label: string;
  seconds: string;
}> = [{
  value: "short",
  label: "Short",
  seconds: "0.75–1.5"
}, {
  value: "medium",
  label: "Medium",
  seconds: "1.5–2.5"
}, {
  value: "long",
  label: "Long",
  seconds: "2.5–4"
}];

export function ListenRepeatWorkspace({ api, active, onOpenAiVoice }: Props) {
  const [snapshot, setSnapshot] = useState<ListenRepeatSnapshot>(emptySnapshot);
  const [material, setMaterial] = useState("");
  const [mode, setMode] = useState<ListenRepeatMode>("progressive");
  const [shortChunkLength, setShortChunkLength] =
    useState<ListenRepeatShortChunkLength>("short");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [processingElapsedSeconds, setProcessingElapsedSeconds] = useState(0);
  const [error, setError] = useState("");
  const [recordingChunkId, setRecordingChunkId] = useState<string>();
  const [playingChunkId, setPlayingChunkId] = useState<string>();
  const [preparingLongId, setPreparingLongId] = useState<string>();
  const [continuous, setContinuous] = useState<ContinuousState | null>(null);
  const [continuousStart, setContinuousStart] = useState<string>();
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [pausedChunkId, setPausedChunkId] = useState<string>();
  const [materialExpanded, setMaterialExpanded] = useState(true);
  const snapshotRef = useRef(snapshot);
  const continuousRunRef = useRef(0);
  const recordingSessionRef = useRef<RecordingSession | undefined>(undefined);
  const chunkRefs = useRef(new Map<string, HTMLElement>());
  const lastDraftRef = useRef("");

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    void api.getSnapshot().then((next) => {
      if (cancelled) return;
      setSnapshot(next);
      snapshotRef.current = next;
      if (next.practice) {
        setMaterial(next.practice.material);
        setMode(next.practice.mode);
        setShortChunkLength(next.practice.shortChunkLength);
        setMaterialExpanded(next.practice.phase !== "ready");
        if (next.practice.phase === "draft") {
          lastDraftRef.current = [
            next.practice.mode,
            next.practice.shortChunkLength,
            next.practice.material
          ].join("\0");
        }
      }
      setError("");
    }).catch((caught) => {
      if (!cancelled) setError(caught instanceof Error
        ? caught.message : "Listen & Repeat is unavailable.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [active, api]);

  useEffect(() => () => {
    continuousRunRef.current += 1;
    recordingSessionRef.current?.stop(false);
    const practiceId = snapshotRef.current.practice?.id;
    if (practiceId) void api.cancelAiAudio({ practiceId });
  }, [api]);

  useEffect(() => {
    if (!active || loading ||
      (snapshot.practice && snapshot.practice.phase !== "draft")) return;
    const signature = [mode, shortChunkLength, material].join("\0");
    if (lastDraftRef.current === signature) return;
    const timeout = setTimeout(() => {
      lastDraftRef.current = signature;
      void api.saveDraft({ material, mode, shortChunkLength }).then((next) => {
        setSnapshot(next);
        snapshotRef.current = next;
      }).catch(() => {
        lastDraftRef.current = "";
        // Processing still validates the canonical material; draft persistence is best-effort.
      });
    }, 500);
    return () => clearTimeout(timeout);
  }, [active, api, loading, material, mode, shortChunkLength, snapshot.practice]);

  useEffect(() => {
    if (!processing) return;
    const startedAt = Date.now();
    const interval = setInterval(() => {
      setProcessingElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000));
    }, 1_000);
    return () => clearInterval(interval);
  }, [processing]);

  const validation = validateListenRepeatMaterial(material);
  const count = countListenRepeatGraphemes(material);
  const practice = snapshot.practice;
  const sequence = useMemo(
    () => practice ? flattenListenRepeatPractice(practice) : [],
    [practice]
  );
  const currentContinuousChunk = continuous
    ? sequence.find(({ id }) => id === continuous.chunkId) : undefined;
  const currentParent = currentContinuousChunk?.parentId
    ? practice?.longChunks.find(({ id }) => id === currentContinuousChunk.parentId)
    : currentContinuousChunk?.kind === "long" ? currentContinuousChunk : undefined;
  const resumeChunkId = practice ? findResumeChunkId(practice) : undefined;
  const shortProgress = snapshot.progress.shortTotal
    ? snapshot.progress.shortCompleted / snapshot.progress.shortTotal : 0;
  const longProgress = snapshot.progress.longTotal
    ? snapshot.progress.longCompleted / snapshot.progress.longTotal : 0;
  const processingStatus = processingFeedback(processingElapsedSeconds);
  const shortChunkLengthIndex = shortChunkLengthOptions.findIndex(
    ({ value }) => value === shortChunkLength
  );
  const shortChunkLengthOption = shortChunkLengthOptions[shortChunkLengthIndex];

  async function processMaterial(replaceConfirmed = false) {
    if (!validation.valid) return;
    const hasRecordings = Boolean(practice?.longChunks.some((long) =>
      long.recording || long.shortChunks.some((short) => short.recording)
    ));
    if (hasRecordings && !replaceConfirmed) {
      setConfirmReplace(true);
      return;
    }
    setConfirmReplace(false);
    setProcessingElapsedSeconds(0);
    setProcessing(true);
    setError("");
    try {
      const next = await api.process({
        material,
        mode,
        shortChunkLength,
        replaceConfirmed
      });
      setSnapshot(next);
      snapshotRef.current = next;
      if (next.practice?.phase === "ready") setMaterialExpanded(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI processing failed.");
    } finally {
      setProcessing(false);
    }
  }

  async function playAi(chunk: ListenRepeatChunk, waitForEnd = false) {
    const current = snapshotRef.current;
    if (!current.hasAiVoice) {
      onOpenAiVoice();
      throw new Error("Set up AI Voice in Settings.");
    }
    if (!current.practice) throw new Error("Practice is unavailable.");
    const longId = chunk.kind === "long" ? chunk.id : chunk.parentId;
    setPlayingChunkId(chunk.id);
    setPreparingLongId(longId ?? undefined);
    try {
      const audio = await api.prepareAiAudio({
        practiceId: current.practice.id,
        chunkId: chunk.id
      });
      setPreparingLongId(undefined);
      await playAudio(audio, waitForEnd);
      return audio;
    } finally {
      setPreparingLongId(undefined);
      setPlayingChunkId(undefined);
    }
  }

  async function playMine(chunk: ListenRepeatChunk) {
    const current = snapshotRef.current.practice;
    if (!current) return;
    try {
      await playAudio(await api.getRecording({
        practiceId: current.id,
        chunkId: chunk.id
      }), false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Recording playback failed.");
    }
  }

  async function captureRecording(
    chunk: ListenRepeatChunk,
    onLevel: (level: number, elapsedMs: number) => void
  ): Promise<{ mimeType: string; audio: Uint8Array }> {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      throw new Error("Microphone recording is unavailable on this device.");
    }
    const mimeType = supportedRecordingMime();
    if (!mimeType) throw new Error("This device has no supported recording format.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType });
    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const pieces: Blob[] = [];
    let activity = createVoiceActivityState(performance.now());
    let saveRequested = true;
    let frame = 0;

    const clean = () => {
      cancelAnimationFrame(frame);
      stream.getTracks().forEach((track) => track.stop());
      void context.close();
      recordingSessionRef.current = undefined;
      setRecordingChunkId(undefined);
    };

    return new Promise((resolve, reject) => {
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size) pieces.push(event.data);
      });
      recorder.addEventListener("error", () => {
        clean();
        reject(new Error("Microphone recording failed."));
      }, { once: true });
      recorder.addEventListener("stop", () => {
        const completion = recordingCompletion(activity, saveRequested);
        clean();
        if (completion === "cancel") {
          reject(new DOMException("Recording cancelled", "AbortError"));
          return;
        }
        if (completion === "no-speech") {
          reject(new Error("No voice was detected. Please retry this chunk."));
          return;
        }
        const blob = new Blob(pieces, { type: mimeType });
        void blob.arrayBuffer().then((buffer) => resolve({
          mimeType,
          audio: new Uint8Array(buffer)
        }), reject);
      }, { once: true });

      const sample = () => {
        analyser.getByteTimeDomainData(samples);
        let energy = 0;
        for (const value of samples) {
          const normalized = (value - 128) / 128;
          energy += normalized * normalized;
        }
        const level = Math.sqrt(energy / samples.length);
        activity = advanceVoiceActivity(activity, {
          now: performance.now(),
          level
        });
        onLevel(level, performance.now() - activity.startedAt);
        if (activity.outcome === "complete") recorder.stop();
        else if (activity.outcome === "no-speech") recorder.stop();
        else frame = requestAnimationFrame(sample);
      };

      recordingSessionRef.current = {
        stop(save) {
          saveRequested = save;
          if (recorder.state !== "inactive") recorder.stop();
        }
      };
      setRecordingChunkId(chunk.id);
      recorder.start(250);
      frame = requestAnimationFrame(sample);
    });
  }

  async function recordAndSave(chunk: ListenRepeatChunk, continuousMode: boolean) {
    const current = snapshotRef.current.practice;
    if (!current) throw new Error("Practice is unavailable.");
    const captured = await captureRecording(chunk, (level, elapsedMs) => {
      if (continuousMode) {
        setContinuous((value) => value ? { ...value, level, elapsedMs } : value);
      }
    });
    if (continuousMode) {
      setContinuous((value) => value ? { ...value, phase: "Saving" } : value);
    }
    const next = await api.saveRecording({
      practiceId: current.id,
      chunkId: chunk.id,
      ...captured
    });
    setSnapshot(next);
    snapshotRef.current = next;
    return next;
  }

  async function startManualRecording(chunk: ListenRepeatChunk) {
    setError("");
    try {
      await recordAndSave(chunk, false);
    } catch (caught) {
      if ((caught as Error).name !== "AbortError") {
        setError(caught instanceof Error ? caught.message : "Recording failed.");
      }
    }
  }

  function stopContinuous() {
    continuousRunRef.current += 1;
    recordingSessionRef.current?.stop(false);
    const current = snapshotRef.current.practice;
    if (current) void api.cancelAiAudio({ practiceId: current.id });
    const chunkId = continuous?.chunkId;
    setContinuous(null);
    if (chunkId) focusChunk(chunkId);
  }

  function focusChunk(chunkId: string) {
    requestAnimationFrame(() => {
      chunkRefs.current.get(chunkId)?.scrollIntoView({ block: "center" });
      chunkRefs.current.get(chunkId)?.focus();
    });
  }

  async function runContinuous(startChunkId: string) {
    const initial = snapshotRef.current.practice;
    if (!initial) return;
    const run = continuousRunRef.current + 1;
    continuousRunRef.current = run;
    setError("");
    setPausedChunkId(undefined);
    const prefetched = new Map<string, Promise<ListenRepeatAudioResult>>();
    let chunkId: string | undefined = startChunkId;
    try {
      while (chunkId && continuousRunRef.current === run) {
        const currentPractice = snapshotRef.current.practice;
        if (!currentPractice) break;
        const chunks = flattenListenRepeatPractice(currentPractice);
        const index = chunks.findIndex(({ id }) => id === chunkId);
        if (index < 0) break;
        const chunk = chunks[index];
        if (currentPractice.mode === "progressive" && !chunk.recordingUnlocked) {
          throw new Error("Complete every short chunk before recording this long chunk.");
        }
        setContinuous({
          chunkId,
          phase: "Preparing",
          countdown: null,
          level: 0,
          elapsedMs: 0,
          index,
          total: chunks.length
        });
        const prepared = prefetched.get(chunk.id) ?? api.prepareAiAudio({
          practiceId: currentPractice.id,
          chunkId: chunk.id
        });
        const nextCandidate = continuousPreparationWindow(currentPractice, chunk.id)[1];
        if (nextCandidate && !prefetched.has(nextCandidate.id)) {
          const nextAudio = api.prepareAiAudio({
            practiceId: currentPractice.id,
            chunkId: nextCandidate.id
          });
          void nextAudio.catch(() => undefined);
          prefetched.set(nextCandidate.id, nextAudio);
        }
        const audio = await prepared;
        if (continuousRunRef.current !== run) break;
        setContinuous((value) => value ? { ...value, phase: "AI playback" } : value);
        await playAudio(audio, true);
        for (let countdown = 3; countdown >= 1; countdown -= 1) {
          if (continuousRunRef.current !== run) break;
          setContinuous((value) => value ? {
            ...value,
            phase: "Countdown",
            countdown
          } : value);
          await sleep(1_000);
        }
        if (continuousRunRef.current !== run) break;
        setContinuous((value) => value ? {
          ...value,
          phase: "Recording",
          countdown: null
        } : value);
        await recordAndSave(chunk, true);
        if (continuousRunRef.current !== run) break;
        const updated = snapshotRef.current.practice;
        if (!updated) break;
        const updatedChunks = flattenListenRepeatPractice(updated);
        const updatedIndex = updatedChunks.findIndex(({ id }) => id === chunk.id);
        chunkId = updatedChunks[updatedIndex + 1]?.id;
      }
      if (continuousRunRef.current === run) setContinuous(null);
    } catch (caught) {
      if ((caught as Error).name !== "AbortError") {
        setError(caught instanceof Error ? caught.message : "Continuous practice paused.");
        if (chunkId) setPausedChunkId(chunkId);
      }
      if (chunkId) focusChunk(chunkId);
      if (continuousRunRef.current === run) setContinuous(null);
    }
  }

  function requestContinuous(startChunkId?: string) {
    if (!practice) return;
    if (!snapshot.hasAiVoice) {
      onOpenAiVoice();
      return;
    }
    const start = startChunkId ?? findResumeChunkId(practice);
    if (!start) return;
    setContinuousStart(start);
    if (hasRecordingAtOrAfter(practice, start)) return;
    setContinuousStart(undefined);
    void runContinuous(start);
  }

  function renderChunk(chunk: ListenRepeatChunk, index: number) {
    const label = chunkLabel(chunk, index);
    const isRecording = recordingChunkId === chunk.id;
    const isAdvancedSentence = practice?.mode === "advanced" && chunk.kind === "long";
    const longId = chunk.kind === "long" ? chunk.id : chunk.parentId;
    const groupPreparing = Boolean(longId && preparingLongId === longId);
    return (
      <article
        key={chunk.id}
        className={`listen-repeat-chunk ${chunk.kind}-chunk${chunk.recording ? " is-recorded" : ""}${!chunk.recordingUnlocked ? " is-locked" : ""}`}
        ref={(node) => {
          if (node) chunkRefs.current.set(chunk.id, node);
          else chunkRefs.current.delete(chunk.id);
        }}
        tabIndex={-1}
        data-chunk-id={chunk.id}
      >
        <div className="listen-repeat-chunk-heading">
          <div className="listen-repeat-chunk-identity">
            {!isAdvancedSentence ? (
              <span className="listen-repeat-chunk-number">{index + 1}</span>
            ) : null}
            <span>{isAdvancedSentence
              ? `Sentence ${index + 1}`
              : chunk.kind === "short" ? "Short phrase" : "Full sentence"}</span>
          </div>
          {chunk.recording ? (
            <em><Check aria-hidden="true" /> Recorded</em>
          ) : !chunk.recordingUnlocked ? (
            <em className="locked"><LockKeyhole aria-hidden="true" /> Locked</em>
          ) : (
            <em className="not-recorded">Not recorded</em>
          )}
        </div>
        <p className="listen-repeat-chunk-text">{chunk.text}</p>
        {practice?.mode === "progressive" && chunk.kind === "long" ? (
          <p className="listen-repeat-parent-source-note">
            <AudioLines aria-hidden="true" />
            The short phrases below use exact excerpts from this full-sentence take.
          </p>
        ) : null}
        {chunk.kind === "long" && groupPreparing ? (
          <p className="listen-repeat-parent-preparing" role="status">
            <LoaderCircle aria-hidden="true" />
            Preparing the full sentence and aligning every short phrase…
          </p>
        ) : null}
        <div className="listen-repeat-chunk-actions">
          <button
            type="button"
            className="listen-repeat-action listen-repeat-action-ai"
            aria-label={`Play AI for ${label}`}
            disabled={groupPreparing || playingChunkId === chunk.id}
            onClick={() => void playAi(chunk).catch((caught) => {
              setError(caught instanceof Error ? caught.message : "AI playback failed.");
            })}
          >
            {groupPreparing && playingChunkId === chunk.id
              ? <LoaderCircle className="listen-repeat-inline-spinner" aria-hidden="true" />
              : playingChunkId === chunk.id
                ? <AudioLines aria-hidden="true" /> : <Play aria-hidden="true" />}
            <span>{groupPreparing && playingChunkId === chunk.id
              ? "Preparing sentence…" : "Play AI"}</span>
          </button>
          {isRecording ? (
            <button
              type="button"
              className="listen-repeat-action listen-repeat-action-stop"
              onClick={() => recordingSessionRef.current?.stop(true)}
            >
              <CircleStop aria-hidden="true" />
              <span>Stop & save</span>
            </button>
          ) : (
            <button
              type="button"
              className="listen-repeat-action listen-repeat-action-record"
              aria-label={`${chunk.recording ? "Re-record" : "Record"} ${label}`}
              disabled={!chunk.recordingUnlocked || Boolean(recordingChunkId)}
              onClick={() => void startManualRecording(chunk)}
            >
              <Mic2 aria-hidden="true" />
              <span>{chunk.recording ? "Re-record" : "Record"}</span>
            </button>
          )}
          <button
            type="button"
            className="listen-repeat-action listen-repeat-action-mine"
            disabled={!chunk.recording}
            onClick={() => void playMine(chunk)}
          >
            <Headphones aria-hidden="true" />
            <span>Play mine</span>
          </button>
          <button
            type="button"
            className="listen-repeat-action listen-repeat-action-start"
            disabled={!chunk.recordingUnlocked}
            onClick={() => requestContinuous(chunk.id)}
          >
            <Route aria-hidden="true" />
            <span>Start here</span>
          </button>
        </div>
        {!chunk.recordingUnlocked ? (
          <p className="listen-repeat-lock-note">
            <LockKeyhole aria-hidden="true" />
            Complete every short chunk to unlock recording.
          </p>
        ) : null}
      </article>
    );
  }

  if (!active) return null;

  return (
    <section className="listen-repeat-workspace" aria-labelledby="listen-repeat-title">
      <header className="listen-repeat-heading">
        <div className="listen-repeat-heading-copy">
          <span className="eyebrow"><Waves aria-hidden="true" /> Speaking studio</span>
          <h1 id="listen-repeat-title">Listen & Repeat Practice</h1>
          <p>Build pronunciation and speaking memory—one natural phrase at a time.</p>
          <div className="listen-repeat-trust-notes" aria-label="Practice characteristics">
            <span><ShieldCheck aria-hidden="true" /> Your recordings stay on this device</span>
            <span><AudioLines aria-hidden="true" /> Works with any language</span>
          </div>
        </div>
        {practice ? (
          <button
            type="button"
            className="listen-repeat-clear-action"
            disabled={processing}
            onClick={() => setConfirmClear(true)}
          >
            <Trash2 aria-hidden="true" />
            <span>Clear current practice</span>
          </button>
        ) : null}
      </header>

      {materialExpanded || practice?.phase !== "ready" ? (
        <section
          className="listen-repeat-material is-expanded"
          aria-labelledby="listen-repeat-material-title"
        >
        <div className="listen-repeat-section-heading">
          <div className="listen-repeat-step-heading">
            <span className="listen-repeat-step-number">01</span>
            <div>
              <span className="eyebrow">Prepare</span>
              <h2 id="listen-repeat-material-title">
                {practice?.phase === "ready" ? "Edit your source material" : "Paste what you want to practise"}
              </h2>
            </div>
          </div>
          {practice?.phase === "ready" ? (
            <button
              type="button"
              className="listen-repeat-edit-material"
              onClick={() => setMaterialExpanded(false)}
            >
              <ArrowLeft aria-hidden="true" />
              Return to practice
            </button>
          ) : null}
        </div>
          <div className="listen-repeat-material-body">
            <div className="listen-repeat-field-heading">
              <label htmlFor="listen-repeat-material">Practice material</label>
              <strong className={count > 2_000 ? "over-limit" : ""}>
                {count.toLocaleString()} / 2,000 characters
              </strong>
            </div>
            <textarea
              id="listen-repeat-material"
              rows={7}
              value={material}
              disabled={processing}
              onChange={(event) => setMaterial(event.target.value)}
              placeholder="Paste a paragraph in any language…"
            />
            <div className="listen-repeat-character-track" aria-hidden="true">
              <span style={{ transform: `scaleX(${Math.min(1, count / 2_000)})` }} />
            </div>
            {!validation.valid && validation.reason === "too-long" ? (
              <p role="alert">Material must contain no more than 2,000 characters.</p>
            ) : null}
            <fieldset className="listen-repeat-modes" disabled={processing}>
              <legend>Choose your practice path</legend>
              <div className="listen-repeat-mode-grid">
                <div className={`listen-repeat-mode-card is-progressive${
                  mode === "progressive" ? " is-selected" : ""
                }`}>
                  <label className="listen-repeat-mode-choice">
                    <input
                      type="radio"
                      name="listen-repeat-mode"
                      checked={mode === "progressive"}
                      onChange={() => setMode("progressive")}
                    />
                    <span className="listen-repeat-mode-icon"><Waves aria-hidden="true" /></span>
                    <span>
                      <strong>Progressive <em>Recommended</em></strong>
                      Start with short phrases, then join them into complete sentences.
                      <small>Best for working memory and new sounds</small>
                    </span>
                  </label>
                  <section
                    className="listen-repeat-length-control"
                    aria-labelledby="listen-repeat-length-title"
                  >
                      <div className="listen-repeat-length-heading">
                        <span id="listen-repeat-length-title">Phrase length</span>
                        <strong>{shortChunkLengthOption.label}</strong>
                        <p>About {shortChunkLengthOption.seconds} sec</p>
                      </div>
                      <div className="listen-repeat-length-slider">
                        <input
                          type="range"
                          min="0"
                          max="2"
                          step="1"
                          value={shortChunkLengthIndex}
                          disabled={processing}
                          aria-label="Progressive phrase length"
                          aria-valuetext={`${shortChunkLengthOption.label}, about ${shortChunkLengthOption.seconds} seconds`}
                          style={{
                            background: `linear-gradient(to right, #5b8f6d 0 ${shortChunkLengthIndex * 50}%, #d9ded9 ${shortChunkLengthIndex * 50}% 100%)`
                          }}
                          onChange={(event) => {
                            const option = shortChunkLengthOptions[Number(event.target.value)];
                            if (option) {
                              setMode("progressive");
                              setShortChunkLength(option.value);
                            }
                          }}
                          onPointerDown={() => setMode("progressive")}
                        />
                        <span className="listen-repeat-length-marks" aria-hidden="true">
                          {shortChunkLengthOptions.map(({ value }) => (
                            <i
                              className={value === shortChunkLength ? "is-active" : ""}
                              key={value}
                            />
                          ))}
                        </span>
                      </div>
                      <div className="listen-repeat-length-labels" aria-hidden="true">
                        {shortChunkLengthOptions.map(({ value, label }) => (
                          <span
                            className={value === shortChunkLength ? "is-active" : ""}
                            key={value}
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                  </section>
                </div>
                <div className={`listen-repeat-mode-card is-advanced${
                  mode === "advanced" ? " is-selected" : ""
                }`}>
                  <label className="listen-repeat-mode-choice">
                    <input
                      type="radio"
                      name="listen-repeat-mode"
                      checked={mode === "advanced"}
                      onChange={() => setMode("advanced")}
                    />
                    <span className="listen-repeat-mode-icon"><AudioLines aria-hidden="true" /></span>
                    <span>
                      <strong>Advanced</strong>
                      Practise complete, natural-length sentences right away.
                      <small>Best for fluent shadowing practice</small>
                    </span>
                  </label>
                  <section
                    className="listen-repeat-advanced-summary"
                    aria-label="Advanced practice unit"
                  >
                    <div>
                      <span>Practice unit</span>
                      <strong>Full sentence</strong>
                    </div>
                    <p><Check aria-hidden="true" /> No phrase splitting</p>
                  </section>
                </div>
              </div>
            </fieldset>
            <div className={`listen-repeat-material-footer${processing ? " is-processing" : ""}`}>
              {processing ? (
                <div
                  className="listen-repeat-processing-status"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <span className="listen-repeat-processing-spinner" aria-hidden="true">
                    <LoaderCircle />
                  </span>
                  <span className="listen-repeat-processing-copy">
                    <strong>{processingStatus.title}</strong>
                    <span>{processingStatus.detail}</span>
                  </span>
                  <time aria-hidden="true">
                    <Clock3 aria-hidden="true" />
                    {formatProcessingTime(processingElapsedSeconds)}
                  </time>
                </div>
              ) : (
                <p><Sparkles aria-hidden="true" /> AI finds natural pauses without rewriting your text.</p>
              )}
              <button
                type="button"
                className="listen-repeat-process-action"
                aria-label="Process with AI"
                disabled={!validation.valid || processing}
                onClick={() => void processMaterial(false)}
              >
                {processing
                  ? <LoaderCircle className="is-spinning" aria-hidden="true" />
                  : <Sparkles aria-hidden="true" />}
                <span>{processing ? "Creating practice…" : "Create practice with AI"}</span>
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {error ? (
        <div className="listen-repeat-error" role="alert">
          <CircleAlert aria-hidden="true" />
          <div>
            <strong>Practice paused</strong>
            <p>{error}</p>
          </div>
          <div className="listen-repeat-error-actions">
            {pausedChunkId ? (
              <button type="button" onClick={() => requestContinuous(pausedChunkId)}>
                Retry continuous practice
              </button>
            ) : null}
            {/AI Voice|OpenAI rejected/u.test(error) ? (
              <button type="button" onClick={onOpenAiVoice}>Open AI Voice settings</button>
            ) : null}
          </div>
        </div>
      ) : null}
      {loading ? (
        <p className="listen-repeat-loading" role="status">
          <AudioLines aria-hidden="true" /> Loading current practice…
        </p>
      ) : null}

      {practice?.phase === "ready" && !materialExpanded ? (
        <section className="listen-repeat-session" aria-label="Practice chunks">
          <div className="listen-repeat-session-topbar">
            <button type="button" onClick={() => setMaterialExpanded(true)}>
              <ArrowLeft aria-hidden="true" /> Back to material
            </button>
            <span>{practice.mode === "progressive" ? "Progressive" : "Advanced"} practice</span>
          </div>
          <div className="listen-repeat-session-heading">
            <div className="listen-repeat-step-heading">
              <span className="listen-repeat-step-number">02</span>
              <div>
                <span className="eyebrow">Practise</span>
                <h2>Build the rhythm, one chunk at a time</h2>
                <p>Listen to the model, record yourself, then compare. Your progress saves automatically.</p>
              </div>
            </div>
            <button
              type="button"
              className="listen-repeat-continuous-action"
              disabled={!resumeChunkId}
              onClick={() => requestContinuous()}
            >
              <Waves aria-hidden="true" />
              <span>
                <strong>Resume continuous practice</strong>
                <small>Hands-free AI → countdown → record</small>
              </span>
              <Play aria-hidden="true" />
            </button>
          </div>
          <div className="listen-repeat-progress" aria-label="Practice progress">
            {practice.mode === "progressive" ? (
              <div className="listen-repeat-progress-item">
                <div><span>Short phrases</span><strong>Short {snapshot.progress.shortCompleted}/{snapshot.progress.shortTotal}</strong></div>
                <div className="listen-repeat-progress-track" role="progressbar" aria-label="Short phrase progress" aria-valuemin={0} aria-valuemax={snapshot.progress.shortTotal} aria-valuenow={snapshot.progress.shortCompleted}>
                  <span style={{ transform: `scaleX(${shortProgress})` }} />
                </div>
              </div>
            ) : null}
            <div className="listen-repeat-progress-item">
              <div><span>Full sentences</span><strong>Long {snapshot.progress.longCompleted}/{snapshot.progress.longTotal}</strong></div>
              <div className="listen-repeat-progress-track" role="progressbar" aria-label="Full sentence progress" aria-valuemin={0} aria-valuemax={snapshot.progress.longTotal} aria-valuenow={snapshot.progress.longCompleted}>
                <span style={{ transform: `scaleX(${longProgress})` }} />
              </div>
            </div>
            {snapshot.progress.complete ? (
              <div className="listen-repeat-complete"><Check aria-hidden="true" /> Practice complete</div>
            ) : null}
          </div>
          <div className="listen-repeat-long-list">
            {practice.longChunks.map((long, longIndex) => (
              <section className={`listen-repeat-group${practice.mode === "advanced" ? " is-advanced" : ""}`} key={long.id}>
                {practice.mode === "progressive" ? (
                  <>
                    <header className="listen-repeat-group-heading">
                      <div>
                        <span>Sentence {longIndex + 1}</span>
                        <strong>Whole sentence · phrase source</strong>
                      </div>
                      <span className={long.recording ? "is-complete" : ""}>
                        {long.recording ? <Check aria-hidden="true" /> : null}
                        {long.recording ? "Complete" : "In progress"}
                      </span>
                    </header>
                    <div className="listen-repeat-ladder-label">
                      <span>1</span>
                      <div><strong>Hear the whole sentence</strong><small>Start with its natural rhythm and intonation.</small></div>
                    </div>
                    {renderChunk(long, longIndex)}
                    <div className="listen-repeat-ladder-label">
                      <span>2</span>
                      <div><strong>Build it in short phrases</strong><small>Practice each excerpt, then return to the whole sentence.</small></div>
                    </div>
                    <div className="listen-repeat-short-list">
                      {long.shortChunks.map(renderChunk)}
                    </div>
                    <div className="listen-repeat-ladder-label is-final">
                      <span>3</span>
                      <div><strong>Bring it together</strong><small>When every phrase is recorded, the full-sentence recording above unlocks.</small></div>
                    </div>
                  </>
                ) : null}
                {practice.mode === "advanced" ? renderChunk(long, longIndex) : null}
              </section>
            ))}
          </div>
        </section>
      ) : null}

      {continuous && currentContinuousChunk ? (
        <div className="listen-repeat-focus" role="dialog" aria-modal="true" aria-labelledby="listen-repeat-focus-title">
          <div className="listen-repeat-focus-card">
            <header className="listen-repeat-focus-heading">
              <div>
                <span className="eyebrow"><Waves aria-hidden="true" /> Continuous practice</span>
                <h2 id="listen-repeat-focus-title">Stay with the rhythm</h2>
              </div>
              <span>Chunk {continuous.index + 1} of {continuous.total}</span>
            </header>
            <div className="listen-repeat-focus-progress" role="progressbar" aria-label="Continuous practice progress" aria-valuemin={1} aria-valuemax={continuous.total} aria-valuenow={continuous.index + 1}>
              <span style={{ transform: `scaleX(${(continuous.index + 1) / continuous.total})` }} />
            </div>
            <div className={`listen-repeat-focus-status is-${continuous.phase.toLowerCase().replace(" ", "-")}`}>
              <span className="listen-repeat-focus-status-icon">
                {continuous.phase === "Recording" ? <Mic2 aria-hidden="true" />
                  : continuous.phase === "AI playback" ? <AudioLines aria-hidden="true" />
                    : continuous.phase === "Saving" ? <Check aria-hidden="true" />
                      : <Waves aria-hidden="true" />}
              </span>
              <div>
                <strong className="listen-repeat-focus-phase" aria-live="polite">
                  {continuous.phase}
                  {continuous.countdown ? ` ${continuous.countdown}` : ""}
                </strong>
                <span>{continuous.phase === "Preparing" ? "Getting the model voice ready"
                  : continuous.phase === "AI playback" ? "Listen closely—recording starts after the countdown"
                    : continuous.phase === "Countdown" ? "Get ready to repeat"
                      : continuous.phase === "Recording" ? "Speak now; recording stops after silence"
                        : "Saving your recording"}</span>
              </div>
            </div>
            {currentParent && currentContinuousChunk.kind === "short" ? (
              <div className="listen-repeat-parent-context">
                <span>Full sentence context</span>
                <p>{(() => {
                  const start = currentParent.text.indexOf(currentContinuousChunk.text);
                  if (start < 0) return currentParent.text;
                  return <>
                    {currentParent.text.slice(0, start)}
                    <mark>{currentContinuousChunk.text}</mark>
                    {currentParent.text.slice(start + currentContinuousChunk.text.length)}
                  </>;
                })()}</p>
              </div>
            ) : null}
            <p className="listen-repeat-focus-text">{currentContinuousChunk.text}</p>
            <div className="listen-repeat-focus-meter-row">
              <div
                className="listen-repeat-mic-level"
                role="meter"
                aria-label="Microphone input"
                aria-valuemin={0}
                aria-valuemax={1}
                aria-valuenow={Math.min(1, continuous.level)}
              >
                <span style={{ transform: `scaleX(${Math.min(1, continuous.level * 5)})` }} />
              </div>
              <span className="listen-repeat-recording-time">
                {continuous.phase === "Recording" ? `${(continuous.elapsedMs / 1_000).toFixed(1)} s` : "Mic ready"}
              </span>
            </div>
            <button type="button" className="listen-repeat-stop-continuous" onClick={stopContinuous}>
              <CircleStop aria-hidden="true" /> Stop continuous practice
            </button>
          </div>
        </div>
      ) : null}

      {confirmReplace ? (
        <div className="listen-repeat-dialog" role="dialog" aria-modal="true" aria-labelledby="listen-repeat-replace-title">
          <div>
            <span className="listen-repeat-dialog-icon"><Sparkles aria-hidden="true" /></span>
            <h2 id="listen-repeat-replace-title">Replace the current practice?</h2>
            <p>The new segmentation will replace all saved recordings and AI audio after processing succeeds.</p>
            <div className="listen-repeat-dialog-actions">
              <button type="button" onClick={() => setConfirmReplace(false)}>Cancel</button>
              <button type="button" className="is-primary" onClick={() => void processMaterial(true)}>Replace and process</button>
            </div>
          </div>
        </div>
      ) : null}

      {continuousStart && practice && hasRecordingAtOrAfter(practice, continuousStart) && !continuous ? (
        <div className="listen-repeat-dialog" role="dialog" aria-modal="true" aria-labelledby="listen-repeat-overwrite-title">
          <div>
            <span className="listen-repeat-dialog-icon"><Route aria-hidden="true" /></span>
            <h2 id="listen-repeat-overwrite-title">Replace recordings as you continue?</h2>
            <p>Only chunks reached and fully saved in this run will replace their recordings.</p>
            <div className="listen-repeat-dialog-actions">
              <button type="button" onClick={() => setContinuousStart(undefined)}>Cancel</button>
              <button type="button" className="is-primary" onClick={() => {
                const start = continuousStart;
                setContinuousStart(undefined);
                void runContinuous(start);
              }}>Start continuous practice</button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmClear ? (
        <div className="listen-repeat-dialog is-danger" role="dialog" aria-modal="true" aria-labelledby="listen-repeat-clear-title">
          <div>
            <span className="listen-repeat-dialog-icon"><Trash2 aria-hidden="true" /></span>
            <h2 id="listen-repeat-clear-title">Permanently clear this practice?</h2>
            <p>Material, chunks, recordings, and AI audio will be deleted and cannot be recovered.</p>
            <div className="listen-repeat-dialog-actions">
              <button type="button" onClick={() => setConfirmClear(false)}>Cancel</button>
              <button type="button" className="is-danger" onClick={() => void api.clear().then((next) => {
                setSnapshot(next);
                snapshotRef.current = next;
                setMaterial("");
                setMode("progressive");
                setMaterialExpanded(true);
                setConfirmClear(false);
              })}>Clear permanently</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
