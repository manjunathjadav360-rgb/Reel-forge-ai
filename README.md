# ReelForge AI

A phone-first music-video studio. Add a soundtrack, choose a visual direction, add an optional title or your own footage, and create a 60-second vertical music video.

## Included in this release

- Local audio selection and playback
- Four visual directions: Cinematic, Typography, Dreamscape and Pulse
- Six automatically sequenced visual scenes with transitions
- Moving landscapes, city lights, stars, ocean textures, silhouettes and atmospheric light
- Audio-reactive motion and waveform accents using the live audio analyser
- Optional user footage with subtle camera movement and cinematic overlay
- Custom title treatment
- Optional lyric text input: pasted lines are sequenced across the 60-second cut, displayed as timed captions and used for simple keyword-based visual mood selection
- Exact 60-second render: longer songs are cut at 60 seconds; shorter songs loop to fill the cut
- 720 × 1280 vertical video export with synchronized audio as WebM
- Responsive phone-first interface
- Local browser processing; selected files are not uploaded

## Run and deploy

Open `index.html` through GitHub Pages or a local static web server. For export, use a recent Chrome browser and keep the tab open while the 60-second render completes.

To enable deployment, open **Settings → Pages → Build and deployment → Source → GitHub Actions**. The included workflow deploys changes pushed to `main`.

## Honest capability boundary

This release creates an actual animated music-video composition, not AI-generated live-action footage. Lyrics are not automatically transcribed from audio. When users paste lyrics, lines are evenly sequenced across the 60-second cut and simple keyword rules guide visual mood selection; this is not deep semantic AI story understanding. Audio-reactive motion responds to the live frequency spectrum; it is not advertised as precise beat detection. No paid AI service or unlimited free generation is assumed.

## Next architecture layer

AI lyric transcription, mood/story planning and generated-scene providers can be connected as independent services without changing the local renderer. Provider integrations will be added only when credentials, terms and usable free quotas are available.
