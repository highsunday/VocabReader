import { describe, expect, it } from "vitest";
import type { ListenRepeatPractice } from "../shared/listen-repeat-contracts";
import {
  advanceVoiceActivity,
  continuousPreparationWindow,
  createVoiceActivityState,
  findResumeChunkId,
  flattenListenRepeatPractice,
  hasRecordingAtOrAfter,
  recordingCompletion
} from "./listen-repeat-flow";

function practice(): ListenRepeatPractice {
  const recording = {
    mimeType: "audio/webm",
    bytes: 1,
    updatedAt: "2026-08-10T00:00:00.000Z"
  };
  return {
    id: "practice",
    material: "A B. C D.",
    mode: "progressive",
    phase: "ready",
    error: null,
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    longChunks: [{
      id: "long-1",
      kind: "long",
      text: "A B. ",
      parentId: null,
      recording: null,
      aiAudio: null,
      recordingUnlocked: false,
      shortChunks: [{
        id: "short-1",
        kind: "short",
        text: "A ",
        parentId: "long-1",
        recording,
        aiAudio: null,
        recordingUnlocked: true,
        shortChunks: []
      }, {
        id: "short-2",
        kind: "short",
        text: "B. ",
        parentId: "long-1",
        recording: null,
        aiAudio: null,
        recordingUnlocked: true,
        shortChunks: []
      }]
    }, {
      id: "long-2",
      kind: "long",
      text: "C D.",
      parentId: null,
      recording: null,
      aiAudio: null,
      recordingUnlocked: true,
      shortChunks: [{
        id: "short-3",
        kind: "short",
        text: "C D.",
        parentId: "long-2",
        recording: null,
        aiAudio: null,
        recordingUnlocked: true,
        shortChunks: []
      }]
    }]
  };
}

describe("listen-and-repeat continuous flow", () => {
  it("flattens Progressive practice as every child then its parent", () => {
    expect(flattenListenRepeatPractice(practice()).map(({ id }) => id)).toEqual([
      "short-1",
      "short-2",
      "long-1",
      "short-3",
      "long-2"
    ]);
  });

  it("resumes at the first incomplete eligible chunk and detects overwrite scope", () => {
    expect(findResumeChunkId(practice())).toBe("short-2");
    expect(hasRecordingAtOrAfter(practice(), "short-1")).toBe(true);
    expect(hasRecordingAtOrAfter(practice(), "short-2")).toBe(false);
    expect(findResumeChunkId({
      ...practice(),
      mode: "advanced",
      longChunks: practice().longChunks.map((long) => ({
        ...long,
        shortChunks: []
      }))
    })).toBe("long-1");
  });

  it("limits continuous preparation to the current and next chunk", () => {
    expect(continuousPreparationWindow(practice(), "short-2").map(({ id }) => id))
      .toEqual(["short-2", "long-1"]);
    expect(continuousPreparationWindow(practice(), "long-2").map(({ id }) => id))
      .toEqual(["long-2"]);
    expect(continuousPreparationWindow(practice(), "missing")).toEqual([]);
  });

  it("stops after speech followed by 1.5 seconds of silence", () => {
    let state = createVoiceActivityState(0);
    state = advanceVoiceActivity(state, { now: 100, level: 0.2 });
    expect(state.speechStarted).toBe(true);
    state = advanceVoiceActivity(state, { now: 1_500, level: 0.01 });
    expect(state.outcome).toBe("listening");
    state = advanceVoiceActivity(state, { now: 1_601, level: 0.01 });
    expect(state.outcome).toBe("complete");
  });

  it("reports no speech and maximum-duration guards without a blank completion", () => {
    const noSpeech = advanceVoiceActivity(createVoiceActivityState(0), {
      now: 8_001,
      level: 0.01
    });
    expect(noSpeech.outcome).toBe("no-speech");

    let maximum = advanceVoiceActivity(createVoiceActivityState(0), {
      now: 100,
      level: 0.2
    });
    maximum = advanceVoiceActivity(maximum, { now: 30_001, level: 0.2 });
    expect(maximum.outcome).toBe("complete");
  });

  it("saves only requested recordings that detected speech", () => {
    const silent = createVoiceActivityState(0);
    const spoken = advanceVoiceActivity(silent, { now: 100, level: 0.2 });
    expect(recordingCompletion(spoken, true)).toBe("save");
    expect(recordingCompletion(spoken, false)).toBe("cancel");
    expect(recordingCompletion(silent, true)).toBe("no-speech");
  });
});
