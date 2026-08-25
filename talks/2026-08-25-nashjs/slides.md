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
class: beat
---

## Reads the bundle, not the source

<div class="body">

<div class="term"><div class="term-bar"></div><div class="term-body"><div class="sess"><div class="p">&gt; drag and drop puts the card in the wrong column if you drop it fast. can you fix</div><div class="step" v-click="1"><div><span class="dot">&#9679;</span> Read(package.json)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;"interactjs": "^1.10.28"</div></div><div class="step" v-click="2"><div><span class="dot">&#9679;</span> Bash(ls node_modules/interactjs)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;LICENSE&nbsp;&nbsp;&nbsp;README.md&nbsp;&nbsp;&nbsp;bower.json&nbsp;&nbsp;&nbsp;dist&nbsp;&nbsp;&nbsp;index.d.ts&nbsp;&nbsp;&nbsp;index.js</div></div><div class="step" v-click="3"><div><span class="dot">&#9679;</span> Read(node_modules/interactjs/dist/interact.min.js)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Read 4 lines</div></div><div class="step" v-click="4"><div class="r">/* interact.js 1.10.28 | https://raw.github.com/taye/interact.js/main/LICENSE */</div><div class="r">!function(t,e){&quot;object&quot;==typeof exports&amp;&amp;&quot;undefined&quot;!=typeof module?module.expo&hellip;</div></div><div class="step" v-click="5"><div><span class="dot">&#9679;</span> Bash(sed -n '3p' &hellip;/interact.min.js | cut -c 1-2000)</div><div><span class="dot">&#9679;</span> Bash(sed -n '3p' &hellip;/interact.min.js | cut -c 2000-4000)</div><div><span class="dot">&#9679;</span> Bash(sed -n '3p' &hellip;/interact.min.js | cut -c 4000-6000)</div></div><div class="step" v-click="6"><div class="s"><span class="dot">&#9679;</span> The drop target is cached on pointerdown, so a fast drop reads a stale rect.</div></div></div></div></div>

</div>

---
class: whoami
---

<div class="whoami-cols">
<div class="whoami-term">

<div class="term"><div class="term-bar"></div><div class="term-body"><div class="sess big white-dot"><div class="p">&gt; what is my job now that you write all the code</div><div class="s"><span class="dot">&#9679;</span> Jeremy Mack</div><div class="step"><div>&nbsp;&nbsp;Typing code myself&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;13 years</div><div>&nbsp;&nbsp;Yelling at agents&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2 years</div><div>&nbsp;&nbsp;Nashville&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;since 2014</div><div>&nbsp;&nbsp;Remote&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;10 years</div><div>&nbsp;&nbsp;Failed startups&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;several</div><div>&nbsp;&nbsp;Vim config&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;immaculate</div></div></div></div></div>

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

## Fetches raw docs from the web

<div class="body">

<div class="term"><div class="term-bar"></div><div class="term-body"><div class="sess"><div class="p">&gt; use effect to read the config file. handle it if the file isnt there</div><div class="step" v-click="1"><div><span class="dot">&#9679;</span> WebSearch("effect typescript read a file")</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Found 8 results</div></div><div class="step" v-click="2"><div><span class="dot">&#9679;</span> WebFetch(effect.website/docs/platform/file-system)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Received 412 KB</div></div><div class="step" v-click="3"><div><span class="dot">&#9679;</span> WebFetch(effect.website/docs/getting-started)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Received 288 KB</div></div><div class="step" v-click="4"><div><span class="dot">&#9679;</span> Update(src/config.ts)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Updated src/config.ts with 12 additions</div></div></div></div></div>

</div>

---
class: beat
---

## Guesses from memory

<div class="body">

<div class="term"><div class="term-bar"></div><div class="term-body"><div class="sess"><div class="p">&gt; add a virtualized list here</div><div class="step" v-click="1"><div><span class="dot">&#9679;</span> Read(src/List.tsx)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Read 84 lines</div></div><div class="step" v-click="2"><div><span class="dot">&#9679;</span> Update(src/List.tsx)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Updated src/List.tsx with 4 additions</div><div class="r">&nbsp;&nbsp;&nbsp;&nbsp;14 +&nbsp;&nbsp;const rows = useVirtual({</div></div><div class="step" v-click="3"><div><span class="dot">&#9679;</span> Bash(pnpm tsc --noEmit)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;error TS2305: '@tanstack/react-virtual' has no exported member</div><div class="r">&nbsp;&nbsp;&nbsp;'useVirtual'.</div></div><div class="step" v-click="4"><div><span class="dot">&#9679;</span> Update(src/List.tsx)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Updated src/List.tsx with 1 addition, 1 removal</div></div><div class="step" v-click="5"><div><span class="dot">&#9679;</span> Bash(pnpm tsc --noEmit)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;error TS2353: 'size' does not exist in 'VirtualizerOptions'.</div></div></div></div></div>

</div>

---
class: beat
---

## Clones the repo every time

<div class="body">

<div class="term"><div class="term-bar"></div><div class="term-body"><div class="sess"><div class="p">&gt; can remotion render a downloadable video right in the browser? if so wire it up</div><div class="step" v-click="1"><div><span class="dot">&#9679;</span> WebSearch("remotion render video in browser")</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Found 8 results</div></div><div class="step" v-click="2"><div><span class="dot">&#9679;</span> Bash(git clone --depth 1 https://github.com/remotion-dev/remotion.git /tmp/r)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Cloning into '/tmp/r'&hellip; done.</div></div><div class="step" v-click="3"><div><span class="dot">&#9679;</span> Read(/tmp/r/packages/renderer/src/render-frames.ts)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Read 340 lines</div><div><span class="dot">&#9679;</span> Grep("MediaRecorder", /tmp/r/packages)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;6 matches</div></div><div class="step" v-click="4"><div class="s"><span class="dot">&#9679;</span> Yes. Here is the browser-side render path wired up.</div></div></div></div></div>

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

## Paste the setup prompt

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

## Your agent sets itself up

<div class="body">

<div class="term"><div class="term-bar"></div><div class="term-body"><div class="sess"><div class="p">&gt; Set this project up for agent-reference: run `npx agent-reference init` and follow the brief it prints.</div><div class="step" v-click="1"><div><span class="dot">&#9679;</span> Bash(npx agent-reference init)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;transcript stores on this machine</div><div class="r">&nbsp;&nbsp;&nbsp;&nbsp;claude-code&nbsp;&nbsp;2,723 sessions&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;codex&nbsp;&nbsp;519&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;opencode&nbsp;&nbsp;147</div><div class="r">&nbsp;&nbsp;&nbsp;&hellip; +31 lines (ctrl+o to expand)</div></div><div class="step" v-click="2"><div><span class="dot">&#9679;</span> Bash(rg -o '~/[^ ]+' ~/.claude/projects | uniq -c | sort -rn)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;312 ~/code/acme/api&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;88 ~/code/acme/workers</div></div><div class="step" v-click="3"><div><span class="dot">&#9679;</span> Write(agent-reference.local.json)</div><div><span class="dot">&#9679;</span> Update(.gitignore)</div><div><span class="dot">&#9679;</span> Bash(agent-reference validate)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;agent-reference.local.json&nbsp;&nbsp;ok</div></div><div class="step" v-click="4"><div class="s"><span class="dot">&#9679;</span> Set up. I declared the repo you point me at most, and pinned effect and</div><div class="s">&nbsp;&nbsp;its v4 docs, since this project installs a prerelease.</div></div></div></div></div>

</div>

---
class: config
---

## What it created

<div class="body">

<div class="pair">
<div class="panel"><div class="panel-head">~/code/acme/web/agent-reference.json</div><div class="panel-body"><div class="code small"><div>{</div><div>&nbsp;&nbsp;<span class="k">"packages"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"npm:effect"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"version"</span>: <span class="s">"4.0.0-rc.111"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"We are on the v4 rc.</span></div><div><span class="s">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Every example online is v3"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;}</div><div>&nbsp;&nbsp;},</div><div>&nbsp;&nbsp;<span class="k">"git"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"effect-docs"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"repository"</span>: <span class="s">"github:Effect-TS/website"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"directory"</span>: <span class="s">"content/docs/v4"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"The v4 docs, which the</span></div><div><span class="s">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;site does not publish"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;}</div><div>&nbsp;&nbsp;}</div><div>}</div></div></div></div>
<div class="panel"><div class="panel-head">~/code/acme/web/agent-reference.local.json</div><div class="panel-body"><div class="code small"><div>{</div><div>&nbsp;&nbsp;<span class="k">"paths"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"api"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"path"</span>: <span class="s">"../api"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"Acme's API. Read it</span></div><div><span class="s">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;before changing anything the</span></div><div><span class="s">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;web app sends or receives"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;}</div><div>&nbsp;&nbsp;}</div><div>}</div></div></div></div>
</div>

</div>

---
class: beat
---

## agent-reference in action

<div class="body">

<div class="term"><div class="term-bar"></div><div class="term-body"><div class="sess"><div class="p">&gt; use effect to read the config file. handle it if the file isnt there, same as the api does</div><div class="step" v-click="1"><div><span class="dot">&#9679;</span> Skill(agent-reference)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;Launching skill: agent-reference</div></div><div class="step" v-click="2"><div><span class="dot">&#9679;</span> Bash(agent-reference status)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;effect&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;npm &middot; ready &middot; 4.0.0-rc.111 verified</div><div class="r">&nbsp;&nbsp;&nbsp;effect-docs&nbsp;&nbsp;git &middot; ready</div><div class="r">&nbsp;&nbsp;&nbsp;api&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;folder &middot; ready &middot; ~/code/acme/api</div></div><div class="step" v-click="3"><div><span class="dot">&#9679;</span> Bash(agent-reference get effect-docs)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;~/.agent-reference/src/&hellip;/website/6ee985b1/content/docs/v4</div><div><span class="dot">&#9679;</span> Read(&hellip;/docs/v4/platform/file-system.mdx)</div></div><div class="step" v-click="4"><div><span class="dot">&#9679;</span> Bash(agent-reference get api)</div><div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;~/code/acme/api</div><div><span class="dot">&#9679;</span> Read(~/code/acme/api/src/config.ts)</div></div><div class="step" v-click="5"><div><span class="dot">&#9679;</span> Update(src/config.ts)</div><div><span class="dot">&#9679;</span> Bash(pnpm tsc --noEmit)</div></div></div></div></div>

</div>

---
layout: statement
class: interlude
---

# How it works

---
class: config
---

## A name in, a path out

<div class="body">

<div class="trio">
<div class="panel"><div class="panel-head">agent-reference.json</div><div class="panel-body"><div class="code small"><div>{</div><div>&nbsp;&nbsp;<span class="k">"packages"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"npm:effect"</span>:</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="s">"4.0.0-rc.111"</span></div><div>&nbsp;&nbsp;},</div><div>&nbsp;&nbsp;<span class="k">"git"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"pi"</span>:</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="s">"github:earendil-works/pi"</span></div><div>&nbsp;&nbsp;}</div><div>}</div></div></div></div>
<div class="panel"><div class="panel-head">~/.agent-reference/</div><div class="panel-body"><div class="code small"><div>git/</div><div>&nbsp;&nbsp;<span class="c"># bare mirrors,</span></div><div>&nbsp;&nbsp;<span class="c"># one per repository</span></div><div>&nbsp;&nbsp;Effect-TS/effect.git</div><div>&nbsp;&nbsp;earendil-works/pi.git</div><div>&nbsp;</div><div>src/</div><div>&nbsp;&nbsp;<span class="c"># one worktree</span></div><div>&nbsp;&nbsp;<span class="c"># per commit</span></div><div>&nbsp;&nbsp;…/effect/6ba41e59/</div><div>&nbsp;&nbsp;…/pi/dcd46192/</div><div>&nbsp;</div><div>state/</div><div>&nbsp;&nbsp;<span class="c"># one file</span></div><div>&nbsp;&nbsp;<span class="c"># per project</span></div><div>&nbsp;&nbsp;web-a3f81c04.json</div></div></div></div>
<div class="panel"><div class="panel-head">agent</div><div class="panel-body"><div class="sess" style="font-size:12px">
<div class="p">&gt; how does pi stream a tool</div>
<div>&nbsp;&nbsp;result back</div>
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

# Other types of references

---
class: config
---

## The repos next door

<div class="body">

<div class="pair">
<div class="panel"><div class="panel-head">~/code/acme/</div><div class="panel-body"><div class="code"><div>├── web/</div><div>│&nbsp;&nbsp;&nbsp;└── agent-reference.local.json</div><div>├── api/</div><div>└── workers/</div></div></div></div>
<div class="panel"><div class="panel-head">web/agent-reference.local.json</div><div class="panel-body"><div class="code small"><div>{</div><div>&nbsp;&nbsp;<span class="k">"paths"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"api"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"path"</span>: <span class="s">"../api"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"Acme's API"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;},</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"workers"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"path"</span>: <span class="s">"../workers"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"Background jobs"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;}</div><div>&nbsp;&nbsp;}</div><div>}</div></div></div></div>
</div>

</div>

---
class: config
---

## Repos you reference

<div class="body">

<div class="pair">
<div class="panel"><div class="panel-head">agent-reference.json</div><div class="panel-body"><div class="code small"><div>{</div><div>&nbsp;&nbsp;<span class="k">"git"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"codex"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"repository"</span>: <span class="s">"github:openai/codex"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"OpenAI's coding agent,</span></div><div><span class="s">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;written in Rust"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;},</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"design-system"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"repository"</span>: <span class="s">"git@git.acme.internal:</span></div><div><span class="s">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;platform/design-system.git"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"Our components. Read it</span></div><div><span class="s">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;before writing a new one"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;}</div><div>&nbsp;&nbsp;}</div><div>}</div></div></div></div>
<div class="panel"><div class="panel-head">~/.agent-reference/</div><div class="panel-body"><div class="code small"><div>git/</div><div>&nbsp;&nbsp;github.com/openai/codex.git</div><div>&nbsp;&nbsp;git.acme.internal/platform/</div><div>&nbsp;&nbsp;&nbsp;&nbsp;design-system.git</div><div>&nbsp;</div><div>src/</div><div>&nbsp;&nbsp;<span class="c"># a read-only worktree, at</span></div><div>&nbsp;&nbsp;<span class="c"># one commit, per repository</span></div><div>&nbsp;&nbsp;…/openai/codex/a4f10b27/</div><div>&nbsp;&nbsp;…/design-system/91ce03d4/</div></div></div></div>
</div>

</div>

---
class: config
---

## Pin exact npm versions

<div class="body">

<div class="panel"><div class="panel-head">agent-reference.json</div><div class="panel-body"><div class="code"><div>{</div><div>&nbsp;&nbsp;<span class="k">"packages"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"npm:ai"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"version"</span>: <span class="s">"7.0.78"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"The Vercel AI SDK. Read its docs/ and changelog</span></div><div><span class="s">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;before writing v7; every v6 example on the internet is wrong"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;}</div><div>&nbsp;&nbsp;}</div><div>}</div></div></div></div>

</div>

---
class: config
---

## Two versions at once

<div class="body">

<div class="panel"><div class="panel-head">agent-reference.json</div><div class="panel-body"><div class="code"><div>{</div><div>&nbsp;&nbsp;<span class="k">"git"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"zod"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"repository"</span>: <span class="s">"github:colinhacks/zod"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"ref"</span>: <span class="s">"v4.1.5"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"What we are moving to"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;},</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"zod-v3"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"repository"</span>: <span class="s">"github:colinhacks/zod"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"ref"</span>: <span class="s">"v3.22.0"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"What we are moving off. Read both sides</span></div><div><span class="s">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;before changing a schema"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;}</div><div>&nbsp;&nbsp;}</div><div>}</div></div></div></div>

</div>

---
class: config
---

## An optional global config

<div class="body">

<div class="pair">
<div class="panel"><div class="panel-head">~/</div><div class="panel-body"><div class="code"><div>├── agent-reference.local.json</div><div>├── .dotfiles/</div><div>└── code/</div><div>&nbsp;&nbsp;&nbsp;&nbsp;├── personal/</div><div>&nbsp;&nbsp;&nbsp;&nbsp;├── work/</div><div>&nbsp;&nbsp;&nbsp;&nbsp;└── forks/</div></div></div></div>
<div class="panel"><div class="panel-head">~/agent-reference.local.json</div><div class="panel-body"><div class="code small"><div>{</div><div>&nbsp;&nbsp;<span class="k">"paths"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"dotfiles"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"path"</span>: <span class="s">"~/.dotfiles"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"Shell and editor"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;},</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"notes"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"path"</span>: <span class="s">"~/Documents/notes"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"Decisions I keep"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;}</div><div>&nbsp;&nbsp;}</div><div>}</div></div></div></div>
</div>

</div>

---
class: config
---

## Sets of references

<div class="body">

<div class="pair">
<div class="panel"><div class="panel-head">agent-reference.json</div><div class="panel-body"><div class="code small"><div><span class="k">"sets"</span>: [{</div><div>&nbsp;&nbsp;<span class="k">"name"</span>: <span class="s">"coding harnesses"</span>,</div><div>&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"How others solve this"</span>,</div><div>&nbsp;&nbsp;<span class="k">"git"</span>: [</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="s">"github:earendil-works/pi"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="s">"github:openai/codex"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="s">"github:anomalyco/opencode"</span></div><div>&nbsp;&nbsp;]</div><div>}]</div></div></div></div>
<div class="panel"><div class="panel-head">agent</div><div class="panel-body"><div class="sess" style="font-size:12px">
<div class="p">&gt; how do other harnesses compact context</div>
<div class="step" v-click="1">
<div><span class="dot">&#9679;</span> Bash(agent-reference status</div>
<div>&nbsp;&nbsp;&nbsp;&nbsp;--set &quot;coding harnesses&quot;)</div>
<div class="r"><span class="el">&#9151;</span>&nbsp;&nbsp;codex&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;git &middot; ready</div>
<div class="r">&nbsp;&nbsp;&nbsp;pi&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;git &middot; ready</div>
<div class="r">&nbsp;&nbsp;&nbsp;opencode&nbsp;&nbsp;git &middot; ready</div>
</div>
<div class="step" v-click="2">
<div><span class="dot">&#9679;</span> Read(&hellip;/pi/&hellip;/compaction.ts)</div>
</div>
</div></div></div>
</div>

</div>

---
class: config
---

## One you commit, one you don&rsquo;t

<div class="body">

<div class="pair">
<div class="panel"><div class="panel-head">agent-reference.json</div><div class="panel-body"><div class="code small"><div>{</div><div>&nbsp;&nbsp;<span class="k">"packages"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"npm:ai"</span>: <span class="s">"7.0.78"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"npm:effect"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"version"</span>: <span class="s">"4.0.0-rc.111"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"We are on the v4 rc"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;}</div><div>&nbsp;&nbsp;},</div><div>&nbsp;&nbsp;<span class="k">"git"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"codex"</span>: <span class="s">"github:openai/codex"</span></div><div>&nbsp;&nbsp;},</div><div>&nbsp;&nbsp;<span class="k">"paths"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"decisions"</span>: <span class="s">"./docs/decisions"</span></div><div>&nbsp;&nbsp;},</div><div>&nbsp;&nbsp;<span class="k">"sets"</span>: [{</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"name"</span>: <span class="s">"coding harnesses"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"git"</span>: [<span class="s">"github:earendil-works/pi"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="s">"github:openai/codex"</span>]</div><div>&nbsp;&nbsp;}]</div><div>}</div></div></div></div>
<div class="panel"><div class="panel-head">agent-reference.local.json</div><div class="panel-body"><div class="code small"><div>{</div><div>&nbsp;&nbsp;<span class="k">"paths"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"api"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"path"</span>: <span class="s">"../api"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"Acme's API"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;},</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"notes"</span>: <span class="s">"~/Documents/notes"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"forks"</span>: <span class="s">"~/code/forks"</span></div><div>&nbsp;&nbsp;},</div><div>&nbsp;&nbsp;<span class="k">"git"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"spike"</span>: {</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"repository"</span>: <span class="s">"file:~/code/spike"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"description"</span>: <span class="s">"My scratch repo. Never</span></div><div><span class="s">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;name this in a commit"</span></div><div>&nbsp;&nbsp;&nbsp;&nbsp;}</div><div>&nbsp;&nbsp;}</div><div>}</div></div></div></div>
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
<div>Runs your <code>.ts</code> with no build step</div>
</div>
<div class="shot-col"><img class="repo-shot" src="./assets/repo.png" alt="mutewinter/agent-reference on GitHub" /></div>
</div>

</div>

---
layout: statement
class: dark closer
---

<img class="brawndo" src="./assets/brawndo.svg" alt="" />

# agent-reference.dev

<div class="crave slow">It&rsquo;s got what agents crave</div>

<div class="cta">Questions? &middot; x.com/mutewinter &middot; hi@mutewinter.com</div>
