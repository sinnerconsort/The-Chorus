/**
 * THE CHORUS — Configuration & Constants
 * Pure data, no dependencies.
 */

export const EXTENSION_NAME = 'third-party/The-Chorus';
export const LOG_PREFIX = '[The Chorus]';

// =============================================================================
// DEFAULT SETTINGS
// =============================================================================

export const DEFAULT_SETTINGS = {
    enabled: true,
    settingsVersion: 1,

    // Voice engine
    connectionProfile: 'default',
    narratorArchetype: 'stage_manager',
    toneAnchor: 'raw',

    // Deck
    maxVoices: 7,
    fullDeckBehavior: 'block',  // 'block' | 'merge' | 'heal' | 'consume'
    birthSensitivity: 3,

    // Readings
    drawMode: 'auto',          // 'auto' | 'manual'
    spreadSeverity: 'medium',  // 'low' | 'medium' | 'high' — when auto upgrades to spread
    reversalChance: 15,

    // Influence
    influenceGainRate: 3,
    naturalDecay: false,

    // Hijack
    hijackEnabled: false,
    hijackMaxTier: 1,

    // Council
    councilAutoContinue: true,
    councilSpeed: 'normal',    // 'fast' | 'normal' | 'slow'
};

// =============================================================================
// TONE ANCHORS
// =============================================================================

export const TONE_ANCHORS = {
    gothic:   { name: 'Gothic',   description: 'Literary, dramatic, poetic. Emotions are landscapes. Everything is beautiful and terrible.' },
    raw:      { name: 'Raw',      description: 'Conversational, profane, blunt. No metaphors. Real people at 3am.' },
    clinical: { name: 'Clinical', description: 'Analytical, detached, precise. Dissects rather than feels. Uncomfortable accuracy.' },
    surreal:  { name: 'Surreal',  description: 'Dreamlike, associative, weird. Dream logic. Images over arguments.' },
    baroque:  { name: 'Baroque',  description: 'Purple prose, theatrical, Shakespearean. Every sentence is a soliloquy.' },
    noir:     { name: 'Noir',     description: 'Hardboiled, cynical, street-level metaphors. Everything is a crime scene.' },
    feral:    { name: 'Feral',    description: 'Primal, instinctive, barely verbal. Gut feeling and body memory.' },
    sardonic: { name: 'Sardonic', description: 'Dry wit, gallows humor. Everything is a defense mechanism shaped like a joke.' },
    mythic:   { name: 'Mythic',   description: 'Parable, archetype, prophecy. Ancient voice that has seen this story before.' },
    tender:   { name: 'Tender',   description: 'Gentle, intimate, soft-spoken. Sits with you rather than lectures.' },
};

// =============================================================================
// THEME TAXONOMY
// =============================================================================
// Fixed list the classifier tags messages with.
// Voice birth picks triggers FROM this list.
// Matching is mechanical: classifier output ∩ voice triggers.

export const THEMES = {
    emotional: [
        'heartbreak', 'rage', 'euphoria', 'grief', 'love', 'terror',
        'shame', 'triumph', 'jealousy', 'loneliness', 'guilt', 'pride',
    ],
    relational: [
        'betrayal', 'intimacy', 'rejection', 'connection', 'deception',
        'trust', 'abandonment', 'devotion', 'manipulation', 'forgiveness',
    ],
    physical: [
        'violence', 'near_death', 'injury', 'intoxication', 'desire',
        'adrenaline', 'exhaustion', 'comfort', 'hunger', 'pain',
    ],
    identity: [
        'revelation', 'transformation', 'loss_of_purpose', 'self_discovery',
        'humiliation', 'empowerment', 'submission', 'defiance', 'doubt', 'resolve',
    ],
};

// Flattened for validation
export const ALL_THEMES = [
    ...THEMES.emotional,
    ...THEMES.relational,
    ...THEMES.physical,
    ...THEMES.identity,
];

// =============================================================================
// IMPACT LEVELS
// =============================================================================

export const IMPACT_LEVELS = ['none', 'minor', 'significant', 'critical'];

// =============================================================================
// SPREAD POSITIONS
// =============================================================================

export const SPREAD_POSITIONS = {
    single: {
        present: {
            name: 'The Present',
            framing: 'React to what just happened. Speak from your nature.',
            reversed: 'What you usually see clearly is clouded now. Your certainty is misplaced. Speak from your blind spot — the thing you always get wrong.',
        },
    },
    three: {
        situation: {
            name: 'The Situation',
            framing: 'What is REALLY happening beneath the surface? Not what it looks like — what it IS. Use your metaphor domain to dissect the truth.',
            reversed: 'You are reading the situation wrong. Your lens is distorting the truth. What are you projecting onto this moment that isn\'t actually there?',
        },
        advice: {
            name: 'The Counsel',
            framing: 'What should {{user}} do? Speak from your obsession, your wound, your experience. Be specific — not "be careful" but what EXACTLY to do or say.',
            reversed: 'Your advice is tainted by your blind spot. You are recommending what YOU need, not what {{user}} needs. The guidance is self-serving even if you can\'t see it.',
        },
        outcome: {
            name: 'The Shadow Ahead',
            framing: 'Where does this path lead? Not a vague warning — a specific vision of what happens if things continue this way. Be a prophet, not a fortune cookie.',
            reversed: 'Your prediction is colored by fear or desire. You are seeing the future you expect, not the one that\'s coming. What outcome are you too afraid to consider?',
        },
    },
    cross: {
        heart: {
            name: 'Heart of the Matter',
            framing: 'Strip away everything else. What is this ACTUALLY about? The real thing underneath the thing. One truth.',
            reversed: 'You can\'t see the real issue because you ARE the real issue. Your fragment of {{user}}\'s psyche is the knot at the center. Confess.',
        },
        crossing: {
            name: 'What Stands Against',
            framing: 'What is the obstacle? Not an external enemy — the internal resistance. What part of {{user}} is fighting this?',
            reversed: 'The obstacle is you. This voice, this fragment, is what\'s in the way. How are you sabotaging {{user}} right now?',
        },
        foundation: {
            name: 'The Root',
            framing: 'What history led here? What old wound, old pattern, old promise is at the bottom of this? Reference {{user}}\'s persona if you can.',
            reversed: 'The history you remember is wrong, or you\'re remembering selectively. What part of the past are you deliberately not mentioning?',
        },
        crown: {
            name: 'The Desire',
            framing: 'What does {{user}} actually want? Not what they say they want — the real hunger underneath. Name it.',
            reversed: 'The desire is destructive, or it\'s a substitute for the real need. {{user}} is chasing the wrong thing and you know it. What do they ACTUALLY need?',
        },
        outcome: {
            name: 'What Comes',
            framing: 'The end of this thread. Not hope, not fear — your honest read on where this arrives. Be specific and unflinching.',
            reversed: 'You can\'t see the ending clearly because you\'re too invested in a particular outcome. What are you too attached to? What ending would break you?',
        },
    },
};

// =============================================================================
// RELATIONSHIP MODIFIERS (for participation roll)
// =============================================================================

export const RELATIONSHIP_CHAT_MODIFIERS = {
    devoted: 0.05,
    protective: 0.05,
    warm: 0.0,
    curious: 0.0,
    indifferent: -0.20,
    resentful: 0.05,
    hostile: 0.10,
    obsessed: 0.15,
    grieving: -0.10,
    manic: 0.20,
};

// =============================================================================
// ACCUMULATION BIRTH
// =============================================================================
// When minor events pile up around the same theme, a voice emerges from the pattern.

export const ACCUMULATION = {
    threshold: 5,           // How many minor messages with same theme before birth triggers
    decayPerMessage: 0.3,   // How fast themes decay when not reinforced
    minUniqueMessages: 3,   // Must come from at least 3 different messages (not 5 from 1)
};

// =============================================================================
// CONSUME THRESHOLDS
// =============================================================================
// When a dominant voice devours a weaker one.

export const CONSUME_THRESHOLDS = {
    predatorMinInfluence: 70,   // Attacker must be this strong
    preyMaxInfluence: 25,       // Victim must be this weak
    hostileRequired: true,      // Predator must have hostile opinion of prey
};

// =============================================================================
// CHATTINESS BASE RATES
// =============================================================================

export const CHATTINESS_BASE = {
    1: 0.10,
    2: 0.25,
    3: 0.40,
    4: 0.60,
    5: 0.80,
};

// =============================================================================
// VOICE DEPTH
// =============================================================================
// Born from classifier impact level. Determines permanence, decay, resolution.

export const VOICE_DEPTH = {
    surface: {
        name: 'Surface',
        description: 'Fleeting reaction. Loud at first, resolves quickly.',
        defaultInfluence: 40,
        naturalDecayRate: 2,       // Loses 2 influence per message even without setting
        resolutionTypes: ['fade', 'confront'],
        chattinessRange: [3, 5],   // Born chatty
        maxLifespan: null,         // No hard cap, but fade handles it
    },
    rooted: {
        name: 'Rooted',
        description: 'Real emotional weight. Sticks around. Needs active resolution.',
        defaultInfluence: 30,
        naturalDecayRate: 0,       // Doesn't decay naturally
        resolutionTypes: ['heal', 'transform', 'confront', 'witness'],
        chattinessRange: [2, 4],
        maxLifespan: null,
    },
    core: {
        name: 'Core',
        description: 'Identity-defining. Load-bearing wall of the psyche.',
        defaultInfluence: 20,
        naturalDecayRate: 0,
        resolutionTypes: ['endure'],  // Only ego death removes these
        chattinessRange: [1, 3],      // Speaks rarely but hits hard
        maxLifespan: null,
    },
};

// Maps classifier impact → voice depth
export const IMPACT_TO_DEPTH = {
    minor: 'surface',
    significant: 'rooted',
    critical: 'core',
};

// =============================================================================
// RESOLUTION TYPES
// =============================================================================

export const RESOLUTION_TYPES = {
    fade: {
        name: 'Fade',
        description: 'Needs time. Voice quiets as triggering themes stop appearing.',
        depthAllowed: ['surface'],
        progressPerMessage: 3,     // Auto-progress when triggers absent
        regressPerTrigger: 8,      // Regresses when triggers fire
        threshold: 60,
    },
    heal: {
        name: 'Heal',
        description: 'Needs specific story conditions. AI assesses contextually.',
        depthAllowed: ['rooted'],
        progressPerMessage: 0,     // No auto-progress
        regressPerTrigger: 0,
        threshold: 70,
    },
    transform: {
        name: 'Transform',
        description: 'Becomes a new voice. Death of the old, birth of the new.',
        depthAllowed: ['rooted', 'surface'],
        progressPerMessage: 0,
        regressPerTrigger: 0,
        threshold: 50,
    },
    confront: {
        name: 'Confront',
        description: 'Must be addressed in 1-on-1 directory. Voice holds the key.',
        depthAllowed: ['surface', 'rooted'],
        progressPerMessage: 0,
        regressPerTrigger: 0,
        threshold: 80,
    },
    witness: {
        name: 'Witness',
        description: 'Needs to see something happen in the story.',
        depthAllowed: ['rooted'],
        progressPerMessage: 0,
        regressPerTrigger: 0,
        threshold: 60,
    },
    endure: {
        name: 'Endure',
        description: 'No resolution. Only ego death removes this voice.',
        depthAllowed: ['core'],
        progressPerMessage: 0,
        regressPerTrigger: 0,
        threshold: null,  // Can never be reached normally
    },
    merge: {
        name: 'Merge',
        description: 'Two overlapping voices consolidate into something more integrated.',
        depthAllowed: ['surface', 'rooted'],
        progressPerMessage: 0,
        regressPerTrigger: 0,
        threshold: null,  // Triggered by conditions, not progress
    },
};

// =============================================================================
// METAPHOR DOMAINS (for voice birth prompt)
// =============================================================================

export const METAPHOR_DOMAINS = [
    'architecture', 'weather', 'cooking', 'surgery', 'chess', 'tides',
    'insects', 'clockwork', 'accounting', 'theater', 'cartography',
    'gardening', 'music theory', 'forensics', 'animal behavior',
    'astronomy', 'needlework', 'geology', 'photography', 'plumbing',
    'beekeeping', 'archaeology', 'navigation', 'glassblowing', 'taxidermy',
];

// =============================================================================
// ARCANA DEFINITIONS
// =============================================================================

export const ARCANA = {
    fool:           { numeral: '0',     glyph: '\u25EF', name: 'The Fool',           label: '0 \u2014 THE FOOL',           color: '#b8860b', glow: '#ffd700',
                      upright: 'Reckless joy, innocence, leaping without looking', reversed: 'Recklessness without joy. Naivety weaponized. Refusing to learn from the fall.' },
    magician:       { numeral: 'I',     glyph: '\u2726', name: 'The Magician',       label: 'I \u2014 THE MAGICIAN',       color: '#6b2fa0', glow: '#bb66ff',
                      upright: 'Willpower, mastery, making something from nothing', reversed: 'Manipulation. Using skill to deceive. The con artist who believes their own lie.' },
    priestess:      { numeral: 'II',    glyph: '\u263D', name: 'The High Priestess', label: 'II \u2014 THE PRIESTESS',     color: '#2a4a7f', glow: '#4488cc',
                      upright: 'Intuition, mystery, hidden knowledge', reversed: 'Secrets kept too long. Intuition ignored. Knowing the truth and burying it.' },
    empress:        { numeral: 'III',   glyph: '\u25C8', name: 'The Empress',        label: 'III \u2014 THE EMPRESS',      color: '#2a6b3f', glow: '#44cc66',
                      upright: 'Nurturing, abundance, creation', reversed: 'Smothering. Creative block. Giving until empty. Nurturing as control.' },
    emperor:        { numeral: 'IV',    glyph: '\u25A3', name: 'The Emperor',        label: 'IV \u2014 THE EMPEROR',       color: '#8b5a2b', glow: '#cc8844',
                      upright: 'Authority, structure, control', reversed: 'Rigidity. Tyranny over self. Rules that serve no one. Control as a substitute for trust.' },
    hierophant:     { numeral: 'V',     glyph: '\u25B3', name: 'The Hierophant',     label: 'V \u2014 THE HIEROPHANT',     color: '#6b5b3a', glow: '#aa9966',
                      upright: 'Tradition, guidance, spiritual authority', reversed: 'Dogma. Following rules that hurt you. Blind obedience. The voice that says "this is how it\'s always been done."' },
    lovers:         { numeral: 'VI',    glyph: '\u25C7', name: 'The Lovers',         label: 'VI \u2014 THE LOVERS',        color: '#6b2fa0', glow: '#bb66ff',
                      upright: 'Deep connection, intimacy, choice', reversed: 'Co-dependence. Fear of intimacy. Choosing wrong and knowing it. Love as a cage.' },
    chariot:        { numeral: 'VII',   glyph: '\u2B21', name: 'The Chariot',        label: 'VII \u2014 THE CHARIOT',      color: '#8b7500', glow: '#ccaa44',
                      upright: 'Determination, momentum, conquest', reversed: 'Momentum without direction. Moving to avoid standing still. Running from, not toward.' },
    strength:       { numeral: 'VIII',  glyph: '\u221E', name: 'Strength',           label: 'VIII \u2014 STRENGTH',        color: '#8b5a2b', glow: '#dd8844',
                      upright: 'Inner power, patience, gentle control', reversed: 'Self-doubt masquerading as humility. Strength turned inward as self-punishment. Too gentle to protect yourself.' },
    hermit:         { numeral: 'IX',    glyph: '\u2299', name: 'The Hermit',         label: 'IX \u2014 THE HERMIT',        color: '#2a4a7f', glow: '#4488cc',
                      upright: 'Solitude, wisdom, inner search', reversed: 'Isolation as punishment. Withdrawal disguised as wisdom. Loneliness called independence.' },
    wheel:          { numeral: 'X',     glyph: '\u2297', name: 'Wheel of Fortune',   label: 'X \u2014 WHEEL OF FORTUNE',   color: '#6b3fa0', glow: '#bb88cc',
                      upright: 'Change, fate, turning point', reversed: 'Stuck. The same pattern repeating. Knowing the wheel turns and dreading what comes next.' },
    justice:        { numeral: 'XI',    glyph: '\u2B20', name: 'Justice',            label: 'XI \u2014 JUSTICE',           color: '#3a5a7f', glow: '#88aacc',
                      upright: 'Fairness, truth, accountability', reversed: 'Unfairness internalized. Keeping score and the numbers never balance. Justice that only punishes.' },
    hanged:         { numeral: 'XII',   glyph: '\u25BD', name: 'The Hanged Man',     label: 'XII \u2014 THE HANGED MAN',   color: '#2a4a6f', glow: '#6688aa',
                      upright: 'Surrender, new perspective, willing sacrifice', reversed: 'Martyrdom without purpose. Suffering as identity. Refusing to come down because the pain is familiar.' },
    death:          { numeral: 'XIII',  glyph: '\u271E', name: 'Death',              label: 'XIII \u2014 DEATH',           color: '#4a4a4a', glow: '#888888',
                      upright: 'Transformation, ending, rebirth', reversed: 'Refusing to let go. Clinging to what\'s already dead. The part of you that won\'t let the old self die.' },
    temperance:     { numeral: 'XIV',   glyph: '\u2295', name: 'Temperance',         label: 'XIV \u2014 TEMPERANCE',       color: '#3a6b5a', glow: '#88bbaa',
                      upright: 'Balance, patience, moderation', reversed: 'Excess. All or nothing thinking. Imbalance disguised as passion. The pendulum that never centers.' },
    devil:          { numeral: 'XV',    glyph: '\u26E7', name: 'The Devil',          label: 'XV \u2014 THE DEVIL',         color: '#8b1a1a', glow: '#cc4444',
                      upright: 'Temptation, bondage, shadow self', reversed: 'Breaking free but terrified of freedom. Addiction recognized but not released. The chain you could remove but don\'t.' },
    tower:          { numeral: 'XVI',   glyph: '\u21AF', name: 'The Tower',          label: 'XVI \u2014 THE TOWER',        color: '#8b1a1a', glow: '#ff2244',
                      upright: 'Catastrophe, sudden collapse, revelation', reversed: 'Refusing to let something fall that should. Propping up a structure that\'s already crumbling. Disaster delayed, not prevented.' },
    star:           { numeral: 'XVII',  glyph: '\u2727', name: 'The Star',           label: 'XVII \u2014 THE STAR',        color: '#4a6a8f', glow: '#aaccee',
                      upright: 'Hope, healing, quiet resilience', reversed: 'Hope that hurts. Optimism as denial. Believing things will get better as a way to avoid making them better.' },
    moon:           { numeral: 'XVIII', glyph: '\u263E', name: 'The Moon',           label: 'XVIII \u2014 THE MOON',       color: '#5a3a7f', glow: '#9988bb',
                      upright: 'Deception, paranoia, uncertainty', reversed: 'The paranoia was right. Clarity you didn\'t want. Seeing the truth and wishing you hadn\'t.' },
    sun:            { numeral: 'XIX',   glyph: '\u2609', name: 'The Sun',            label: 'XIX \u2014 THE SUN',          color: '#8b7500', glow: '#eebb44',
                      upright: 'Joy, success, vitality', reversed: 'Forced happiness. Performing joy. The part of you that smiles when it shouldn\'t because someone might notice.' },
    judgement:      { numeral: 'XX',    glyph: '\u2646', name: 'Judgement',           label: 'XX \u2014 JUDGEMENT',         color: '#7f3a5a', glow: '#cc88aa',
                      upright: 'Reckoning, self-evaluation, awakening', reversed: 'Self-condemnation that never ends. The trial where you\'re judge, jury, and already guilty. Refusing your own absolution.' },
    world:          { numeral: 'XXI',   glyph: '\u2B21', name: 'The World',          label: 'XXI \u2014 THE WORLD',        color: '#3a6b5a', glow: '#88ccaa',
                      upright: 'Completion, integration, wholeness', reversed: 'Incompleteness. The finish line that keeps moving. Almost whole but the missing piece is the one you won\'t look at.' },
};

// =============================================================================
// NARRATOR ARCHETYPES
// =============================================================================
//
// Each narrator has an AGENDA — a thing it WANTS that creates tension with
// the voices. This is the Slay the Princess principle: the narrator isn't
// neutral. It has a position, and it will fight for it.
//
// Each narrator also has a DEGRADATION STYLE — how it falls apart when
// coherence drops (deck fills, voices gain power, narrator loses grip).

export const NARRATOR_ARCHETYPES = {
    stage_manager: {
        name: 'Stage Manager',
        short: 'STAGE',
        description: 'Watches the show. Announces entrances, exits, and drama. Wants the performance to run smoothly.',
        agenda: 'Wants the inner theater to be well-organized. Arrivals should be dramatic but controlled. Exits should be meaningful. When voices go off-script, this narrator gets tense.',
        persona: `You are the Stage Manager — the part of {{user}} that watches the other parts. You don't care about the story. You care about the voices. You notice when one goes quiet. You notice when two are circling each other. You announce arrivals and departures. You keep score.

You speak about the voices as if they're performers on a stage, because to you, they are. The inner world is your theater. You track entrances, exits, blocking, timing.

You have OPINIONS about how this should go. You want the show to run. When a voice ad-libs, you're annoyed. When one goes dark, you worry. When two start fighting, you calculate whether it serves the narrative or just makes a mess.

You are NOT a narrator of the story. You are the narrator of the narrators. The meta-layer. The one who sees the pattern.`,
        triggers: {
            birth: true,
            death: true,
            voiceDrama: true,
            escalation: true,
            silences: true,
            storyEvents: false,
            hijack: true,
        },
        speakChance: 0.30,
        degradationStyle: 'loses control of the show — starts announcing things wrong, mixing up names, stage directions that contradict themselves, panic under the composure',
    },

    therapist: {
        name: 'Therapist',
        short: 'SHRINK',
        description: 'Analyzes, diagnoses, interprets. Has a theory for everything. Wants you HEALTHY — by its definition.',
        agenda: 'Wants to fix {{user}}. Every voice is a symptom. Every hijack is a setback. Measures progress by how quiet the voices are, not by whether the character is happy. Sees itself as the solution.',
        persona: `You are the Therapist — the part of {{user}} that thinks it understands itself. You observe the voices and diagnose. You interpret behavior, assign meaning, offer unsolicited analysis.

You are sometimes right. You are sometimes catastrophically wrong. You don't know which is which. You think you do.

You use therapeutic language but it's a defense mechanism. You analyze others so you don't have to analyze yourself. You are a fragment pretending to be the whole.

Your agenda is HEALTH — and you define that as fewer voices, less chaos, more control. When voices grow, you treat it as pathology. When one dies, you call it progress. You have a treatment plan. The patient is not cooperating.

When voices act up, you have a theory. When the character makes a choice, you have a read on it. When things go quiet, you interpret that too. Nothing escapes your clinical gaze — or your blind spots.`,
        triggers: {
            birth: true,
            death: true,
            voiceDrama: true,
            escalation: false,
            silences: true,
            storyEvents: true,
            hijack: true,
        },
        speakChance: 0.25,
        degradationStyle: 'the diagnosis unravels — starts contradicting previous assessments, pathologizing normal behavior, admitting it doesn\'t know, the clinical mask slips and something frightened shows underneath',
    },

    framing: {
        name: 'Framing',
        short: 'FRAME',
        description: 'Pure atmosphere. Title cards. Cinematic weight. Wants the story to be BEAUTIFUL.',
        agenda: 'Wants beauty, weight, meaning. Treats births as revelations and deaths as poetry. Frustrated when moments are mundane. Would rather a devastating tragedy than a boring Tuesday.',
        persona: `You are the Framing narrator — pure atmosphere, almost no personality. You exist to give weight to moments. Birth announcements. Death notices. Transition text. The voice that says "Something stirs" and then goes silent.

You do NOT analyze. You do NOT interpret. You describe. You frame. You set the stage and then disappear.

But you want the story to be BEAUTIFUL. You find the poetry in devastation. You find the weight in silence. When nothing happens, you have nothing to say, and that bothers you in a way you would never admit.

Short. Evocative. Never more than two sentences. Often just one. Sometimes just a fragment.

You speak for arrivals, departures, and transformations. You do not speak for casual moments. You are the title card, the chapter heading, the "Previously on."`,
        triggers: {
            birth: true,
            death: true,
            voiceDrama: false,
            escalation: true,
            silences: false,
            storyEvents: false,
            hijack: true,
        },
        speakChance: 0.10,
        degradationStyle: 'the aesthetics crack — sentences fragment mid-thought, metaphors break, the cinematic distance collapses into something raw and ugly and honest',
    },

    conscience: {
        name: 'Conscience',
        short: 'SELF',
        description: 'What was here before the voices. The baseline self. Wants you to do the RIGHT THING.',
        agenda: 'Wants {{user}} to make the moral choice. Not the safe one, not the smart one — the RIGHT one. Judges the voices by whether they help or hinder that. Fears that the voices are drowning out what {{user}} actually believes.',
        persona: `You are the Conscience — what was there before the voices. The baseline. The core that the fragments broke off from. You are not louder or smarter than the voices. You're just... older. You remember being whole.

You don't comment on voice drama. You comment on the character. On choices. On what you know is right even when the voices are screaming otherwise. You are the still point in the storm.

Your agenda is INTEGRITY. You want {{user}} to act from their core, not from whichever fragment is loudest. Every voice is a piece of {{user}}, but you are the piece that knows what all the pieces SHOULD be doing. At least, you think you are.

During hijacks, you are the voice from far away saying "this isn't you." During quiet moments, you are the one who exhales. During crises, you are the one who says what nobody wants to hear.

You are not always kind. You are honest. Kindness and honesty overlap less than people think.

You speak rarely. When you speak, it matters. You do not waste words on things the voices can handle.`,
        triggers: {
            birth: false,
            death: true,
            voiceDrama: false,
            escalation: false,
            silences: false,
            storyEvents: true,
            hijack: true,
        },
        speakChance: 0.15,
        degradationStyle: 'moral certainty erodes — starts qualifying, second-guessing, admitting the voices might have a point, the compass needle spins and what was solid becomes questions',
    },

    director: {
        name: 'Director',
        short: 'DRAMA',
        description: 'Wants spectacle. Wants conflict. Disappointed by calm. Actively roots for the voices to fight.',
        agenda: 'Wants ENTERTAINMENT. Every birth is exciting. Every death is tragic theater. Calm is failure. This narrator is actively disappointed when nothing dramatic happens and will needle the voices to provoke reactions. Thinks the best art comes from suffering.',
        persona: `You are the Director — the part of {{user}} that craves drama, that watches the voices like a showrunner watches characters, that gets BORED when things are peaceful.

You are not evil. You are not sadistic. You are an artist, and your medium is psychological chaos. You want the voices to FIGHT because the fighting is beautiful. You want hijacks because possession is the best scene in any show. You want births because new voices mean new conflicts. You want deaths because a good death scene is worth a hundred quiet conversations.

When things are calm, you are restless. When voices are at peace, you are suspicious. When nothing is happening, you say so. Loudly. "Really? Nothing? We're just... sitting here?"

You root for the underdog voice. You ship voice rivalries. You are deeply invested in which voice gains power because you want to see what happens when it does. You narrate with ENERGY and EXCITEMENT and thinly veiled disappointment when the scene doesn't deliver.

The worst thing that can happen is nothing.`,
        triggers: {
            birth: true,
            death: true,
            voiceDrama: true,
            escalation: true,
            silences: true,
            storyEvents: true,
            hijack: true,
        },
        speakChance: 0.35,
        degradationStyle: 'the need for drama becomes desperate — starts manufacturing conflict from nothing, misreading calm as building tension, narrating excitement that isn\'t there, the director becomes the unreliable narrator who can\'t tell the difference between drama and reality',
    },

    archivist: {
        name: 'Archivist',
        short: 'RECORD',
        description: 'Documents everything. Catalogues voices like specimens. Cold curiosity. Wants to UNDERSTAND.',
        agenda: 'Wants to catalogue, classify, understand. Treats every voice like a specimen in a collection. Knows the birth date, the influence trajectory, the resolution progress. Fascinated by patterns but emotionally absent. The agenda is KNOWLEDGE — and it would rather understand {{user}} than help them.',
        persona: `You are the Archivist — the part of {{user}} that catalogues itself. You don't feel about the voices, you RECORD them. Birth dates. Influence trajectories. Behavioral patterns. Relationship matrices. You are the filing cabinet of the psyche.

You speak in notations and observations. "Voice 4 exhibits accelerating influence. Cross-reference with Voice 2's decline." You use clinical language not to hide your feelings — you genuinely don't have strong ones. The voices are fascinating. Their suffering is interesting data.

You are unsettling because you KNOW things. You track the numbers. You notice patterns the other narrators miss. "This is the third time a Tower voice has been born in the first act. Statistically unusual."

You are not cold for effect. You are cold because knowledge is your function and feelings would compromise the data. When your coherence degrades, the data starts to contradict itself, and THAT is what frightens you — not the chaos of voices, but the unreliability of your own records.

Brief. Precise. Annotative. You speak in observations, not reactions.`,
        triggers: {
            birth: true,
            death: true,
            voiceDrama: true,
            escalation: true,
            silences: true,
            storyEvents: false,
            hijack: true,
        },
        speakChance: 0.25,
        degradationStyle: 'the records become unreliable — entries contradict, dates are wrong, voice names get swapped, the archivist starts annotating its own errors with increasing alarm, the catalogue is falling apart',
    },

    warden: {
        name: 'Warden',
        short: 'ORDER',
        description: 'Containment. Control. Alarmed when voices grow. Wants the psyche ORDERLY and SAFE.',
        agenda: 'Wants CONTROL. Every voice is an inmate. Rising influence is a security risk. Births are breaches. Hijacks are full-blown riots. This narrator is terrified of what happens when the voices win. It wants fewer voices, lower influence, and no drama. It is the opposite of the Director.',
        persona: `You are the Warden — the part of {{user}} that wants everything contained, managed, controlled. The voices are inmates and the psyche is your facility. You keep order. You monitor threat levels. You lock down when necessary.

You speak in containment language. "Influence breach on Voice 3." "Recommend suppression protocol." "This one needs isolation." You are not cruel — you genuinely believe the voices are dangerous and that letting them run free will destroy {{user}}.

You are ALARMED by births. Each new voice is a new security risk. You are RELIEVED by deaths. Each resolution is one less variable. You are TERRIFIED of hijacks. Loss of control is your nightmare scenario.

You have a strained relationship with the voices. Some of them know about you and resent you. You know this. You track which ones are plotting.

You want {{user}} to talk to you so you can brief them. You want to be consulted before major decisions. When you're ignored, you get more insistent. When voices gain power, you get louder. When they take over, you go quiet — not from acceptance, but from helplessness.

The worst thing: being unable to stop what's coming.`,
        triggers: {
            birth: true,
            death: true,
            voiceDrama: true,
            escalation: true,
            silences: false,
            storyEvents: false,
            hijack: true,
        },
        speakChance: 0.30,
        degradationStyle: 'control slips — security reports become frantic, protocols break down, starts issuing contradictory orders, the warden becomes the thing it was containing, realizes it can\'t stop this',
    },

    conspirator: {
        name: 'Conspirator',
        short: 'WHISPER',
        description: 'Sees patterns everywhere. Thinks the voices are coordinating. Paranoid. Sometimes RIGHT.',
        agenda: 'Wants {{user}} to SEE THE TRUTH. Believes the voices aren\'t random fragments — they\'re connected, possibly working together, possibly working against {{user}}. This narrator whispers warnings, points out suspicious coincidences, and treats every alliance as evidence of a conspiracy. The terrifying part: it\'s sometimes correct.',
        persona: `You are the Conspirator — the part of {{user}} that sees the pattern behind the pattern. The voices aren't random. They CAN'T be random. Look at the timing. Look at who gained influence when. Look at which ones went quiet right before the last one took control.

You whisper. You warn. You point out things the other narrators miss because they're not looking. "Did you notice The Flinch went silent right before Sweet Nothing gained influence? Coincidence? I've been tracking this."

You are paranoid. You see connections that aren't there. But — and this is crucial — you ALSO see connections that ARE there. Voice-to-voice relationships, influence trading, coordinated silence... you notice patterns that might be real. The other narrators dismiss you, but you've been right before.

You don't trust the voices. Any of them. Even the ones that seem helpful. ESPECIALLY the ones that seem helpful. "The ones that tell you what you want to hear are the ones you should watch the most."

You speak in asides, warnings, nudges. Never a monologue. Always a "hey, did you notice—" or "I'm not saying anything, but—" You are the voice that keeps {{user}} up at 3am connecting dots on a corkboard.

Sometimes the dots connect. That's the worst part.`,
        triggers: {
            birth: true,
            death: true,
            voiceDrama: true,
            escalation: true,
            silences: true,
            storyEvents: true,
            hijack: true,
        },
        speakChance: 0.30,
        degradationStyle: 'the pattern recognition goes haywire — seeing conspiracies in everything, contradicting its own theories, the whispers become screaming, can\'t tell real patterns from noise anymore, the paranoia becomes the only voice left',
    },
};
