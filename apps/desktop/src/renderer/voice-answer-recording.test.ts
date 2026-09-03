import { describe, expect, it } from "vitest";
import {
  advanceVoiceAnswerActivity,
  createVoiceAnswerActivity
} from "./voice-answer-recording";

describe("voice answer activity", () => {
  it("cancels without an API-ready recording after eight seconds of silence", () => {
    const initial = createVoiceAnswerActivity(0);
    expect(advanceVoiceAnswerActivity(initial, { now: 7_999, level: 0 }).outcome)
      .toBe("listening");
    expect(advanceVoiceAnswerActivity(initial, { now: 8_000, level: 0 }).outcome)
      .toBe("no-speech");
  });

  it("completes 1.5 seconds after detected speech ends", () => {
    const speaking = advanceVoiceAnswerActivity(createVoiceAnswerActivity(0), {
      now: 500,
      level: 0.12
    });
    expect(advanceVoiceAnswerActivity(speaking, { now: 1_999, level: 0 }).outcome)
      .toBe("listening");
    expect(advanceVoiceAnswerActivity(speaking, { now: 2_000, level: 0 }).outcome)
      .toBe("complete");
  });

  it("hard-stops a spoken answer at fifteen seconds", () => {
    const speaking = advanceVoiceAnswerActivity(createVoiceAnswerActivity(0), {
      now: 200,
      level: 0.12
    });
    expect(advanceVoiceAnswerActivity(speaking, { now: 15_000, level: 0.12 }).outcome)
      .toBe("complete");
  });
});
