// Write and record the original stadium scores. Normal installs play the included recordings.
// Usage: node scripts/record-stadium-band.mjs SOUNDFONT FLUIDSYNTH FFMPEG [work-directory]
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tunes, movements } from './stadium-arrangements.mjs';

const [font, synth, encoder, scratch = '.tooling/stadium-band/takes'] = process.argv.slice(2);
if (!font || !synth || !encoder) throw new Error('Supply the SoundFont, FluidSynth and FFmpeg paths.');
const folder = 'public/music/stadium-band';
mkdirSync(scratch, { recursive: true });
mkdirSync(folder, { recursive: true });
const rate = 32000, ppq = 480, tail = Math.round(.9 * rate);
const harmonies = {
  I:[0,'maj'], I7:[0,'dom'], i:[0,'min'], ii:[2,'min'], iiDim:[2,'dim'], II7:[2,'dom'],
  iii:[4,'min'], III7:[4,'dom'], bIII:[3,'maj'], IV:[5,'maj'], IV7:[5,'dom'], iv:[5,'min'],
  V:[7,'dom'], V7:[7,'dom'], Vsus:[7,'sus'], vi:[9,'min'], VI7:[9,'dom'], bVI:[8,'maj'], bVII:[10,'maj'],
};
const scales = { maj:[0,2,4,5,7,9,11], min:[0,2,3,5,7,8,10], dom:[0,2,4,5,7,9,10], dim:[0,1,3,5,6,8,10], sus:[0,2,5,5,7,9,10] };
const wrap = (n,k) => (n%k+k)%k;
function degree(chord, n) {
  return chord[0] + scales[chord[1]][wrap(n-1,7)] + 12*Math.floor((n-1)/7);
}
function register(key, bottom) { return bottom + wrap(key-bottom,12); }

function randomFor(key) {
  let state = 1;
  for (const ch of key) state = (Math.imul(state,31)+ch.charCodeAt(0))>>>0;
  return () => { state = (Math.imul(state,1664525)+1013904223)>>>0; return state/4294967296; };
}
function delta(value) {
  const bytes = [value & 127];
  while ((value = Math.floor(value / 128)) > 0) bytes.unshift(128 | value & 127);
  return bytes;
}
function command(exe, args) {
  const result = spawnSync(exe, args, { encoding:'utf8', windowsHide:true });
  if (result.error || result.status !== 0) throw new Error(result.error?.message ?? (result.stderr + result.stdout).slice(-2000));
}
function record(name, tune, bars, programs, arrange) {
  const events = [], rand = randomFor(name);
  const tempo = Math.round(60_000_000 / tune.bpm);
  const frames = Math.round(bars*tune.beats*tempo*rate/1e6);
  const push = (tick, data) => events.push({ tick, data });
  push(0,[255,81,3,tempo>>16,tempo>>8&255,tempo&255]);
  programs.forEach((program,ch) => {
    push(0,[192+ch,program]);
    push(0,[176+ch,10,tune.pans[ch]]);
    push(0,[176+ch,91,[37,25,12,42,30][ch]]);
  });
  push(0,[185,91,22]);
  function note(ch, beat, key, duration, velocity) {
    if (beat >= bars*tune.beats) return;
    const swing = Math.abs(beat%1-.5)<.015 ? tune.swing : 0;
    const start = Math.max(0, Math.round((beat+swing+(rand()-.5)*.018)*ppq));
    const stop = Math.min(bars*tune.beats*ppq, start+Math.max(10,Math.round(duration*ppq)));
    if (stop<=start) return;
    push(start,[144+ch, key, Math.max(1,Math.min(120,Math.round(velocity+(rand()-.5)*6)))]);
    push(stop,[128+ch,key,0]);
  }
  arrange(note);
  events.sort((a,b)=>a.tick-b.tick);
  let last = 0;
  const bytes = [];
  for (const {tick,data} of events) { bytes.push(...delta(tick-last),...data); last=tick; }
  bytes.push(...delta(Math.max(0,bars*tune.beats*ppq - last)),255,47,0);
  const header=Buffer.from([77,84,104,100,0,0,0,6,0,0,0,1,ppq>>8,ppq&255,77,84,114,107,0,0,0,0]);
  header.writeUInt32BE(bytes.length,18);
  const mid=resolve(scratch,name+'.mid'), wav=resolve(scratch,name+'.wav');
  writeFileSync(mid,Buffer.concat([header,Buffer.from(bytes)]));
  command(synth,['-n','-i','-q','-r',String(rate),'-g','.42','-o','synth.reverb.room-size=0.44','-o','synth.reverb.level=0.52','-F',wav,'-T','wav','-O','s16',font,mid]);
  const file=readFileSync(wav);
  let p=12;
  while(p+8<file.length && file.toString('ascii',p,p+4)!=='data') p+=8+file.readUInt32LE(p+4)+(file.readUInt32LE(p+4)%2);
  if (p+8>=file.length) throw new Error('Missing PCM in '+wav);
  const audio=new Int16Array((frames+tail)*2);
  const count=Math.min(file.readUInt32LE(p+4)/2,audio.length);
  for(let i=0;i<count;i++) audio[i]=file.readInt16LE(p+8+i*2);
  return { audio, frames };
}

function writePack(name, takes, gain) {
  const samples=takes.reduce((n,t)=>n+t.audio.length,0);
  const bytes=Buffer.alloc(44+samples*2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length-8,4); bytes.write('WAVEfmt ',8);
  bytes.writeUInt32LE(16,16); bytes.writeUInt16LE(1,20); bytes.writeUInt16LE(2,22);
  bytes.writeUInt32LE(rate,24); bytes.writeUInt32LE(rate*4,28); bytes.writeUInt16LE(4,32);
  bytes.writeUInt16LE(16,34); bytes.write('data',36); bytes.writeUInt32LE(samples*2,40);
  let out=44;
  for (const take of takes) {
    for(let i=0;i<take.audio.length;i++) {
      const remaining=(take.audio.length-i)/2;
      const fade=Math.min(1,remaining/(rate*.16));
      const value=take.audio[i]*gain*fade/32768;
      // Transparent below the knee. Retain headroom on an accented brass or snare hit.
      const absolute=Math.abs(value);
      const limited=absolute<.72?absolute:.72+.24*Math.tanh((absolute-.72)/.24);
      bytes.writeInt16LE(Math.round(Math.sign(value)*limited*32767),out); out+=2;
    }
  }
  const temp=resolve(scratch,'master.wav');
  writeFileSync(temp,bytes);
  command(encoder,['-hide_banner','-loglevel','error','-y','-i',temp,'-c:a','libvorbis','-q:a','4.3',join(folder,name+'.ogg')]);
}

function rhythm(tune, movement, bar, chord, next, note, extra) {
  const t=bar*tune.beats, id=tune.id;
  const hush=movement==='hush', finale=bar===7 && (movement==='home'||movement==='reprise');
  const light=hush?-13:0;
  const hit=(beat,kit,velocity)=>note(9,t+beat,kit,.15,velocity+light);
  const bass=(beat,d,length=.52,v=82)=>note(2,t+beat,register(tune.tonic+chord[0],34)+degree(chord,d)-chord[0],length,v+light);
  const keys=[3,5,7].map(d=>register(tune.tonic+degree(chord,d),53)).sort((a,b)=>a-b);
  if (id==='kites' || id==='caper') keys[2]=register(tune.tonic+degree(chord,1),62);
  const strum=(beat,length,velocity)=>keys.forEach((k,i)=>note(1,t+beat+i*.016,k,length,velocity+light-i*2));
  const walking=(beat,pitch)=>note(2,t+beat,pitch,.65,74+light);
  const endFill=bar===3 || bar===7;
  if (extra) {
    if (id==='mango') {
      for (const [beat,kit] of [[.5,64],[1.25,63],[2.5,64],[3.25,62]]) hit(beat,kit,bar%2?65:72);
    } else if (id==='kites') {
      hit(0,54,51); if(bar%2)hit(2,81,43);
    } else if (id==='caper') {
      hit(.5,76,53); if(bar%2)hit(2.75,77,61);
    } else {
      if(bar%2===0) hit(0,49,45);
      hit(.5,54,57); hit(2.5,54,60); if(bar%2)hit(3.5,46,56);
    }
    if(endFill) for (const [i,kit] of [50,48,45].entries()) hit(tune.beats-1+i*.33,kit,57+i*5);
    return;
  }
  if (id==='brass') {
    bass(0,1,.74,86); bass(1,bar%2?5:3,.69,71); bass(2,5,.69,81);
    walking(3,register(tune.tonic+next[0],36)+(bar%2?1:-1));
    strum(.66,.25,70); strum(2,.52,62); if(bar%2)strum(3.5,.20,64);
    for(const beat of [0,1,1.5,2,3,3.5]) hit(beat,51,beat%1?49:61);
    hit(0,36,65); hit(1,37,72); hit(3,38,67);
  } else if(id==='mango') {
    bass(0,1,.66); bass(1.5,5,.67,77); bass(2.75,1,.84); if(bar%2)bass(3.75,3,.18,63);
    for(const beat of [.5,1.5,2.25,3.5])strum(beat,.28,bar%2?65:70);
    for(const beat of [0,.5,1,1.5,2,2.5,3,3.5])hit(beat,70,beat%1?44:57);
    for(const beat of (bar%2?[1,2]:[0,1.5,3]))hit(beat,75,63);
    hit(0,36,74);hit(2.5,36,58);hit(3,37,71);
  } else if(id==='caper') {
    bass(0,1,.27,84);bass(1.5,5,.23,73);bass(2.5,bar%2?3:1,.31,79);
    strum(.5,.14,65);strum(2,.16,70);if(bar%2)strum(3.5,.13,65);
    hit(0,36,57);hit(1.5,76,49);hit(3,37,65);if(endFill)hit(3.5,77,57);
  } else if(id==='velcro') {
    for(const [beat,d,len,v] of [[0,1,.68,92],[.75,1,.16,68],[1.5,5,.26,81],[2.25,8,.31,82],[3,bar%2?7:5,.36,76],[3.75,5,.14,68]])bass(beat,d,len,v);
    for(const beat of [.5,1.25,2.5,3.25])strum(beat,.13,70);
    for(const beat of [0,.5,1,1.5,2,2.5,3,3.5])hit(beat,42,beat%1?46:63);
    hit(0,36,92);hit(1.75,36,76);hit(2.5,36,78);hit(1,38,83);hit(3,38,87);
  } else if(id==='kites') {
    bass(0,bar%2?5:1,1.4,77);
    keys.forEach((k,i)=>note(1,t+1+i*.25,k,.60,65+light-i*3));
    if(bar%2===0)strum(2,.51,57);
    hit(0,36,55);hit(1,70,44);hit(2,37,43);
  } else {
    bass(0,1,.66,87);bass(1,3,.42,75);bass(2,5,.69,80);if(bar%2)bass(3,6,.51,74);
    for(const beat of [.5,1.5,2.5,3.5])strum(beat,.17,75);
    for(const beat of [0,.5,1,1.5,2,2.5,3,3.5])hit(beat,42,beat%1?57:40);
    hit(0,36,67);hit(2,36,85);hit(2,37,82);if(bar%2)hit(3.5,46,51);
  }
  if(endFill&&!hush) {
    hit(tune.beats-.5,finale?49:38,finale?58:52);
    if(!finale)hit(tune.beats-.25,38,58);
  }
}

function movementTake(tune, move, side) {
  const chords=tune.changes[move.chords].split(' ').map(symbol=>harmonies[symbol]);
  if(move.name==='home'||move.name==='reprise') chords[7]=harmonies[tune.id==='caper'?'i':'I'];
  return record(tune.id+'-'+move.name+'-'+side,tune,8,tune.instruments,note=>{
    for(let bar=0;bar<8;bar++){
      const chord=chords[bar],t=bar*tune.beats,extra=side==='lift';
      rhythm(tune,move.name,bar,chord,chords[(bar+1)%8],note,extra);
      const line=tune.hooks[move.hooks[bar]].split(' ');
      const responding=(bar%4===1||bar%4===3);
      const exchanged=['answer','bridge','solo','hush'].includes(move.name);
      const ch=responding!==exchanged?3:0;
      const root=register(tune.tonic+chord[0], tune.id==='caper'&&ch===0?48:57);
      if(extra) {
        const beat=tune.beats===3?1:1.5;
        const keys=[3,5].map(d=>register(tune.tonic+degree(chord,d),61));
        if(bar%2===0)keys.forEach(k=>note(4,t+beat,k,.42,77));
        if(bar%2===1||bar===6){
          for(const [i,d] of [5,6,3].entries())note(4,t+tune.beats-1.5+i*.5,register(tune.tonic+degree(chord,d),65),.27,i===0?78:68);
        }
        continue;
      }
      const quiet=move.name==='hush';
      const sparse=quiet && bar%2===1;
      for(const [i,token] of line.entries()){
        const [beat,d,len]=token.split(':').map(Number);
        if(sparse && i%2)continue;
        let key=root+degree(chord,d)-chord[0];
        if(ch===3 && (tune.id==='mango'||tune.id==='kites'))key+=12;
        if(tune.id==='velcro'&&ch===0)key+=12;
        if(move.name==='solo' && i===1 && len>.32) {
          note(ch,t+beat,key+2,.12,61);note(ch,t+beat+.13,key,len-.14,81);
        } else note(ch,t+beat,key,len*(quiet?1.10:1),(quiet?68:84)+(i===0?4:0)+(bar===6?3:0));
      }
      if((move.name==='bridge'||move.name==='reprise') && bar%2===0){
        note(ch===0?3:0,t+tune.beats-1,register(tune.tonic+degree(chord,3),55),.75,59);
      }
    }
  });
}

const cueNames=['roundhouse','scruff','save','interval','curtain','roundhouseEncore','scruffEncore'];
function eventTake(tune,name) {
  const interval=name==='interval', curtain=name==='curtain', short=name==='save';
  const encore=name.endsWith('Encore'), roundhouse=name.startsWith('roundhouse'), scruff=name.startsWith('scruff');
  const bars=curtain?3:interval?2:short?1:2, beats=tune.beats;
  const programs=[roundhouse?57:scruff?71:interval?8:curtain?56:12, 0,32,encore?(roundhouse?56:12):73,9];
  const key=register(tune.tonic,60), minor=tune.id==='caper';
  return record(tune.id+'-'+name,tune,bars,programs,note=>{
    // Beats are written on a four-beat grid; keep the same contour in the waltz.
    const factor=beats/4;
    const tuneLine=name==='roundhouseEncore'?[[0,0,.38],[.55,0,.25],[1,4,.46],[1.75,7,.72],[3,12,.55],[4,9,.50],[4.75,7,.49],[5.5,12,1.7]]:
      name==='scruffEncore'?[[0,12,.30],[.5,9,.34],[1,7,.33],[1.5,4,.48],[2.5,7,.30],[3,9,.51],[4,12,.49],[4.75,14,.46],[5.5,12,1.65]]:
      name==='roundhouse'?[[0,0,.62],[.8,0,.30],[1.5,4,.45],[2,7,.8],[3.2,5,.43],[4,4,.39],[4.65,7,.50],[5.4,12,1.8]]:
      name==='scruff'?[[0,12,.28],[.5,9,.29],[1,7,.29],[1.5,4,.54],[2.45,5,.28],[2.95,7,.56],[4,9,.33],[4.5,11,.36],[5,12,2.2]]:
      short?[[0,12,.27],[.45,7,.26],[.95,4,.28],[1.65,7,.65]]:
      interval?[[0,4,1.05],[1.5,7,1.05],[3,9,.64],[4,7,1.12],[5.6,0,1.50]]:
      [[0,0,.56],[.75,4,.45],[1.5,7,.82],[3,9,.55],[4,7,1.03],[5.5,5,.57],[6.5,2,.65],[8,4,.65],[9,12,2.3]];
    for(const [i,[beat,pitch,len]] of tuneLine.entries()){
      const k=key+pitch-(minor && [4,9,11].includes(pitch)?1:0);
      note(0,beat*factor,k,len*factor,interval?73:86);
      if(curtain||name==='scruff'&&i===tuneLine.length-1)note(4,beat*factor+.025,k+12,len*factor*.88,64);
    }
    if(encore){
      // The returning team gets an answering player and a little drum pickup into its final note.
      for(const [beat,pitch] of [[1.9,0],[2.5,4],[3.25,7],[4.5,4],[5.5,7]]) {
        note(3,beat*factor,key+pitch-(minor&&pitch===4?1:0),.46*factor,79);
      }
      for(const [i,drum] of [50,48,45].entries())note(9,(4.6+i*.30)*factor,drum,.14,63+i*4);
    }
    for(let b=0;b<bars;b++){
      const root=curtain && b===1?7:0,third=root+(minor&&root===0?3:4);
      note(2,b*beats,register(key+root,38),beats*.58,short?63:78);
      for(const p of [root,third,root+7])note(1,b*beats+.10,key+p-12,beats*.65,interval?54:65);
      if(!interval&&!short){note(9,b*beats,b===bars-1?49:36,.15,66);if(b<bars-1)for(const at of [beats-1,beats-.5,beats-.25])note(9,b*beats+at,38,.15,60);}
    }
  });
}

const manifest=[];
for(const tune of tunes){
  const pairs=movements.map(move=>[movementTake(tune,move,'band'),movementTake(tune,move,'lift')]);
  let square=0, count=0;
  for(const [band] of pairs)for(let i=0;i<band.frames*2;i+=17){square+=(band.audio[i]/32768)**2;count++;}
  const gain=.144/Math.sqrt(square/count);
  if(!Number.isFinite(gain)||gain>40)throw new Error('Silent recording: '+tune.title);
  for(const [i,pair] of pairs.entries())writePack(tune.id+'-'+movements[i].name,pair,gain);
  const cues=cueNames.map(name=>eventTake(tune,name));
  writePack(tune.id+'-cues',cues,gain*.90);
  let at=0;
  const lengths=cues.map(cue=>{const start=at; at+=cue.audio.length/2;return [start,at-start];});
  manifest.push({id:tune.id,title:tune.title,bpm:tune.bpm,beats:tune.beats,frames:pairs[0][0].frames,
    takeFrames:pairs[0][0].audio.length/2,cues:Object.fromEntries(cueNames.map((name,i)=>[name,lengths[i]]))});
  console.log(tune.title+' recorded, '+(pairs[0][0].frames/rate*8).toFixed(1)+' seconds of arrangements.');
}
writeFileSync('src/stadium-score.json',JSON.stringify({rate,movements:movements.map(m=>m.name),tunes:manifest},null,2)+'\n');
