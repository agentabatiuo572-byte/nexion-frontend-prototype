# Bundled application fonts

These unmodified fonts are embedded for UVEL's own UI. This directory is not a font distribution service.

- Inter: the variable WOFF2 subsets `latin`, `latin-ext` and `vietnamese` (weight 400–600, optical size 14–32) exactly as served by the [Google Fonts CSS endpoint](https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..600&display=swap), retrieved 2026-10-29 and stored as `Inter-latin.woff2`, `Inter-latin-ext.woff2` and `Inter-vietnamese.woff2`. Retain `INTER-OFL.txt`, copied from the [Inter project](https://github.com/rsms/inter/blob/master/LICENSE.txt). SHA-256: latin `dd8a4575be9806105ac3decd02805cd2782fe7c05abb02c582316bc436ce03ae`, latin-ext `8bc9dee39deab5dc6599980e563c5023053387e4c391f5c419543e493e024c39`, vietnamese `07df696d36deed379a901c2867fd700fee3453f46e384424a08ee376178a81b1`.
- JetBrains Mono: original `JetBrainsMono[wght].ttf` from [google/fonts](https://github.com/google/fonts/tree/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/jetbrainsmono), stored as `JetBrainsMono.ttf`. Retain `JETBRAINS-MONO-OFL.txt`. Used only for addresses, hashes and codes read character by character.

All binary font data is unchanged. `src/styles/fonts.css` declares each Inter subset with its original `unicode-range`, so a page loads only the subsets its text needs; Chinese falls through to the system fonts. These files and licenses are copied into the application build through uni-app's static asset pipeline.

General Sans and Manrope were retired on 2026-10-29 (uvel-docs design system DS-25): General Sans could not draw Vietnamese stacked diacritics, and patching those code points with Manrope mixed two designs inside one word.
