/**
 * THE CHORUS — Participation System
 * Determines which voices speak each message.
 *
 * Each living voice rolls for participation based on:
 *   - Base chattiness (1-5 personality trait)
 *   - Influence bonus (higher power = louder)
 *   - Relevance bonus (scene matches triggers)
 *   - Silence pressure (builds over time)
 *   - Recency penalty (spoke recently = quieter)
 *   - Relationship modifier (manic = loud, indifferent = quiet)
 *   - Wound sensitivity (avoidance/attraction to resolution themes)
 *   - Depth impact floor (core voices only speak when it matters)
 *   - Voice-to-voice dynamics (allies boost, enemies suppress)
 *
 * Cap at configurable max speakers. At least 1 always speaks.
 */

import { CHATTINESS_BASE, RELATIONSHIP_CHAT_MODIFIERS, LOG_PREFIX } from '../config.js';
import { getLivingVoices } from '../state.js';

// =============================================================================
// PARTICIPATION ROLL
// =============================================================================

/**
 * Roll for which voices speak this message.
 * @param {string[]} themes - Themes from classifier for this message
 * @param {number} maxSpeakers - Maximum voices that can speak (default 3)
 * @param {string} impact - Classifier impact level (none/minor/significant/critical)
 * @returns {Object[]} Array of voice objects that will speak, sorted by score
 */
export function rollForParticipation(themes = [], maxSpeakers = 3, impact = 'minor') {
    const living = getLivingVoices();
    if (living.length === 0) return [];

    const scored = living.map(voice => ({
        voice,
        score: calculateParticipationScore(voice, themes, impact, living),
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Determine who speaks: roll against score as probability
    const speakers = [];
    for (const { voice, score } of scored) {
        if (speakers.length >= maxSpeakers) break;

        // Clamp probability 0-0.95 (never guaranteed, never impossible for top scorer)
        const probability = Math.max(0.05, Math.min(0.95, score));

        if (Math.random() < probability) {
            speakers.push(voice);
        }
    }

    // Guarantee at least one speaker (highest scorer auto-wins)
    if (speakers.length === 0 && scored.length > 0) {
        speakers.push(scored[0].voice);
    }

    return speakers;
}

/**
 * Calculate participation score for a single voice.
 * Returns a float 0.0-1.0+ representing likelihood of speaking.
 */
function calculateParticipationScore(voice, themes, impact, allVoices) {
    let score = 0;

    // ── Depth-based impact floor ──
    // Core voices only speak when something significant happens.
    // They don't waste words on small talk.
    if (voice.depth === 'core' && (impact === 'none' || impact === 'minor')) {
        score -= 0.40; // Heavy penalty, but silence pressure can still override
    }

    // Base from chattiness (1-5 trait)
    const chattiness = Math.max(1, Math.min(5, voice.chattiness || 3));
    score += CHATTINESS_BASE[chattiness] || 0.40;

    // Influence bonus: influence / 200
    score += (voice.influence || 0) / 200;

    // Relevance bonus: theme matches
    score += calculateRelevanceBonus(voice, themes);

    // ── Wound sensitivity: resolution topic avoidance/attraction ──
    score += calculateWoundResponse(voice, themes);

    // Silence pressure: builds over time
    const silentStreak = voice.silentStreak || 0;
    score += silentStreak * 0.05;

    // Recency penalty
    score += calculateRecencyPenalty(voice);

    // Relationship modifier
    const relMod = RELATIONSHIP_CHAT_MODIFIERS[voice.relationship] || 0;
    score += relMod;

    // ── Voice-to-voice dynamics ──
    // If other voices have opinions about this voice, it affects participation
    score += calculateSocialPressure(voice, allVoices);

    // Small random variance for variety
    score += (Math.random() - 0.5) * 0.10;

    return score;
}

/**
 * Calculate relevance bonus from theme matching.
 * +0.30 per matching raise trigger
 */
function calculateRelevanceBonus(voice, themes) {
    if (!themes || themes.length === 0) return 0;
    if (!voice.influenceTriggers) return 0;

    let bonus = 0;
    const raises = voice.influenceTriggers.raises || [];

    for (const theme of themes) {
        if (raises.includes(theme)) {
            bonus += 0.30;
        }
    }

    // Cap relevance bonus
    return Math.min(0.60, bonus);
}

/**
 * Wound sensitivity — how a voice reacts when resolution-adjacent themes appear.
 *
 * Not all voices WANT to engage with their healing themes.
 * - Low resolution progress: AVOIDANT — the wound is too raw, they flinch away
 * - Mid resolution progress: AGITATED — they can't ignore it anymore, it's stirring
 * - High resolution progress: DRAWN — something is shifting, they sense the change
 * - Endure types: always drawn, they can never let go of their territory
 * - Fading voices near resolution: go quiet, let it pass
 */
function calculateWoundResponse(voice, themes) {
    if (!themes || themes.length === 0) return 0;
    if (!voice.resolution) return 0;

    const lowers = voice.influenceTriggers?.lowers || [];
    const resType = voice.resolution.type;
    const progress = voice.resolution.progress || 0;
    const threshold = voice.resolution.threshold;

    // Check if any scene themes match the voice's LOWER triggers (healing themes)
    const healingThemesPresent = themes.some(t => lowers.includes(t));
    if (!healingThemesPresent) return 0;

    // Endure voices: wound is permanent, they're always reactive to it
    if (resType === 'endure') return 0.10;

    // Fading voices near resolution: grow quiet — let the thought pass
    if (resType === 'fade' && threshold && progress / threshold > 0.6) {
        return -0.25;
    }

    // Calculate progress ratio (0 to 1)
    const ratio = threshold ? progress / threshold : 0;

    if (ratio < 0.3) {
        // Low progress: AVOIDANT — not ready to face this
        return -0.20;
    } else if (ratio < 0.6) {
        // Mid progress: AGITATED — it's stirring, can't ignore it
        return 0.15;
    } else {
        // High progress: DRAWN — something is changing
        return 0.25;
    }
}

/**
 * Social pressure from voice-to-voice opinions.
 * Allies boost participation, enemies suppress it.
 *
 * If Voice A has opinion "allied" or "respects" about this voice,
 * and Voice A spoke recently, this voice gets a small boost (encouraged).
 * If Voice A has opinion "hostile" or "distrusts" about this voice,
 * and Voice A spoke recently, this voice gets a penalty (suppressed).
 */
function calculateSocialPressure(voice, allVoices) {
    let pressure = 0;

    for (const other of allVoices) {
        if (other.id === voice.id) continue;
        if (!other.relationships) continue;

        const opinion = other.relationships[voice.id];
        if (!opinion) continue;

        // Only matters if the other voice is active (spoke recently)
        const otherActive = (other.silentStreak || 0) < 3;
        if (!otherActive) continue;

        const op = opinion.toLowerCase();
        if (op.includes('allied') || op.includes('respect') || op.includes('agree') || op.includes('protect')) {
            pressure += 0.08; // Allies encourage you to speak
        } else if (op.includes('hostile') || op.includes('distrust') || op.includes('hate') || op.includes('suppress')) {
            pressure -= 0.12; // Enemies try to shut you up
        } else if (op.includes('mock') || op.includes('dismiss') || op.includes('annoy')) {
            pressure -= 0.05; // Mild social friction
        }
    }

    // Cap social pressure
    return Math.max(-0.20, Math.min(0.15, pressure));
}

/**
 * Recency penalty — recently spoke = less likely to speak again.
 */
function calculateRecencyPenalty(voice) {
    if (!voice.lastSpoke) return 0;

    // Calculate messages since last spoke using silentStreak
    const streak = voice.silentStreak || 0;
    if (streak === 0) return -0.50;  // Spoke last message
    if (streak === 1) return -0.25;  // Spoke 2 messages ago
    return 0;
}

// =============================================================================
// VOICE SELECTION FOR SPREADS
// =============================================================================

/**
 * Select the single most opinionated voice about the current themes.
 * Used for single card pulls.
 */
export function selectMostOpinionated(themes = []) {
    const living = getLivingVoices();
    if (living.length === 0) return null;

    let best = null;
    let bestScore = -Infinity;

    for (const voice of living) {
        let score = 0;

        // Relevance to themes (primary factor)
        score += calculateRelevanceBonus(voice, themes) * 2;

        // Influence (secondary)
        score += (voice.influence || 0) / 100;

        // Chattiness bonus (opinionated voices are chattier)
        score += (voice.chattiness || 3) * 0.05;

        // Small random for ties
        score += Math.random() * 0.05;

        if (score > bestScore) {
            bestScore = score;
            best = voice;
        }
    }

    return best;
}

/**
 * Select voices for spread positions based on relevance + relationship gravity.
 * @param {string[]} themes - Classifier themes
 * @param {Object} positions - Position definitions from SPREAD_POSITIONS
 * @returns {Object} Map of positionKey → voice
 */
export function selectForSpread(themes = [], positions = {}) {
    const living = getLivingVoices();
    if (living.length === 0) return {};

    // Relationship → preferred positions gravity
    const GRAVITY = {
        devoted:     ['heart', 'advice', 'foundation'],
        protective:  ['advice', 'crossing'],
        warm:        ['heart', 'advice', 'outcome'],
        curious:     ['crown', 'outcome', 'situation'],
        indifferent: ['foundation'],
        resentful:   ['crossing', 'outcome'],
        hostile:     ['crossing', 'outcome'],
        obsessed:    ['heart', 'crossing'],
        grieving:    ['foundation', 'heart'],
        manic:       ['crown', 'outcome', 'situation'],
    };

    const positionKeys = Object.keys(positions);
    const assignments = {};
    const used = new Set(); // Track used voices (allow reuse for cross spreads)

    for (const posKey of positionKeys) {
        let best = null;
        let bestScore = -Infinity;

        for (const voice of living) {
            let score = 0;

            // Theme relevance
            score += calculateRelevanceBonus(voice, themes);

            // Influence
            score += (voice.influence || 0) / 200;

            // Gravity: does this voice's relationship prefer this position?
            const preferred = GRAVITY[voice.relationship] || [];
            if (preferred.includes(posKey)) {
                score += 0.30;
            }

            // Slight penalty for reuse (prefer variety, but allow it)
            if (used.has(voice.id)) {
                score -= 0.15;
            }

            // Random variance
            score += Math.random() * 0.10;

            if (score > bestScore) {
                bestScore = score;
                best = voice;
            }
        }

        if (best) {
            assignments[posKey] = best;
            used.add(best.id);
        }
    }

    return assignments;
}

// =============================================================================
// INFLUENCE UPDATES FROM THEMES
// =============================================================================

/**
 * Update all voice influences based on classified themes.
 * Voices gain influence when themes match their raise triggers.
 * Voices lose influence when themes match their lower triggers.
 * @param {string[]} themes - Themes from classifier
 * @param {number} gainRate - Points per matching theme
 * @returns {Object[]} Array of { voiceId, delta, reason } changes
 */
export function calculateInfluenceDeltas(themes = [], gainRate = 3) {
    const living = getLivingVoices();
    const deltas = [];

    for (const voice of living) {
        const triggers = voice.influenceTriggers || { raises: [], lowers: [] };
        let delta = 0;

        for (const theme of themes) {
            if (triggers.raises.includes(theme)) {
                delta += gainRate;
            }
            if (triggers.lowers.includes(theme)) {
                delta -= Math.ceil(gainRate / 2);
            }
        }

        if (delta !== 0) {
            deltas.push({
                voiceId: voice.id,
                name: voice.name,
                delta,
                reason: delta > 0 ? 'trigger match' : 'trigger conflict',
            });
        }
    }

    return deltas;
}
