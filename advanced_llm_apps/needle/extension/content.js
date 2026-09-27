(() => {
  const existing = document.getElementById("needle-search-host");
  if (existing) {
    existing.dispatchEvent(new Event("needle-close"));
    return;
  }
  const host = document.createElement("div");
  host.id = "needle-search-host";
  host.style.cssText = "position:fixed;top:20px;right:20px;z-index:2147483647";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>
 :host{all:initial}*{box-sizing:border-box}[hidden]{display:none!important}.dock{width:min(510px,calc(100vw - 40px));background:#26362d;color:#f8faf3;border-radius:18px;box-shadow:0 12px 65px #0004;font:13px/1.5 system-ui;padding:15px}.top{display:flex;align-items:center;gap:9px}.brand{display:flex;align-items:center;gap:7px;font-size:18px;font-weight:750;letter-spacing:-.8px;margin-right:auto;color:#d5f58d}.brand svg{width:27px;height:27px;flex-shrink:0}button{font:inherit;cursor:pointer;border:0;border-radius:7px;background:transparent;color:#b9c6b7;padding:6px 9px}button:hover{background:#ffffff12;color:white}.search{display:flex;align-items:center;gap:8px;border-bottom:1px solid #ffffff26;margin-top:13px;padding-bottom:12px}input{width:100%;min-width:0;border:0;background:transparent;outline:none;color:white;font:17px system-ui}input::placeholder{color:#a3b0a0}.go{background:#d5f58d;color:#26362d;font-size:19px}.status{display:flex;align-items:center;gap:6px;margin-top:11px}.label{flex:1;color:#dbe5d6}.nav{background:#ffffff0d}.detail{margin:8px 0 0;color:#9ead99;font-size:11px}.error{color:#ffcca8}.quote{margin:8px 0 0;color:#dbe5d6;font-style:italic}.open{display:inline-block;margin-top:4px;color:#d5f58d}button:focus-visible,input:focus-visible{outline:2px solid #d5f58d;outline-offset:2px}
 </style><section class="dock" role="dialog" aria-label="Find with Needle"><div class="top"><span class="brand"><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="9.4" fill="#c9f078"/><path d="m9 25 12-17 3 2-12 17Zm9-13 3 2" fill="none" stroke="#26362d" stroke-width="2.4" stroke-linecap="round"/></svg><span>needle.</span></span><button class="settings" aria-label="Open settings">⚙</button><button class="close" aria-label="Close Needle">✕</button></div><form class="search"><input aria-label="Find what you mean" placeholder="Find what you mean…" maxlength="400"><button class="go" aria-label="Search">↗</button></form><div class="status"><span class="label" aria-live="polite">A thought, a question, a half-remembered idea.</span><button class="nav prev" aria-label="Previous match">↑</button><button class="nav next" aria-label="Next match">↓</button></div><p class="quote" hidden></p><a class="open" target="_blank" rel="noopener" hidden>open post ↗</a><p class="detail"></p></section>`;
  document.documentElement.append(host);
  const $ = (s) => shadow.querySelector(s),
    input = $("input"),
    label = $(".label"),
    detail = $(".detail"),
    quote = $(".quote"),
    open = $(".open");
  let active = 0,
    matches = [],
    generation = 0,
    closed = false,
    blocks = [],
    highlightStyle = null,
    harvested = false;
  const onXThread =
    /(^|\.)(x|twitter)\.com$/.test(location.hostname) &&
    location.pathname.includes("/status/");
  const tweets = new Map();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  function readTweets() {
    for (const el of document.querySelectorAll(
      'article [data-testid="tweetText"]',
    )) {
      const url = el
        .closest("article")
        .querySelector('a[href*="/status/"]:has(time)')
        ?.getAttribute("href");
      const text = el.textContent.trim();
      // Skip promoted posts mixed into replies.
      if (el.closest('[data-testid="placementTracking"]')) continue;
      if (url && text.length >= 12 && !tweets.has(url)) tweets.set(url, text);
    }
  }
  // X only renders ~30 posts near the viewport, so scroll the thread to read them all.
  async function harvestX(current) {
    const start = scrollY;
    let idle = 0;
    for (let i = 0; i < 80 && idle < 3 && tweets.size < 160; i++) {
      readTweets();
      for (const button of document.querySelectorAll('main [role="button"]'))
        if (
          /show (more|additional) replies|mostrar (más )?respuestas/i.test(
            button.textContent,
          )
        )
          button.click();
      label.textContent = `Reading replies… ${tweets.size}`;
      const before = tweets.size,
        atBottom =
          innerHeight + scrollY >= document.documentElement.scrollHeight - 50;
      scrollBy(0, innerHeight * 0.8);
      await sleep(500);
      if (closed || current !== generation) return;
      readTweets();
      idle = atBottom && tweets.size === before ? idle + 1 : 0;
    }
    scrollTo(0, start);
    harvested = true;
  }
  function tweetBlocks() {
    let size = 0,
      truncated = false;
    blocks = [];
    for (const [url, text] of tweets) {
      if (text.length > 2200) {
        truncated = true;
        continue;
      }
      if (blocks.length >= 160 || size + text.length > 60000) {
        truncated = true;
        break;
      }
      blocks.push({ id: `b${blocks.length}`, text, url });
      size += text.length;
    }
    detail.textContent = `${blocks.length} posts read${truncated ? " · some omitted" : ""} · Search sends text to Jev.`;
  }
  function elementOf(block) {
    if (block?.el?.isConnected) return block.el;
    if (!block?.url) return null;
    return [...document.querySelectorAll('article a[href*="/status/"]')]
      .find((a) => a.getAttribute("href") === block.url)
      ?.closest("article")
      .querySelector('[data-testid="tweetText"]');
  }
  function collect() {
    const candidates = [
      ...document.querySelectorAll(
        // Last two: X/Twitter tweet text and long-form article blocks.
        'p,li,pre,blockquote,h1,h2,h3,h4,td,figcaption,[data-testid="tweetText"],[data-block="true"]',
      ),
    ];
    let size = 0,
      truncated = false;
    const selected = candidates.filter(
      (el) =>
        !el.closest(
          'nav,header,footer,script,style,[contenteditable="true"]',
        ) &&
        el.getClientRects().length &&
        getComputedStyle(el).visibility !== "hidden",
    );
    blocks = [];
    for (const el of selected) {
      if (selected.some((other) => other !== el && el.contains(other)))
        continue;
      const text = el.textContent.trim();
      if (text.length < 12) continue;
      if (text.length > 2200) {
        truncated = true;
        continue;
      }
      if (blocks.length >= 160 || size + text.length > 60000) {
        truncated = true;
        break;
      }
      blocks.push({ id: `b${blocks.length}`, text, el });
      size += text.length;
    }
    detail.textContent = `${blocks.length} readable passages${truncated ? " · some content omitted" : ""} · Search sends text to Jev.`;
  }
  function clearHighlights() {
    if (globalThis.CSS?.highlights) {
      CSS.highlights.delete("needle-matches");
      CSS.highlights.delete("needle-active");
      CSS.highlights.delete("needle-sentences");
    }
    highlightStyle?.remove();
    highlightStyle = null;
  }
  function paint() {
    clearHighlights();
    if (!matches.length) return;
    const ranges = [],
      sentences = [];
    let selectedSentence = null;
    matches.forEach((match, i) => {
      const block = blocks.find((b) => b.id === match.id),
        el = elementOf(block);
      if (!el || el.textContent.trim() !== block.text) return;
      const context = new Range();
      context.selectNodeContents(el);
      ranges.push(context);
      const sentence = globalThis.NeedleTextRange(
        el,
        match.focus,
        block.text,
      );
      if (sentence) {
        sentences.push(sentence);
        if (i === active) selectedSentence = sentence;
      }
    });
    if (globalThis.CSS?.highlights && globalThis.Highlight) {
      highlightStyle = document.createElement("style");
      highlightStyle.textContent =
        "::highlight(needle-matches){background:#edf4e2;color:#344332}::highlight(needle-sentences){background:#d1ed98;color:#2c4228}::highlight(needle-active){background:#bce85f;color:#172414}";
      document.documentElement.append(highlightStyle);
      const context = new Highlight(...ranges),
        focus = new Highlight(...sentences),
        selected = new Highlight(
          ...(selectedSentence ? [selectedSentence] : []),
        );
      context.priority = 0;
      focus.priority = 1;
      selected.priority = 2;
      CSS.highlights.set("needle-matches", context);
      CSS.highlights.set("needle-sentences", focus);
      CSS.highlights.set("needle-active", selected);
    }
    elementOf(blocks.find((b) => b.id === matches[active].id))?.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "center",
      });
  }
  function update() {
    label.textContent = matches.length
      ? `${active + 1} of ${matches.length} ${matches.length === 1 ? "connection" : "connections"}`
      : "No strong matches.";
    const block = matches.length
      ? blocks.find((b) => b.id === matches[active].id)
      : null;
    const offscreen = Boolean(block?.url && !elementOf(block));
    quote.hidden = open.hidden = !offscreen;
    if (offscreen) {
      quote.textContent = `“${matches[active].focus?.text || block.text}”`;
      open.href = block.url;
    }
    paint();
  }
  async function search() {
    const current = ++generation;
    clearHighlights();
    quote.hidden = open.hidden = true;
    matches = [];
    active = 0;
    label.classList.remove("error");
    const query = input.value.trim();
    if (query.length < 2) {
      label.textContent = "Describe what you’re looking for.";
      return;
    }
    if (onXThread) {
      if (!harvested) await harvestX(current);
      if (closed || current !== generation) return;
      readTweets();
      tweetBlocks();
    } else collect();
    if (!blocks.length) {
      label.textContent = "No readable paragraphs on this page.";
      return;
    }
    label.textContent = "Finding the thought…";
    try {
      const result = await chrome.runtime.sendMessage({
        type: "NEEDLE_SEARCH",
        payload: {
          query,
          blocks: blocks.map(({ id, text }) => ({ id, text })),
        },
      });
      if (closed || current !== generation) return;
      if (!result || result.error)
        throw new Error(result?.error || "Could not complete the search.");
      matches = result.matches.filter((m) => blocks.some((b) => b.id === m.id));
      update();
      detail.textContent += ` · ${result.elapsedMs} ms · Bright = key sentence; pale = context.`;
    } catch (error) {
      if (!closed && current === generation) {
        label.textContent = error.message;
        label.classList.add("error");
      }
    }
  }
  function move(delta) {
    if (matches.length) {
      active = (active + delta + matches.length) % matches.length;
      update();
    }
  }
  function close() {
    closed = true;
    generation++;
    clearHighlights();
    host.remove();
    document.removeEventListener("keydown", key, true);
  }
  function key(event) {
    if (event.key === "Escape") {
      close();
      event.stopPropagation();
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "f") {
      event.preventDefault();
      event.stopPropagation();
      input.focus();
      input.select();
    }
  }
  host.addEventListener("needle-close", close);
  // Keep typing out of page hotkeys (e.g. GitHub's "t" file finder).
  for (const type of ["keydown", "keypress", "keyup"])
    host.addEventListener(type, (event) => event.stopPropagation());
  document.addEventListener("keydown", key, true);
  $(".close").onclick = close;
  $(".settings").onclick = () =>
    chrome.runtime.sendMessage({ type: "NEEDLE_SETTINGS" });
  $(".prev").onclick = () => move(-1);
  $(".next").onclick = () => move(1);
  $(".search").onsubmit = (event) => {
    event.preventDefault();
    search();
  };
  input.oninput = () => {
    generation++;
    clearHighlights();
    matches = [];
    label.textContent = "Press Enter to search.";
  };
  input.onkeydown = (event) => {
    if (event.key === "Enter" && matches.length) {
      event.preventDefault();
      move(event.shiftKey ? -1 : 1);
    }
  };
  if (onXThread) {
    readTweets();
    tweetBlocks();
  } else collect();
  input.focus();
})();
