# Browser source setup

Run `npm run serve` in the workspace and keep that terminal open. Use [http://127.0.0.1:41730/](http://127.0.0.1:41730/) as the browser-source URL on the same machine.

## Record and cut an episode

[Open the recording layout](http://127.0.0.1:41730/?mode=capture&fps=30). Set the capture source to **1920×1080** for a horizontal episode or **1080×1920** for a vertical clip. Capture mode uses its own preferences and checkpoint, with larger score and caption graphics, a dedicated vertical camera, and brief on-field names during suitable conversations.

For an OBS or Streamlabs take, open **Broadcast controls** with **O**. Start the marker log at the start of the recording, note any difference between the two start times, then close the panel. At the end of the take, stop the marker log and download the JSON edit log and `.srt` subtitles. The JSON gives elapsed recording time, match time, score, players, save types, goals, and completed exchanges. It also records dialogue text and whether the game played the audio. The exported clock covers the current take. Download the files before starting another take or reloading the source.

On this Windows workspace, the command-line workflow uses Chrome to record the local game tab, reads audio from Rush Arena's own mixer, and uses the workspace's portable FFmpeg. On a new machine, install a full FFmpeg build with H.264, AAC, and `drawtext`, then put it on `PATH` or set `RUSH_FFMPEG` to its executable. Start the game server before recording.

```powershell
npm.cmd run record:take -- midnight-cup 180 horizontal artifacts/midnight-take
npm.cmd run edit:episode -- artifacts/midnight-take.json artifacts/rush-arena-pilot
```

The recorder creates the video, JSON markers, and source subtitles. The episode command selects a real rivalry or standout play, keeps score-changing action in order, adds a title and closing score, and writes an MP4, cut list, and retimed subtitles. A full-time marker from the featured match lets the episode close on the actual match result. A shorter take closes on the score at the selected play. Use `vertical` in place of `horizontal` to record a vertical clip. Use `$env:RUSH_CAPTIONS='off'` before recording when you want to add the exported subtitles in the editor.

Review the exported file on a phone with sound on and muted. Check that the opening delivers the title's promise, the ball and speakers are easy to follow, and the ending resolves the story. For this child-directed series, set the audience to **Made for Kids** in YouTube Studio. [YouTube audience settings](https://support.google.com/youtube/answer/9527654?hl=en)

## OBS Studio

1. Add a **Browser** source. Leave **Local file** clear and paste the capture URL.
2. Set width to `1920` and height to `1080`. For a 4K composition use `3840` and `2160`. Enable a custom frame rate when you need to match an explicit `fps=30` or `fps=60` game setting. Match the video canvas and output settings to the recording or stream you intend to make.
3. Disable **Shutdown source when not visible** and **Refresh browser source when scene becomes active**. The OBS Browser Source guide uses the second label. Some OBS Browser versions display **Refresh browser when scene becomes active**. [OBS Browser Source guide](https://obsproject.com/kb/browser-source) · [OBS Browser locale](https://github.com/obsproject/obs-browser/blob/master/data/locale/en-US.ini)
4. Enable **Control audio via OBS** to route the game, including Rush Radio commentary, into its own mixer channel. Right-click the source, choose **Interact**, press **O** and click **Enable audio** if the mixer is silent. Close the panel after checking the meter. Keep the same output from being captured a second time through desktop audio. [OBS Browser locale](https://github.com/obsproject/obs-browser/blob/master/data/locale/en-US.ini)

## Streamlabs Desktop

1. Add a **Browser Source** and paste the capture URL into its properties. Set **Width**, **Height** and **FPS** to match the output. Use **Use custom frame rate** if your version exposes it and the source needs a specific cap. [Streamlabs Browser Source guide](https://streamlabs.com/content-hub/post/introducing-browser-source-interaction-for-streamlabs-desktop)
2. Disable **Shutdown source when not visible** and **Refresh browser when scene becomes active**. These exact strings were checked in the installed Streamlabs Desktop 1.22.5 English browser plug-in locale. [Streamlabs Browser Source guide](https://streamlabs.com/content-hub/post/introducing-browser-source-interaction-for-streamlabs-desktop)
3. Select **Control audio via Streamlabs Desktop** to route the source to its own mixer channel. Use **Interact**, **O** and **Enable audio** if the game needs a user gesture. Check the source meter and monitoring/track settings. For desktop device capture, leave browser audio rerouting off and use a single capture of the device the source plays into. [Streamlabs browser-source audio routing](https://support.streamlabs.com/hc/en-us/articles/360043743994-Selective-Recording-Audio-Routing)

## Capture size, performance and continuity

| Setting | 1080p capture | 4K capture |
| --- | --- | --- |
| Browser viewport | 1920×1080 | 3840×2160 |
| Internal `high` resolution at 1× device scaling | 1920×1080 | 3840×2160 |
| Internal `medium` resolution at 1× device scaling | About 1651×929 | About 1991×1120 |
| Internal `low` resolution at 1× device scaling | About 1248×702 | About 1458×820 |
| Frame rate | Set the source and game to the same 60 or 30 fps target after checking measured playback | Use diagnostics and a recording to choose the sustainable target with the encoder running |

The capture viewport describes the output material received by the streaming application. The internal resolution is the canvas drawing buffer, which can render fewer pixels and upscale into that viewport. The FPS readout comes from measured frame intervals in the game, while the encoder and streaming application report their own delivery metrics. **D** shows the viewport, drawing buffer, scale, draw calls, render timing and physics timing. The game fits a 16:9 viewport without fullscreen.

Use one Browser Source instance across scenes where possible. Leave the server running, keep the capture surface visible and prevent the host from sleeping during a broadcast. A hidden browser may throttle or suspend animation frames even with scene reload disabled. During a long frame gap, simulation catch-up is bounded and the match clock advances only for executed ticks. An OS sleep or browser suspension can therefore create a gap between the match clock and real time. Refreshing the default source URL starts match 01 at 00:00 and 0–0. Add `session=resume` to the source URL to resume from the latest matching checkpoint after a reload. Checkpoints belong to the browser profile and origin, including its port. Clearing browser storage discards that continuity.

Halftime occurs at 10 minutes and a fresh match clock starts at each 20-minute boundary. The game keeps playing through the series. Speech, effects and music use the same browser audio graph. The operator can mix them separately. Captions remain visible while audio waits for a gesture and can be hidden with the rest of the HUD.

The browser tests exercise the delivered game in Chrome. They do not measure native source compositing, streaming encoders, audio levels in a recording, or delivery to YouTube.
