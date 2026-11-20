import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BandReactions, MusicProgram, scoreLibrary } from '../src/music-program';

test('a stadium programme plays all 48 recordings before reusing one and spaces out returning tunes', () => {
  const first = new MusicProgram('cup'), same = new MusicProgram('cup'), other = new MusicProgram('rivals');
  const heard: string[] = [], alternate: string[] = [], recent: string[] = [];
  for (let i = 0; i < 144; i++) {
    const phrase = first.next(), alternative = other.next();
    assert.deepEqual(phrase, same.next());
    heard.push(phrase.tune.id + '/' + phrase.movement);
    alternate.push(alternative.tune.id + '/' + alternative.movement);
    if (i%4 === 0) {
      assert.ok(!recent.includes(phrase.tune.id));
      recent.push(phrase.tune.id);
      if (recent.length>4) recent.shift();
    } else assert.equal(phrase.tune.id,recent.at(-1));
  }
  assert.equal(new Set(heard.slice(0,48)).size,48);
  assert.notDeepEqual(heard,alternate);
});

test('the band follows sustained passes, shots and rulings and gives each side its own goal melody', () => {
  const response = new BandReactions();
  response.react({kind:'pass',team:0,tick:60},1);
  response.react({kind:'pass',team:0,tick:120},2);
  assert.equal(response.until,0);
  response.react({kind:'interception',team:1,tick:150},2.5);
  response.react({kind:'pass',team:1,tick:180},3);
  response.react({kind:'pass',team:1,tick:240},4);
  response.react({kind:'pass',team:1,tick:360},6);
  assert.equal(response.until,11);
  response.react({kind:'shot',team:1,tick:480},8);
  assert.ok(response.until>13);
  assert.equal(response.react({kind:'save',tick:540},9)?.name,'save');
  assert.equal(response.react({kind:'save',tick:660},11),undefined);
  assert.equal(response.react({kind:'goal',team:0,tick:900},15)?.name,'roundhouse');
  assert.equal(response.until,0);
  assert.equal(response.react({kind:'goal',team:1,tick:1500},25)?.name,'scruff');
  assert.equal(response.react({kind:'goal',team:1,tick:2600},44)?.name,'scruffEncore');
  assert.equal(response.react({kind:'goal',team:0,tick:3600},60)?.name,'roundhouseEncore');
  assert.equal(response.react({kind:'halftime',tick:36000},600)?.name,'interval');
  assert.equal(response.react({kind:'fulltime',tick:72000},1200)?.name,'curtain');
  response.react({kind:'match-start',tick:72637},1210);
  assert.equal(response.react({kind:'goal',team:0,tick:73200},1220)?.name,'roundhouse');
});

test('the shipped stereo recordings contain the complete score and every referenced event cue', () => {
  const hashes = new Set<string>();
  let seconds = 0;
  function verify(name: string, frames: number) {
    const file = readFileSync(new URL('../public/music/stadium-band/' + name + '.ogg',import.meta.url));
    assert.equal(file.toString('ascii',29,35),'vorbis');
    assert.equal(file[39],2);
    assert.equal(file.readUInt32LE(40),scoreLibrary.rate);
    let page = 0, granule = 0n;
    while (page < file.length) {
      assert.equal(file.toString('ascii',page,page+4),'OggS');
      granule = file.readBigUInt64LE(page+6);
      const segments = file[page+26];
      const bytes = file.subarray(page+27,page+27+segments).reduce((sum,n)=>sum+n,0);
      page += 27+segments+bytes;
    }
    assert.equal(page,file.length);
    assert.equal(granule,BigInt(frames));
    hashes.add(createHash('sha256').update(file).digest('hex'));
  }
  for (const tune of scoreLibrary.tunes) {
    assert.ok(Math.abs(tune.frames/scoreLibrary.rate - 8*tune.beats*60/tune.bpm) < .001);
    assert.ok(tune.takeFrames > tune.frames + .8*scoreLibrary.rate);
    for (const name of scoreLibrary.movements) verify(tune.id+'-'+name,2*tune.takeFrames);
    let end = 0;
    assert.equal(Object.keys(tune.cues).length,7);
    for (const [start,length] of Object.values(tune.cues)) {
      assert.equal(start,end);
      assert.ok(length/scoreLibrary.rate > 1.9);
      end += length;
    }
    verify(tune.id+'-cues',end);
    seconds += scoreLibrary.movements.length*tune.frames/scoreLibrary.rate;
  }
  assert.equal(hashes.size,54);
  assert.ok(seconds > 12*60);
});
