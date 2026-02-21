# The Chorus

> *Slay the Princess meets Persona meets Venom*

A SillyTavern extension that gives your persona a fractured inner psyche. Voices are born from extreme moments in your story, accumulate as tarot cards, argue with each other, and fight for control of who you are.

They're not narrators. They're not advisors. They're the intrusive thought at 2am. The grudge you can't release. The calm you weren't expecting. The pettiness you'll never admit to.

---

## What It Does

When you chat, The Chorus reads each incoming message and detects emotional, physical, and identity extremes. When something significant happens — heartbreak, betrayal, near-death, euphoria — a new voice is born inside your persona's head.

Each voice is:

- **Named by AI** — not "The Angry One" but "The Flinch," "Sweet Nothing," "The Auditor," "Teeth"
- **Assigned a Major Arcana** — The Tower, The Moon, The Lovers, Death — matched to the moment that created them
- **Given a personality** — speaking style, obsession, blind spot, metaphor domain, verbal tic
- **Alive** — they react to every message, argue with each other, give unsolicited advice, drift in and out of relevance, and eventually fade or transform

Voices exist inside your persona's head. They are fragments of a fictional character's psyche, not the player's. Think Disco Elysium — the skills live inside Harry Du Bois and comment on his world without knowing they're in a game.

---

## Features

### Tarot Deck
Your collected voices displayed as animated tarot cards. Each card shows the voice's arcana symbol (animated sigil pattern behind it), name, influence level, and state. Tap to flip and see personality, birth memory, and action buttons. Cards can be normal or reversed (shadow aspect births).

### Four Interaction Layers

**Sidebar Commentary** — Every incoming message, voices react in a panel. They talk to each other, argue, go quiet. The ambient heartbeat of your persona's inner world.

**Card Readings** — Event-driven tarot draws. Single card pulls on minor events, three-card spreads on significant moments, five-card cross spreads on critical ones. Each voice speaks from a formal position with advice, warnings, or predictions. Reversed cards speak from their blind spot.

**1-on-1 Directory** — Tap a voice's card to enter a private conversation. Full chat history. Negotiate influence, confront their obsessions, or accidentally feed their ego. The biggest relationship shifts happen here.

**Council** — All voices in one room, and you can participate. The 3am insomnia channel. Freeform chaos where voices form alliances, break them, and drag up old arguments. Auto-continue lets voices talk among themselves while you watch.

### Voice Lifecycle

Voices aren't permanent. They have depth (surface → rooted → core) that increases as they participate. They can be resolved through six hidden paths — fade, heal, transform, confront, witness, or endure — each with distinct animations. Voices can also be manually dissolved, merged with allied voices, or consumed by dominant hostile ones.

### Narrator

A dedicated narrator voice with 8 selectable archetypes (Stage Manager, Therapist, Framing Device, Conscience, Director, Archivist, Warden, Conspirator). Each has its own agenda and opinions about the voices. The narrator's coherence degrades under deck pressure and recovers when given attention through directory conversations.

### Outreach

Voices don't just wait to be spoken to. When conditions align, they initiate contact — appearing as toast notifications with their arcana glyph, inviting you into a 1-on-1 conversation. You can accept, dismiss, or ignore them (and ignoring has consequences).

### 10 Tone Anchors

Set the chat's tone and all voices express it through their personality:
Gothic, Raw, Clinical, Surreal, Baroque, Noir, Feral, Sardonic, Mythic, Tender

### Detection & Birth

A 42-theme taxonomy covers emotional extremes (heartbreak, rage, euphoria, shame), physical extremes (near-death, intoxication, intimacy), and identity crises (betrayal, revelation, ego collapse). Births can be triggered by single extreme moments or accumulated patterns of repeated minor themes.

### Persona Extraction

At chat start, extract 2-4 voices directly from your persona card. Format-agnostic — works with W++, JSON, Ali:Chat, plain text, or any mix.

---

## Installation

1. Navigate to your SillyTavern extensions folder:
   ```
   SillyTavern/data/default-user/extensions/
   ```

2. Clone or copy the extension:
   ```
   git clone https://github.com/sinnerconsort/the-chorus.git
   ```

3. Restart SillyTavern

4. Enable "The Chorus" in Extensions → Manage Extensions

---

## Setup

### Connection Profile

The Chorus makes independent API calls for voice generation, sidebar commentary, and card readings. You need a Connection Profile configured in SillyTavern:

1. Go to **Settings → Connection Profiles**
2. Create or select a profile with your preferred API
3. Open The Chorus panel → **Settings** tab
4. Select the connection profile from the dropdown

Any API backend that SillyTavern supports will work. Recommended: a model with good creative writing ability for voice personality generation.

### Basic Settings

- **Max Voices** — Deck size, 3-10 (default 5)
- **Tone** — Select from 10 tone anchors
- **Narrator Archetype** — Choose narrator personality
- **Draw Mode** — Auto (event-driven) or Manual (button only)
- **Draw Frequency** — Every 1/2/3/5 messages (auto mode)
- **Max Speakers** — How many voices speak per message (2-5)
- **Birth Sensitivity** — How extreme an event needs to be to spawn a voice
- **Full Deck Behavior** — What happens when deck is full and a new voice wants to be born (Block / Heal oldest / Merge allies / Consume weakest)
- **Council Speed** — Auto-continue interval for council conversations

---

## Card States

| State | Meaning |
|-------|---------|
| **Active** | Voice is participating, sigil rotates normally |
| **Dormant** | Quiet, low relevance, dim sigil |
| **Agitated** | Influence climbing, sigil intensifies |
| **Dead** | Resolved/dissolved, moved to graveyard |

---

## Voice Relationships

Each voice has a relationship with your persona that drifts over time:

- **Devoted** / **Protective** / **Curious** — warm states
- **Indifferent** — neutral
- **Resentful** / **Hostile** / **Obsessed** — cold/intense states
- **Grieving** / **Manic** / **Resigned** — complex states

Relationships drift passively (matching scene themes), actively (following or ignoring spread advice), and dramatically (through directory conversations and council interactions).

Voices also have opinions about each other that form organically through council conversations and shared reactions.

---

## File Structure

```
the-chorus/
├── index.js              # Main entry, ST event hooks, message pipeline
├── manifest.json
├── style.css             # All styles (~3500 lines)
├── template.html         # Panel HTML structure
├── settings.html         # Settings tab content
├── src/
│   ├── config.js         # Arcana definitions, tones, themes, defaults
│   ├── state.js          # Voice registry, persistence, deck management
│   ├── voices/
│   │   ├── classifier.js     # Message classification (severity, themes)
│   │   ├── participation.js  # Who speaks each message (probability rolls)
│   │   ├── voice-engine.js   # Sidebar commentary + card reading generation
│   │   ├── voice-birth.js    # AI-driven voice creation
│   │   ├── voice-lifecycle.js# Depth, resolution, transformation
│   │   └── narrator.js       # Narrator archetypes, coherence, opinions
│   ├── social/
│   │   ├── directory.js      # 1-on-1 voice conversations
│   │   ├── council.js        # Group chat with all voices
│   │   └── outreach.js       # Voice-initiated contact system
│   └── ui/
│       ├── panel.js          # Main panel, tabs, settings wiring
│       ├── deck.js           # Tarot card rendering, sigil canvases
│       ├── reading.js        # Card draw / spread display
│       ├── log.js            # Unified chronicle tab
│       └── animations.js     # Awakening, dissolution, transformation
```

---

## How It Works (Per-Message Flow)

```
AI message arrives
│
├─ CLASSIFY — Detect severity (none/minor/significant/critical)
│             and active themes from 42-theme taxonomy
│
├─ UPDATE STATE — Adjust influence from theme→trigger matches
│                  Apply relationship drift
│                  Increment counters, check thresholds
│
├─ SIDEBAR — Roll for participation, generate batched commentary
│             Voices see each other and can argue
│
├─ CARD DRAW — If auto mode + counter matches frequency:
│               minor → single card, significant → 3-card spread,
│               critical → 5-card cross spread
│
├─ BIRTH CHECK — If theme accumulators cross birth threshold
│                 and deck has room → AI generates new voice
│
└─ OUTREACH CHECK — Score each voice for outreach potential
                     High scorers may initiate contact
```

---

## Credits

- **Author:** sinnerconsort
- **Version:** 0.1.0
- **Inspired by:** Disco Elysium (internal voices), Persona (tarot/awakening aesthetic), Slay the Princess (voice accumulation and conflict)

---

## License

MIT

---

*They don't create moments. They amplify the ones that already haunt you.*
