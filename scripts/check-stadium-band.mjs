import assert from 'node:assert/strict';

// Exercise the actual stereo capture bus with the booth and effects faders down.
export async function verifyStadiumBand(browser, origin, collect) {
  const context = await browser.newContext({viewport:{width:720,height:405}});
  const address = origin+'/?mode=capture&quality=low&fps=30&start=record&seed=grandstand-54&audio=auto&music=on&commentary=off';
  try {
    const page = await context.newPage();
    collect(page);
    async function ready(tab) {
      await tab.waitForFunction(() => !!window.rushCapture);
      await tab.keyboard.press('o');
      await tab.getByRole('button',{name:'Enable audio'}).click();
      await tab.getByRole('button',{name:'Close'}).click();
      await tab.waitForFunction(() => window.rushCapture.status().musicReady && window.rushCapture.status().audio === 'on');
    }
    await page.goto(address+'&session=new');
    await ready(page);
    const check = await page.evaluate(async () => {
      const api = window.rushCapture;
      const wait = ms => new Promise(r=>setTimeout(r,ms));
      const input = label => Array.from(document.querySelectorAll('#operator label')).find(row=>row.textContent===label).querySelector('input');
      const set = (slider,value) => {slider.value=value;slider.dispatchEvent(new Event('input'));};
      set(input('Effects volume'),'0');
      const fader=input('Music volume'), original=fader.value;
      const track=api.audioTrack(), context=new AudioContext();
      await context.resume();
      const probe=context.createAnalyser(), data=new Float32Array(probe.fftSize);
      const node=context.createMediaStreamSource(new MediaStream([track]));
      node.connect(probe);
      function rms() {
        probe.getFloatTimeDomainData(data);
        return Math.sqrt(data.reduce((n,v)=>n+v*v,0)/data.length);
      }
      async function level() { let peak=0;for(let i=0;i<8;i++){await wait(70);peak=Math.max(peak,rms());}return peak; }
      try {
        const preroll=await level(), before=api.status().music.phrases;
        api.begin();
        await wait(650);
        const playing=await level();
        set(fader,'0'); await wait(700);
        const muted=await level();
        set(fader,original); await wait(750);
        const resumed=await level();
        const titles=new Set(), cues=new Set();
        let lifted=false, maxSources=0, maxCache=0, phrase=0, quietRun=0, longestQuiet=0;
        const start=performance.now();
        while(performance.now()-start<76000){
          const music=api.status().music, signal=rms();
          if(music.title)titles.add(music.title);
          if(music.lastCue)cues.add(music.lastCue);
          lifted ||= music.lifted;
          maxSources=Math.max(maxSources,music.sources);maxCache=Math.max(maxCache,music.cached);
          phrase=music.phrases;
          quietRun=signal<.00035?quietRun+1:0;longestQuiet=Math.max(longestQuiet,quietRun);
          if(titles.size>=2 && phrase>=5 && cues.has('save') && cues.has('scruffEncore'))break;
          await wait(100);
        }
        return {preroll,before,playing,muted,resumed,titles:[...titles],cues:[...cues],lifted,maxSources,maxCache,phrase,longestQuiet};
      } finally {node.disconnect();track.stop();await context.close();}
    });
    assert.equal(check.before,0);
    assert.ok(check.preroll<.0001 && check.playing>.003 && check.muted<.00035 && check.resumed>.003,JSON.stringify(check));
    assert.ok(check.titles.length>=2 && check.phrase>=5 && check.lifted,JSON.stringify(check));
    assert.ok(['save','scruff','scruffEncore'].every(cue=>check.cues.includes(cue)),JSON.stringify(check));
    assert.ok(check.maxSources<=7 && check.maxCache<=5 && check.longestQuiet<7,JSON.stringify(check));
    const checkpoint=await page.evaluate(()=>JSON.parse(localStorage.getItem('capture.zeerush.match.v2')));
    assert.ok(checkpoint);
    const periodCues=[];
    for(const [ticks,name] of [[36000,'interval'],[72000,'curtain']]){
      const edge=await context.newPage();collect(edge);
      await edge.addInitScript(cp=>localStorage.setItem('capture.zeerush.match.v2',JSON.stringify(cp)),{...checkpoint,ticks:ticks-155});
      await edge.goto(address+'&session=resume');await ready(edge);
      await edge.evaluate(()=>window.rushCapture.begin());
      await edge.waitForFunction(cue=>window.rushCapture.status().music.lastCue===cue,name,{timeout:10000});
      periodCues.push(name);
      await edge.close();
    }
    return {...check,periodCues};
  } finally {await context.close();}
}
