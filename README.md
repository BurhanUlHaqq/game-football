# Roundhouse vs. Scruff · Cartoon Football

ZeeRush Gaming’s local broadcast of back-to-back, computer-controlled 5-a-side football matches. Roundhouse FC fields broad, round capybaras in gold. Scruff FC fields crooked-eared, shaggy misfits in teal. Both teams use the same gameplay rules, and their display names are configurable.

The first match starts when the page opens or refreshes, with the clock at **00:00** and the score at **0–0**. Halftime begins at **10:00**, when the teams swap ends and keep the score. At **20:00** the next match clock starts at 00:00 with a fresh score. The full-time celebration runs for **10 seconds**, with the final score and a countdown to the next automatic kickoff.

Boulder and Zip are the captains. Real saves, shots off the post, and steals can trigger their comic reactions. Quick saves get a short wave or shrug. Goal celebrations run for **5.5 seconds** unless a period ends. The camera first shows the ball inside the net. Roundhouse jumps and pumps its fists while Scruff spins and waves. The scorer gets a close-up, team-colored confetti, and a goal jingle before the scoring supporters get their own close-up. Player portraits at restarts help viewers catch up. Halftime and full time show a short replay of a standout play and name the standout player when eligible.

The broadcast opens with a brief arena view, then moves down to the sideline to follow the ball and nearby players. Passes and challenges get a closer two-player shot when both players are near the ball. Saves include the keeper and the surrounding action, and goal celebrations show faces, gestures, and confetti. Long balls pull the camera back gradually. The vertical view follows a long delivery toward the receiver and keeps the ball clear of the caption area.

Jom, a soft-spoken cat, and Jerry, a quick-witted mouse, share the commentary desk. They have **480 recorded calls**, 240 per host. Jerry can spot a ball going over the bar, Jom can answer a question about a close miss, and either can open or finish a goal call. Their mouths follow the actual recordings. [Watch the recorded match](artifacts/rush-arena-goal-line-preview.mp4) · [Hear the match audio](artifacts/jom-and-jerry-match-audio.mp3)

The whole ball must cross between the posts and under the bar to score. A wide or high shot carries onto the tan apron. A sideline exit gives the other team a throw-in. At the end line, an attacking touch gives the defending keeper a throw, and a defending touch gives the attackers a corner throw. The named player collects the same ball and throws it to a teammate.

The Rush Arena Stadium Band plays six original pieces, from brass swing and marimba to bassoon, funk, a waltz and ska. Its first 48 movements contain more than 12 minutes of distinct music. Completed pass sequences and shots bring in extra players on the same beat. Roundhouse scores to trombone and Scruff to clarinet. A second goal earns a harmonized encore. The band leaves a beat open for a shot off the post and plays a music-box interlude at halftime. Jom and Jerry have room to speak in the mix. Press **O** for the current tune and separate music, commentary and effects faders. [Listen to the soundtrack sampler](artifacts/rush-arena-stadium-band.mp3) · [Hear it in a match](artifacts/rush-arena-band-in-play.mp4) · [Music credits](public/licenses/stadium-music.txt)

The football casts a soft shadow that spreads and fades as it rises. Players plant a support foot, draw the other boot back, and follow through. Ground passes roll forward. Lofted passes and keeper punts carry backspin.

Mitts and Patch track the incoming shot, push off, and land where their momentum takes them. They gather low balls, block with the body, and tip high shots with a glove. After a catch, opponents give them space to lower the ball for a short pass or drop it onto a swinging boot for a punt. [Watch a diving catch and drop punt](artifacts/rush-arena-keeper-physics.mp4)

Roundhouse and Scruff have their own supporter sections, flags, and sideline mascots. Eight animal species wear team colours and scarves. The supporters clap, wave pennants and raise scarves in response to play. A wave crosses the stands at kickoff. The crowd leans in when a shot hits the post and reacts by team to goals and saves. The stadium screen and pitch-side boards show the real play, and the wide kickoff camera shows the surroundings before settling back on the ball.

The arena is surrounded by a park, paved entrances, a fountain, and a neighborhood behind the stands. Cloud layers drift across the sky and take on warmer colors at dusk. The opening shot in both recording formats shows the setting before the camera moves in to follow play.

Players lead teammates into space, drive the ball along open lanes, and loft it across the pitch when a teammate has room out wide. The camera widens to keep the ball and the receiver in view.

Open **Heroes** to meet all ten players and choose a favorite. Each player has a distinct face, build, and signature accessory in the match and on their portrait. The game remembers your favorite in this browser and puts a gold ring under them. Live spotlights take turns introducing the roster during natural restarts. [Player lineup](artifacts/rush-arena-npc-lineup.png)

**Production capture URL** [http://127.0.0.1:41730/](http://127.0.0.1:41730/)

For a stream or recording with a larger scoreboard, a fixed caption area, and on-field name tags during two-player shots, use the recording layout. It frames tall and wide sources separately. Press **O** to mark the start of a take and export its edit log or subtitles. [Open the recording layout with audio](http://127.0.0.1:41730/?mode=capture&fps=30&audio=auto&music=on&commentary=on) · [Recording and episode workflow](docs/STREAMING.md#record-and-cut-an-episode)

## Run the game

Install Node.js 24 LTS and use a browser with WebGL 2. The workspace includes a production build in `dist/`. To serve that build, run the last command in the block for your platform. Installation needs access to the npm registry. The built game runs over local HTTP with all graphics, sound and physics available offline.

### Windows PowerShell

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run serve
```

### Linux and macOS

```sh
npm ci
npm run build
npm run serve
```

Keep the server terminal open and visit the capture URL. The server binds only to `127.0.0.1`. If the command says Rush Arena is already running, use the URL it prints. If another service occupies the port, set `PORT` before serving (`$env:PORT='41731'` in PowerShell or `PORT=41731 npm run serve` in a POSIX shell) and use that port in the capture URL. Any static HTTP server can serve `dist/` as its document root. `file://` cannot start the game.

This Windows workspace also has a portable Node.js runtime in `.tooling/`. If `node` is absent from your PATH, serve the existing build from the project root with the portable executable.

```powershell
& .\.tooling\node-v24.22.3-win-x64\node.exe .\scripts\serve.mjs
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Live development at `http://127.0.0.1:5173/`. |
| `npm run typecheck` | Strict TypeScript without emitting files. |
| `npm run lint` | ESLint. |
| `npm run build` | Rebuild production output in `dist/`. |
| `npm run serve` | Serve production output over loopback. |
| `npm test` | Football rules, physics, AI, state, recovery and storage tests. |
| `npm run test:browser` | Chrome production checks and screenshots at both capture sizes. Run the build first. |
| `npm run test:stress` | Three seeds at two simulated hours each. Pass `-- 0.25` for 15 minutes per seed. |
| `npm run test:soak` | 20-minute rendered Chrome soak at a 1920×1080 viewport. Run the build first. Set `SOAK_MINUTES` to substitute another duration. |

Use `npm.cmd` in PowerShell if your execution policy blocks the `npm.ps1` wrapper. Browser tests use installed Google Chrome on Windows when present. Otherwise run `npx playwright install chromium` (`npx.cmd` in PowerShell), or set `CHROMIUM_PATH` to a Chromium executable. Use `RUSH_HEADED=1` for a visible browser, `RUSH_SWIFTSHADER=1` to explicitly request software WebGL, and `RUSH_QUALITY` to select a render preset. Reports and screenshots go to `artifacts/`.

## Configure a session

Example capture URL [1080p stream with auto quality and a 60 fps render target](http://127.0.0.1:41730/?mode=stream&quality=auto&audio=auto&hud=minimal&seed=zeerush&fps=60)

| Query option | Accepted values and default |
| --- | --- |
| `mode` | `stream` (default), `capture` for recorded episodes, `operator` to open controls, `debug` to show diagnostics. |
| `quality` | `auto` (default), `low`, `medium`, `high`. |
| `fps` | `60` or `30`. Capture mode defaults to 30. Physics always uses 60 fixed steps per simulated second. |
| `captions` | In capture mode, `off` hides the caption text. The booth window stays on camera, and subtitle export still records the lines. |
| `audio` | `auto` (default) or `muted`. Visuals start even when browser autoplay is blocked. |
| `commentary` | `on` restores the default voice volume. `off` mutes the voice track while keeping caption cards. Omit it to use the saved volume. |
| `hud` | `minimal` (default) or `off` to hide the broadcast overlays. |
| `seed` | `zeerush` by default. Accepts 1–48 letters, digits, underscores, dots or hyphens. |
| `teamA`, `teamB` | Defaults to `ROUNDHOUSE FC` and `SCRUFF FC`. URL-encode spaces. Each name accepts up to 22 letters, numbers and common name punctuation. |
| `session` | `new` (default) starts at match 01 and 0–0. Use `resume` to load a matching saved checkpoint. |

Click inside the browser source’s **Interact** window to give it focus. Press **O** for quality, frame cap, scoreboard, audio, commentary volume and fullscreen controls. In the regular game, **Turn sound on** appears when the browser blocks autoplay. In capture mode, click the pitch or select **Enable audio** in the operator controls. Press **D** for diagnostics or **Esc** to close the operator panel. Controls leave the match running. Explicit query values override saved preferences on page load. Invalid query values use the defaults. Volume settings persist locally. Changing the seed or team names selects a new match identity. Keep one active capture instance per browser storage profile so the two instances do not replace each other’s checkpoint.

See [streaming setup](docs/STREAMING.md), [architecture and tuning](docs/ARCHITECTURE.md), [asset provenance](docs/ASSETS.md), [verification](docs/VERIFICATION.md), and the [viewing test](docs/VIEWING-TEST.md).
