# User study 2: does the motion follow the prompt?

A static web page (works on GitHub Pages or from any web server). Each of the 10 pages shows a text
prompt, the original letter, and three looping animations of the same letter and subject, labelled
only A, B and C. Each animation was made for a different action. Participants pick the one that
performs the action in the prompt.

**Status:** the clips are not ready yet, so every page currently shows empty slots and placeholder
prompts. The page flow, layout and answer file already work.

The order of the pages, and the order of A/B/C on every page, are randomised per participant and
recorded with the answers.

## Collecting answers

There is no server. At the end each participant downloads a JSON file (or copies the same text) and
sends it to us. Put each file in `responses/` and commit it. Progress is kept in the participant's
browser, so reloading the page does not lose answers.

## Files

- `index.html`, `style.css`, `app.js`: the study page.
- `questions.js`: the prompts and clip files (generated).
- `assets/qNN/`: the original letter and the three animations, under neutral names (once added).
- `responses/`: collected answer files.

## Running it locally

From this folder: `python3 -m http.server 8000`, then open http://localhost:8000.
