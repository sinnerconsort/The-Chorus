/**
 * THE CHORUS — Voice Lifecycle
 * Tracks resolution progress, triggers transformations, handles fading.
 *
 * Resolution is HIDDEN from the user. They can't see the condition or
 * progress bar. They only see the behavioral changes:
 *   - A fading voice gets quieter, more fragmented
 *   - A healing voice gets softer, less angry
 *   - A transforming voice gets unstable, contradicts itself
 *   - A confronting voice drops hints in directory conversations
 *
 * The classifier assesses resolution progress contextually each message.
 * No regex. No keyword matching. Just "does this feel like progress?"
 */

import { getContext } from '../../../../../extensions.js';
import {
    RESOLUTION_TYPES, VOICE_DEPTH, LOG_PREFIX, ALL_THEMES,
} from '../config.js';
import {
    extensionSettings,
    getLivingVoices,
    getVoiceById,
    updateVoice,
    resolveVoice,
    transformVoice,
    saveChatState,
} from '../state.js';
import { birthVoiceFromTransform } from './voice-birth.js';

// =============================================================================
// RESOLUTION PROGRESS UPDATE
// =============================================================================

/**
 * Process resolution progress for all living voices.
 * Called each message after classification.
 *
 * @param {Object} classification - { impact, themes[], summary }
 * @param {Object[]} resolutionAssessments - From classifier: [{ voiceId, progress }]
 * @returns {Object[]} Array of lifecycle events that occurred
 */
export function processLifecycle(classification, resolutionAssessments = []) {
    const events = [];
    const living = getLivingVoices();

    for (const voice of living) {
        if (!voice.resolution) continue;
        const resType = RESOLUTION_TYPES[voice.resolution.type];
        if (!resType) continue;

        // Skip endure — these don't resolve
        if (voice.resolution.type === 'endure') continue;

        let progressDelta = 0;

        // ── Fade: auto-progress when triggers absent, regress when present ──
        if (voice.resolution.type === 'fade') {
            const triggers = voice.influenceTriggers?.raises || [];
            const themesPresent = classification.themes.some(t => triggers.includes(t));

            if (themesPresent) {
                // Triggering themes appeared — voice regresses
                progressDelta = -(resType.regressPerTrigger || 8);
            } else {
                // No triggers — voice naturally fades
                progressDelta = resType.progressPerMessage || 3;
            }
        }

        // ── AI-assessed types: heal, transform, witness ──
        if (['heal', 'transform', 'witness'].includes(voice.resolution.type)) {
            const assessment = resolutionAssessments.find(a => a.voiceId === voice.id);
            if (assessment && assessment.progress > 0) {
                progressDelta = assessment.progress;
            }
        }

        // ── Confront: progress only from directory (handled in directory.js) ──
        // No automatic progress here

        // Apply progress
        if (progressDelta !== 0) {
            const oldProgress = voice.resolution.progress;
            voice.resolution.progress = Math.max(0, Math.min(100,
                oldProgress + progressDelta));

            if (progressDelta > 0 && voice.resolution.progress > oldProgress) {
                console.log(`${LOG_PREFIX} ${voice.name} resolution: ${oldProgress} → ${voice.resolution.progress}/${voice.resolution.threshold} (${voice.resolution.type})`);
            }
        }

        // ── Apply depth-specific natural decay to influence ──
        const depthDef = VOICE_DEPTH[voice.depth];
        if (depthDef?.naturalDecayRate > 0) {
            const newInf = Math.max(0, voice.influence - depthDef.naturalDecayRate);
            if (newInf !== voice.influence) {
                voice.influence = newInf;
            }
        }

        // ── Check behavioral state changes ──
        const stateEvent = updateBehavioralState(voice);
        if (stateEvent) events.push(stateEvent);

        // ── Check resolution threshold ──
        if (voice.resolution.threshold !== null &&
            voice.resolution.progress >= voice.resolution.threshold) {
            const resolveEvent = triggerResolution(voice);
            if (resolveEvent) events.push(resolveEvent);
        }

        // ── Surface voice influence death ──
        // Surface voices with 0 influence just fade away silently
        if (voice.depth === 'surface' && voice.influence <= 0 && voice.state !== 'dead') {
            resolveVoice(voice.id, 'influence depleted');
            events.push({
                type: 'fade_death',
                voiceId: voice.id,
                name: voice.name,
                message: `${voice.name} fell silent. The thought passed.`,
            });
        }
    }

    if (events.length > 0) {
        saveChatState();
    }

    return events;
}

// =============================================================================
// BEHAVIORAL STATE CHANGES
// =============================================================================

/**
 * Update a voice's visible behavior based on resolution progress.
 * The user can't see the progress number, but they can see the voice changing.
 */
function updateBehavioralState(voice) {
    if (!voice.resolution || voice.resolution.threshold === null) return null;

    const ratio = voice.resolution.progress / voice.resolution.threshold;

    switch (voice.resolution.type) {
        case 'fade':
            // Fading voices get quieter as they resolve
            if (ratio > 0.7 && voice.state !== 'fading') {
                updateVoice(voice.id, { state: 'fading' });
                return {
                    type: 'state_change',
                    voiceId: voice.id,
                    name: voice.name,
                    newState: 'fading',
                    message: `${voice.name} is growing distant...`,
                };
            }
            break;

        case 'transform':
            // Transforming voices get unstable
            if (ratio > 0.6 && voice.state !== 'transforming') {
                updateVoice(voice.id, { state: 'transforming' });
                return {
                    type: 'state_change',
                    voiceId: voice.id,
                    name: voice.name,
                    newState: 'transforming',
                    message: `${voice.name} is becoming something else...`,
                };
            }
            break;

        case 'heal':
        case 'witness':
            // Healing/witnessing voices soften
            if (ratio > 0.7 && voice.state !== 'resolving') {
                updateVoice(voice.id, { state: 'resolving' });
                return {
                    type: 'state_change',
                    voiceId: voice.id,
                    name: voice.name,
                    newState: 'resolving',
                    message: `Something is shifting in ${voice.name}...`,
                };
            }
            break;
    }

    return null;
}

// =============================================================================
// RESOLUTION TRIGGERS
// =============================================================================

/**
 * Trigger the actual resolution of a voice that hit its threshold.
 */
function triggerResolution(voice) {
    switch (voice.resolution.type) {
        case 'fade':
            resolveVoice(voice.id, 'faded');
            return {
                type: 'resolved',
                voiceId: voice.id,
                name: voice.name,
                resolutionType: 'fade',
                message: `${voice.name} went quiet. The thought passed.`,
                animation: 'fade', // UI hint for gentle dissolution
            };

        case 'heal':
            resolveVoice(voice.id, 'healed');
            return {
                type: 'resolved',
                voiceId: voice.id,
                name: voice.name,
                resolutionType: 'heal',
                message: `${voice.name} exhaled. Something loosened.`,
                animation: 'dissolve',
            };

        case 'witness':
            resolveVoice(voice.id, 'witnessed');
            return {
                type: 'resolved',
                voiceId: voice.id,
                name: voice.name,
                resolutionType: 'witness',
                message: `${voice.name} saw what it needed to see.`,
                animation: 'dissolve',
            };

        case 'confront':
            resolveVoice(voice.id, 'confronted');
            return {
                type: 'resolved',
                voiceId: voice.id,
                name: voice.name,
                resolutionType: 'confront',
                message: `${voice.name} was heard. It was enough.`,
                animation: 'dissolve',
            };

        case 'transform':
            // This one is special — kill old, birth new
            const transformData = transformVoice(voice.id);
            return {
                type: 'transforming',
                voiceId: voice.id,
                name: voice.name,
                resolutionType: 'transform',
                transformData,
                message: `${voice.name} is cracking apart. Something new is forming...`,
                animation: 'shatter',
            };

        default:
            return null;
    }
}

/**
 * Complete a transformation — called after the transform animation.
 * Births the new voice from the old one's ashes.
 * @param {Object} transformData - From triggerResolution's transforming event
 * @returns {Object|null} The new voice
 */
export async function completeTransformation(transformData) {
    if (!transformData) return null;

    try {
        const newVoice = await birthVoiceFromTransform(transformData);
        return newVoice;
    } catch (e) {
        console.error(`${LOG_PREFIX} Transformation completion failed:`, e);
        return null;
    }
}

// =============================================================================
// CLASSIFIER RESOLUTION ASSESSMENT
// =============================================================================

/**
 * Build the resolution assessment block for the classifier prompt.
 * This gets appended to the classifier call — same API call, tiny extra cost.
 *
 * Returns an array of voice conditions for the classifier to assess,
 * or null if no voices need assessment this message.
 */
export function getResolutionAssessmentBlock() {
    const living = getLivingVoices();
    const candidates = [];

    for (const voice of living) {
        if (!voice.resolution) continue;

        // Only assess types that need contextual judgment
        if (!['heal', 'transform', 'witness'].includes(voice.resolution.type)) continue;

        // Skip if already near resolution (avoid spam)
        if (voice.resolution.threshold !== null &&
            voice.resolution.progress >= voice.resolution.threshold) continue;

        candidates.push({
            voiceId: voice.id,
            name: voice.name,
            type: voice.resolution.type,
            condition: voice.resolution.condition,
            currentProgress: voice.resolution.progress,
            threshold: voice.resolution.threshold,
        });
    }

    if (candidates.length === 0) return null;

    return candidates;
}

/**
 * Format the assessment block into prompt text for the classifier.
 */
export function formatAssessmentPrompt(candidates) {
    if (!candidates || candidates.length === 0) return '';

    const lines = candidates.map(c =>
        `- "${c.name}" (${c.type}): "${c.condition}" [${c.currentProgress}/${c.threshold}]`,
    ).join('\n');

    return `

RESOLUTION ASSESSMENT:
These voices have hidden resolution conditions. Based on what just happened in the scene, rate how much progress each voice made toward resolution. Score 0 (no progress) to 10 (major breakthrough).

${lines}

Add to your JSON response:
"resolution_progress": [
    { "voiceId": "id", "progress": 0-10 }
]`;
}
