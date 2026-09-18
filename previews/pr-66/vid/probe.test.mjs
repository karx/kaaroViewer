import { describe, it, expect } from 'vitest';
import { parseProbe, parseFps } from './probe.mjs';

const RAW = {
  format: {
    filename: 'sample.mp4',
    format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
    duration: '4.033333',
    size: '98304',
    bit_rate: '195048',
  },
  streams: [
    {
      index: 0, codec_type: 'video', codec_name: 'h264',
      width: 1920, height: 1080, pix_fmt: 'yuv420p',
      avg_frame_rate: '30000/1001', r_frame_rate: '30000/1001',
      duration: '4.0', nb_frames: '120',
    },
    {
      index: 1, codec_type: 'audio', codec_name: 'aac',
      sample_rate: '48000', channels: 2, channel_layout: 'stereo',
      duration: '4.033333',
    },
  ],
};

describe('parseFps', () => {
  it('parses rational rates', () => {
    expect(parseFps('30/1')).toBe(30);
    expect(parseFps('30000/1001')).toBe(29.97);
  });
  it('returns null for missing/zero rates', () => {
    expect(parseFps('0/0')).toBeNull();
    expect(parseFps(undefined)).toBeNull();
  });
});

describe('parseProbe', () => {
  it('normalizes format-level fields', () => {
    const p = parseProbe(RAW);
    expect(p.path).toBe('sample.mp4');
    expect(p.duration).toBeCloseTo(4.033, 2);
    expect(p.sizeBytes).toBe(98304);
    expect(p.container).toContain('mp4');
  });

  it('exposes first video and audio streams as shortcuts', () => {
    const p = parseProbe(RAW);
    expect(p.video).toMatchObject({ codec: 'h264', width: 1920, height: 1080, fps: 29.97, frames: 120 });
    expect(p.audio).toMatchObject({ codec: 'aac', sampleRate: 48000, channels: 2 });
  });

  it('accepts a JSON string and handles missing streams', () => {
    const p = parseProbe(JSON.stringify({ format: { duration: '1.0' } }));
    expect(p.duration).toBe(1);
    expect(p.video).toBeNull();
    expect(p.audio).toBeNull();
    expect(p.streams).toEqual([]);
  });
});
