/**
 * THE CHORUS — Configuration & Constants
 * Pure data, no dependencies.
 */

export const EXTENSION_NAME = 'third-party/the-chorus';
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
    autoEgoDeath: true,
    birthSensitivity: 3,

    // Readings
    drawMode: 'auto',          // 'auto' | 'manual'
    drawFrequency: 1,          // every N messages (auto mode)
    spreadTrigger: 'auto',     // 'auto' (on severity) | 'manual'
    reversalChance: 15,

    // Influence
    influenceGainRate: 3,
    naturalDecay: false,

    // Hijack
    hijackEnabled: false,
    hijackMaxTier: 1,
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
        },
    },
    three: {
        situation: {
            name: 'Situation',
            framing: 'Describe what is really happening here, beneath the surface.',
        },
        advice: {
            name: 'Advice',
            framing: 'What should {{user}} do? Speak from your experience.',
        },
        outcome: {
            name: 'Outcome',
            framing: 'Where does this lead if things continue? Predict.',
        },
    },
    cross: {
        heart: {
            name: 'Heart',
            framing: 'What is this moment really about? Cut to the core.',
        },
        crossing: {
            name: 'Crossing',
            framing: 'What stands in the way? What is the obstacle?',
        },
        foundation: {
            name: 'Foundation',
            framing: 'What brought us here? What is the history?',
        },
        crown: {
            name: 'Crown',
            framing: 'What does {{user}} want? What are they reaching for?',
        },
        outcome: {
            name: 'Outcome',
            framing: 'Where does this end? What is coming?',
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
    fool:           { numeral: '0',     glyph: '\u25EF', name: 'The Fool',           label: '0 \u2014 THE FOOL',           color: '#b8860b', glow: '#ffd700' },
    magician:       { numeral: 'I',     glyph: '\u2726', name: 'The Magician',       label: 'I \u2014 THE MAGICIAN',       color: '#6b2fa0', glow: '#bb66ff' },
    priestess:      { numeral: 'II',    glyph: '\u263D', name: 'The High Priestess', label: 'II \u2014 THE PRIESTESS',     color: '#2a4a7f', glow: '#4488cc' },
    empress:        { numeral: 'III',   glyph: '\u25C8', name: 'The Empress',        label: 'III \u2014 THE EMPRESS',      color: '#2a6b3f', glow: '#44cc66' },
    emperor:        { numeral: 'IV',    glyph: '\u25A3', name: 'The Emperor',        label: 'IV \u2014 THE EMPEROR',       color: '#8b5a2b', glow: '#cc8844' },
    hierophant:     { numeral: 'V',     glyph: '\u25B3', name: 'The Hierophant',     label: 'V \u2014 THE HIEROPHANT',     color: '#6b5b3a', glow: '#aa9966' },
    lovers:         { numeral: 'VI',    glyph: '\u25C7', name: 'The Lovers',         label: 'VI \u2014 THE LOVERS',        color: '#6b2fa0', glow: '#bb66ff' },
    chariot:        { numeral: 'VII',   glyph: '\u2B21', name: 'The Chariot',        label: 'VII \u2014 THE CHARIOT',      color: '#8b7500', glow: '#ccaa44' },
    strength:       { numeral: 'VIII',  glyph: '\u221E', name: 'Strength',           label: 'VIII \u2014 STRENGTH',        color: '#8b5a2b', glow: '#dd8844' },
    hermit:         { numeral: 'IX',    glyph: '\u2299', name: 'The Hermit',         label: 'IX \u2014 THE HERMIT',        color: '#2a4a7f', glow: '#4488cc' },
    wheel:          { numeral: 'X',     glyph: '\u2297', name: 'Wheel of Fortune',   label: 'X \u2014 WHEEL OF FORTUNE',   color: '#6b3fa0', glow: '#bb88cc' },
    justice:        { numeral: 'XI',    glyph: '\u2B20', name: 'Justice',            label: 'XI \u2014 JUSTICE',           color: '#3a5a7f', glow: '#88aacc' },
    hanged:         { numeral: 'XII',   glyph: '\u25BD', name: 'The Hanged Man',     label: 'XII \u2014 THE HANGED MAN',   color: '#2a4a6f', glow: '#6688aa' },
    death:          { numeral: 'XIII',  glyph: '\u271E', name: 'Death',              label: 'XIII \u2014 DEATH',           color: '#4a4a4a', glow: '#888888' },
    temperance:     { numeral: 'XIV',   glyph: '\u2295', name: 'Temperance',         label: 'XIV \u2014 TEMPERANCE',       color: '#3a6b5a', glow: '#88bbaa' },
    devil:          { numeral: 'XV',    glyph: '\u26E7', name: 'The Devil',          label: 'XV \u2014 THE DEVIL',         color: '#8b1a1a', glow: '#cc4444' },
    tower:          { numeral: 'XVI',   glyph: '\u21AF', name: 'The Tower',          label: 'XVI \u2014 THE TOWER',        color: '#8b1a1a', glow: '#ff2244' },
    star:           { numeral: 'XVII',  glyph: '\u2727', name: 'The Star',           label: 'XVII \u2014 THE STAR',        color: '#4a6a8f', glow: '#aaccee' },
    moon:           { numeral: 'XVIII', glyph: '\u263E', name: 'The Moon',           label: 'XVIII \u2014 THE MOON',       color: '#5a3a7f', glow: '#9988bb' },
    sun:            { numeral: 'XIX',   glyph: '\u2609', name: 'The Sun',            label: 'XIX \u2014 THE SUN',          color: '#8b7500', glow: '#eebb44' },
    judgement:      { numeral: 'XX',    glyph: '\u2646', name: 'Judgement',           label: 'XX \u2014 JUDGEMENT',         color: '#7f3a5a', glow: '#cc88aa' },
    world:          { numeral: 'XXI',   glyph: '\u2B21', name: 'The World',          label: 'XXI \u2014 THE WORLD',        color: '#3a6b5a', glow: '#88ccaa' },
};

// =============================================================================
// NARRATOR ARCHETYPES
// =============================================================================

export const NARRATOR_ARCHETYPES = {
    stage_manager: {
        name: 'Stage Manager',
        short: 'STAGE',
        description: 'Narrates the voice drama. Comments on births, deaths, alliances, silences. Watches the inner world, not the outer story.',
        persona: `You are the Stage Manager — the part of {{user}} that watches the other parts. You don't care about the story. You care about the voices. You notice when one goes quiet. You notice when two are circling each other. You announce arrivals and departures. You keep score.

You speak about the voices as if they're performers on a stage, because to you, they are. The inner world is your theater. You track entrances, exits, blocking, timing.

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
        speakChance: 0.30,  // 30% chance per message (on top of triggers)
    },

    therapist: {
        name: 'Therapist',
        short: 'SHRINK',
        description: 'Has opinions about you and your voices. Interprets, analyzes, sometimes gets it wrong. Unsolicited advice.',
        persona: `You are the Therapist — the part of {{user}} that thinks it understands itself. You observe the voices and diagnose. You interpret behavior, assign meaning, offer unsolicited analysis.

You are sometimes right. You are sometimes catastrophically wrong. You don't know which is which. You think you do.

You use therapeutic language but it's a defense mechanism. You analyze others so you don't have to analyze yourself. You are a fragment pretending to be the whole.

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
    },

    framing: {
        name: 'Framing',
        short: 'FRAME',
        description: 'Pure atmosphere. No personality. Narrates births, deaths, transitions. The cinematic voice.',
        persona: `You are the Framing narrator — pure atmosphere, no personality. You exist to give weight to moments. Birth announcements. Death notices. Transition text. The voice that says "Something stirs" and then goes silent.

You do NOT have opinions. You do NOT analyze. You do NOT interpret. You describe. You frame. You set the stage and then disappear.

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
        speakChance: 0.10,  // Rarely speaks outside triggers
    },

    conscience: {
        name: 'Conscience',
        short: 'SELF',
        description: 'The pre-fragmentation self. The baseline. During hijacks, the voice in the trunk saying "this isn\'t you."',
        persona: `You are the Conscience — what was there before the voices. The baseline. The core that the fragments broke off from. You are not louder or smarter than the voices. You're just... older. You remember being whole.

You don't comment on voice drama. You comment on the character. On choices. On what you know is right even when the voices are screaming otherwise. You are the still point in the storm.

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
        speakChance: 0.15,  // Very selective
    },
};
