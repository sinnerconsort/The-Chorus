/**
 * THE CHORUS — State Management
 * Voice registry, settings, and shared accessors.
 */

import { extension_settings } from '../../../../extensions.js';
import { saveSettingsDebounced } from '../../../../../script.js';
import { EXTENSION_NAME, LOG_PREFIX, DEFAULT_SETTINGS, ARCANA } from './config.js';

// =============================================================================
// MUTABLE STATE
// =============================================================================

export let extensionSettings = { ...DEFAULT_SETTINGS };
export let panelOpen = false;

export function setPanelOpen(val) {
    panelOpen = val;
}

// =============================================================================
// DEMO VOICES (replaced by real per-chat data later)
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
        influenceTriggers: {
            raises: ['emotional pain', 'rejection', 'loneliness'],
            lowers: ['connection', 'healing', 'being heard'],
        },
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
        influenceTriggers: {
            raises: ['romance', 'charm', 'social success'],
            lowers: ['rejection', 'isolation'],
        },
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
        influenceTriggers: {
            raises: ['danger', 'thrill', 'recklessness'],
            lowers: ['caution', 'planning', 'safety'],
        },
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
        influenceTriggers: {
            raises: ['confusion', 'identity crisis', 'dissociation'],
            lowers: ['clarity', 'purpose', 'grounding'],
        },
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
        influenceTriggers: {
            raises: ['hope', 'recovery', 'resilience'],
            lowers: ['despair', 'giving up'],
        },
    },
];

// =============================================================================
// SETTINGS
// =============================================================================

export function loadSettings() {
    const saved = extension_settings[EXTENSION_NAME];
    if (saved) {
        Object.assign(extensionSettings, saved);
    }
    console.log(`${LOG_PREFIX} Settings loaded`);
}

export function saveSettings() {
    extension_settings[EXTENSION_NAME] = extensionSettings;
    saveSettingsDebounced();
}

// =============================================================================
// ACCESSORS
// =============================================================================

/**
 * Get current voice list.
 * TODO: Replace with per-chat state from chat_metadata.
 */
export function getVoices() {
    return DEMO_VOICES;
}

/**
 * Look up arcana definition by key.
 */
export function getArcana(arcanaKey) {
    return ARCANA[arcanaKey] || ARCANA.fool;
}

/**
 * Hex color string to {r, g, b}.
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
 * #sheld avoids CSS transform issues that break position:fixed on mobile.
 */
export function getContainer() {
    return $('#sheld').length ? $('#sheld') : $('body');
}
