/**
 * THE CHORUS — State Management
 * Per-chat voice state, global settings, voice CRUD, persistence.
 *
 * Two layers:
 *   Global settings  → extension_settings[EXTENSION_NAME]  (survives all chats)
 *   Per-chat state   → chat_metadata[EXTENSION_NAME]       (per conversation)
 */

import { extension_settings, getContext } from '../../../../extensions.js';
import {
    saveSettingsDebounced,
    chat_metadata,
    saveChatDebounced,
} from '../../../../../script.js';
import { EXTENSION_NAME, LOG_PREFIX, DEFAULT_SETTINGS, ARCANA } from './config.js';

// =============================================================================
// DEFAULT PER-CHAT STATE
// =============================================================================

const DEFAULT_CHAT_STATE = {
    stateVersion: 1,

    // Narrator
    narrator: {
        persona: '',
        active: true,
    },

    // Voice deck
    voices: [],

    // Hijack state (null when no hijack active)
    activeHijack: null,

    // Detection accumulators — filled by scanners each message
    emotionAccumulator: {
        heartbreak: 0, rage: 0, euphoria: 0, grief: 0,
        love: 0, terror: 0, shame: 0, triumph: 0,
    },
    physicalAccumulator: {
        nearDeath: 0, injury: 0, intoxication: 0,
        intimacy: 0, adrenaline: 0,
    },

    // Theme accumulation tracker — for "death by a thousand cuts" births
    // { theme: { count: 0, messages: 0 } } — count = weighted score, messages = unique message count
    themeAccumulator: {},

    // Escalation level (driven by accumulators)
    escalation: 'calm',

    // History logs
    birthLog: [],
    deathLog: [],
    hijackLog: [],

    // Council conversation history (persisted per-chat)
    councilHistory: [],

    // Message counter (for draw frequency)
    messagesSinceLastDraw: 0,
};

// =============================================================================
// DEMO VOICES (loaded for fresh chats / demo mode)
// =============================================================================

const DEMO_VOICES = [
    {
        id: 'voice_001',
        name: 'The Wounded',
        arcana: 'tower',
        personality: 'Born from betrayal. Bitter, sharp-tongued, always watching for the next knife.',
        speakingStyle: 'Bitter. Short sentences. References the betrayal.',
        birthMoment: 'When she revealed she never loved you.',
        birthMessageId: 42,
        influence: 72,
        state: 'agitated',
        relationship: 'resentful',
        relationships: {},
        influenceTriggers: {
            raises: ['emotional pain', 'rejection', 'loneliness'],
            lowers: ['connection', 'healing', 'being heard'],
        },
        directoryHistory: [],
        created: Date.now() - 86400000,
        lastSpoke: Date.now() - 3600000,
    },
    {
        id: 'voice_002',
        name: 'The Charming',
        arcana: 'lovers',
        personality: 'Born from the first genuine connection. Warm, flirtatious, sees the best in people.',
        speakingStyle: 'Playful. Uses endearments. Speaks in questions.',
        birthMoment: 'The first time someone looked at you like you mattered.',
        birthMessageId: 15,
        influence: 45,
        state: 'active',
        relationship: 'curious',
        relationships: {},
        influenceTriggers: {
            raises: ['romance', 'charm', 'social success'],
            lowers: ['rejection', 'isolation'],
        },
        directoryHistory: [],
        created: Date.now() - 172800000,
        lastSpoke: Date.now() - 7200000,
    },
    {
        id: 'voice_003',
        name: 'The Reckless',
        arcana: 'fool',
        personality: 'Born from the moment you stopped caring about consequences. Wild, loud, free.',
        speakingStyle: 'ALL CAPS when excited. Short bursts. Dares and challenges.',
        birthMoment: 'When you jumped without looking and survived.',
        birthMessageId: 28,
        influence: 58,
        state: 'active',
        relationship: 'manic',
        relationships: {},
        influenceTriggers: {
            raises: ['danger', 'thrill', 'recklessness'],
            lowers: ['caution', 'planning', 'safety'],
        },
        directoryHistory: [],
        created: Date.now() - 259200000,
        lastSpoke: Date.now() - 1800000,
    },
    {
        id: 'voice_004',
        name: 'The Hollow',
        arcana: 'moon',
        personality: 'Born from the fog of not knowing who you are. Quiet, uncertain, drifting.',
        speakingStyle: 'Trailing off... Uses ellipses. Asks questions it doesn\'t want answered.',
        birthMoment: 'The morning you woke up and didn\'t recognize yourself.',
        birthMessageId: 67,
        influence: 18,
        state: 'dormant',
        relationship: 'grieving',
        relationships: {},
        influenceTriggers: {
            raises: ['confusion', 'identity crisis', 'dissociation'],
            lowers: ['clarity', 'purpose', 'grounding'],
        },
        directoryHistory: [],
        created: Date.now() - 345600000,
        lastSpoke: Date.now() - 43200000,
    },
    {
        id: 'voice_005',
        name: 'The Ember',
        arcana: 'star',
        personality: 'Was hope. Was resilience. Was the small flame that kept burning. Now ash.',
        speakingStyle: 'Past tense. Wistful. References what could have been.',
        birthMoment: 'The night you decided to keep going despite everything.',
        birthMessageId: 89,
        influence: 0,
        state: 'dead',
        relationship: 'indifferent',
        relationships: {},
        influenceTriggers: {
            raises: ['hope', 'recovery', 'resilience'],
            lowers: ['despair', 'giving up'],
        },
        directoryHistory: [],
        created: Date.now() - 432000000,
        lastSpoke: null,
    },
];

// =============================================================================
// RUNTIME STATE
// =============================================================================

/** Global settings (persists across all chats) */
export let extensionSettings = { ...DEFAULT_SETTINGS };

/** Per-chat state (loaded/saved per conversation) */
let chatState = null;

/** UI state (not persisted) */
export let panelOpen = false;

export function setPanelOpen(val) {
    panelOpen = val;
}

// =============================================================================
// GLOBAL SETTINGS — extension_settings
// =============================================================================

export function loadSettings() {
    if (!extension_settings[EXTENSION_NAME]) {
        extension_settings[EXTENSION_NAME] = { ...DEFAULT_SETTINGS };
    }

    const saved = extension_settings[EXTENSION_NAME];

    // Ensure all keys exist (forward-compat for new settings)
    for (const key in DEFAULT_SETTINGS) {
        if (saved[key] === undefined) {
            saved[key] = DEFAULT_SETTINGS[key];
        }
    }

    extensionSettings = saved;
    console.log(`${LOG_PREFIX} Global settings loaded (v${extensionSettings.settingsVersion})`);
}

export function saveGlobalSettings() {
    extension_settings[EXTENSION_NAME] = extensionSettings;
    saveSettingsDebounced();
}

// Alias for backward compat with index.js
export const saveSettings = saveGlobalSettings;

// =============================================================================
// PER-CHAT STATE — chat_metadata
// =============================================================================

/**
 * Deep-clone an object (safe for JSON-serializable state).
 */
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Ensure chat state has all expected keys (defensive init).
 * Handles version migrations and missing fields gracefully.
 */
function sanitizeChatState(state) {
    if (!state || typeof state !== 'object') {
        return deepClone(DEFAULT_CHAT_STATE);
    }

    // Ensure top-level keys
    for (const key in DEFAULT_CHAT_STATE) {
        if (state[key] === undefined) {
            state[key] = deepClone(DEFAULT_CHAT_STATE[key]);
        }
    }

    // Ensure narrator structure
    if (!state.narrator || typeof state.narrator !== 'object') {
        state.narrator = deepClone(DEFAULT_CHAT_STATE.narrator);
    }

    // Ensure voices is array
    if (!Array.isArray(state.voices)) {
        state.voices = [];
    }

    // Sanitize each voice
    state.voices = state.voices.map(v => sanitizeVoice(v));

    // Ensure accumulators
    if (!state.emotionAccumulator || typeof state.emotionAccumulator !== 'object') {
        state.emotionAccumulator = deepClone(DEFAULT_CHAT_STATE.emotionAccumulator);
    }
    if (!state.physicalAccumulator || typeof state.physicalAccumulator !== 'object') {
        state.physicalAccumulator = deepClone(DEFAULT_CHAT_STATE.physicalAccumulator);
    }
    if (!state.themeAccumulator || typeof state.themeAccumulator !== 'object') {
        state.themeAccumulator = {};
    }

    // Ensure arrays
    if (!Array.isArray(state.birthLog)) state.birthLog = [];
    if (!Array.isArray(state.deathLog)) state.deathLog = [];
    if (!Array.isArray(state.hijackLog)) state.hijackLog = [];

    // Ensure escalation is valid
    const validEscalations = ['calm', 'rising', 'elevated', 'crisis'];
    if (!validEscalations.includes(state.escalation)) {
        state.escalation = 'calm';
    }

    // Ensure counter
    if (typeof state.messagesSinceLastDraw !== 'number') {
        state.messagesSinceLastDraw = 0;
    }

    return state;
}

/**
 * Ensure a voice object has all required fields.
 */
function sanitizeVoice(voice) {
    const defaults = {
        id: '',
        name: 'Unknown Voice',
        arcana: 'fool',
        personality: '',
        speakingStyle: '',
        birthMoment: '',
        birthMessageId: null,
        influence: 0,
        state: 'dormant',
        relationship: 'curious',
        relationships: {},
        influenceTriggers: { raises: [], lowers: [] },
        directoryHistory: [],
        created: Date.now(),
        lastSpoke: null,

        // Voice engine fields
        obsession: '',
        opinion: '',
        blindSpot: '',
        selfAwareness: '',
        metaphorDomain: 'general',
        verbalTic: '',
        chattiness: 3,
        lastCommentary: '',
        silentStreak: 0,

        // Outreach (voice-initiated DMs)
        pendingDM: null,       // { text, trigger, timestamp } or null

        // Depth & lifecycle
        depth: 'rooted',           // 'surface' | 'rooted' | 'core'
        reversed: false,           // Born from shadow aspect of arcana
        birthType: 'event',        // 'event' | 'persona' | 'accumulation' | 'transform' | 'merge'
        resolution: {
            type: 'endure',
            condition: '',         // Natural language (hidden from user)
            progress: 0,           // 0-100
            threshold: null,       // Target to resolve (null = unresolvable)
            transformsInto: null,  // For transform type: { hint, suggestedArcana, depth }
        },
        resolvedAt: null,          // Timestamp if resolved/transformed
    };

    const sanitized = { ...defaults, ...voice };

    // Clamp influence
    sanitized.influence = Math.max(0, Math.min(100, sanitized.influence || 0));

    // Validate state
    const validStates = ['dormant', 'active', 'agitated', 'hijacking', 'dead',
        'fading', 'resolving', 'transforming'];
    if (!validStates.includes(sanitized.state)) {
        sanitized.state = 'dormant';
    }

    // Validate relationship
    const validRelationships = [
        'devoted', 'protective', 'warm', 'curious', 'indifferent',
        'resentful', 'hostile', 'obsessed', 'grieving', 'manic',
    ];
    if (!validRelationships.includes(sanitized.relationship)) {
        sanitized.relationship = 'curious';
    }

    // Validate depth
    const validDepths = ['surface', 'rooted', 'core'];
    if (!validDepths.includes(sanitized.depth)) {
        sanitized.depth = 'rooted';
    }

    // Ensure triggers structure
    if (!sanitized.influenceTriggers || typeof sanitized.influenceTriggers !== 'object') {
        sanitized.influenceTriggers = { raises: [], lowers: [] };
    }
    if (!Array.isArray(sanitized.influenceTriggers.raises)) sanitized.influenceTriggers.raises = [];
    if (!Array.isArray(sanitized.influenceTriggers.lowers)) sanitized.influenceTriggers.lowers = [];

    // Ensure resolution structure
    if (!sanitized.resolution || typeof sanitized.resolution !== 'object') {
        sanitized.resolution = { type: 'endure', condition: '', progress: 0, threshold: null, transformsInto: null };
    }
    sanitized.resolution.progress = Math.max(0, Math.min(100, sanitized.resolution.progress || 0));

    // Ensure history array
    if (!Array.isArray(sanitized.directoryHistory)) sanitized.directoryHistory = [];

    return sanitized;
}

/**
 * Load per-chat state from chat_metadata.
 * Called on CHAT_CHANGED — ST has already populated chat_metadata.
 */
export function loadChatState() {
    const context = getContext();
    if (!context.chatId) {
        console.log(`${LOG_PREFIX} No active chat, clearing state`);
        chatState = null;
        return;
    }

    const saved = chat_metadata?.[EXTENSION_NAME];

    if (saved) {
        chatState = sanitizeChatState(deepClone(saved));
        console.log(`${LOG_PREFIX} Chat state loaded (${chatState.voices.length} voices)`);
    } else {
        // Fresh chat — start with demo voices for now
        // TODO: Replace demo load with persona-card reader for first voice
        chatState = deepClone(DEFAULT_CHAT_STATE);
        chatState.voices = deepClone(DEMO_VOICES);
        saveChatState();
        console.log(`${LOG_PREFIX} New chat — initialized with demo voices`);
    }
}

/**
 * Save current chat state to chat_metadata.
 */
export function saveChatState() {
    if (!chat_metadata || !chatState) {
        return;
    }

    chat_metadata[EXTENSION_NAME] = deepClone(chatState);
    saveChatDebounced();
}

/**
 * Reset all Chorus state for the current chat.
 * Wipes voices, logs, accumulators — fresh start.
 */
export function resetChatState() {
    if (!chatState) return;

    chatState = deepClone(DEFAULT_CHAT_STATE);
    saveChatState();
    console.log(`${LOG_PREFIX} Chat state reset to default`);
}

/**
 * Check if we have an active chat with loaded state.
 */
export function hasActiveChat() {
    return chatState !== null;
}

// =============================================================================
// VOICE ACCESSORS
// =============================================================================

/**
 * Get all voices in the current chat.
 * Returns empty array if no chat is active.
 */
export function getVoices() {
    if (!chatState) return DEMO_VOICES; // Fallback for UI before chat loads
    return chatState.voices;
}

/**
 * Get living (non-dead) voices.
 */
export function getLivingVoices() {
    return getVoices().filter(v => v.state !== 'dead');
}

/**
 * Get all arcana currently used by living voices.
 * @returns {string[]} Array of arcana keys (e.g. ['fool', 'tower', 'lovers'])
 */
export function getTakenArcana() {
    return getLivingVoices().map(v => v.arcana);
}

/**
 * Get the weakest living voice (lowest influence, not core depth).
 * Used for full-deck heal/consume behavior.
 * @returns {Object|null} The weakest eligible voice
 */
export function getWeakestVoice() {
    const eligible = getLivingVoices()
        .filter(v => v.depth !== 'core')
        .sort((a, b) => (a.influence || 0) - (b.influence || 0));
    return eligible[0] || null;
}

/**
 * Get a single voice by ID.
 */
export function getVoiceById(id) {
    return getVoices().find(v => v.id === id) || null;
}

/**
 * Get narrator state.
 */
export function getNarrator() {
    if (!chatState) return DEFAULT_CHAT_STATE.narrator;
    return chatState.narrator;
}

/**
 * Get current escalation level.
 */
export function getEscalation() {
    if (!chatState) return 'calm';
    return chatState.escalation;
}

/**
 * Get message counter since last draw.
 */
export function getMessagesSinceLastDraw() {
    if (!chatState) return 0;
    return chatState.messagesSinceLastDraw;
}

/**
 * Get detection accumulators.
 */
export function getAccumulators() {
    if (!chatState) return {
        emotion: deepClone(DEFAULT_CHAT_STATE.emotionAccumulator),
        physical: deepClone(DEFAULT_CHAT_STATE.physicalAccumulator),
    };
    return {
        emotion: chatState.emotionAccumulator,
        physical: chatState.physicalAccumulator,
    };
}

/**
 * Get theme accumulator (for accumulation births).
 */
export function getThemeAccumulator() {
    if (!chatState) return {};
    if (!chatState.themeAccumulator) chatState.themeAccumulator = {};
    return chatState.themeAccumulator;
}

/**
 * Update theme accumulator — increment themes from this message, decay others.
 * @param {string[]} themes - Themes present in this message
 * @param {number} decayRate - How fast absent themes decay
 * @returns {Object[]} Array of { theme, count, messages } for themes that crossed threshold
 */
export function updateThemeAccumulator(themes = [], decayRate = 0.3) {
    if (!chatState) return [];
    if (!chatState.themeAccumulator) chatState.themeAccumulator = {};

    const acc = chatState.themeAccumulator;
    const peaked = [];

    // Increment present themes
    for (const theme of themes) {
        if (!acc[theme]) {
            acc[theme] = { count: 0, messages: 0 };
        }
        acc[theme].count += 1;
        acc[theme].messages += 1;
    }

    // Decay absent themes
    for (const key of Object.keys(acc)) {
        if (!themes.includes(key)) {
            acc[key].count = Math.max(0, acc[key].count - decayRate);
            // Clean up dead accumulators
            if (acc[key].count <= 0 && acc[key].messages <= 1) {
                delete acc[key];
            }
        }
    }

    saveChatState();
    return acc;
}

/**
 * Clear a specific theme from the accumulator (after birth).
 */
export function clearThemeAccumulation(theme) {
    if (!chatState?.themeAccumulator) return;
    delete chatState.themeAccumulator[theme];
    saveChatState();
}

/**
 * Get logs.
 */
export function getLogs() {
    if (!chatState) return { births: [], deaths: [], hijacks: [] };
    return {
        births: chatState.birthLog,
        deaths: chatState.deathLog,
        hijacks: chatState.hijackLog,
    };
}

// =============================================================================
// VOICE MUTATIONS
// =============================================================================

/** Generate a unique voice ID. */
function generateVoiceId() {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 6);
    return `voice_${ts}_${rand}`;
}

/**
 * Add a new voice to the deck.
 * Returns the created voice, or null if deck is full.
 */
export function addVoice(voiceData) {
    if (!chatState) return null;

    const living = getLivingVoices();
    if (living.length >= extensionSettings.maxVoices) {
        console.log(`${LOG_PREFIX} Deck full (${living.length}/${extensionSettings.maxVoices})`);
        return null;
    }

    const voice = sanitizeVoice({
        id: generateVoiceId(),
        created: Date.now(),
        ...voiceData,
    });

    chatState.voices.push(voice);

    // Log birth
    chatState.birthLog.push({
        voiceId: voice.id,
        name: voice.name,
        arcana: voice.arcana,
        birthMoment: voice.birthMoment,
        timestamp: Date.now(),
    });

    saveChatState();
    console.log(`${LOG_PREFIX} Voice born: ${voice.name} (${voice.arcana})`);
    return voice;
}

/**
 * Kill a voice (ego death). Sets state to 'dead', influence to 0.
 * Voice remains in deck as a record.
 */
export function killVoice(voiceId) {
    if (!chatState) return false;

    const voice = getVoiceById(voiceId);
    if (!voice || voice.state === 'dead') return false;

    voice.state = 'dead';
    voice.influence = 0;

    // Log death
    chatState.deathLog.push({
        voiceId: voice.id,
        name: voice.name,
        arcana: voice.arcana,
        relationship: voice.relationship,
        influence: voice.influence,
        timestamp: Date.now(),
    });

    saveChatState();
    console.log(`${LOG_PREFIX} Voice died: ${voice.name}`);
    return true;
}

/**
 * Remove a dead voice from the deck entirely (make room).
 */
export function removeDeadVoice(voiceId) {
    if (!chatState) return false;

    const idx = chatState.voices.findIndex(v => v.id === voiceId && v.state === 'dead');
    if (idx === -1) return false;

    chatState.voices.splice(idx, 1);
    saveChatState();
    return true;
}

/**
 * Resolve a voice (natural end — fading, healing, confronting).
 * Different from kill (ego death) — this is peaceful completion.
 */
export function resolveVoice(voiceId, reason = 'resolved') {
    if (!chatState) return false;

    const voice = getVoiceById(voiceId);
    if (!voice || voice.state === 'dead') return false;

    voice.state = 'dead';
    voice.influence = 0;
    voice.resolvedAt = Date.now();

    // Log as death but with resolution context
    chatState.deathLog.push({
        voiceId: voice.id,
        name: voice.name,
        arcana: voice.arcana,
        relationship: voice.relationship,
        influence: voice.influence,
        reason,
        resolutionType: voice.resolution?.type || 'unknown',
        timestamp: Date.now(),
    });

    saveChatState();
    console.log(`${LOG_PREFIX} Voice resolved (${reason}): ${voice.name}`);
    return true;
}

/**
 * Transform a voice — kill the old, return data needed to birth the new.
 * Returns the old voice's transformsInto data, or null.
 */
export function transformVoice(voiceId) {
    if (!chatState) return null;

    const voice = getVoiceById(voiceId);
    if (!voice || voice.state === 'dead') return null;

    const transformData = voice.resolution?.transformsInto;
    if (!transformData) return null;

    // Kill the old voice
    voice.state = 'dead';
    voice.influence = 0;
    voice.resolvedAt = Date.now();

    // Log transformation
    chatState.deathLog.push({
        voiceId: voice.id,
        name: voice.name,
        arcana: voice.arcana,
        relationship: voice.relationship,
        influence: voice.influence,
        reason: 'transformed',
        resolutionType: 'transform',
        transformHint: transformData.hint,
        timestamp: Date.now(),
    });

    saveChatState();
    console.log(`${LOG_PREFIX} Voice transforming: ${voice.name} → "${transformData.hint}"`);

    return {
        oldVoice: voice,
        hint: transformData.hint,
        suggestedArcana: transformData.suggestedArcana,
        depth: transformData.depth || 'rooted',
        birthMoment: voice.birthMoment, // Carries memory
    };
}

/**
 * Update voice fields. Merges provided fields into existing voice.
 * Auto-saves.
 */
export function updateVoice(voiceId, updates) {
    if (!chatState) return false;

    const voice = getVoiceById(voiceId);
    if (!voice) return false;

    // Merge fields (shallow — deep fields like influenceTriggers need full replace)
    Object.assign(voice, updates);

    // Re-clamp influence
    voice.influence = Math.max(0, Math.min(100, voice.influence));

    saveChatState();
    return true;
}

// =============================================================================
// INFLUENCE HELPERS
// =============================================================================

/**
 * Adjust a voice's influence by delta. Clamps 0-100.
 * Positive = gain, negative = loss.
 * Auto-updates voice state based on new level.
 */
export function adjustInfluence(voiceId, delta) {
    const voice = getVoiceById(voiceId);
    if (!voice || voice.state === 'dead') return;

    const oldInfluence = voice.influence;
    voice.influence = Math.max(0, Math.min(100, voice.influence + delta));

    // Auto-update state based on influence thresholds
    if (voice.state !== 'hijacking') {
        if (voice.influence >= 70) {
            voice.state = 'agitated';
        } else if (voice.influence >= 20) {
            voice.state = 'active';
        } else {
            voice.state = 'dormant';
        }
    }

    if (voice.influence !== oldInfluence) {
        saveChatState();
    }
}

// =============================================================================
// OUTREACH (voice-initiated DM) HELPERS
// =============================================================================

/**
 * Set a pending DM on a voice. Returns true if set.
 */
export function setPendingDM(voiceId, text, trigger) {
    const voice = getVoiceById(voiceId);
    if (!voice || voice.state === 'dead') return false;
    if (voice.pendingDM) return false; // Already has one

    voice.pendingDM = {
        text,
        trigger,
        timestamp: Date.now(),
    };
    saveChatState();
    return true;
}

/**
 * Clear a voice's pending DM. Returns the DM that was cleared (or null).
 */
export function clearPendingDM(voiceId) {
    const voice = getVoiceById(voiceId);
    if (!voice) return null;

    const dm = voice.pendingDM;
    voice.pendingDM = null;
    saveChatState();
    return dm;
}

/**
 * Get all voices with pending DMs.
 */
export function getVoicesWithPendingDMs() {
    return getLivingVoices().filter(v => v.pendingDM !== null);
}

// =============================================================================
// COUNCIL HISTORY HELPERS
// =============================================================================

/**
 * Get council conversation history.
 */
export function getCouncilHistory() {
    return chatState?.councilHistory || [];
}

/**
 * Add messages to council history. Trims to last 40 messages.
 */
export function addCouncilMessages(messages) {
    if (!chatState) return;
    if (!Array.isArray(chatState.councilHistory)) chatState.councilHistory = [];

    chatState.councilHistory.push(...messages);

    // Trim to last 40
    while (chatState.councilHistory.length > 40) {
        chatState.councilHistory.shift();
    }
    saveChatState();
}

/**
 * Clear council history.
 */
export function clearCouncilHistory() {
    if (!chatState) return;
    chatState.councilHistory = [];
    saveChatState();
}

/**
 * Update a voice's relationships map from council dynamics.
 */
export function updateVoiceRelationships(voiceId, relationshipUpdates) {
    const voice = getVoiceById(voiceId);
    if (!voice) return;

    if (!voice.relationships) voice.relationships = {};
    Object.assign(voice.relationships, relationshipUpdates);
    saveChatState();
}

/**
 * Apply natural decay to all living voices.
 * Called per message when naturalDecay is enabled.
 */
export function decayAllInfluence(amount = 1) {
    if (!chatState) return;

    let changed = false;
    for (const voice of chatState.voices) {
        if (voice.state === 'dead') continue;
        if (voice.influence > 0) {
            voice.influence = Math.max(0, voice.influence - amount);
            changed = true;
        }
    }

    if (changed) {
        // Recalculate states
        for (const voice of chatState.voices) {
            if (voice.state === 'dead' || voice.state === 'hijacking') continue;
            if (voice.influence >= 70) voice.state = 'agitated';
            else if (voice.influence >= 20) voice.state = 'active';
            else voice.state = 'dormant';
        }
        saveChatState();
    }
}

// =============================================================================
// ESCALATION
// =============================================================================

/**
 * Set escalation level. Auto-saves.
 */
export function setEscalation(level) {
    if (!chatState) return;
    const valid = ['calm', 'rising', 'elevated', 'crisis'];
    if (!valid.includes(level)) return;
    chatState.escalation = level;
    saveChatState();
}

// =============================================================================
// MESSAGE COUNTER
// =============================================================================

/**
 * Increment message counter. Returns new count.
 */
export function incrementMessageCounter() {
    if (!chatState) return 0;
    chatState.messagesSinceLastDraw++;
    saveChatState();
    return chatState.messagesSinceLastDraw;
}

/**
 * Reset message counter (after a draw).
 */
export function resetMessageCounter() {
    if (!chatState) return;
    chatState.messagesSinceLastDraw = 0;
    saveChatState();
}

// =============================================================================
// ACCUMULATOR MUTATIONS
// =============================================================================

/**
 * Update emotion accumulator values.
 * @param {Object} deltas - { heartbreak: 5, rage: -2, ... }
 */
export function updateEmotionAccumulator(deltas) {
    if (!chatState) return;
    for (const [key, delta] of Object.entries(deltas)) {
        if (key in chatState.emotionAccumulator) {
            chatState.emotionAccumulator[key] = Math.max(0,
                Math.min(100, (chatState.emotionAccumulator[key] || 0) + delta));
        }
    }
    saveChatState();
}

/**
 * Update physical accumulator values.
 * @param {Object} deltas - { nearDeath: 10, intimacy: 5, ... }
 */
export function updatePhysicalAccumulator(deltas) {
    if (!chatState) return;
    for (const [key, delta] of Object.entries(deltas)) {
        if (key in chatState.physicalAccumulator) {
            chatState.physicalAccumulator[key] = Math.max(0,
                Math.min(100, (chatState.physicalAccumulator[key] || 0) + delta));
        }
    }
    saveChatState();
}

/**
 * Decay all accumulators by a flat amount (natural cooldown).
 */
export function decayAccumulators(amount = 2) {
    if (!chatState) return;

    for (const key in chatState.emotionAccumulator) {
        chatState.emotionAccumulator[key] = Math.max(0,
            chatState.emotionAccumulator[key] - amount);
    }
    for (const key in chatState.physicalAccumulator) {
        chatState.physicalAccumulator[key] = Math.max(0,
            chatState.physicalAccumulator[key] - amount);
    }
    saveChatState();
}

// =============================================================================
// HIJACK STATE
// =============================================================================

/**
 * Start a hijack.
 */
export function startHijack(voiceId, tier, messagesRemaining) {
    if (!chatState) return;

    const voice = getVoiceById(voiceId);
    if (!voice) return;

    voice.state = 'hijacking';
    chatState.activeHijack = {
        voiceId,
        tier,
        messagesRemaining,
        startedAt: Date.now(),
    };

    chatState.hijackLog.push({
        voiceId,
        name: voice.name,
        tier,
        timestamp: Date.now(),
    });

    saveChatState();
    console.log(`${LOG_PREFIX} Hijack started: ${voice.name} (Tier ${tier})`);
}

/**
 * End the current hijack.
 */
export function endHijack() {
    if (!chatState || !chatState.activeHijack) return;

    const voice = getVoiceById(chatState.activeHijack.voiceId);
    if (voice && voice.state === 'hijacking') {
        // Recalculate state from influence
        if (voice.influence >= 70) voice.state = 'agitated';
        else if (voice.influence >= 20) voice.state = 'active';
        else voice.state = 'dormant';
    }

    chatState.activeHijack = null;
    saveChatState();
    console.log(`${LOG_PREFIX} Hijack ended`);
}

/**
 * Get active hijack state (or null).
 */
export function getActiveHijack() {
    if (!chatState) return null;
    return chatState.activeHijack;
}

// =============================================================================
// UTILITY ACCESSORS
// =============================================================================

/**
 * Look up arcana definition by key.
 */
export function getArcana(arcanaKey) {
    return ARCANA[arcanaKey] || ARCANA.fool;
}

/**
 * Hex color string → {r, g, b}.
 */
export function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
    } : { r: 128, g: 128, b: 128 };
}

/**
 * Get best container for absolute-positioned elements.
 */
export function getContainer() {
    return $('#sheld').length ? $('#sheld') : $('body');
}
