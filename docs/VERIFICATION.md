# Verification report

The updated build was tested on Windows 11 26H2 x64 with an Intel Core Ultra 7 255H, Intel Arc 140T graphics, Node.js 24.22.3 and Chrome 157.0.8103.79. Chrome reported Intel graphics through ANGLE/D3D11.

## The stadium band

The music-only sampler lasts 75 seconds. The six scores contain 48 different eight-bar arrangements lasting 12 minutes 17 seconds altogether. Their cue reels include both teams’ goal melodies and encores, a keeper response and the two period breaks. All 54 local Ogg files decoded with audible music in both instrument parts and all 42 event recordings. The stereo MP3 measures −15.9 LUFS integrated with a −1.7 dB true peak. [Hear the sampler](../artifacts/rush-arena-stadium-band.mp3)

The 32-second match capture uses the normal game mixer and seed `grandstand-54`. Scruff gets its clarinet theme at 00:10, Mitts tips a shot at 00:22, and Scruff’s second goal brings in the answering instrument at 00:25. Seven booth captions accompany the play. The 1080p export has 48 kHz stereo audio at −17.7 LUFS integrated. [Watch the match excerpt](../artifacts/rush-arena-band-in-play.mp4)

All 46 unit tests passed. The focused Chrome test solos the music through the capture track, checks silence before recording and at zero music volume, then follows the band into its next tune. It heard the three match cues and verified the halftime and full-time cues across the fixture boundaries. The test observed up to five music sources, including release tails and the cue, and three entries in the decoded-file cache. Run it with `npm run test:browser -- --music`. [Music verification](../artifacts/stadium-band-check.json)

## Boot contact and goalkeeper physics

The 20.6-second, 1080p preview combines two recorded plays. Mitts gets a glove to a high shot about three seconds in. Patch dives to hold a shot around 00:15, then drops the ball onto a swinging boot around 00:16. The scoreboard, shadows, commentary and music are from the game. [Watch the keeper physics preview](../artifacts/rush-arena-keeper-physics.mp4)

The 43 automated tests include mirrored low catches, high tips, unreachable shots inside the post and wide misses. They also check a near miss between simulation frames, a full landing after a tip goes out of play, forward roll on a pass, backspin on a punt and the free fall between the keeper's hands and boot. The six-hour simulation covered 18 fixtures, 139 goals, 731 credited saves and 116 keeper distributions. It recorded zero physics faults. [Stress results](../artifacts/stress.json)

Chrome completed the desktop and phone broadcast checks. The phone camera kept the ball in frame and clear of the overlaid panels in all 299 sampled frames. The exported H.264 video has 617 frames at 30 fps, with 48 kHz stereo audio peaking at −4.3 dBFS. [Browser results](../artifacts/browser.json)

## Goal-line rulings, supporters and stadium audio

The 35-second clip is a recording from the normal capture layout with the seed `grandstand-18`. Boulder scores at 00:09, the scoring supporters appear at 00:13, and Mitts returns two misses. The first goes wide at 00:22 and the second clears the bar at 00:27. Jom and Jerry deliver ten audible calls. The export is 1920×1080 H.264 at 30 fps with 48 kHz stereo AAC and a peak of −4.0 dBFS. [Match preview](../artifacts/rush-arena-goal-line-preview.mp4) · [Audio from the match](../artifacts/jom-and-jerry-match-audio.mp3)

All 37 unit and simulation tests passed. They cover both goals, partial and diagonal crossings, real net contact, keeper throws, corner throws, sideline restarts, audible cues for all 480 scripts, and timely replies from the other host. Across six accelerated hours and 18 fixtures, the three seeds produced 914 outs and 910 throws. The period whistles ended the remaining four stoppages. Each seed recorded zero simulation faults and zero emergency recoveries. The longest completed throw restart took 7.35 seconds. [Simulation report](../artifacts/stress.json)

Chrome sampled the ball during the goal-line and throw shots at 390×844 and 390×220, including the overhead release. None of those samples fell outside the picture or beneath the score, ruling or captions. In both layouts the music channel produced a signal with play paused before kickoff, fell below 0.0002 peak after the music fader reached zero, and returned above 0.13 peak when restored.

The project's Chrome regression suite completed the halftime and full-time restarts and the refresh check. In the regular phone view it sampled 270 ball positions with zero clipping, card overlap or duplicate event captions. [Browser report](../artifacts/browser.json)

## Earlier Mick and Emma commentary booth

The packaged 24 kHz voice track contains 452 distinct audible clips, with 226 for each host and 32 scripted two-host exchanges. The automated tests check clip boundaries, signal levels, unique captions, matching replies, speaker credits, and interruption by goals and stoppages. An offline English recognizer matched 12 sampled performances to their scripts from a limited list of phrases. A byte comparison confirmed that those takes are in the game.

Eight consecutive 20-minute fixtures on the default seed selected 297 different recordings and completed 124 booth exchanges with zero simulation faults. Separate full fixtures on three seeds each selected between 100 and 108 distinct recordings.

A 40-second recording from kickoff contains eight audible calls. Emma introduces the booth, Mick answers her, and the hosts call a shot, an own goal, a steal and a keeper block. The video contains 1920×1080 H.264 at 30 fps with the game's stereo AAC mix. [Watch the match](../artifacts/rush-arena-booth-preview.mp4) · [Hear ten voice clips](../artifacts/rush-radio-preview.mp3)

Chrome also captured both voices in a 1080×1920 layout with caption text enabled and disabled. The booth animated during speech, the exported captions named the two hosts, and the booth stayed clear of the ball during the sampled opening exchange. [Vertical booth view](../artifacts/commentary-booth-vertical.png)

## Earlier sideline camera and streaming capture

Strict TypeScript, ESLint, the production build, and all 35 automated tests passed. On comparable samples from the first two minutes of the default match, the player nearest the ball grew from a median 7.4% to 21% of the picture height in landscape and from 5% to 23% in vertical.

Three full simulated matches exercised four layouts. The ball stayed in frame across 400,432 samples. The revised camera removes the abrupt wide pullback at the start of a long ball and still holds the shooter, keeper, and ball when space allows.

Chrome sampled 3,699 visible ball positions across landscape capture, vertical capture, and a 390×220 browser. The ball stayed in frame and clear of the scoreboard and captions in those samples. Chrome also verified the final score and the automatic next kickoff. A 1920×1080 game with sound averaged 29.9 fps at a 30 fps target with zero browser errors or simulation faults. [Sideline dialogue](../artifacts/camera-dialogue-horizontal.png) · [Vertical save](../artifacts/camera-save-vertical.png) · [Goal reaction](../artifacts/camera-goal-horizontal.png) · [Full-time result](../artifacts/camera-fulltime-horizontal.png)

The 24-second preview includes a save, a shot off the post, a goal, and two exchanges with five audible lines. The export decoded as 1920×1080 H.264 at 30 fps with stereo AAC and a measured peak of −4.3 dBFS. [Camera and audio preview](../artifacts/rush-arena-camera-preview.mp4)

## Earlier player silhouettes and expanded Rush Radio

Strict TypeScript, ESLint, the production build, and all 34 automated tests passed. The voice bank has 365 distinct captions and 365 non-silent PCM clips, including 257 new clips. Across three simulated matches, all ten players spoke in each fixture and the scheduler used 109 distinct new clips. The simulations recorded zero faults.

Chrome rendered all ten player rigs and matching portraits, captured the supporters at kickoff, and kept the ball visible in the sampled 1080×1920 recording view. After audio was enabled, the default match played three new clips in its first 24 simulated seconds. Those included on-field calls from Dash and Patch and an announcer's reaction to an own goal. The 1920×1080 sample averaged 29.2 frames per second at a 30 fps target with zero browser errors or simulation faults. [Player lineup](../artifacts/rush-arena-npc-lineup.png) · [Supporters](../artifacts/rush-arena-supporters.png)

## Earlier sky and park surroundings

Strict TypeScript, ESLint, the production build, and all 32 automated tests passed. Chrome captured the opening shot in landscape at 1920×1080, portrait at 1080×1920, and at dusk for the second-half kickoff. The ball stayed in frame in all three captures, and Chrome logged no page or console errors. [Landscape kickoff](../artifacts/surroundings-wide.png) · [Portrait kickoff](../artifacts/surroundings-vertical.png) · [Dusk kickoff](../artifacts/surroundings-dusk.png)

A separate 1920×1080 high-quality play sample with a 30 fps target averaged 29.9 rendered frames per second. It ended with 11 physics bodies, 30 colliders, and zero simulation faults.

## Earlier reactive stadium

All 32 automated tests passed. The arena tests cover cue priority and expiry, save credit, the retained full-time score, and different reactions from each team’s fans. Chrome verified a wide kickoff shot and its return to play, Mitts's low save, Zip's goal, a shot off the post, and Patch's fingertip save at 1080×1920. The ball stayed in view in those samples. [Kickoff stands](../artifacts/arena-kickoff.png) · [Pitch-side goal cue](../artifacts/arena-goal.png) · [Vertical save](../artifacts/arena-vertical.png)

The 24-second horizontal preview recorded a save and two goals. The MP4 decoded at 1920×1080 with stereo AAC, and the measured peak was −4.1 dBFS. [Stadium preview](../artifacts/rush-arena-stadium-preview.mp4)

## Earlier YouTube recording layout

All 30 automated tests passed. The capture tests verify chronological marker times, the final score at a fixture reset, and subtitle timing across both turns of a conversation. Chrome verified the operator JSON download and the regular Heroes picker. The recording layout hid the player controls and showed the full Roundhouse and Scruff names.

The sampled dialogue font was 66.24 px at 1920×1080 and 45.90 px at 1080×1920. Across 986 horizontal and 990 vertical animation-frame samples, the ball stayed in frame and clear of the captions. The camera used two-player framing in both orientations. [Horizontal recording layout](../artifacts/production-horizontal.png) · [Vertical recording layout](../artifacts/production-vertical.png)

The episode editor used a three-minute `midnight-cup` take with 97 markers and 32 audible lines. It produced a 1:38 pilot following Patch's saves and Boulder's goal at match time 2:53.867. The episode closes at 4–2, with the fixture still in its first half. The exported MP4 is 1920×1080 at a 30 fps target with stereo AAC and a measured audio peak of about −4 dBFS. [Pilot](../artifacts/rush-arena-pilot.mp4) · [Cut list](../artifacts/rush-arena-pilot.json) · [Subtitles](../artifacts/rush-arena-pilot.srt)

## Earlier player conversations

All 28 automated tests passed, including checks that the participants come from the play, the reply waits for the first line, and goals and dead balls can interrupt the exchange. The audio check found 108 non-silent clips. All ten players spoke in the first five minutes of each seed. The full cast had spoken by 4:32 on `zeerush`, 3:13 on `after-school`, and 1:48 on `midnight-cup`.

Chrome verified that Dash and Boulder could trade readable captions while muted at 390×220. After audio was enabled, Chrome played both clips of Patch and Doodle's exchange at 1440×900. The sampled captions stayed clear of the ball. [Muted phone captions](../artifacts/pitch-talk-caption-phone.png) · [Desktop exchange](../artifacts/pitch-talk-rivals.png)

The full browser suite passed with zero errors or warnings. Across 270 landscape phone samples, the ball stayed in frame and clear of floating panels. The run saw pitch captions in 122 samples and played a teammate reply from Zip after unmuting. [Chrome checks](../artifacts/browser.json)

## Earlier goalkeeper defense

All 26 automated tests passed. The tests cover shot tracking at both ends, save selection by height and reach, a held low save, and a high save parried back into play. Both keepers performed all four save types in the first match of each stress-test seed, and both teams scored in each of those matches.

Chrome verified Patch's low catch and next distribution, Patch's fingertip parry at 1440×900, and Mitts's diving save at 390×220. The ball stayed in frame during the sampled animations, and both standout saves showed their own captions. [Patch's ready stance](../artifacts/keeper-ready.png) · [Fingertip save](../artifacts/keeper-fingertip.png) · [Mitts's diving save on a phone](../artifacts/keeper-phone.png)

## Earlier longer celebrations

All 24 automated tests passed. Chrome showed active celebration moves and confetti 3.25 seconds after a natural goal. The opposing team kicked off 277 ticks after the goal. The win and draw checks showed both teams waving after 8.17 seconds and a live kickoff 637 ticks after the final whistle. The final score and kickoff countdown remained visible in the 390×220 viewport. [Goal preview](../artifacts/goal-extended.png) · [Full-time preview](../artifacts/fulltime-extended.png)

## Earlier player identities and favorites

All 23 automated tests passed. The spotlight test cycles through the complete roster and verifies player counts from match events. Chrome verified ten distinct portraits, keyboard and touch selection, a visible on-field marker, favorite persistence across reload, and clearing the selection. The game clock kept moving while the picker was open. Chrome checked the picker at 1440×920, 390×844, and 390×220. All ten accessories were visible in the 3D close-ups. [Hero roster](../artifacts/hero-roster.png) · [3D characters](../artifacts/hero-models.png) · [Favorite on the pitch](../artifacts/favorite-hero.png) · [Phone roster](../artifacts/hero-roster-phone.png)

The Chrome broadcast suite passed with zero errors and warnings. In 292 landscape phone samples, the Heroes button and other floating cards stayed clear of the ball. [Chrome checks](../artifacts/browser-before-pitch-talk.json)

## Earlier long kicks and passes

All 22 automated tests passed. Chrome showed a 20.2-metre shot at 1920×1080 and a 19.2-metre switch at 390×220. The ball stayed in frame during both samples, and the intended winger controlled the switch after 72 ticks. [Long shot](../artifacts/long-shot.png) · [Phone-sized switch](../artifacts/lofted-switch-phone.png)

The Chrome regression suite passed with zero errors and warnings. It verified WebGL restoration, goal celebrations, checkpoint resume, halftime replay, both match boundaries, and audio controls. None of its 290 landscape phone samples showed ball clipping or a floating card covering the ball. [Long-kick Chrome checks](../artifacts/browser-long-kicks.json)

A comparison of the first match from each of the same three seeds counted passes as long when the intended teammate was at least 13 metres away at release. The intended player controlled 69 of 114 long passes in the revised run, up from 32 of 89. Shot attempts from at least 15.8 metres out rose from 3 to 64. Across all passes, 84.7% reached a teammate in the revised run, compared with 88.6% before. There were 19 out-of-play recoveries across those three matches, up from 6. [Passing comparison](../artifacts/passing-comparison.json)

## Earlier goal celebrations

All 21 automated tests passed. Production Chrome captured Roundhouse's double-hop at 1920×1080 and Scruff's victory twirl at 390×220. Both natural goals triggered five team gestures, a scorer close-up, confetti, a goal sound accent, and one score update. The opposing team kicked off 107 ticks later in both cases. The own-goal test verifies which captain leads the celebration. [Roundhouse goal](../artifacts/goal-roundhouse.png) · [Scruff goal at phone size](../artifacts/goal-scruff-phone.png)

## Earlier match and browser checks

- Strict TypeScript, ESLint, Vite production build, and all 20 automated tests passed. The tests cover honest save setups, verified recap counts, placement around the ball and players, cue audio, and the existing timing and physics checks.
- The audio asset contains 68 English lines across six synthesized voices. Chrome verified captions with autoplay blocked, a Zip voice line and sound effects after a trusted click, and a drop to near-silent output after mute. The production browser checks logged zero page errors, failed requests, or warnings.
- Browser tests resumed near 10:00 and 20:00 to check the scoreboard, report, and next kickoff. The halftime inset played a 15-frame save by Mitts. The 390×220 run captured 299 live-ball samples with zero clipping, card overlap with the ball, or duplicate event labels. It also verified a captain recap and heard a second Zip line after audio was enabled. The scoreboard was visible at 390×844. [1080p](../artifacts/broadcast-1080.png) · [muted phone save](../artifacts/phone-goalmouth.png) · [captain recap](../artifacts/phone-recap.png) · [halftime](../artifacts/halftime.png)

## Commentary and comic timing

A separate presentation check simulated the first 20-minute match of each seed. All four character voices and all seven gags appeared in each match. The first character line arrived at **14.03 seconds** in `zeerush`, **24.80 seconds** in `after-school`, and **17.25 seconds** in `midnight-cup`. Across the three matches, all 26 stretches followed at least 0.35 seconds with the setup pose active. The highlight selector chose two saves, three post hits, and one goal. Captain recaps first appeared between 68 and 91 simulated seconds on all three seeds.

## Accelerated simulation

Three seeds each ran for 432,000 fixed ticks or two simulated hours. The total was six simulated hours, 18 completed fixtures, and 18 halftime changes. Scores and wins are shown as Roundhouse–Scruff.

| Seed | Series goals | Wins | Draws | Passes | Shots | Saves | Recoveries / faults |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `zeerush` | 67–57 | 5–1 | 0 | 3,878 | 1,033 | 328 | 49 / 0 |
| `after-school` | 49–53 | 2–3 | 1 | 4,029 | 962 | 313 | 35 / 0 |
| `midnight-cup` | 69–55 | 4–2 | 0 | 3,928 | 1,025 | 335 | 31 / 0 |

The run also produced 2,785 interceptions, 3,682 tackles, 741 keeper distributions, 1,331 rebounds and 9,121 possession changes. The longest goal gap was 361 simulated seconds. All halftime and full-time events occurred on their exact scheduled tick. Goal and full-time states reached their planned peaks of 240 and 600 ticks. Physics stayed at 11 bodies and 30 colliders, with the event history capped at 96.

## Earlier two-minute rendered test

The updated broadcast ran unattended for 120.02 seconds in Chrome at 1920×1080. It advanced 120.02 simulated seconds and averaged 58.42 rendered frames per second while the other browser checks also ran. Sampled drawing buffers stayed at 1920×1080. The run ended with 11 physics bodies, 30 colliders, 22 geometries, and 26 textures. It logged zero simulation faults, browser errors, or warnings. [Two-minute render results](../artifacts/soak-2min.json)

## Earlier three-minute rendered test

The presentation build ran unattended for 180.03 seconds at a 1920×1080 viewport and averaged **58.15 rendered fps**. All six sampled drawing buffers were 1920×1080. Browser quality and action framing varied draw calls between 133 and 137. Resources stabilized at 22 geometries and 26 textures after the impact ring first appeared. The run recorded one normal recovery, zero simulation faults, and zero browser errors or warnings. [Three-minute render results](../artifacts/soak-3min.json)

## Earlier full rendered match

The match-timing build ran for 1,209.02 wall-clock seconds in hardware-accelerated headless Chrome with seed `zeerush`, muted audio, auto quality, and a 60 fps target. It averaged **59.73 rendered fps** at a 1920×1080 viewport. All minute samples used a 1920×1080 drawing buffer. The final smoothed frame interval was 16.67 ms, with 1.21 ms CPU render submission and 0.13 ms per physics step.

Roundhouse led **5–2 at halftime** and won Match 01 **11–5**. The live run logged the full-time result at tick 72,000 and Match 02's kickoff at tick 72,192. The run finished with Match 02 live at **0–0**. It recorded 660 passes, 189 shots, 63 saves, 447 possession changes, and four ordinary recoveries, with zero simulation faults, page errors, failed requests, or console warnings. It retained 11 bodies, 30 colliders, 20 geometries and 26 textures. [End of the rendered run](../artifacts/soak-end.png)

Raw reports [Chrome checks](../artifacts/browser.json) · [long-kick Chrome checks](../artifacts/browser-long-kicks.json) · [earlier Chrome checks](../artifacts/browser-before-long-kicks.json) · [earlier presentation checks](../artifacts/show-review.json) · [accelerated simulation](../artifacts/stress.json) · [earlier rendered match](../artifacts/soak.json)

## Remaining limits

Native Browser Source playback, audio routing and encoder load inside OBS Studio and Streamlabs Desktop are outside these Chrome checks. Browser and OS suspension can delay the simulation clock. The prepared viewing test has yet to be run with children. [Viewing test](VIEWING-TEST.md)
