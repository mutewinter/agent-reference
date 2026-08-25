---
theme: none
title: Your Agent is Starving
titleTemplate: "%s"
transition: none
fonts:
  mono: JetBrains Mono
---

# Your Agent is Starving

<div class="venue">NashJS &middot; August 25, 2026<br />Hosted by Vaco Nashville</div>

---
class: whoami
---

<div class="whoami-cols">
<div class="whoami-term">

<div class="term"><div class="term-bar">agent</div><div class="term-body"><div class="sess big white-dot"><div class="p"><div>&gt; what is my job now that you write all the code</div></div><div class="s"><span class="dot">&#9679;</span> Jeremy Mack</div><div class="step"><div>&nbsp;&nbsp;Typing code myself&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;13 years</div><div>&nbsp;&nbsp;Yelling at agents&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2 years</div><div>&nbsp;&nbsp;Nashville&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;since 2014</div><div>&nbsp;&nbsp;Remote&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;10 years</div><div>&nbsp;&nbsp;Failed startups&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;several</div><div>&nbsp;&nbsp;Vim config&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;immaculate</div></div></div></div></div>

</div>
<img class="whoami-photo" src="./assets/jeremy-mack.jpg" alt="Jeremy Mack" />
</div>

---
class: beat
---

## You might have seen me earlier this year

<div class="body">

<div class="shot-wrap"><img class="shot" src="./assets/last-talk.jpg" alt="NashJS: How to Build an AI App Builder for No One" /></div>

</div>

---
layout: statement
class: interlude
---

# Why is your agent starving?

---
class: beat
---

## Agents read minified source code

<div class="body">

<div class="term"><div class="term-bar">agent</div><div class="term-body"><div class="sess"><div class="p"><div>&gt; drag and drop puts the card in the wrong column if you drop it fast. can you fix</div></div><div class="step" v-click="1"><div><span class="dot">&#9679;</span> Read(package.json)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;"interactjs": "^1.10.28"</div></div><div class="step" v-click="2"><div><span class="dot">&#9679;</span> Bash(ls node_modules/interactjs)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;LICENSE&nbsp;&nbsp;&nbsp;README.md&nbsp;&nbsp;&nbsp;bower.json&nbsp;&nbsp;&nbsp;dist&nbsp;&nbsp;&nbsp;index.d.ts&nbsp;&nbsp;&nbsp;index.js</div></div><div class="step" v-click="3"><div><span class="dot">&#9679;</span> Read(node_modules/interactjs/dist/interact.min.js)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Read 4 lines</div></div><div class="step" v-click="4"><div><span class="dot">&#9679;</span> Bash(sed -n '3p' &hellip;/interact.min.js | cut -c 1-2000)</div><div class="warn"><span class="el">&#9151;</span>&nbsp;&nbsp;!function(t,e){&quot;object&quot;==typeof exports&amp;&amp;&quot;undefined&quot;!=typeof module?modul&hellip;</div></div><div class="step" v-click="5"><div><span class="dot">&#9679;</span> Bash(sed -n '3p' &hellip;/interact.min.js | cut -c 2000-4000)</div><div class="warn"><span class="el">&#9151;</span>&nbsp;&nbsp;ect.setPrototypeOf.bind():function(t,e){return t.__proto__=e,t},l(t,e)}f&hellip;</div></div><div class="step" v-click="6"><div><span class="dot">&#9679;</span> Bash(sed -n '3p' &hellip;/interact.min.js | cut -c 4000-6000)</div><div class="warn"><span class="el">&#9151;</span>&nbsp;&nbsp;:function(t){return&quot;number&quot;==typeof t},bool:function(t){return&quot;boolean&quot;&hellip;</div></div></div></div></div>

</div>

---
class: beat
---

## Agents search the web for docs

<div class="body">

<div class="term"><div class="term-bar">agent</div><div class="term-body"><div class="sess"><div class="p"><div>&gt; use effect to read the config file. handle it if the file isnt there</div></div><div class="step" v-click="1"><div><span class="dot">&#9679;</span> WebSearch("effect typescript read a file")</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Found 8 results</div></div><div class="step" v-click="2"><div><span class="dot">&#9679;</span> WebFetch(effect.website/docs/platform/file-system)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Received 412 KB</div><div class="warn">&nbsp;&nbsp;&nbsp;&lt;!doctype html&gt;&lt;html lang=&quot;en&quot; class=&quot;dark&quot;&gt;&lt;head&gt;&lt;meta charset=&quot;utf-8&quot;&gt;&lt;&hellip;</div><div class="warn">&nbsp;&nbsp;&nbsp;&hellip;&lt;nav class=&quot;sidebar&quot;&gt;&lt;a href=&quot;/docs/getting-started&quot;&gt;Getting Started&lt;/a&gt;&hellip;</div><div class="warn">&nbsp;&nbsp;&nbsp;&hellip;&lt;div class=&quot;prose&quot;&gt;&lt;h1&gt;FileSystem&lt;/h1&gt;&lt;p&gt;The &lt;code&gt;FileSystem&lt;/code&gt; tag&hellip;</div><div class="warn">&nbsp;&nbsp;&nbsp;&hellip;&lt;script id=&quot;__NEXT_DATA__&quot; type=&quot;application/json&quot;&gt;{&quot;props&quot;:{&quot;page&hellip;</div></div><div class="step" v-click="3"><div><span class="dot">&#9679;</span> WebFetch(effect.website/docs/getting-started)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Received 288 KB</div><div class="warn">&nbsp;&nbsp;&nbsp;&lt;!doctype html&gt;&lt;html lang=&quot;en&quot; class=&quot;dark&quot;&gt;&lt;head&gt;&lt;meta charset=&quot;utf-8&quot;&gt;&lt;&hellip;</div><div class="warn">&nbsp;&nbsp;&nbsp;&hellip;&lt;div class=&quot;prose&quot;&gt;&lt;h1&gt;Getting Started&lt;/h1&gt;&lt;p&gt;Effect is a library&hellip;</div></div><div class="step" v-click="4"><div><span class="dot">&#9679;</span> WebSearch("effect v4 filesystem readFileString example")</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Found 8 results</div></div></div></div></div>

</div>

---
class: beat
---

## Agents guess from memory

<div class="body">

<div class="term"><div class="term-bar">agent</div><div class="term-body"><div class="sess"><div class="p"><div>&gt; add a virtualized list here</div></div><div class="step" v-click="1"><div><span class="dot">&#9679;</span> Read(src/List.tsx)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Read 84 lines</div></div><div class="step" v-click="2"><div><span class="dot">&#9679;</span> Update(src/List.tsx)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Updated src/List.tsx with 4 additions</div><div class="add">&nbsp;&nbsp;&nbsp;&nbsp;14 +&nbsp;&nbsp;const rows = useVirtual({</div></div><div class="step" v-click="3"><div><span class="dot">&#9679;</span> Bash(pnpm tsc --noEmit)</div><div class="e"><span class="el">&#9151;</span>&nbsp;&nbsp;error TS2305: '@tanstack/react-virtual' has no exported member 'useVirtual'.</div></div><div class="step" v-click="4"><div><span class="dot">&#9679;</span> Update(src/List.tsx)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Updated src/List.tsx with 1 addition, 1 removal</div><div class="add">&nbsp;&nbsp;&nbsp;&nbsp;14 +&nbsp;&nbsp;const rows = useVirtualizer({</div></div><div class="step" v-click="5"><div><span class="dot">&#9679;</span> Bash(pnpm tsc --noEmit)</div><div class="e"><span class="el">&#9151;</span>&nbsp;&nbsp;error TS2353: 'size' does not exist in 'VirtualizerOptions'.</div></div></div></div></div>

</div>

---
class: beat twin
---

## Agents clone repos and forget about them

<div class="body">

<div class="term"><div class="term-bar">agent</div><div class="term-body"><div class="sess"><div class="p"><div>&gt; can remotion render a downloadable video right in the browser? if so wire it up</div></div><div class="step" v-click="1"><div><span class="dot">&#9679;</span> WebSearch("remotion render video in browser")</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Found 8 results</div></div><div class="step" v-click="2"><div><span class="dot">&#9679;</span> Bash(git clone --depth 1 https://github.com/remotion-dev/remotion.git /tmp/r)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Cloning into '/tmp/r'&hellip; done.</div></div><div class="step" v-click="3"><div><span class="dot">&#9679;</span> Grep("MediaRecorder", /tmp/r/packages)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;6 matches</div></div></div></div></div><div class="step" v-click="4"><div class="term"><div class="term-bar">agent</div><div class="term-body"><div class="sess"><div class="p"><div>&gt; add a progress bar while the video renders</div></div><div class="step" v-click="5"><div><span class="dot">&#9679;</span> WebSearch("remotion render progress callback")</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Found 8 results</div></div><div class="step" v-click="6"><div><span class="dot">&#9679;</span> Bash(git clone --depth 1 https://github.com/remotion-dev/remotion.git /tmp/r2)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Cloning into '/tmp/r2'&hellip; done.</div></div></div></div></div></div>

</div>

---
layout: statement
class: interlude
---

# Let&rsquo;s feed your agent

<div class="crave mono">npx agent-reference</div>

---
class: beat mid
---

## Start on the website

<div class="body">

<div class="browser">
<div class="browser-bar"><div class="addr">agent-reference.dev</div></div>
<div class="browser-body">
<div class="site-nav"><span class="site-name">agent-reference</span><span class="site-links">github&nbsp;&nbsp;&nbsp;npm&nbsp;<span class="ver">v0.1.0</span></span></div>
<div class="site-tag">Give your agents the source</div>
<div class="site-label">Let your agent do it</div>
<div class="copyblock">
<span class="copytext">Set this project up for agent-reference: run <code>npx agent-reference init</code> and follow the brief it prints.</span>
<span class="copyslot"><span class="copybtn" v-click.hide="1">Copy</span><span class="copybtn hit" v-click="1">Copied</span></span>
<svg class="cursor" v-click="1" viewBox="0 0 24 24" width="26" height="26"><path d="M5 2l14 9-6.6 1.3L9.9 20z" fill="#e8e8d3" stroke="#101010" stroke-width="1.4" stroke-linejoin="round"/></svg>
</div>
</div>
</div>

</div>

---
class: beat
---

## Paste the prompt into your agent

<div class="body">

<div class="term"><div class="term-bar">agent</div><div class="term-body"><div class="sess"><div class="p">&gt; <span v-click.hide="1" class="caret">&#9612;</span><span v-click="1">Set this project up for agent-reference: run `npx agent-reference init` and follow the brief it prints.</span></div><div class="step" v-click="2"><div><span class="dot">&#9679;</span> Bash(npx agent-reference init)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;transcript stores on this machine</div><div class="r">&nbsp;&nbsp;&nbsp;&nbsp;claude-code&nbsp;&nbsp;2,723 sessions&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;codex&nbsp;&nbsp;519&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;opencode&nbsp;&nbsp;147</div></div><div class="step" v-click="3"><div><span class="dot">&#9679;</span> Bash(rg -o '~/[^ ]+' ~/.claude/projects | uniq -c | sort -rn)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;312 ~/code/acme/api&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;88 ~/code/acme/workers</div></div><div class="step" v-click="4"><div><span class="dot">&#9679;</span> Write(agent-reference.json)</div><div><span class="dot">&#9679;</span> Write(agent-reference.local.json)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;{ "references": {</div><div class="r">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"api":&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{ "source": "../api",&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"description": "Acme's API" },</div><div class="r">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"workers": { "source": "../workers", "description": "Background jobs" } } }</div><div><span class="dot">&#9679;</span> Bash(agent-reference validate)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;both files ok</div></div><div class="step" v-click="5"><div class="s"><span class="dot">&#9679;</span> agent-reference is set up and the skill is installed. I declared the references you reach for most.</div></div></div></div></div>

</div>

---
class: config
---

## The config your agent created

<div class="body">

<div class="pair">
<div class="panel"><div class="panel-head">~/code/acme/web/agent-reference.json</div><div class="panel-body"><div class="code small"><div>{</div><div>&nbsp;&nbsp;<span class="k">"references"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"effect"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"source"</span>: <span class="s">"npm:effect@4.0.0-rc.111"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"We are on the v4 rc.</span></div><div><span class="s">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Every example online is v3"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;},</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"effect-docs"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"source"</span>: <span class="s">"github:Effect-TS/website"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"directory"</span>: <span class="s">"src/content/docs/v4"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"The v4 docs, which the</span></div><div><span class="s">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;site does not publish"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;}</div><div>&nbsp;&nbsp;}</div><div>}</div></div></div></div>
<div class="panel"><div class="panel-head">~/code/acme/web/agent-reference.local.json</div><div class="panel-body"><div class="code small"><div>{</div><div>&nbsp;&nbsp;<span class="k">"references"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"api"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"source"</span>: <span class="s">"../api"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"Acme's API. Read it</span></div><div><span class="s">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;before changing anything the</span></div><div><span class="s">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;web app sends or receives"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;}</div><div>&nbsp;&nbsp;}</div><div>}</div></div></div></div>
</div>

</div>

---
class: beat
---

## Now use your agent normally

<div class="body">

<div class="term"><div class="term-bar">agent</div><div class="term-body"><div class="sess"><div class="p"><div>&gt; use effect to read the config file. handle it if the file isnt there, same as the api does</div></div><div class="step" v-click="1"><div><span class="dot">&#9679;</span> Skill(agent-reference)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Launching skill: agent-reference</div></div><div class="step" v-click="2"><div><span class="dot">&#9679;</span> Bash(agent-reference status)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;effect&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;npm &middot; ready &middot; 4.0.0-rc.111 verified</div><div class="r">&nbsp;&nbsp;&nbsp;effect-docs&nbsp;&nbsp;git &middot; ready</div><div class="r">&nbsp;&nbsp;&nbsp;api&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;folder &middot; ready &middot; ~/code/acme/api</div></div><div class="step" v-click="3"><div><span class="dot">&#9679;</span> Bash(agent-reference get effect-docs)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;~/.agent-reference/src/&hellip;/website/6ee985b1/content/docs/v4</div><div><span class="dot">&#9679;</span> Read(&hellip;/docs/v4/platform/file-system.mdx)</div></div><div class="step" v-click="4"><div><span class="dot">&#9679;</span> Bash(agent-reference get api)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;~/code/acme/api</div><div><span class="dot">&#9679;</span> Read(~/code/acme/api/src/config.ts)</div></div><div class="step" v-click="5"><div><span class="dot">&#9679;</span> Update(src/config.ts)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Updated src/config.ts with 9 additions</div><div class="add">&nbsp;&nbsp;&nbsp;&nbsp;12 +&nbsp;&nbsp;const fs = yield* FileSystem.FileSystem</div><div class="add">&nbsp;&nbsp;&nbsp;&nbsp;13 +&nbsp;&nbsp;return yield* fs.readFileString(CONFIG_PATH)</div></div></div></div></div>

</div>

---
class: config
---

## How agent-reference works

<div class="body">

<div class="trio">
<div class="panel"><div class="panel-head">agent-reference.json</div><div class="panel-body"><div class="code small"><div>{</div><div>&nbsp;&nbsp;<span class="k">"references"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"effect"</span>:</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="s">"npm:effect@4.0.0-rc.111"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"pi"</span>:</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="s">"github:earendil-works/pi"</span></div><div>&nbsp;&nbsp;}</div><div>}</div></div></div></div>
<div class="panel"><div class="panel-head">~/.agent-reference/</div><div class="panel-body"><div class="code small"><div>git/</div><div>&nbsp;&nbsp;<span class="c"># bare mirrors,</span></div><div>&nbsp;&nbsp;<span class="c"># one per repository</span></div><div>&nbsp;&nbsp;Effect-TS/effect.git</div><div>&nbsp;&nbsp;earendil-works/pi.git</div><div>&nbsp;</div><div>src/</div><div>&nbsp;&nbsp;<span class="c"># one worktree</span></div><div>&nbsp;&nbsp;<span class="c"># per commit</span></div><div>&nbsp;&nbsp;…/effect/6ba41e59/</div><div>&nbsp;&nbsp;…/pi/dcd46192/</div><div>&nbsp;</div><div>state/</div><div>&nbsp;&nbsp;<span class="c"># one file</span></div><div>&nbsp;&nbsp;<span class="c"># per project</span></div><div>&nbsp;&nbsp;web-a3f81c04.json</div></div></div></div>
<div class="panel"><div class="panel-head">agent</div><div class="panel-body"><div class="sess" style="font-size:12px">
<div class="p"><div>&gt; stream tool results the</div><div>&nbsp;&nbsp;way pi does</div></div>
<div><span class="dot">&#9679;</span> Bash(agent-reference status)</div>
<div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;effect&nbsp;&nbsp;npm &middot; ready</div>
<div class="r">&nbsp;&nbsp;&nbsp;pi&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;git &middot; ready</div>
<div class="r">&nbsp;</div>
<div><span class="dot">&#9679;</span> Bash(agent-reference get pi)</div>
<div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;~/.agent-reference/src/&hellip;</div>
<div class="r">&nbsp;&nbsp;&nbsp;/pi/dcd46192</div>
<div class="r">&nbsp;</div>
<div><span class="dot">&#9679;</span> Read(&hellip;/pi/dcd46192/src/&hellip;)</div>
</div></div></div>
</div>

</div>

---
layout: statement
class: interlude
---

# What can a reference be?

---
class: config
---

## Reference the repos checked out beside this one

<div class="subhead">By name, so nobody has to remember a path</div>

<div class="body">

<div class="pair">
<div class="panel"><div class="panel-head">~/code/acme/</div><div class="panel-body"><div class="code"><div>├── web/</div><div>│&nbsp;&nbsp;&nbsp;└── agent-reference.local.json</div><div>├── api/</div><div>└── workers/</div></div></div></div>
<div class="panel"><div class="panel-head">web/agent-reference.local.json</div><div class="panel-body"><div class="code small"><div>{</div><div>&nbsp;&nbsp;<span class="k">"references"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"api"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"source"</span>: <span class="s">"../api"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"Acme's API"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;},</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"workers"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"source"</span>: <span class="s">"../workers"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"Background jobs"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;}</div><div>&nbsp;&nbsp;}</div><div>}</div></div></div></div>
</div>

</div>

---
class: config
---

## Check out any repo worth reading

<div class="subhead">Public or private, and the projects you copy patterns from</div>

<div class="body">

<div class="pair">
<div class="panel"><div class="panel-head">agent-reference.json</div><div class="panel-body"><div class="code small"><div>{</div><div>&nbsp;&nbsp;<span class="k">"references"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"codex"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"source"</span>: <span class="s">"github:openai/codex"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"OpenAI's coding agent,</span></div><div><span class="s">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;written in Rust"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;},</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"design-system"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"source"</span>: <span class="s">"git@git.acme.internal:</span></div><div><span class="s">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;platform/design-system.git"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"Our components. Read it</span></div><div><span class="s">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;before writing a new one"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;}</div><div>&nbsp;&nbsp;}</div><div>}</div></div></div></div>
<div class="panel"><div class="panel-head">agent</div><div class="panel-body"><div class="sess" style="font-size:12px"><div class="p"><div>&gt; copy codex's shell approval</div><div>&nbsp;&nbsp;flow into ours</div></div><div><span class="dot">&#9679;</span> Skill(agent-reference)</div><div><span class="dot">&#9679;</span> Bash(agent-reference get codex)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;&hellip;/openai/codex/a4f10b27</div><div><span class="dot">&#9679;</span> Grep(&quot;approval&quot;, &hellip;/codex-rs)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;23 matches</div><div><span class="dot">&#9679;</span> Read(&hellip;/core/src/safety.rs)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Read 210 lines</div><div><span class="dot">&#9679;</span> Update(src/approval.ts)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;38 additions</div></div></div></div>
</div>

</div>

---
class: config
---

## Check out source for exact npm versions

<div class="subhead">The version your lockfile installs, from the repository rather than the tarball</div>

<div class="body">

<div class="pair">
<div class="panel"><div class="panel-head">agent-reference.json</div><div class="panel-body"><div class="code small"><div>{</div><div>&nbsp;&nbsp;<span class="k">"references"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"ai"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"source"</span>: <span class="s">"npm:ai@7.0.78"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"The Vercel AI SDK.</span></div><div><span class="s">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;We are on v7"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;}</div><div>&nbsp;&nbsp;}</div><div>}</div></div></div></div>
<div class="panel"><div class="panel-head">agent</div><div class="panel-body"><div class="sess" style="font-size:12px"><div class="p"><div>&gt; add streaming to the chat route</div></div><div><span class="dot">&#9679;</span> Skill(agent-reference)</div><div><span class="dot">&#9679;</span> Bash(agent-reference get ai)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;&hellip;/vercel/ai/5b64c390</div><div><span class="dot">&#9679;</span> Read(&hellip;/generate-text/</div><div>&nbsp;&nbsp;&nbsp;&nbsp;stream-text.ts)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Read 340 lines</div><div><span class="dot">&#9679;</span> Update(src/routes/chat.ts)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;22 additions, 4 removals</div></div></div></div>
</div>

</div>

---
class: config
---

## Check out two versions of one package at once

<div class="subhead">Both on disk, keyed by commit, so an upgrade can be read from both sides</div>

<div class="body">

<div class="pair">
<div class="panel"><div class="panel-head">agent-reference.json</div><div class="panel-body"><div class="code small"><div>{</div><div>&nbsp;&nbsp;<span class="k">"references"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"zod-v4"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"source"</span>: <span class="s">"github:colinhacks/zod"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"ref"</span>: <span class="s">"v4.1.5"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"What we are moving to"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;},</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"zod-v3"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"source"</span>: <span class="s">"github:colinhacks/zod"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"ref"</span>: <span class="s">"v3.22.0"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"What we are moving off"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;}</div><div>&nbsp;&nbsp;}</div><div>}</div></div></div></div>
<div class="panel"><div class="panel-head">agent</div><div class="panel-body"><div class="sess" style="font-size:12px"><div class="p"><div>&gt; migrate our user schema to zod 4</div></div><div><span class="dot">&#9679;</span> Skill(agent-reference)</div><div><span class="dot">&#9679;</span> Bash(agent-reference get zod-v3)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;&hellip;/colinhacks/zod/ec2b5f19</div><div><span class="dot">&#9679;</span> Bash(agent-reference get zod-v4)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;&hellip;/colinhacks/zod/8f1c0a44</div><div><span class="dot">&#9679;</span> Read(&hellip;/zod/8f1c0a44/CHANGELOG.md)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Read 1,204 lines</div><div><span class="dot">&#9679;</span> Update(src/schema/user.ts)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;17 additions, 17 removals</div><div class="del">&nbsp;&nbsp;&nbsp;8 -&nbsp;&nbsp;email: z.string().email()</div><div class="add">&nbsp;&nbsp;&nbsp;8 +&nbsp;&nbsp;email: z.email()</div></div></div></div>
</div>

</div>

---
class: config
---

## Reference anything on your machine, from any folder

<div class="subhead">A config at home, for every project that has none of its own</div>

<div class="body">

<div class="pair">
<div class="panel"><div class="panel-head">~/</div><div class="panel-body"><div class="code"><div>├── agent-reference.local.json</div><div>├── .dotfiles/</div><div>└── code/</div><div>&nbsp;&nbsp;&nbsp;&nbsp;├── personal/</div><div>&nbsp;&nbsp;&nbsp;&nbsp;├── work/</div><div>&nbsp;&nbsp;&nbsp;&nbsp;└── forks/</div></div></div></div>
<div class="panel"><div class="panel-head">~/agent-reference.local.json</div><div class="panel-body"><div class="code small"><div>{</div><div>&nbsp;&nbsp;<span class="k">"references"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"dotfiles"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"source"</span>: <span class="s">"~/.dotfiles"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"Shell and editor"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;},</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"notes"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"source"</span>: <span class="s">"~/Documents/notes"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"Decisions I keep"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;}</div><div>&nbsp;&nbsp;}</div><div>}</div></div></div></div>
</div>

</div>

---
class: config
---

## Group references under one name

<div class="subhead">Ask for all of them at once, by that name</div>

<div class="body">

<div class="pair">
<div class="panel"><div class="panel-head">agent-reference.json</div><div class="panel-body"><div class="code small"><div><span class="k">"references"</span>: {</div><div>&nbsp;&nbsp;<span class="k">"harnesses"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"How others solve this"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"references"</span>: [</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="s">"github:earendil-works/pi"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="s">"github:openai/codex"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="s">"github:anomalyco/opencode"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;]</div><div>&nbsp;&nbsp;}</div><div>}</div></div></div></div>
<div class="panel"><div class="panel-head">agent</div><div class="panel-body"><div class="sess" style="font-size:12px">
<div class="p"><div>&gt; how do other <b>harnesses</b> compact context</div></div>
<div>
<div><span class="dot">&#9679;</span> Bash(agent-reference get harnesses)</div>
<div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;codex&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&hellip;/openai/codex/a4f10b27</div>
<div class="r">&nbsp;&nbsp;&nbsp;pi&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&hellip;/earendil-works/pi/dcd46192</div>
<div class="r">&nbsp;&nbsp;&nbsp;opencode&nbsp;&nbsp;&hellip;/anomalyco/opencode/71b9e40c</div>
</div>
<div>
<div><span class="dot">&#9679;</span> Read(&hellip;/pi/&hellip;/compaction.ts)</div>
</div>
</div></div></div>
</div>

</div>

---
class: config
---

## A config for your team, and a config for you

<div class="body">

<div class="pair">
<div class="panel"><div class="panel-head">~/code/acme/web/agent-reference.json</div><div class="panel-body"><div class="code tiny"><div>{</div><div>&nbsp;&nbsp;<span class="k">"references"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"ai"</span>: <span class="s">"npm:ai@7.0.78"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"effect"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"source"</span>: <span class="s">"npm:effect@4.0.0-rc.111"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"We are on the v4 rc"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;},</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"codex"</span>: <span class="s">"github:openai/codex"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"decisions"</span>: <span class="s">"./docs/decisions"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"harnesses"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"How others solve this"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"references"</span>: [</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="s">"github:earendil-works/pi"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="s">"github:openai/codex"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;]</div><div>&nbsp;&nbsp;&nbsp;&nbsp;}</div><div>&nbsp;&nbsp;}</div><div>}</div></div></div></div>
<div class="panel"><div class="panel-head">~/code/acme/web/agent-reference.local.json</div><div class="panel-body"><div class="code tiny"><div>{</div><div>&nbsp;&nbsp;<span class="k">"references"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"api"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"source"</span>: <span class="s">"../api"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"Acme's API"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;},</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"notes"</span>: <span class="s">"~/Documents/notes"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"forks"</span>: <span class="s">"~/code/forks"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"spike"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"source"</span>: <span class="s">"git@git.acme.internal:me/spike.git"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"My scratch repo. Never name</span></div><div><span class="s">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;this one in a commit"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;}</div><div>&nbsp;&nbsp;}</div><div>}</div></div></div></div>
</div>

</div>

---
layout: statement
class: interlude
---

# Oh yeah, this is a JavaScript meetup

---
class: beat mid
---

<div class="body">

<div class="split">
<div class="points">
<div class="lead">An npm package, written in TypeScript</div>
<div>Made by agents, for agents</div>
<div>First-class support for npm dependencies</div>
<div>Reads npm, pnpm, yarn and bun lockfiles</div>
</div>
<div class="shot-col"><img class="repo-shot" src="./assets/repo.png" alt="mutewinter/agent-reference on GitHub" /></div>
</div>

</div>

---
layout: statement
class: dark closer
---

<img class="brawndo-bed" src="./assets/brawndo.png" alt="" />
<img class="brawndo" src="./assets/brawndo.png" alt="" />

# agent-reference.dev

<div class="crave slow">It&rsquo;s got what agents crave</div>

<div class="cta">Questions? &middot; x.com/mutewinter &middot; hi@mutewinter.com</div>

<div class="thanks">Thank you, NashJS and Vaco Nashville</div>
