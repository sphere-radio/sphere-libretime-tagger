import { describe, expect, it } from "vitest";
import { parseAudioInfo, parseDuration, parseSilences } from "../src/convert/mediaLog";

const WAV_LOG = `Input #0, wav, from 'source':
  Duration: 01:02:03.50, bitrate: 1411 kb/s
  Stream #0:0: Audio: pcm_s16le ([1][0][0][0] / 0x0001), 44100 Hz, stereo, s16, 1411 kb/s
Output #0, null
  Stream #0:0: Audio: pcm_s16le, 192000 Hz, stereo`;

const MP3_WITH_COVER_LOG = `Input #0, mp3, from 'source':
  Duration: 00:00:07.50, start: 0.025057, bitrate: 128 kb/s
  Stream #0:0: Audio: mp3, 48000 Hz, 5.1, fltp, 128 kb/s
  Stream #0:1: Video: mjpeg, yuvj420p, 500x500`;

describe("parseDuration", () => {
  it("converts the Duration line to seconds", () => {
    expect(parseDuration(WAV_LOG)).toBe(3723.5);
  });

  it("is undefined without a Duration line", () => {
    expect(parseDuration("nothing")).toBeUndefined();
  });
});

describe("parseAudioInfo", () => {
  it("describes the input stream, not the output stream", () => {
    expect(parseAudioInfo(WAV_LOG)).toEqual({ codec: "pcm", durationSeconds: 3723.5, sampleRateHz: 44100, channels: 2, bitrateKbps: 1411 });
  });

  it("keeps the codec name and ignores cover art streams", () => {
    expect(parseAudioInfo(MP3_WITH_COVER_LOG)).toMatchObject({ codec: "mp3", sampleRateHz: 48000, channels: null, bitrateKbps: 128 });
  });

  it("is null when there is no audio stream", () => {
    expect(parseAudioInfo("nothing")).toBeNull();
  });
});

describe("parseSilences", () => {
  it("pairs each start with its end", () => {
    const log = "[silencedetect @ 0x1] silence_start: 0\n[silencedetect @ 0x1] silence_end: 2.00009 | silence_duration: 2.00009\n[silencedetect @ 0x1] silence_start: 4.99993\n[silencedetect @ 0x1] silence_end: 7.5 | silence_duration: 2.50007";
    expect(parseSilences(log, 7.5)).toEqual([{ start: 0, end: 2.00009 }, { start: 4.99993, end: 7.5 }]);
  });

  it("ends a silence that never closes at the end of the file", () => {
    expect(parseSilences("silence_start: 6.5", 7.5)).toEqual([{ start: 6.5, end: 7.5 }]);
  });

  it("finds nothing in a log without silence", () => {
    expect(parseSilences("no silence", 7.5)).toEqual([]);
  });
});
