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
    narratorPersona: 'sardonic',

    // Deck
    maxVoices: 7,
    autoEgoDeath: true,
    birthSensitivity: 3,

    // Readings
    autoDraw: true,
    drawFrequency: 3,
    defaultSpread: 'three',
    reversalChance: 15,

    // Influence
    influenceGainRate: 3,
    naturalDecay: false,

    // Hijack
    hijackEnabled: false,
    hijackMaxTier: 1,
};

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
