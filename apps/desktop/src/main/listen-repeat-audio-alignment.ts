export interface ListenRepeatWordTimestamp {
  word: string;
  start: number;
  end: number;
}

interface PcmWav {
  channels: number;
  sampleRate: number;
  blockAlign: number;
  data: Uint8Array;
}

const SILENCE_SECONDS = 0.06;
const FADE_SECONDS = 0.008;
const STREAMING_WAV_LENGTH = 0xffff_ffff;

function ascii(view: DataView, offset: number, length: number): string {
  return Array.from({ length }, (_, index) =>
    String.fromCharCode(view.getUint8(offset + index))).join("");
}

function parsePcmWav(audio: Uint8Array): PcmWav {
  if (audio.byteLength < 44) throw new Error("Invalid PCM WAV");
  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
  if (ascii(view, 0, 4) !== "RIFF" || ascii(view, 8, 4) !== "WAVE") {
    throw new Error("Invalid PCM WAV");
  }
  let offset = 12;
  let format: {
    audioFormat: number;
    channels: number;
    sampleRate: number;
    blockAlign: number;
    bitsPerSample: number;
  } | undefined;
  let data: Uint8Array | undefined;
  while (offset + 8 <= audio.byteLength) {
    const id = ascii(view, offset, 4);
    const declaredSize = view.getUint32(offset + 4, true);
    const content = offset + 8;
    const size = id === "data" && declaredSize === STREAMING_WAV_LENGTH
      ? audio.byteLength - content
      : declaredSize;
    if (content + size > audio.byteLength) throw new Error("Invalid PCM WAV");
    if (id === "fmt " && size >= 16) {
      format = {
        audioFormat: view.getUint16(content, true),
        channels: view.getUint16(content + 2, true),
        sampleRate: view.getUint32(content + 4, true),
        blockAlign: view.getUint16(content + 12, true),
        bitsPerSample: view.getUint16(content + 14, true)
      };
    } else if (id === "data") {
      data = audio.slice(content, content + size);
    }
    offset = content + size + (size % 2);
  }
  if (!format || !data || format.audioFormat !== 1 ||
    format.bitsPerSample !== 16 || format.channels < 1 ||
    format.sampleRate < 8_000 || format.blockAlign !== format.channels * 2 ||
    data.byteLength === 0 || data.byteLength % format.blockAlign !== 0) {
    throw new Error("Invalid PCM WAV");
  }
  return { ...format, data };
}

export function validateListenRepeatPcmWav(audio: Uint8Array): void {
  parsePcmWav(audio);
}

function normalizeSpeechText(value: string): string {
  return value.normalize("NFKD").toLocaleLowerCase()
    .replace(/[\p{M}\p{P}\p{Z}\p{C}]/gu, "");
}

function writePcmWav(input: PcmWav, sourceData: Uint8Array): Uint8Array {
  const output = new Uint8Array(44 + sourceData.byteLength);
  const view = new DataView(output.buffer);
  const writeAscii = (offset: number, value: string) => {
    [...value].forEach((character, index) =>
      view.setUint8(offset + index, character.charCodeAt(0))
    );
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + sourceData.byteLength, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, input.channels, true);
  view.setUint32(24, input.sampleRate, true);
  view.setUint32(28, input.sampleRate * input.blockAlign, true);
  view.setUint16(32, input.blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, sourceData.byteLength, true);
  output.set(sourceData, 44);
  return output;
}

function sliceWithEdges(
  wav: PcmWav,
  startSeconds: number,
  endSeconds: number
): Uint8Array {
  const totalFrames = wav.data.byteLength / wav.blockAlign;
  const startFrame = Math.max(0, Math.min(
    totalFrames,
    Math.floor(startSeconds * wav.sampleRate)
  ));
  const endFrame = Math.max(startFrame + 1, Math.min(
    totalFrames,
    Math.ceil(endSeconds * wav.sampleRate)
  ));
  const silenceFrames = Math.round(SILENCE_SECONDS * wav.sampleRate);
  const sourceFrames = endFrame - startFrame;
  const data = new Uint8Array(
    (silenceFrames + sourceFrames + silenceFrames) * wav.blockAlign
  );
  data.set(wav.data.slice(
    startFrame * wav.blockAlign,
    endFrame * wav.blockAlign
  ), silenceFrames * wav.blockAlign);

  const view = new DataView(data.buffer);
  const fadeFrames = Math.min(
    Math.round(FADE_SECONDS * wav.sampleRate),
    Math.floor(sourceFrames / 2)
  );
  for (let frame = 0; frame < fadeFrames; frame += 1) {
    const rising = (frame + 1) / fadeFrames;
    const falling = (fadeFrames - frame) / fadeFrames;
    for (let channel = 0; channel < wav.channels; channel += 1) {
      const startOffset = ((silenceFrames + frame) * wav.channels + channel) * 2;
      const endOffset = ((silenceFrames + sourceFrames - fadeFrames + frame) *
        wav.channels + channel) * 2;
      view.setInt16(startOffset, Math.round(view.getInt16(startOffset, true) * rising), true);
      view.setInt16(endOffset, Math.round(view.getInt16(endOffset, true) * falling), true);
    }
  }
  return writePcmWav(wav, data);
}

export function deriveListenRepeatAudioSlices(input: {
  parentText: string;
  childTexts: string[];
  audio: Uint8Array;
  words: ListenRepeatWordTimestamp[];
}): Uint8Array[] {
  const wav = parsePcmWav(input.audio);
  const duration = wav.data.byteLength / wav.blockAlign / wav.sampleRate;
  const childNormalized = input.childTexts.map(normalizeSpeechText);
  const parentNormalized = normalizeSpeechText(input.parentText);
  if (childNormalized.some((value) => !value) ||
    childNormalized.join("") !== parentNormalized) {
    throw new Error("Unsafe listen-and-repeat alignment");
  }
  const words = input.words.map((word) => ({
    ...word,
    normalized: normalizeSpeechText(word.word)
  })).filter(({ normalized }) => normalized);
  if (words.length === 0 || words.map(({ normalized }) => normalized).join("") !==
    parentNormalized) {
    throw new Error("Unsafe listen-and-repeat alignment");
  }
  let previousEnd = 0;
  for (const word of words) {
    if (!Number.isFinite(word.start) || !Number.isFinite(word.end) ||
      word.start < 0 || word.end < word.start || word.start < previousEnd - 0.2 ||
      word.end > duration + 0.25) {
      throw new Error("Unsafe listen-and-repeat alignment");
    }
    previousEnd = word.end;
  }

  const wordEnds: number[] = [];
  let characters = 0;
  for (const word of words) {
    characters += word.normalized.length;
    wordEnds.push(characters);
  }
  const boundaries: number[] = [0];
  let childCharacters = 0;
  for (let index = 0; index < childNormalized.length - 1; index += 1) {
    childCharacters += childNormalized[index].length;
    const wordIndex = wordEnds.indexOf(childCharacters);
    if (wordIndex < 0 || wordIndex + 1 >= words.length) {
      throw new Error("Unsafe listen-and-repeat alignment");
    }
    const left = words[wordIndex].end;
    const right = words[wordIndex + 1].start;
    boundaries.push(Math.max(0, Math.min(duration, (left + right) / 2)));
  }
  boundaries.push(duration);
  if (boundaries.some((boundary, index) =>
    index > 0 && boundary <= boundaries[index - 1]
  )) {
    throw new Error("Unsafe listen-and-repeat alignment");
  }
  return input.childTexts.map((_, index) => sliceWithEdges(
    wav,
    boundaries[index],
    boundaries[index + 1]
  ));
}
