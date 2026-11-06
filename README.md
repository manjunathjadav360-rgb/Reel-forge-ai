# ReelForge AI

A phone-first, audio-led video creation studio. Start with a sound, choose a visual direction, add an optional opening line or your own footage, then create a synchronized vertical video.

## Current build

The first browser MVP includes:
- Audio file selection and local preview (MP3, WAV, M4A supported by the browser)
- Four visual directions: Cinematic, Typography, Dreamscape, and Minimal
- Editable opening text
- Optional user-supplied background footage
- 9:16 animated canvas composition
- Synchronized audio + video export as WebM using the browser's MediaRecorder API
- Responsive layout for phones and desktop
- Local-only processing in this build; files are not uploaded

## Run it

Open `index.html` through a local static web server or GitHub Pages. For the most reliable export, use a recent version of Chrome. Keep the tab open while the video is rendering.

## Enable GitHub Pages

In the repository, open **Settings → Pages** and set the build/deployment source to **GitHub Actions**. The included workflow deploys the site on every push to `main`.

## Honest capability boundary

This MVP does **not** yet generate new AI footage, transcribe lyrics, detect musical beats, or automatically understand a song's mood. It makes a real animated video composition and synchronizes the selected audio. AI scene generation and deeper audio analysis will be added through separate provider modules when suitable services and credentials are available. No paid provider or unlimited free generation is assumed.

## Project direction

The longer-term goal is an audio-aware editing assistant that can plan scenes, typography, pacing, transitions, and visual treatments across cinematic, animated, storytelling, and social formats. Provider integrations will remain modular so the app can use available free options without locking the project to one service.
