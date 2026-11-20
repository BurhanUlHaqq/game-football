import './styles.css';
import { MatchAudio } from './audio';
import { BroadcastLayout } from './broadcast-layout';
import { Commentary } from './commentary';
import type { CommentaryCall } from './commentary';
import { CommentaryBooth } from './commentary-booth';
import { formatTime, FULLTIME_BREAK, GOAL_BREAK, HALFTIME_BREAK, HALF_TICKS, KICKOFF_TICKS, MATCH_TICKS, STEP } from './football';
import type { MatchEvent, MatchSummary, Team } from './football';
import { connectHeroPicker } from './hero-picker';
import { HEROES } from './heroes';
import { initializePhysics, Match } from './match';
import { drawPortrait } from './portraits';
import { ProductionLog, subtitles } from './production';
import { BroadcastRenderer } from './renderer';
import { MatchReplay } from './replay';
import { browserStorage, hudModes, loadCheckpoint, qualities, rates, saveCheckpoint, savePreferences, settingsFrom } from './settings';
import type { Preferences } from './settings';
import { CAPTAINS, CAST, MatchShow, momentTime } from './show';
import type { CastRecap, ShowMoment } from './show';

function byId<T extends HTMLElement = HTMLElement>(id: string) {
  const item = document.getElementById(id);
  if (!item) throw new Error(`Required element missing: ${id}`);
  return item as T;
}

type GameDebug = { focus: (id: number | null) => void; snapshot: () => unknown };
type CaptureControls = { begin: () => void; finish: () => ReturnType<ProductionLog['snapshot']>; status: () => unknown; audioTrack: () => MediaStreamTrack | undefined };
declare global { interface Window { rush?: GameDebug; rushCapture?: CaptureControls } }

async function start() {
  const query = new URLSearchParams(location.search);
  const local = browserStorage();
  const storage = query.get('mode') === 'capture' && local ? {
    getItem: (key: string) => local.getItem(`capture.${key}`),
    setItem: (key: string, value: string) => local.setItem(`capture.${key}`, value),
    removeItem: (key: string) => local.removeItem(`capture.${key}`),
  } : local;
  const settings = settingsFrom(location.search, storage);
  const production = settings.mode === 'capture';
  let awaitingRecording = production && query.get('start') === 'record';
  const showCaptions = !production || query.get('captions') !== 'off';
  const edit = production ? new ProductionLog(settings.seed, settings.names) : undefined;
  byId('broadcast').dataset.mode = settings.mode;
  await initializePhysics();
  const checkpoint = loadCheckpoint(storage, settings);
  const match = new Match(settings.seed, checkpoint);
  const view = new BroadcastRenderer(byId('scene'), match, settings.quality, settings.names);
  view.camera.production = production;
  const musicSeed = query.has('seed') ? settings.seed : String(crypto.getRandomValues(new Uint32Array(1))[0]);
  const audio = new MatchAudio(settings, musicSeed, !awaitingRecording);
  const commentary = new Commentary(settings.seed);
  const show = new MatchShow(production);
  const hud = byId('hud');
  const overlay = byId('callout');
  const eventLabel = byId('event-label');
  const eventText = byId('event-text');
  const eventDetail = byId('event-detail');
  const clock = byId('clock');
  const halfLabel = byId('half-label');
  const matchNumber = byId('match-number');
  const clockProgress = byId('clock-progress');
  const caption = byId('commentary');
  const booth = new CommentaryBooth(byId<HTMLCanvasElement>('commentary-booth'));
  const unlockSound = byId<HTMLButtonElement>('sound-unlock');
  caption.dataset.subtitles = showCaptions ? 'on' : 'off';
  const captionText = byId('commentary-text');
  const lineRuling = byId('line-ruling');
  const rulingTitle = byId('ruling-title'), rulingDetail = byId('ruling-detail');
  let rulingUntil = 0;
  const captionHost = byId('commentary-host');
  const captionEvent = byId('commentary-event');
  const report = byId('match-report');
  const reportTitle = byId('report-title');
  const reportMatch = byId('report-match');
  const reportScore = byId('report-score');
  const reportResult = byId('report-result');
  const reportKickoff = byId('report-kickoff');
  const reportShots = byId('report-shots');
  const reportSaves = byId('report-saves');
  const reportStar = byId('report-star');
  const reportSeries = byId('report-series');
  const highlightCard = byId('report-highlight');
  const highlightImage = byId<HTMLCanvasElement>('highlight-image');
  const highlightClock = byId('highlight-clock');
  const highlightName = byId('highlight-name');
  const highlightStory = byId('highlight-story');
  const rivals = byId('rivals');
  const recapCard = byId('recap');
  const recapPortrait = byId<HTMLCanvasElement>('recap-portrait');
  const recapName = byId('recap-name');
  const recapDetail = byId('recap-detail');
  const tags = byId('capture-players');
  const players = Array.from(tags.querySelectorAll('span'));
  const layout = production ? undefined : new BroadcastLayout(hud, [caption, overlay, recapCard, rivals]);
  const replay = new MatchReplay(highlightImage);
  const captureFrame = (target: CanvasRenderingContext2D) => view.copyFrame(target);
  byId('report-a').textContent = settings.names[0];
  byId('report-b').textContent = settings.names[1];
  const audioStatus = document.createElement('p');
  const editStatus = document.createElement('p');
  const operator = byId('operator');
  const diagnostics = byId('diagnostics');
  const scores = [byId('score-a'), byId('score-b')];
  const persist = () => saveCheckpoint(storage, match.checkpoint(settings));
  const controller = new AbortController();
  const signal = controller.signal;
  const favoriteHero = connectHeroPicker(byId<HTMLDialogElement>('hero-picker'), byId<HTMLButtonElement>('hero-toggle'), settings.names, storage, hero => {
    view.favorite = production || settings.hud === 'off' ? undefined : hero;
  }, signal);
  let hideCallout = 0;
  let hideCaption = 0;
  let onAir: { call: CommentaryCall; tick: number; audible: boolean } | undefined;
  let hideReport = 0;
  let lastPlayCallout = -1000;
  let displayedRecap: CastRecap | undefined;
  let lastText = -1;
  let lastTools = 0;
  let nextSave = match.tick + 900;
  let accumulator = 0;
  let lastTime = 0;
  let nextDraw = 0;
  let lastRender = 0;
  let handle = 0;
  let droppedSeconds = 0;
  let warningShown = false;
  let measuredFrames = 0;
  const frameBuckets = [0, 0, 0, 0, 0, 0, 0, 0];

  hud.hidden = settings.hud === 'off';
  operator.hidden = settings.mode !== 'operator';
  diagnostics.hidden = settings.mode !== 'debug';
  match.measure = settings.mode === 'debug';
  for (const [id, name] of ['team-a', 'team-b'].map((id, i) => [id, settings.names[i]] as const)) {
    const title = byId(id);
    title.textContent = production ? name.replace(/ FC$/i, '') : name;
    title.title = name;
    const crest = title.parentElement?.querySelector('.crest');
    if (crest) crest.textContent = Array.from(name.toUpperCase())[0];
  }

  function updateScores() {
    for (let i = 0; i < 2; i++) {
      const score = match.scores[i];
      scores[i].textContent = score >= 10000 ? new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(score) : String(score);
      scores[i].title = String(score);
      scores[i].setAttribute('aria-label', String(score));
    }
  }
  updateScores();

  const stamp = (summary?: MatchSummary, fulltime = false) => ({ tick: match.tick, now: performance.now(),
    match: summary?.number ?? match.number, matchTicks: fulltime ? MATCH_TICKS : match.matchTicks, score: summary?.scores ?? match.scores });

  function showLineRuling(title: string, detail: string, until: number) {
    lineRuling.hidden = false;
    rulingTitle.textContent = title;
    rulingDetail.textContent = detail;
    rulingUntil = until;
  }

  function callout(label: string, detail: string, team: Team | undefined, ticks: number, story = '') {
    overlay.hidden = false;
    eventLabel.textContent = label;
    eventText.textContent = detail;
    eventDetail.textContent = story;
    eventDetail.hidden = !story;
    overlay.dataset.team = team === undefined ? '' : String(team);
    hideCallout = match.tick + ticks;
  }

  function radio(call: CommentaryCall | undefined, moment?: ShowMoment, summary?: MatchSummary, fulltime = false) {
    if (!call) return;
    if (showCaptions && (production || moment)) overlay.hidden = true;
    caption.hidden = false;
    captionText.textContent = call.text;
    captionHost.textContent = caption.dataset.host = call.host;
    caption.dataset.intro = String(call.id.startsWith('boothHello') || call.id.startsWith('openingBooth'));
    const team = moment?.kind === 'goal' ? moment.team : undefined;
    caption.dataset.team = team === undefined ? '' : String(team);
    captionEvent.hidden = !moment;
    if (moment) captionEvent.textContent = `${moment.beat === 'rematch' ? 'REMATCH · ' : ''}${moment.label} · ${moment.name}`;
    hideCaption = match.tick + call.ticks;
    const audible = audio.speak(call.id, call.priority);
    onAir = { call, tick: match.tick, audible };
    if (edit?.active) edit.call(call, stamp(summary, fulltime), hideCaption, audible);
  }

  function showReport(event: MatchEvent, feature: ShowMoment | undefined) {
    const summary = event.summary;
    if (!summary) return;
    lineRuling.hidden = true;
    byId('music-credit').hidden = audio.status !== 'on' || !audio.musicReady || !settings.music;
    const fulltime = event.kind === 'fulltime';
    report.hidden = false;
    report.dataset.phase = event.kind;
    report.dataset.team = fulltime && event.team !== undefined ? String(event.team) : '';
    reportTitle.textContent = fulltime ? 'FULL-TIME' : 'HALF-TIME';
    reportMatch.textContent = `MATCH ${String(summary.number).padStart(2, '0')}`;
    reportScore.textContent = summary.scores.join(' – ');
    reportResult.hidden = reportKickoff.hidden = !fulltime;
    if (fulltime) reportResult.textContent = event.team === undefined ? 'MATCH DRAWN' : `${settings.names[event.team]} WINS`;
    reportShots.textContent = `Shots ${summary.shots.join(' – ')}`;
    reportSaves.textContent = `Saves ${summary.saves.join(' – ')}`;
    const star = summary.standout === undefined ? undefined : match.players[summary.standout];
    reportStar.textContent = star ? `Standout · ${CAST[star.id]} #${star.number}` : fulltime ? 'Next match coming up' : 'Teams swap ends';
    reportSeries.textContent = fulltime ? `Series ${match.wins.join('–')} · ${match.draws} ${match.draws === 1 ? 'draw' : 'draws'}` : 'Score carries over';
    hideReport = match.tick + (fulltime ? FULLTIME_BREAK : HALFTIME_BREAK) + KICKOFF_TICKS;
    overlay.hidden = true;
    highlightCard.hidden = !feature;
    highlightImage.hidden = !replay.start(feature, match.tick);
    if (feature) {
      highlightClock.textContent = `PLAY OF THE ${fulltime ? 'SECOND HALF' : 'FIRST HALF'} · ${momentTime(feature)}`;
      highlightName.textContent = `${feature.label} · ${feature.name}`;
      highlightStory.textContent = feature.story;
    }
  }

  function react(event: MatchEvent) {
    audio.react(event);
    audio.arena(view.react(event));
    if (event.kind === 'halftime' || event.kind === 'fulltime') {
      const highlight = show.takeHighlight(event.kind === 'fulltime', event.tick);
      show.react(event, match.scores);
      if (edit?.active) edit.event(event, stamp());
      showReport(event, highlight);
      updateScores();
      persist();
      radio(commentary.react(event, match.scores, undefined, highlightImage.hidden ? undefined : highlight), undefined, event.summary, event.kind === 'fulltime');
      return;
    }
    const moment = show.react(event, match.scores);
    if (edit?.active) edit.event(event, stamp(), moment);
    if (moment) audio.accent(moment);
    if (event.kind === 'half-start' || event.kind === 'match-start') {
      report.hidden = true;
      replay.reset();
    }
    if (event.kind === 'goal' || event.kind === 'kickoff') lineRuling.hidden = true;
    const call = commentary.react(event, match.scores, moment, undefined, show.recap);
    radio(call, moment);
    const visibleCall = call && showCaptions;
    const standoutSave = event.save?.move === 'dive' || event.save?.move === 'tip';
    if (event.kind === 'goal') {
      const team = event.team ?? 0;
      showLineRuling(event.detail === 'Own goal' ? 'OWN GOAL' : 'GOAL', settings.names[team], event.tick + GOAL_BREAK);
      if (visibleCall) captionEvent.hidden = true;
      if (!visibleCall) {
        if (production && !call) caption.hidden = true;
        callout(moment?.label ?? 'GOAL', moment?.player === undefined ? settings.names[team] : `${moment.name} · ${settings.names[team]}`, team, GOAL_BREAK);
      }
      updateScores();
      persist();
    } else if (event.kind === 'out' || event.kind === 'throw') {
      const ruling = event.kind === 'throw' ? 'BACK IN PLAY' : event.detail === 'over' ? 'OVER THE BAR' : event.detail === 'wide' ? 'WIDE OF THE POST' : 'OUT OF PLAY';
      showLineRuling(ruling, `${CAST[event.player!]} · ${event.restart?.toUpperCase()}`, event.kind === 'out' ? Infinity : event.tick + 88);
    } else if (!visibleCall && moment && report.hidden && (!production || caption.hidden) && (standoutSave ||
      ((moment.joke || moment.callback || moment.tick - lastPlayCallout > 1320) && match.tick >= hideCallout - 22))) {
      lastPlayCallout = moment.tick;
      callout(moment.label, moment.name, moment.team, 198, moment.story);
    }
    if (event.kind === 'recovery' && match.persistentFault && !warningShown) {
      warningShown = true;
      console.error('Rush Arena encountered repeated simulation faults.', event.detail);
      callout('MATCH RECOVERY', 'Repeated simulation faults', event.team ?? 0, 180);
    }
  }

  function apply() {
    hud.hidden = settings.hud === 'off';
    view.favorite = production || hud.hidden ? undefined : favoriteHero();
    view.setQuality(settings.quality);
    audio.update(settings);
    savePreferences(storage, settings);
  }

  function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    const preferences: Preferences = settings;
    preferences[key] = value;
    apply();
  }

  const title = document.createElement('h2');
  title.textContent = 'Broadcast controls';
  operator.append(title);

  function select<K extends 'quality' | 'hud' | 'fps'>(label: string, key: K, options: readonly Preferences[K][]) {
    const row = document.createElement('label');
    row.textContent = label;
    const field = document.createElement('select');
    for (const value of options) field.add(new Option(String(value), String(value), false, value === settings[key]));
    field.addEventListener('change', () => setPreference(key, options[field.selectedIndex]), { signal });
    row.append(field);
    operator.append(row);
  }
  select('Quality', 'quality', qualities);
  select('Target FPS', 'fps', rates);
  select('Scoreboard', 'hud', hudModes);

  for (const [label, key] of [['Master volume', 'master'], ['Commentary volume', 'commentary'], ['Effects volume', 'effects'], ['Music volume', 'music']] as const) {
    const row = document.createElement('label');
    row.textContent = label;
    const field = document.createElement('input');
    field.type = 'range'; field.min = '0'; field.max = '1'; field.step = '.01'; field.value = String(settings[key]);
    field.addEventListener('input', () => setPreference(key, Number(field.value)), { signal });
    row.append(field); operator.append(row);
  }

  const actions = document.createElement('div');
  actions.className = 'operator-actions';
  operator.append(actions, audioStatus);
  const playingMusic = document.createElement('small');
  operator.append(playingMusic);
  const musicCredit = document.createElement('a');
  musicCredit.href = `${import.meta.env.BASE_URL}licenses/stadium-music.txt`;
  musicCredit.textContent = 'Stadium music credit for your stream';
  musicCredit.target = '_blank';
  operator.append(musicCredit);
  function button(label: string, act: () => void) {
    const item = document.createElement('button');
    item.type = 'button'; item.textContent = label;
    item.addEventListener('click', act, { signal });
    actions.append(item);
    return item;
  }
  button('Enable audio', () => { setPreference('audio', 'auto'); audio.enable(true); });
  const unlock = () => { if (settings.audio === 'auto' && audio.status === 'blocked') audio.enable(true); };
  window.addEventListener('pointerdown', unlock, { signal });
  unlockSound.addEventListener('click', unlock, { signal });
  button('Mute', () => setPreference('audio', 'muted'));
  button('Fullscreen', () => {
    const action = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    void action.catch(() => { audioStatus.textContent = 'Fullscreen is unavailable in this capture surface.'; });
  });
  const toggleDiagnostics = () => { diagnostics.hidden = !diagnostics.hidden; match.measure = !diagnostics.hidden || settings.mode === 'debug'; };
  button('Diagnostics', toggleDiagnostics);
  if (edit) {
    const begin = () => {
      if (awaitingRecording) {
        awaitingRecording = false;
        lastTime = 0;
        audio.startMusic();
      }
      edit.begin(match.tick, performance.now());
      logButton.textContent = 'Stop marker log';
    };
    const finish = () => { logButton.textContent = 'Start marker log'; return edit.snapshot(performance.now(), true); };
    const logButton = button('Start marker log', () => { if (edit.active) finish(); else begin(); });
    const download = (extension: 'json' | 'srt') => {
      const take = edit.snapshot(performance.now());
      if (!take) { editStatus.textContent = 'Start a marker log to export this take.'; return; }
      const json = extension === 'json';
      const blob = new Blob([json ? JSON.stringify(take, null, 2) : subtitles(take.captions)], { type: json ? 'application/json' : 'text/plain' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `rush-arena-${settings.seed}-take-${take.startTick}.${extension}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    };
    button('Download edit log', () => download('json'));
    button('Download captions', () => download('srt'));
    operator.append(editStatus);
    window.rushCapture = { begin, finish, audioTrack: () => audio.captureTrack(), status: () => ({ tick: match.tick, state: match.state, score: [...match.scores],
      fps: settings.fps, audio: audio.status, audioReady: audio.commentaryReady, speech: audio.commentaryPlayed, musicReady: audio.musicReady, music: audio.musicStatus, crowdReactions: audio.crowdReactions,
      framing: view.framing(), arena: view.arena.get(match.tick), booth: currentHost(), playing: edit.active }) };
  }
  button('Close', () => { operator.hidden = true; });

  window.addEventListener('keydown', ev => {
    if (ev.repeat || ev.altKey || ev.ctrlKey || ev.metaKey || ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement) return;
    if (ev.key.toLowerCase() === 'o') operator.hidden = !operator.hidden;
    if (ev.key.toLowerCase() === 'd') toggleDiagnostics();
    if (ev.key === 'Escape') operator.hidden = true;
  }, { signal });

  function currentHost() {
    if (!onAir || match.tick >= hideCaption) return;
    const { call, audible } = onAir;
    return { id: call.id, host: call.host, reply: call.exchange?.reply, audible };
  }

  function snapshot() {
    return { tick: match.tick, state: match.state, stateAge: match.tick - match.stateTick, scores: [...match.scores], restarted: !!checkpoint, seed: settings.seed,
      matchNumber: match.number, half: match.half, matchTicks: match.matchTicks, seriesGoals: [...match.seriesGoals], wins: [...match.wins], draws: match.draws, attack: [match.attack(0), match.attack(1)],
      show: { moment: show.moment, celebration: show.getCelebration(match.tick), highlight: show.highlight?.label, captured: replay.captured, replayFrames: replay.frameCount, replayFrame: replay.frameIndex, recap: show.recap, arena: view.arena.get(match.tick), booth: currentHost(), framing: view.framing(), gestures: match.players.map(p => show.getGesture(p.id, match.tick)?.kind ?? null) },
      restartTeam: match.restartTeam, goalId: match.goalId, owner: match.owner?.id ?? null, ballVisible: match.ballVisible, physicsMs: match.physicsMs,
      render: view.info(), resources: match.resources(), audio: audio.status, music: audio.musicStatus, commentaryReady: audio.commentaryReady, commentaryPlayed: audio.commentaryPlayed, lastSpoken: audio.lastSpoken, effectsPlayed: audio.effectsPlayed, accentsPlayed: audio.accentsPlayed, voices: audio.activeVoices, maxVoices: 10, droppedSeconds, measuredFrames, frameBuckets: [...frameBuckets],
      stats: match.stats, ball: match.currentBall, flight: match.flight, history: match.history, players: match.players.map(({ id, team, role, number, x, z, intent, pose, keeperReady }) => ({ id, team, role, number, x, z, intent, keeperReady, pose: pose?.kind ?? null, poseAge: pose?.age ?? null })) };
  }

  if (settings.mode === 'debug') window.rush = {
    focus: id => { if (id === null || (Number.isInteger(id) && id >= 0 && id < match.players.length)) view.camera.focus = id; },
    snapshot,
  };

  function updateInterface(now: number) {
    const lineView = match.state === 'throw-in' || match.state === 'goal';
    if ((hud.dataset.lineView === 'true') !== lineView) hud.dataset.lineView = String(lineView);
    const second = Math.floor(match.tick / 60);
    if (lastText !== second) {
      clock.textContent = formatTime(match.matchTicks);
      audio.closeFinish(match.state === 'live' && match.half === 2 && MATCH_TICKS-match.matchTicks <= 60*60 && Math.abs(match.scores[0]-match.scores[1]) <= 1);
      matchNumber.textContent = `MATCH ${String(match.number).padStart(2, '0')}`;
      clockProgress.style.width = `${100 * (match.matchTicks % HALF_TICKS) / HALF_TICKS}%`;
      lastText = second;
    }
    const phase = match.state === 'halftime' ? 'HALF-TIME' : match.state === 'fulltime' ? 'NEXT MATCH' : match.half === 1 ? '1ST HALF' : '2ND HALF';
    if (halfLabel.textContent !== phase) halfLabel.textContent = phase;
    const goalTeam = match.state === 'goal' ? show.getCelebration(match.tick)?.team : undefined;
    const goalTheme = goalTeam === undefined ? '' : String(goalTeam);
    if (hud.dataset.goalTeam !== goalTheme) hud.dataset.goalTeam = goalTheme;
    if (!lineRuling.hidden && match.tick > rulingUntil) lineRuling.hidden = true;
    if (!overlay.hidden && match.tick > hideCallout) overlay.hidden = true;
    if (!caption.hidden && match.tick >= hideCaption) caption.hidden = true;
    if (onAir && match.tick < hideCaption) {
      const { call } = onAir;
      const elapsed = (match.tick - onAir.tick) / 60;
      if (!onAir.audible && audio.commentaryReady && audio.status === 'on' && audio.speak(call.id, call.priority, elapsed)) {
        onAir.audible = true;
        edit?.markAudible(call.id);
      }
      if (!hud.hidden && !caption.hidden) booth.draw(call.host, match.tick, audio.mouthLevel(call.id, elapsed), caption.dataset.intro === 'true');
    }
    unlockSound.hidden = production || match.tick < 90 || audio.status !== 'blocked';
    if (!report.hidden && match.tick > hideReport) report.hidden = true;
    if (!report.hidden && !reportKickoff.hidden) {
      const untilKickoff = hideReport - match.tick;
      const next = `Next kickoff in ${Math.max(1, Math.ceil(untilKickoff / 60))}s`;
      if (reportKickoff.textContent !== next) reportKickoff.textContent = next;
      if (untilKickoff < FULLTIME_BREAK + KICKOFF_TICKS - 150) highlightCard.hidden = true;
    }
    rivals.hidden = production || show.introUntil <= match.tick || !report.hidden || !overlay.hidden || goalTeam !== undefined;
    const recap = show.recap;
    recapCard.hidden = production || !recap || recap.until <= match.tick || !report.hidden || goalTeam !== undefined;
    if (!recapCard.hidden && recap && recap !== displayedRecap) {
      displayedRecap = recap;
      const name = CAST[recap.player];
      const hero = HEROES[recap.player];
      recapName.textContent = `${name} · ${hero.title}`;
      recapDetail.textContent = recap.keeper !== undefined && recap.saves
        ? `${CAST[recap.keeper]} stopped ${name} ${recap.saves === 1 ? 'once' : `${recap.saves} times`}`
        : recap.activity ? `${hero.look} · ${recap.activity} ${hero.stat[recap.activity === 1 ? 0 : 1]}` : hero.look;
      drawPortrait(recapPortrait, recap.player);
    }
    if (!report.hidden) replay.update(match.tick);
    if (now - lastTools < 400) return;
    lastTools = now;
    if (!operator.hidden) {
      const messages = { on: 'Audio is active.', blocked: 'Select Enable audio to play sound.', muted: 'Audio is muted.', unavailable: 'Audio is unavailable in this browser.' };
      audioStatus.textContent = messages[audio.status];
      const title = settings.music && audio.status === 'on' && audio.musicTitle;
      playingMusic.hidden = !title;
      if (title) playingMusic.textContent = 'Now playing · ' + title;
      if (edit?.active) editStatus.textContent = 'Marker log is running.';
      else if (edit) editStatus.textContent = 'Start the marker log with your recording.';
    }
    if (!diagnostics.hidden) {
      const { frameMs, fps, renderMs, pixelWidth, pixelHeight, viewportWidth, viewportHeight, calls, geometries, textures, scale, particles } = view.info();
      const s = match.stats;
      diagnostics.textContent = [
        `${fps.toFixed(1)} fps  |  ${frameMs.toFixed(1)} ms/frame  |  CPU render ${renderMs.toFixed(2)} ms  |  physics ${match.physicsMs.toFixed(2)} ms`,
        `${viewportWidth}×${viewportHeight} viewport  |  ${pixelWidth}×${pixelHeight} render (${scale.toFixed(2)}×)`,
        `${calls} draws  |  ${geometries} geometries  |  ${textures} textures  |  ${particles} particles  |  ${audio.activeVoices} effect voices`,
        `${match.state}  |  goals ${match.scores.join('–')}  |  passes ${s.passes}  |  shots ${s.shots}  |  saves ${s.saves}  |  recoveries ${s.recoveries} / ${s.faults} faults`,
        `Possession changes ${s.possessionChanges}  |  ${match.players.map(p => `${p.team}-${p.number} ${p.intent}`).join('  ')}`,
      ].join('\n');
    }
    if (view.lost && !match.persistentFault) callout('DISPLAY RECOVERY', 'Restoring the stadium', 0, 100);
  }

  function updatePlayerNames() {
    tags.hidden = view.camera.mode !== 'two-player';
    if (tags.hidden) return;
    const subjects = view.camera.subjects;
    const marks = subjects.map(id => view.namePoint(id));
    const names = subjects.map(id => match.players[id]);
    const ball = view.framing();
    for (const [index, tag] of players.entries()) {
      const { x, y } = marks[index];
      const overlaps = index === 1 && !players[0].hidden && Math.abs(x - marks[0].x) < 0.14 && Math.abs(y - marks[0].y) < 0.065;
      const nearBall = ball.ballVisible && Math.abs(x - (ball.ballX + 1) / 2) < 0.09 && Math.abs(y - (1 - ball.ballY) / 2) < 0.07;
      tag.hidden = x < 0.11 || x > 0.89 || y < 0.22 || y > (innerWidth < innerHeight ? 0.67 : 0.77) || overlaps || nearBall;
      if (tag.hidden) continue;
      tag.textContent = CAST[names[index].id];
      tag.dataset.team = String(names[index].team);
      tag.style.left = `${x * 100}%`;
      tag.style.top = `${y * 100}%`;
    }
  }

  function frame(now: number) {
    handle = requestAnimationFrame(frame);
    if (lastTime === 0) lastTime = now;
    const gap = Math.max(0, (now - lastTime) / 1000);
    lastTime = now;
    const capped = Math.min(gap, 0.25);
    droppedSeconds += gap - capped;
    if (!awaitingRecording) accumulator += capped;
    for (let step = 0; accumulator + 1e-7 >= STEP && step < 15; step++) {
      match.step();
      if (edit?.active) edit.advance(match.tick, performance.now());
      for (const event of match.events) react(event);
      radio(commentary.countdown(match.tick, match.scores));
      radio(commentary.advanceBooth(match.tick, match.state === 'live' || match.state === 'throw-in' || match.state === 'goal'));
      accumulator = Math.max(0, accumulator - STEP);
    }
    if (match.tick >= nextSave) { nextSave = match.tick + 900; persist(); }
    updateInterface(now);
    const interval = 1000 / settings.fps;
    if (!lastRender || now + 1.2 >= nextDraw) {
      if (!lastRender || now - nextDraw > interval * 1.5 || nextDraw - now > interval * 3) nextDraw = now + interval;
      else nextDraw += interval;
      const elapsed = lastRender ? now - lastRender : interval;
      if (lastRender) {
        measuredFrames++;
        const bucket = [12, 19, 28, 39, 56, 100, 250].findIndex(threshold => elapsed < threshold);
        frameBuckets[bucket === -1 ? 7 : bucket]++;
      }
      view.draw(match, Math.min(1, accumulator / STEP), Math.min(0.13, elapsed / 1000), elapsed, settings.fps, show);
      if (production) updatePlayerNames();
      if (match.state !== 'halftime' && match.state !== 'fulltime') replay.capture(match.tick, show.highlight, captureFrame);
      lastRender = now;
    }
    if (layout && (!caption.hidden || !overlay.hidden || !recapCard.hidden || !rivals.hidden)) {
      const moment = show.moment && match.tick - show.moment.tick <= 170 ? show.moment : undefined;
      const lead = show.getCelebration(match.tick)?.lead;
      const actors = lead !== undefined ? [lead] : rivals.hidden
        ? [...view.camera.subjects.slice(0, 2), moment?.player, moment?.opponent, recapCard.hidden ? undefined : show.recap?.player]
        : CAPTAINS;
      layout.update(view.screenPoints(actors));
    }
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); }, { signal });
  window.addEventListener('pagehide', ev => {
    persist();
    if (ev.persisted) return;
    cancelAnimationFrame(handle); controller.abort(); audio.dispose(); view.dispose(); match.dispose();
  }, { signal });

  view.draw(match, 0, STEP, 1000 / settings.fps, settings.fps, show);
  byId('loading').hidden = true;
  handle = requestAnimationFrame(frame);
  window.setTimeout(() => audio.enable(), 160);
}

void start().catch((reason: unknown) => {
  console.error('Rush Arena could not start.', reason);
  byId('loading').querySelector('span')!.textContent = 'Rush Arena could not open. A WebGL 2 browser is required.';
});
