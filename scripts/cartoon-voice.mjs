const bands = [155, 226, 305, 397, 508, 638, 793, 977, 1195, 1451, 1753, 2110, 2532, 3045, 3658, 4410, 5338, 6490, 7910, 9500];
const TAU = Math.PI * 2;
const profiles = {
  am_michael: { pitch: 171, transpose: 1.30, formant: 1.10, wobble: .059, spring: .17, rate: 6.1, shape: 'reed' },
  bf_emma: { pitch: 264, transpose: 1.12, formant: 1.09, wobble: .049, spring: .14, rate: 5.6, shape: 'bell' },
};

const waveforms = {
  reed: (phase, angle) => .49 * (phase < .34 ? .82 : -.64) + .25 * (phase * 2 - 1) + .26 * Math.sin(angle),
  bell: (phase, angle) => .76 * Math.sin(angle + 1.32 * Math.sin(3 * angle)) + .24 * (phase * 2 - 1),
};
const unit = value => Math.max(0, Math.min(1, value));

function filters(rate, formant) {
  const first = new Float64Array(bands.length);
  const second = new Float64Array(bands.length);
  const gain = new Float64Array(bands.length);
  for (const [index, band] of bands.entries()) {
    const theta = TAU * Math.min(rate * .43, band * formant) / rate;
    const width = Math.sin(theta) / (2 * 2.12);
    gain[index] = width / (1 + width);
    first[index] = -2 * Math.cos(theta) / (1 + width);
    second[index] = (1 - width) / (1 + width);
  }
  return { first, second, gain, z1: new Float64Array(bands.length), z2: new Float64Array(bands.length) };
}

// Speech periodicity separates voiced sounds from the noise bursts in consonants.
function voicing(samples, rate, hop) {
  const down = 6;
  const decimated = new Float32Array(Math.ceil(samples.length / down));
  for (let i = 0; i < decimated.length; i++) {
    let sum = 0;
    for (let j = 0; j < down; j++) sum += samples[i * down + j] ?? 0;
    decimated[i] = sum / down;
  }
  const strength = new Float32Array(Math.ceil(samples.length / hop) + 1);
  const melody = new Float32Array(strength.length).fill(1);
  const size = Math.round(rate / down * .015);
  const firstLag = Math.floor(rate / down / 475);
  const lastLag = Math.round(rate / down / 72);
  let averagePitch = 0, inflection = 1;
  for (let i = 0; i < strength.length; i++) {
    const start = Math.max(0, Math.floor(i * hop / down) - Math.floor(size / 2));
    if (start + size + lastLag >= decimated.length) continue;
    let ref = .00001;
    for (let j = 0; j < size; j++) ref += decimated[start + j] ** 2;
    if (ref < .006) continue;
    let strongest = 0, bestLag = firstLag;
    for (let lag = firstLag; lag <= lastLag; lag++) {
      let corr = 0, power = .00001;
      for (let j = 0; j < size; j++) {
        const shifted = decimated[start + j + lag];
        corr += decimated[start + j] * shifted;
        power += shifted * shifted;
      }
      const score = corr / Math.sqrt(ref * power) - .0012 * lag;
      if (score > strongest) { strongest = score; bestLag = lag; }
    }
    strength[i] = unit((strongest - .32) / .48);
    if (strongest > .62) {
      const hz = rate / down / bestLag;
      if (!averagePitch) averagePitch = hz;
      averagePitch += (hz - averagePitch) * .027;
      const change = Math.max(.79, Math.min(1.27, hz / averagePitch));
      inflection += (change - inflection) * .29;
    } else inflection += (1 - inflection) * .2;
    melody[i] = inflection;
  }
  return { strength, melody };
}

// Transpose short grains and align their overlapping waveforms. This keeps consonants clear at a toy-like
// pitch and preserves the original duration, so the vocal performance, animation and cue sheet agree.
function shiftedArticulation(speech, profile, rate, register) {
  const hop = Math.round(rate * .014);
  const search = Math.round(rate * .005);
  const frame = hop * 2;
  const output = new Float32Array(speech.length);
  const tail = new Float32Array(hop);
  const window = Float32Array.from({ length: frame }, (_, i) => Math.sin(Math.PI * i / frame) ** 2);
  for (let pos = 0; pos < speech.length; pos += hop) {
    const bend = Math.sin(pos * TAU * profile.rate / rate) * profile.wobble * .46;
    const ratio = profile.transpose * register * (1 + bend);
    const ideal = Math.round(pos + hop * (1 - ratio));
    let anchor = ideal, best = -Infinity;
    if (pos > 0 && ideal > search && ideal + search + frame * ratio + 1 < speech.length) {
      for (let shift = -search; shift <= search; shift += 3) {
        let correlation = 0, energy = .000001;
        for (let j = 12; j < hop - 12; j += 8) {
          const sample = speech[ideal + shift + Math.round(j * ratio)];
          correlation += tail[j] * sample;
          energy += sample * sample;
        }
        const score = correlation / Math.sqrt(energy) - .0001 * Math.abs(shift);
        if (score > best) { best = score; anchor = ideal + shift; }
      }
    }
    for (let j = 0; j < frame && pos + j < output.length; j++) {
      const at = anchor + j * ratio, k = Math.floor(at);
      const first = speech[k] ?? 0, second = speech[k + 1] ?? 0;
      const sample = first + (second - first) * (at - k);
      output[pos + j] += sample * window[j];
      if (j >= hop) tail[j - hop] = sample;
    }
  }
  return output;
}

export function cartoonVoice(pcm, line, id, rate = 24000) {
  const profile = profiles[line.voice];
  if (!profile) throw new Error(`Missing cartoon voice for ${line.voice}`);
  const count = pcm.length / 2;
  const speech = new Float32Array(count);
  for (let i = 0; i < count; i++) speech[i] = pcm.readInt16LE(i * 2) / 32768;
  const hop = Math.round(rate * .01);
  const voices = voicing(speech, rate, hop);
  const excited = /^(goal|equalizer|late|leadChange|backInIt|\w+Goal|\w+Payback)/.test(id);
  const measured = /^(ownGoal|quietBuild|halfTime|.*Recap)/.test(id);
  const register = measured ? .96 : excited ? 1.09 : 1;
  const articulation = shiftedArticulation(speech, profile, rate, measured ? .98 : excited ? 1.035 : 1);
  const analysis = filters(rate, 1);
  const synth = filters(rate, profile.formant);
  const contour = new Float64Array(bands.length);
  const carrierLoudness = new Float64Array(bands.length).fill(.012);
  const tone = waveforms[profile.shape];
  const out = new Float32Array(count);
  const ringing = TAU * profile.rate / rate;
  const work = count - Math.floor(rate * .074);
  const tail = Math.floor(rate * .015);
  const shapeEnd = line.text.endsWith('?') ? .12 : -.09;
  let phase = 0, note = profile.pitch, fast = 0, slow = 0, peak = 0, energy = 0, active = 0, seed = 0x59cf0c5d;

  for (let i = 0; i < work; i++) {
    const t = i / hop;
    const before = Math.floor(t);
    const blend = t - before;
    const weight = voices.strength[before] + (voices.strength[before + 1] - voices.strength[before]) * blend;
    const melody = voices.melody[before] + (voices.melody[before + 1] - voices.melody[before]) * blend;
    const sample = speech[i];
    const level = Math.abs(sample);
    fast += (level - fast) * .009;
    slow += (level - slow) * .00115;
    const lift = unit((fast - slow) / (.014 + slow));
    const end = unit((i - work + rate * .28) / (rate * .28));
    const wanted = profile.pitch * register * melody * (1 + Math.sin(i * ringing) * profile.wobble + lift * profile.spring * (excited ? 1.8 : 1.3) + shapeEnd * end);
    note += (wanted - note) * .007;
    phase += note / rate;
    if (phase >= 1) phase -= 1;
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const noise = (seed >>> 0) / 2147483648 - 1;
    const carrier = tone(phase, phase * TAU) * (.19 + .75 * weight) + noise * (.83 - .73 * weight);
    let sound = 0;
    for (let band = 0; band < bands.length; band++) {
      const m = analysis.gain[band] * sample + analysis.z1[band];
      analysis.z1[band] = analysis.z2[band] - analysis.first[band] * m;
      analysis.z2[band] = -analysis.gain[band] * sample - analysis.second[band] * m;
      const env = contour[band];
      contour[band] += (Math.abs(m) - env) * (Math.abs(m) > env ? .023 : .0033);

      const c = synth.gain[band] * carrier + synth.z1[band];
      synth.z1[band] = synth.z2[band] - synth.first[band] * c;
      synth.z2[band] = -synth.gain[band] * carrier - synth.second[band] * c;
      carrierLoudness[band] += (Math.abs(c) - carrierLoudness[band]) * .004;
      const presence = band < 2 ? .63 : band > 11 ? 1.19 : 1;
      sound += c * contour[band] / (.036 + carrierLoudness[band]) * presence;
    }
    const fade = Math.min(1, i / 115, (work - i) / tail);
    const instrument = sound / (1 + Math.abs(sound) * 1.5);
    const shaped = (.25 * instrument + .84 * articulation[i]) * fade;
    out[i] = shaped;
    peak = Math.max(peak, Math.abs(shaped));
    if (fast > .010) { energy += shaped * shaped; active++; }
  }
  if (!active || peak < .02) throw new Error(`Silent cartoon take for ${line.voice}`);
  const gain = Math.min(.76 / peak, .14 / Math.sqrt(energy / active));
  const rendered = Buffer.alloc(pcm.length);
  for (let i = 0; i < work; i++) rendered.writeInt16LE(Math.round(out[i] * gain * 32767), i * 2);
  if (/^(boothHello|goalOne|postBoothReply)/.test(id)) {
    const chime = profile.shape === 'bell';
    const length = Math.round(.102 * rate), start = count - Math.round(.116 * rate);
    for (let i = 0; i < length; i++) {
      const t = i / rate, decay = Math.min(1, i / (.004 * rate)) * (1 - i / length) ** 2;
      const note = chime ? .7 * Math.sin(TAU * 880 * t) + .3 * Math.sin(TAU * 1320 * t) :
        Math.sin(TAU * (420 * t - 1120 * t * t));
      const index = (start + i) * 2;
      rendered.writeInt16LE(rendered.readInt16LE(index) + Math.round(note * decay * .064 * 32767), index);
    }
  }
  return rendered;
}
