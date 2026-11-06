/* User study 2: which animation follows the prompt? (prompt dependence)
 * Every page shows one prompt and three animations of the SAME letter and subject, each made for a
 * different action; the participant picks the one that performs the prompt.
 * Static, no server. Each participant gets their own random order of the pages and of the three
 * animations (A, B, C) on every page. A clip whose file does not exist yet shows as an empty slot. At the end the answers are saved
 * as a JSON file the participant downloads and sends back; collected files go in responses/.
 * Progress is kept in this browser (localStorage) so a reload does not lose answers. */
(function () {
  "use strict";
  const STUDY = "userstudy_2_prompt_dependence";
  const VERSION = 3;          // 3 = answers saved to git through the Worker (2026-11-06)
  const STORE = "us2_state_v" + VERSION;
  const SUBMIT_URL = "";         // Cloudflare Worker that commits answers to git (userstudies/submit_worker); empty = download only
  const Q = window.STUDY_QUESTIONS || [];
  const BLOCKS = {
    prompt_dep: { title: "Which one follows the prompt?", note: "All three animations show the same letter and subject. They differ in how it moves." }
  };
  const app = document.getElementById("app");

  // ---------- small helpers ----------
  function rid() {
    const a = new Uint32Array(2);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return a[0].toString(16).padStart(8, "0") + a[1].toString(16).padStart(8, "0");
  }
  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const r = new Uint32Array(1); crypto.getRandomValues(r);
      const j = r[0] % (i + 1); [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") n.className = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) n.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c !== null && c !== undefined) n.append(c.nodeType ? c : document.createTextNode(c));
    return n;
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* private mode: fine */ } }
  function load() { try { return JSON.parse(localStorage.getItem(STORE) || "null"); } catch (e) { return null; } }

  // ---------- state ----------
  function fresh() {
    const order = [];
    for (const b of Object.keys(BLOCKS)) order.push(...shuffled(Q.filter(q => q.block === b).map(q => q.id)));
    const clipOrder = {};
    for (const q of Q) clipOrder[q.id] = shuffled(q.clips.map(c => c.id));
    return { study: STUDY, version: VERSION, session: rid(), started: null, finished: null,
             order, clipOrder, answers: {}, page: -1 };
  }
  let state = load();
  if (!state || state.version !== VERSION || !state.order || state.order.length !== Q.length) state = fresh();
  const byId = Object.fromEntries(Q.map(q => [q.id, q]));

  // ---------- screens ----------
  function render() {
    window.scrollTo(0, 0);
    app.replaceChildren();
    if (state.page < 0) return intro();
    if (state.page >= state.order.length) return done();
    return question(state.page);
  }

  function intro() {
    app.append(
      el("h1", {}, "Animated letters: which one follows the prompt?"),
      el("div", { class: "panel" },
        el("p", {}, "Each page shows a short text prompt, the original letter, and three looping animations of that letter. All three show the same subject, but each one moves differently."),
        el("ul", { class: "steps" },
          el("li", {}, "Watch all three animations for a few loops."),
          el("li", {}, "Rank them from best to worst by how well their motion matches the action in the prompt. Click the best one first, then the second best; the last one is ranked for you."),
          el("li", {}, "Judge the motion: what is the letter doing? Small differences in shape or drawing quality do not matter here.")),
        el("p", {}, "There are " + Q.length + " pages and it takes about 5 minutes."),
        el("p", { class: "muted small" }, "Your answers stay in this browser until the end, where you download them as a small file and send it back to us. Nothing else is recorded.")),
      el("div", { class: "nav" }, el("span"),
        el("button", { class: "btn", onclick: () => {
          state.started = state.started || new Date().toISOString();
          state.page = 0; save(); render();
        } }, Object.keys(state.answers).length ? "Continue" : "Start")));
  }

  function question(i) {
    const q = byId[state.order[i]];
    const block = BLOCKS[q.block];
    const shownAt = Date.now();
    const ans = state.answers[q.id];
    const ids = state.clipOrder[q.id];
    const clipById = Object.fromEntries(q.clips.map(c => [c.id, c]));
    const bust = "?v=" + shownAt;                       // restart every GIF together on each visit
    const N = ids.length, ORD = ["1st", "2nd", "3rd", "4th"];
    let rank = (ans && ans.ranking && ans.ranking.length === N) ? ans.ranking.slice() : [];   // clip ids, best -> worst
    let resets = ans ? (ans.resets || 0) : 0;
    const next = el("button", { class: "btn", disabled: "" }, i === state.order.length - 1 ? "Finish" : "Next");
    const hint = el("p", { class: "muted small hint" });
    const clear = el("button", { class: "btn secondary", type: "button" }, "Clear ranking");
    const badges = {};
    const buttons = ids.map((cid, k) => {
      const letter = "ABC"[k];
      badges[cid] = el("div", { class: "rank" });
      const b = el("button", { class: "choice", type: "button", "aria-label": "Animation " + letter },
        badges[cid], clipById[cid].src ? el("img", { src: clipById[cid].src + bust, alt: "Animation " + letter, loading: "eager" })
                          : el("div", { class: "placeholder" }, "clip to come"),
        el("div", { class: "lab" }, "Animation " + letter));
      b.addEventListener("click", () => {
        if (rank.includes(cid)) return;                    // already ranked: use Clear ranking to redo
        rank.push(cid);
        if (rank.length === N - 1) rank.push(ids.find(x => !rank.includes(x)));   // the last one is implied
        paint(); commit();
      });
      return b;
    });
    function paint() {
      buttons.forEach((b, k) => {
        const r = rank.indexOf(ids[k]);
        b.setAttribute("data-rank", r < 0 ? "" : String(r + 1));
        b.setAttribute("aria-pressed", r < 0 ? "false" : "true");
        badges[ids[k]].textContent = r < 0 ? "" : ORD[r] + (r === 0 ? " (best)" : r === N - 1 ? " (worst)" : "");
      });
      hint.textContent = rank.length === 0 ? "Click the best animation first."
                       : rank.length < N ? "Now click the second best. The last one is ranked for you."
                       : "Ranked. Use Clear ranking to change it.";
      if (rank.length === N) next.removeAttribute("disabled"); else next.setAttribute("disabled", "");
      clear.disabled = rank.length === 0;
    }
    function commit() {
      if (rank.length === N) state.answers[q.id] = { ranking: rank.slice(), positions: rank.map(c => "ABC"[ids.indexOf(c)]),
                                                     shown: ids, seconds_to_rank: Math.round((Date.now() - shownAt) / 100) / 10, resets };
      else delete state.answers[q.id];
      save();
    }
    clear.addEventListener("click", () => { if (rank.length) resets++; rank = []; paint(); commit(); });
    paint();
    next.addEventListener("click", () => { state.page = i + 1; if (state.page >= state.order.length) state.finished = new Date().toISOString(); save(); render(); });
    const back = el("button", { class: "btn secondary", onclick: () => { state.page = i - 1; save(); render(); } }, "Back");
    const pct = Math.round(100 * i / state.order.length);
    app.append(
      el("div", { class: "topbar" }, el("strong", {}, block.title), el("span", { class: "muted small" }, "Page " + (i + 1) + " of " + state.order.length)),
      el("div", { class: "progress", "aria-hidden": "true" }, el("div", { style: "width:" + pct + "%" })),
      el("div", { class: "panel" },
        el("p", { class: "muted small blocknote" }, block.note),
        el("div", { class: "muted small" }, "Prompt"),
        el("p", { class: "prompt" }, q.prompt),
        el("p", { class: "question" }, "Rank the animations from best to worst: how well does each one match the action in the prompt?"),
        el("div", { class: "row" },
          el("div", { class: "source" }, q.input ? el("img", { src: q.input, alt: "The original letter" }) : el("div", { class: "placeholder" }, "letter"),
                                el("div", { class: "lab" }, "Original letter")),
          el("div", { class: "choices" }, buttons)),
        el("div", { class: "rankbar" }, hint, clear)),
      el("div", { class: "nav" }, back, next));
  }

  function result() {
    return {
      study: STUDY, version: VERSION, session: state.session,
      started: state.started, finished: state.finished, user_agent: navigator.userAgent,
      answers: state.order.map((qid, k) => Object.assign({ question: qid, page: k + 1, block: byId[qid].block, prompt: byId[qid].prompt },
                                                        state.answers[qid] || {}))
    };
  }

  function done() {
    const data = result();
    const text = JSON.stringify(data, null, 1);
    const fname = "us2_" + state.session + ".json";
    const missing = data.answers.filter(a => !a.ranking).length;
    const download = () => {
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const a = el("a", { href: url, download: fname }); document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
    const ta = el("textarea", { readonly: "", "aria-label": "Your answers" }); ta.value = text;
    const copyBtn = el("button", { class: "btn secondary" }, "Copy answers");
    copyBtn.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(text); copyBtn.textContent = "Copied"; }
      catch (e) { ta.select(); document.execCommand("copy"); copyBtn.textContent = "Copied"; }
    });
    const status = el("p", { class: "status" });
    const retry = el("button", { class: "btn", type: "button", style: "display:none" }, "Try again");
    const backup = [
      el("div", { class: "actions" }, el("button", { class: "btn secondary", onclick: download }, "Download answers (" + fname + ")"), copyBtn),
      el("p", { class: "muted small", style: "margin-top:14px" }, "If the download does not work on your device, copy the text below and send it instead."),
      ta];
    const sig = JSON.stringify(data.answers);
    const isPreview = new URLSearchParams(location.search).has("preview");
    function send() {                                   // store the answers in git through the Worker
      if (!SUBMIT_URL || isPreview) { status.textContent = "Please download your answers and send the file back to us."; return; }
      if (state.submittedSig === sig) { status.textContent = "Your answers have been saved. Thank you, you can close this page."; return; }
      status.textContent = "Saving your answers..."; retry.style.display = "none";
      fetch(SUBMIT_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: text })
        .then(r => r.json().then(j => { if (!(r.ok && j.ok)) throw new Error(j.error || String(r.status)); }))
        .then(() => { state.submittedSig = sig; save(); status.textContent = "Your answers have been saved. Thank you, you can close this page."; })
        .catch(() => { status.textContent = "We could not save your answers automatically. Please try again, or download them below and send the file to us."; retry.style.display = ""; });
    }
    retry.addEventListener("click", send);
    app.append(
      el("h1", {}, "Thank you!"),
      el("div", { class: "panel" },
        missing ? el("p", {}, "You skipped " + missing + " page(s). You can go back and answer them first.") : null,
        status, retry,
        SUBMIT_URL ? el("details", { class: "backup" }, el("summary", { class: "muted small" }, "Keep a copy of your answers"), ...backup)
                   : el("div", {}, ...backup)),
      el("div", { class: "nav" },
        el("button", { class: "btn secondary", onclick: () => { state.page = state.order.length - 1; save(); render(); } }, "Back"),
        el("button", { class: "btn secondary", onclick: () => {
          if (confirm("Start over? Your current answers in this browser will be cleared.")) { state = fresh(); save(); render(); }
        } }, "Start over")));
    send();
  }

  // ?preview=N shows page N (0-based; "done" for the last screen) for checking the layout. It uses a
  // throwaway state and never touches the participant's saved answers.
  const pv = new URLSearchParams(location.search).get("preview");
  if (pv !== null) {
    state = fresh(); save = function () {};
    if (pv === "done") { state.order.forEach(id => { state.answers[id] = { ranking: state.clipOrder[id].slice(), positions: ["A", "B", "C"] }; }); state.page = state.order.length; }
    else state.page = Math.max(-1, Math.min(Q.length - 1, parseInt(pv, 10) || 0));
  }
  // preload every clip once so pages show instantly
  for (const q of Q) for (const c of q.clips) if (c.src) { const im = new Image(); im.src = c.src; }
  render();
})();
