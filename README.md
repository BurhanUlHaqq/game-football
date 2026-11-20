# Roundhouse vs. Scruff · Cartoon Football

ZeeRush Gaming’s local broadcast of back-to-back, computer-controlled 5-a-side football matches. Roundhouse FC fields broad, round capybaras in gold. Scruff FC fields crooked-eared, shaggy misfits in teal. Both teams use the same gameplay rules, and their display names are configurable.

The first match starts when the page opens or refreshes, with the clock at **00:00** and the score at **0–0**. Halftime begins at **10:00**, when the teams swap ends and keep the score. At **20:00** the next match clock starts at 00:00 with a fresh score. The full-time celebration runs for **10 seconds**, with the final score and a countdown to the next automatic kickoff.

Boulder and Zip are the captains. Real saves, shots off the post, and steals can trigger their comic reactions. Quick saves get a short wave or shrug. Goal celebrations run for up to **4 seconds**. Roundhouse jumps and pumps its fists while Scruff spins and waves. The scorer gets a close-up, team-colored confetti, and a goal jingle before the automatic kickoff. Player portraits at restarts help viewers catch up. Halftime and full time show a short replay of a standout play and name the standout player when eligible.

The broadcast opens with a brief arena view, then moves down to the sideline to follow the ball and nearby players. Conversations get a closer two-player shot when both speakers are near play. Saves include the keeper and the surrounding action, and goal celebrations show faces, gestures, and confetti. Long balls pull the camera back gradually. The vertical view follows a long delivery toward the receiver and keeps the ball clear of the caption area.

Rush Radio includes 365 English clips across two announcers and all ten players. Calls rotate for goals, rebounds, specific keeper saves, and long passes. Teammates call to the player they pass to, and rivals trade playful challenges and comebacks after saves, tackles, and interceptions. Players glance at each other as they speak. The **On the Pitch** captions name both players and stay available with the sound muted. [Voice sampler](artifacts/rush-radio-preview.mp3)

Mitts and Patch set their feet and raise their gloves as attackers get close. They cover the near post, follow the shot, and choose a low scoop, body block, side dive, or high fingertip save. When they hold the ball, it stays between their gloves until the release.

Roundhouse and Scruff have their own supporter sections, flags, and sideline mascots. Each spectator has an individual mix of headwear, facial expression, and team-colored clothes. A wave crosses the stands at kickoff. The crowd leans in when a shot hits the post and reacts by team to goals and saves. The stadium screen and pitch-side boards show the real play, and the wide kickoff camera shows the surroundings before settling back on the ball.

The arena is surrounded by a park, paved entrances, a fountain, and a neighborhood behind the stands. Cloud layers drift across the sky and take on warmer colors at dusk. The opening shot in both recording formats shows the setting before the camera moves in to follow play.

Players lead teammates into space, drive the ball along open lanes, and loft it across the pitch when a teammate has room out wide. The camera widens to follow long balls and a brighter ground marker helps viewers follow higher kicks.

Open **Heroes** to meet all ten players and choose a favorite. Each player has a distinct face, build, and signature accessory in the match and on their portrait. The game remembers your favorite in this browser and puts a gold ring under them. Live spotlights take turns introducing the roster during natural restarts. [Player lineup](artifacts/rush-arena-npc-lineup.png)

**Production capture URL** [http://127.0.0.1:41730/](http://127.0.0.1:41730/)

For a stream or recording with a larger scoreboard, a fixed caption area, and on-field name tags during selected conversations, use the recording layout. It frames tall and wide sources separately. Press **O** to mark the start of a take and export its edit log or subtitles. [Open the recording layout](http://127.0.0.1:41730/?mode=capture&fps=30) · [Recording and episode workflow](docs/STREAMING.md#record-and-cut-an-episode)

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
| `captions` | In capture mode, `off` hides the on-video captions. Subtitle export still records the lines. |
| `audio` | `auto` (default) or `muted`. Visuals start even when browser autoplay is blocked. |
| `commentary` | `on` restores the default voice volume. `off` mutes the voice track while keeping caption cards. Omit it to use the saved volume. |
| `hud` | `minimal` (default) or `off` to hide the broadcast overlays. |
| `seed` | `zeerush` by default. Accepts 1–48 letters, digits, underscores, dots or hyphens. |
| `teamA`, `teamB` | Defaults to `ROUNDHOUSE FC` and `SCRUFF FC`. URL-encode spaces. Each name accepts up to 22 letters, numbers and common name punctuation. |
| `session` | `new` (default) starts at match 01 and 0–0. Use `resume` to load a matching saved checkpoint. |

Click inside the browser source’s **Interact** window to give it focus. Press **O** for quality, frame cap, scoreboard, audio, commentary volume and fullscreen controls. Select **Enable audio** if the browser requires a gesture. Press **D** for diagnostics or **Esc** to close the operator panel. Controls leave the match running. Explicit query values override saved preferences on page load. Invalid query values use the defaults. Volume settings persist locally. Changing the seed or team names selects a new match identity. Keep one active capture instance per browser storage profile so the two instances do not replace each other’s checkpoint.

See [streaming setup](docs/STREAMING.md), [architecture and tuning](docs/ARCHITECTURE.md), [asset provenance](docs/ASSETS.md), [verification](docs/VERIFICATION.md), and the [viewing test](docs/VIEWING-TEST.md).
