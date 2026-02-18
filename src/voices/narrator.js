/**
 * THE CHORUS — Narrator System
 * The meta-voice that frames the voice experience.
 *
 * Four archetypes:
 *   - Stage Manager: narrates voice drama, births, deaths, silences
 *   - Therapist: interprets, analyzes, offers unsolicited opinions
 *   - Framing: pure atmosphere, title cards, transitions
 *   - Conscience: the pre-fragmentation self, comments on choices
 *
 * The narrator is flavored by the chat's tone anchor (gothic stage
 * manager vs noir stage manager are completely different experiences).
 *
 * Generation: independent API calls via ConnectionManagerRequestService.
 * The narrator speaks on triggers (birth, death, hijack, escalation)
 * and occasionally during sidebar commentary based on speakChance.
 */

import { getContext } from '../../../../../extensions.js';
import {
    NARRATOR_ARCHETYPES, TONE_ANCHORS, LOG_PREFIX,
} from '../config.js';
import {
    extensionSettings,
    getLivingVoices,
    getVoiceById,
    getArcana,
    getNarrator,
} from '../state.js';

// =============================================================================
// CONNECTION (shared pattern)
// =============================================================================

function getProfileId() {
    const ctx = getContext();
    const connectionManager = ctx.extensionSettings?.connectionManager;
    if (!connectionManager) return null;

    const profileName = extensionSettings.connectionProfile || 'current';
    if (profileName === 'current' || profileName === 'default') {
        return connectionManager.selectedProfile;
    }

    const profile = connectionManager.profiles?.find(p => p.name === profileName);
    return profile ? profile.id : connectionManager.selectedProfile;
}

async function sendRequest(messages, maxTokens = 200) {
    const ctx = getContext();
    if (!ctx.ConnectionManagerRequestService) {
        throw new Error('ConnectionManagerRequestService not available');
    }

    const profileId = getProfileId();
    if (!profileId) throw new Error('No connection profile available');

    const response = await ctx.ConnectionManagerRequestService.sendRequest(
        profileId,
        messages,
        maxTokens,
        { extractData: true, includePreset: true, includeInstruct: false },
        {},
    );

    return response?.content || response || '';
}

// =============================================================================
// CONTEXT BUILDING
// =============================================================================

function getArchetype() {
    const key = extensionSettings.narratorArchetype || 'stage_manager';
    return NARRATOR_ARCHETYPES[key] || NARRATOR_ARCHETYPES.stage_manager;
}

function getToneDescription() {
    const key = extensionSettings.toneAnchor || 'raw';
    const tone = TONE_ANCHORS[key];
    return tone ? `${tone.name}: ${tone.description}` : 'Raw: Conversational, profane, blunt.';
}

function buildVoiceSummary() {
    const living = getLivingVoices();
    if (living.length === 0) return 'No voices present.';

    return living.map(v => {
        const arc = getArcana(v.arcana);
        const stateTag = v.state !== 'active' ? ` [${v.state.toUpperCase()}]` : '';
        return `- ${v.name} (${arc.name}, ${v.depth}) — influence: ${v.influence}/100, relationship: ${v.relationship}, silent for ${v.silentStreak || 0} msgs${stateTag}`;
    }).join('\n');
}

// =============================================================================
// NARRATOR PROMPT BUILDING
// =============================================================================

/**
 * Build the narrator prompt for a triggered event.
 */
function buildEventPrompt(archetype, eventType, eventContext) {
    const toneDesc = getToneDescription();
    const voiceSummary = buildVoiceSummary();

    return [
        {
            role: 'system',
            content: `${archetype.persona}

CHAT TONE: ${toneDesc}
Express yourself through this tone. A gothic ${archetype.name.toLowerCase()} is different from a noir one.

CURRENT VOICES IN THE PSYCHE:
${voiceSummary}

You are responding to a specific event. Be brief — 1-3 sentences max. The framing narrator uses even fewer.
Do not describe the story scene. You exist in the meta-layer above the voices.
Do not use quotation marks around your response.`,
        },
        {
            role: 'user',
            content: `EVENT: ${eventType}\n\n${eventContext}\n\nRespond in character. Brief.`,
        },
    ];
}

/**
 * Build the narrator prompt for ambient/sidebar commentary.
 */
function buildAmbientPrompt(archetype, recentScene, voiceCommentary) {
    const toneDesc = getToneDescription();
    const voiceSummary = buildVoiceSummary();

    const commentaryBlock = voiceCommentary.length > 0
        ? `WHAT THE VOICES JUST SAID:\n${voiceCommentary.map(c => `${c.name}: "${c.text}"`).join('\n')}`
        : 'The voices are quiet right now.';

    return [
        {
            role: 'system',
            content: `${archetype.persona}

CHAT TONE: ${toneDesc}

CURRENT VOICES:
${voiceSummary}

${commentaryBlock}

RECENT SCENE (for context only — do NOT narrate the scene):
${recentScene.substring(0, 300)}

You may speak or stay silent. If you have nothing worth saying, respond with exactly: [SILENT]
When you speak, be brief — 1-2 sentences. You are not the main event.`,
        },
        {
            role: 'user',
            content: 'React to the current state of the inner world. Or stay silent.',
        },
    ];
}

// =============================================================================
// PUBLIC API — Event-Triggered Narration
// =============================================================================

/**
 * Generate narrator response for a voice birth.
 * @param {Object} newVoice - The newly born voice
 * @returns {string|null} Narrator text or null
 */
export async function narrateBirth(newVoice) {
    const archetype = getArchetype();
    if (!archetype.triggers.birth) return null;

    const arc = getArcana(newVoice.arcana);
    const context = `A new voice has been born: ${newVoice.name} (${arc.name}, ${newVoice.depth} depth).
Born from: ${newVoice.birthMoment}
Personality: ${newVoice.personality}
Resolution type: ${newVoice.resolution?.type || 'unknown'} (this is hidden from the character — you sense it but don't name it directly)`;

    try {
        const messages = buildEventPrompt(archetype, 'VOICE BIRTH', context);
        const response = await sendRequest(messages, 150);
        return cleanResponse(response);
    } catch (e) {
        console.error(`${LOG_PREFIX} Narrator birth failed:`, e);
        return null;
    }
}

/**
 * Generate narrator response for a voice death/resolution.
 * @param {Object} event - Lifecycle event { type, name, resolutionType, message }
 * @returns {string|null}
 */
export async function narrateDeath(event) {
    const archetype = getArchetype();
    if (!archetype.triggers.death) return null;

    const context = `A voice has ${event.resolutionType === 'transform' ? 'transformed' : 'gone silent'}: ${event.name}.
Resolution: ${event.resolutionType}
${event.message}
${event.newVoice ? `It became: ${event.newVoice.name}` : ''}`;

    try {
        const messages = buildEventPrompt(archetype, 'VOICE DEATH', context);
        const response = await sendRequest(messages, 150);
        return cleanResponse(response);
    } catch (e) {
        console.error(`${LOG_PREFIX} Narrator death failed:`, e);
        return null;
    }
}

/**
 * Generate narrator response for escalation change.
 * @param {string} oldLevel - Previous escalation
 * @param {string} newLevel - New escalation
 * @returns {string|null}
 */
export async function narrateEscalation(oldLevel, newLevel) {
    const archetype = getArchetype();
    if (!archetype.triggers.escalation) return null;

    // Only narrate significant escalation jumps
    const levels = ['calm', 'rising', 'elevated', 'crisis'];
    const oldIdx = levels.indexOf(oldLevel);
    const newIdx = levels.indexOf(newLevel);
    if (Math.abs(newIdx - oldIdx) < 2) return null; // Skip minor shifts

    const context = `Escalation shifted from ${oldLevel.toUpperCase()} to ${newLevel.toUpperCase()}.
The inner world is ${newIdx > oldIdx ? 'heating up' : 'cooling down'}.`;

    try {
        const messages = buildEventPrompt(archetype, 'ESCALATION SHIFT', context);
        const response = await sendRequest(messages, 100);
        return cleanResponse(response);
    } catch (e) {
        console.error(`${LOG_PREFIX} Narrator escalation failed:`, e);
        return null;
    }
}

/**
 * Generate narrator response for a hijack event.
 * @param {string} tier - 'intrusion' | 'struggle' | 'possession'
 * @param {Object} voice - The hijacking voice
 * @returns {string|null}
 */
export async function narrateHijack(tier, voice) {
    const archetype = getArchetype();
    if (!archetype.triggers.hijack) return null;

    const arc = getArcana(voice.arcana);
    const context = `${voice.name} (${arc.name}) is attempting to take control.
Hijack tier: ${tier}
Voice influence: ${voice.influence}/100
Relationship: ${voice.relationship}`;

    try {
        const messages = buildEventPrompt(archetype, `HIJACK — ${tier.toUpperCase()}`, context);
        const response = await sendRequest(messages, 150);
        return cleanResponse(response);
    } catch (e) {
        console.error(`${LOG_PREFIX} Narrator hijack failed:`, e);
        return null;
    }
}

// =============================================================================
// PUBLIC API — Ambient Narration
// =============================================================================

/**
 * Attempt ambient narrator commentary alongside voice sidebar.
 * Returns null most of the time — the narrator doesn't speak every message.
 *
 * @param {string} recentScene - Recent message text
 * @param {Object[]} voiceCommentary - What voices just said
 * @returns {string|null}
 */
export async function tryAmbientNarration(recentScene, voiceCommentary = []) {
    const archetype = getArchetype();

    // Roll for speaking
    if (Math.random() > archetype.speakChance) return null;

    // Extra checks per archetype
    if (archetype === NARRATOR_ARCHETYPES.stage_manager) {
        // Stage manager speaks more when voices are in conflict or silent
        const living = getLivingVoices();
        const longSilent = living.filter(v => (v.silentStreak || 0) > 8);
        const agitated = living.filter(v => v.state === 'agitated' || v.influence > 70);
        if (longSilent.length === 0 && agitated.length === 0 && voiceCommentary.length > 0) {
            // Nothing dramatic happening, skip
            if (Math.random() > 0.15) return null;
        }
    }

    if (archetype === NARRATOR_ARCHETYPES.conscience) {
        // Conscience speaks when things are tense or quiet
        if (voiceCommentary.length > 2) {
            // Too many voices talking, conscience stays quiet
            if (Math.random() > 0.1) return null;
        }
    }

    try {
        const messages = buildAmbientPrompt(archetype, recentScene, voiceCommentary);
        const response = await sendRequest(messages, 120);
        return cleanResponse(response);
    } catch (e) {
        console.error(`${LOG_PREFIX} Narrator ambient failed:`, e);
        return null;
    }
}

// =============================================================================
// UTILITY
// =============================================================================

function cleanResponse(text) {
    if (!text) return null;

    let cleaned = text.trim();

    // Check for silence
    if (cleaned === '[SILENT]' || cleaned.toLowerCase().includes('[silent]')) {
        return null;
    }

    // Strip quotation marks from around the whole response
    if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
        (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
        cleaned = cleaned.slice(1, -1).trim();
    }

    // Strip any stray voice format tags
    cleaned = cleaned.replace(/^\[.*?\]:\s*/, '');

    return cleaned.length > 0 ? cleaned : null;
}
