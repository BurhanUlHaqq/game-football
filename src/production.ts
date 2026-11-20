import cues from './commentary-cues.json';
import { MATCH_TICKS } from './football';
import type { MatchEvent, Score, Team } from './football';
import type { BoothHost, CommentaryCall } from './commentary';
import type { ShowMoment } from './show';
import { CAST } from './show';

type Stamp = { tick: number; now: number; match: number; matchTicks: number; score: Score };
type Position = { recordingSeconds: number; tick: number; match: number; matchSeconds: number; score: Score };
type Participant = { id: number; name: string };
type Caption = Position & { endSeconds: number; id: string; speaker: string; listener?: string; text: string; audible: boolean };
type Marker = Position & {
  kind: string; label?: string; team?: Team; player?: Participant; opponent?: Participant; detail?: string; description?: string;
  technique?: string; held?: boolean; rank?: number; beat?: 'setup' | 'rematch' | 'payoff'; exchangeEndSeconds?: number;
  hosts?: [BoothHost, BoothHost];
};
const markedEvents = new Set(['match-start', 'half-start', 'halftime', 'fulltime', 'goal', 'shot', 'save', 'post', 'tackle', 'interception', 'recovery']);
const maximumEntries = 16000;
const round = (n: number) => Math.round(n * 1000) / 1000;
const participant = (id?: number) => id === undefined ? undefined : { id, name: CAST[id] };

export class ProductionLog {
  private start?: { now: number; tick: number; iso: string };
  private end?: number;
  private markers: Marker[] = [];
  private captions: Caption[] = [];
  private openCaption?: { caption: Caption; until: number };
  private opening?: { position: Position; id: string; host: BoothHost; player?: number; opponent?: number };
  private reply?: { marker: Marker; until: number };
  private truncated = false;

  constructor(private readonly seed: string, private readonly teams: readonly string[]) {}

  get active() { return this.start !== undefined && this.end === undefined; }

  begin(tick: number, now: number) {
    this.start = { now, tick, iso: new Date().toISOString() };
    this.end = undefined;
    this.markers = [];
    this.captions = [];
    this.openCaption = this.opening = this.reply = undefined;
    this.truncated = false;
  }

  private seconds(now: number) { return round(Math.max(0, now - (this.start?.now ?? now)) / 1000); }

  private position(stamp: Stamp): Position {
    return { recordingSeconds: this.seconds(stamp.now), tick: stamp.tick, match: stamp.match,
      matchSeconds: round(stamp.matchTicks / 60), score: [...stamp.score] };
  }

  private add<T>(list: T[], value: T) {
    if (list.length < maximumEntries) list.push(value);
    else this.truncated = true;
  }

  event(event: MatchEvent, stamp: Stamp, moment?: ShowMoment) {
    if (!this.active || !markedEvents.has(event.kind)) return;
    if (event.kind === 'goal' || event.kind === 'halftime' || event.kind === 'fulltime' || event.kind === 'recovery') this.clearExchange();
    const position = this.position(event.summary ? { ...stamp, match: event.summary.number,
      matchTicks: event.kind === 'fulltime' ? MATCH_TICKS : stamp.matchTicks, score: event.summary.scores } : stamp);
    this.add(this.markers, { ...position, kind: event.kind, label: moment?.label, team: event.team,
      player: participant(event.player), opponent: participant(event.opponent), detail: event.detail, description: moment?.story,
      held: event.save?.held, technique: event.save?.move ?? event.flight?.style, rank: moment?.rank, beat: moment?.beat });
  }

  call(call: CommentaryCall, stamp: Stamp, captionUntil: number, audible: boolean) {
    if (!this.active) return;
    this.closeCaption(stamp.now);
    const position = this.position(stamp);
    const turn = call.exchange;
    const caption = { ...position, endSeconds: position.recordingSeconds, id: call.id, speaker: call.host,
      listener: turn ? (call.host === 'MICK' ? 'EMMA' : 'MICK') : undefined, text: call.text, audible };
    this.add(this.captions, caption);
    this.openCaption = { caption, until: captionUntil };
    if (!turn) { this.clearExchange(); return; }
    if (!turn.reply) {
      this.opening = { position, id: call.id, host: call.host, player: turn.player, opponent: turn.opponent };
      return;
    }
    const opening = this.opening;
    this.opening = undefined;
    if (!opening || opening.id !== turn.opening || opening.host === call.host) return;
    this.reply = { until: stamp.tick + Math.ceil(cues[call.id][1] * 60), marker: { ...opening.position, kind: 'exchange',
      label: 'Commentary booth', hosts: [opening.host, call.host], player: participant(opening.player), opponent: participant(opening.opponent) } };
  }

  markAudible(id: string) {
    if (this.openCaption?.caption.id === id) this.openCaption.caption.audible = true;
  }

  advance(tick: number, now: number) {
    if (this.openCaption && tick >= this.openCaption.until) this.closeCaption(now);
    if (this.reply && tick >= this.reply.until) {
      this.add(this.markers, { ...this.reply.marker, exchangeEndSeconds: this.seconds(now) });
      this.clearExchange();
    }
  }

  closeCaption(now: number) {
    if (!this.openCaption) return;
    this.openCaption.caption.endSeconds = this.seconds(now);
    this.openCaption = undefined;
  }

  private clearExchange() { this.opening = this.reply = undefined; }

  snapshot(now: number, finish = false) {
    if (!this.start) return undefined;
    if (finish && this.active) {
      this.closeCaption(now);
      this.clearExchange();
      this.end = now;
    }
    const durationSeconds = this.seconds(this.end ?? now);
    return { version: 1, seed: this.seed, teams: [...this.teams], startedAt: this.start.iso, startTick: this.start.tick,
      durationSeconds, truncated: this.truncated, markers: [...this.markers].sort((a, b) => a.recordingSeconds - b.recordingSeconds),
      captions: this.captions.map(caption => ({ ...caption,
        endSeconds: this.openCaption?.caption === caption ? durationSeconds : caption.endSeconds })) };
  }
}

export function subtitles(captions: readonly Caption[]) {
  const timestamp = (seconds: number) => {
    const ms = Math.round(seconds * 1000);
    const pieces = [Math.floor(ms / 3600000), Math.floor(ms / 60000) % 60, Math.floor(ms / 1000) % 60];
    return `${pieces.map(part => String(part).padStart(2, '0')).join(':')},${String(ms % 1000).padStart(3, '0')}`;
  };
  return captions.filter(c => c.endSeconds > c.recordingSeconds).map((c, i) =>
    `${i + 1}\n${timestamp(c.recordingSeconds)} --> ${timestamp(c.endSeconds)}\n${c.speaker}: ${c.text}\n`).join('\n');
}
