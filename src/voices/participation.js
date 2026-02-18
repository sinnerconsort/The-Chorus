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
 *
 * Cap at ~3 voices per message. At least 1 always speaks.
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
 * @returns {Object[]} Array of voice objects that will speak, sorted by score
 */
export function rollForParticipation(themes = [], maxSpeakers = 3) {
    const living = getLivingVoices();
    if (living.length === 0) return [];

    const scored = living.map(voice => ({
        voice,
        score: calculateParticipationScore(voice, themes),
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
function calculateParticipationScore(voice, themes) {
    let score = 0;

    // Base from chattiness (1-5 trait)
    const chattiness = Math.max(1, Math.min(5, voice.chattiness || 3));
    score += CHATTINESS_BASE[chattiness] || 0.40;

    // Influence bonus: influence / 200
    score += (voice.influence || 0) / 200;

    // Relevance bonus: theme matches
    score += calculateRelevanceBonus(voice, themes);

    // Silence pressure: builds over time
    const silentStreak = voice.silentStreak || 0;
    score += silentStreak * 0.05;

    // Recency penalty
    score += calculateRecencyPenalty(voice);

    // Relationship modifier
    const relMod = RELATIONSHIP_CHAT_MODIFIERS[voice.relationship] || 0;
    score += relMod;

    // Small random variance for variety
    score += (Math.random() - 0.5) * 0.10;

    return score;
}

/**
 * Calculate relevance bonus from theme matching.
 * +0.30 per matching raise trigger
 * +0.15 if obsession loosely matches (always applied for now — AI handles specificity)
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
