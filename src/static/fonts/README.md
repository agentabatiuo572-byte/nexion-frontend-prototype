# Bundled application fonts

These unmodified fonts are embedded for UVEL's own UI. This directory is not a font distribution service.

- General Sans 400/500/600/700: original WOFF2 files supplied by [Fontshare's CSS endpoint](https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600,700&display=swap), retrieved 2026-09-27. Retain `GENERAL-SANS-ITF-FFL.txt` (ITF FFL 2.0); do not subset, convert or redistribute as a font collection. [Official license](https://www.fontshare.com/licenses/itf-ffl).
- Manrope: original `Manrope[wght].ttf` from [google/fonts](https://github.com/google/fonts/tree/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/manrope), stored as `Manrope.ttf`. Retain `MANROPE-OFL.txt`; the official license text is reproduced with normalized whitespace.
- JetBrains Mono: original `JetBrainsMono[wght].ttf` from [google/fonts](https://github.com/google/fonts/tree/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/jetbrainsmono), stored as `JetBrainsMono.ttf`. Retain `JETBRAINS-MONO-OFL.txt`.

All binary font data is unchanged. `src/styles/fonts.css` retains the original family names and requested weights. These files and licenses are copied into the application build through uni-app's static asset pipeline.
