/**
 * THE CHORUS — Log Tab (Chronicle)
 *
 * Unified timeline of voice births, deaths, and transformations.
 * Per-chat history rendered as a scrolling chronicle.
 *
 * Each entry is a "card" with arcana glyph, voice name, event
 * type, relative timestamp, and contextual details.
 */

import {
    getLogs,
    getArcana,
    getVoiceById,
} from '../state.js';
import { LOG_PREFIX } from '../config.js';

// =============================================================================
// EVENT TYPE CONFIG
// =============================================================================

const EVENT_TYPES = {
    birth: {
        label: 'AWAKENED',
        icon: '✦',
        cssClass: 'chorus-log-entry--birth',
    },
    death: {
        label: 'SILENCED',
        icon: '⸸',
        cssClass: 'chorus-log-entry--death',
    },
    resolved: {
        label: 'RESOLVED',
        icon: '◇',
        cssClass: 'chorus-log-entry--resolved',
    },
    transformed: {
        label: 'TRANSFORMED',
        icon: '↻',
        cssClass: 'chorus-log-entry--transformed',
    },
};

// Resolution type → display label
const RESOLUTION_LABELS = {
    fade: 'Faded away',
    heal: 'Found healing',
    transform: 'Became something else',
    confront: 'Faced and overcome',
    witness: 'Witnessed and accepted',
    endure: 'Endured',
};

// =============================================================================
// TIMELINE BUILDER
// =============================================================================

/**
 * Merge all logs into a single sorted timeline.
 * Returns array of { type, timestamp, ...data }.
 */
function buildTimeline() {
    const { births, deaths } = getLogs();
    const entries = [];

    // Births
    for (const b of births) {
        entries.push({
            type: 'birth',
            timestamp: b.timestamp,
            voiceId: b.voiceId,
            name: b.name,
            arcana: b.arcana,
            detail: b.birthMoment || '',
        });
    }

    // Deaths (distinguish kill/resolve/transform)
    for (const d of deaths) {
        let type = 'death';
        if (d.reason === 'transformed') {
            type = 'transformed';
        } else if (d.reason && d.reason !== 'ego death') {
            type = 'resolved';
        }

        entries.push({
            type,
            timestamp: d.timestamp,
            voiceId: d.voiceId,
            name: d.name,
            arcana: d.arcana,
            relationship: d.relationship,
            resolutionType: d.resolutionType,
            transformHint: d.transformHint,
            detail: type === 'transformed'
                ? `Became: ${d.transformHint || 'something new'}`
                : type === 'resolved'
                    ? RESOLUTION_LABELS[d.resolutionType] || d.reason
                    : '',
        });
    }

    // Sort newest first
    entries.sort((a, b) => b.timestamp - a.timestamp);

    return entries;
}

// =============================================================================
// TIME FORMATTING
// =============================================================================

function formatRelativeTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    // Older than a week — show date
    const d = new Date(timestamp);
    const month = d.toLocaleString('default', { month: 'short' });
    return `${month} ${d.getDate()}`;
}

// =============================================================================
// RENDER
// =============================================================================

function buildLogEntry(entry) {
    const evtConfig = EVENT_TYPES[entry.type] || EVENT_TYPES.birth;
    const arcana = getArcana(entry.arcana);
    const glyph = arcana?.glyph || '🂠';
    const arcanaName = arcana?.name || entry.arcana || '???';
    const timeStr = formatRelativeTime(entry.timestamp);

    // Check if voice still exists (for status)
    const voice = getVoiceById(entry.voiceId);
    const isAlive = voice && voice.state !== 'dead';

    return `
        <div class="chorus-log-entry ${evtConfig.cssClass}">
            <div class="chorus-log-entry__glyph">${glyph}</div>
            <div class="chorus-log-entry__body">
                <div class="chorus-log-entry__header">
                    <span class="chorus-log-entry__icon">${evtConfig.icon}</span>
                    <span class="chorus-log-entry__label">${evtConfig.label}</span>
                    <span class="chorus-log-entry__time">${timeStr}</span>
                </div>
                <div class="chorus-log-entry__name">${entry.name}</div>
                <div class="chorus-log-entry__arcana">${arcanaName}</div>
                ${entry.detail ? `<div class="chorus-log-entry__detail">${entry.detail}</div>` : ''}
            </div>
        </div>
    `;
}

/**
 * Render the full log tab.
 * Call this when switching to the log tab or when state changes.
 */
export function renderLog() {
    const $container = $('#chorus-log-entries');
    if (!$container.length) return;

    const timeline = buildTimeline();

    if (timeline.length === 0) {
        $container.html(`
            <div class="chorus-log-empty">
                <div class="chorus-log-empty__icon">🂠</div>
                <div class="chorus-log-empty__text">No history yet</div>
                <div class="chorus-log-empty__sub">Voices will be recorded as they awaken and fall silent</div>
            </div>
        `);
        return;
    }

    // Summary stats at top
    const { births, deaths } = getLogs();
    const statsHtml = `
        <div class="chorus-log-stats">
            <div class="chorus-log-stat">
                <span class="chorus-log-stat__val">${births.length}</span>
                <span class="chorus-log-stat__label">awakened</span>
            </div>
            <div class="chorus-log-stat">
                <span class="chorus-log-stat__val">${deaths.length}</span>
                <span class="chorus-log-stat__label">silenced</span>
            </div>
        </div>
    `;

    const entriesHtml = timeline.map(e => buildLogEntry(e)).join('');

    $container.html(statsHtml + entriesHtml);

    console.log(`${LOG_PREFIX} Log rendered: ${timeline.length} entries`);
}

/**
 * Initialize log tab (call once on extension load).
 */
export function initLog() {
    // Log renders on demand when tab is switched
    console.log(`${LOG_PREFIX} Log tab initialized`);
}
