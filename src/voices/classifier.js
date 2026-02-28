/**
 * THE CHORUS — Message Classifier
 * Cheap per-message API call that determines:
 *   - Impact level (none / minor / significant / critical)
 *   - Themes present (from fixed taxonomy)
 *   - One-sentence summary (if significant+)
 *
 * This single call drives everything downstream:
 *   spread type, influence shifts, birth checks, participation bonuses.
 */

import { getContext } from '../../../../../extensions.js';
import { ALL_THEMES, IMPACT_LEVELS, LOG_PREFIX, THEMES } from '../config.js';
import { extensionSettings } from '../state.js';
import {
    getResolutionAssessmentBlock,
    formatAssessmentPrompt,
} from './voice-lifecycle.js';

// =============================================================================
// CLASSIFIER PROMPT
// =============================================================================

function buildClassifierPrompt(messageText) {
    const themeList = [
        `EMOTIONAL: ${THEMES.emotional.join(', ')}`,
        `RELATIONAL: ${THEMES.relational.join(', ')}`,
        `PHYSICAL: ${THEMES.physical.join(', ')}`,
        `IDENTITY: ${THEMES.identity.join(', ')}`,
    ].join('\n');

    // Check for resolution candidates (appended to same call — cheap)
    const resolutionCandidates = getResolutionAssessmentBlock();
    const resolutionPrompt = formatAssessmentPrompt(resolutionCandidates);
    const resolutionJsonHint = resolutionCandidates
        ? ',\n  "resolution_progress": [{ "voiceId": "id", "progress": 0 }]'
        : '';

    return [
        {
            role: 'system',
            content: `You are a scene classifier for a narrative roleplay. Your job is to read the latest message and identify what emotionally, relationally, physically, or existentially significant things happened.

AVAILABLE THEMES (pick ONLY from this list):
${themeList}

IMPACT LEVELS:
- none: Nothing emotionally/physically significant happened. Small talk, movement, description.
- minor: A slight emotional beat. A hint of tension, a small kindness, mild discomfort.
- significant: A real emotional shift. Confession, confrontation, injury, intimacy, loss.
- critical: A defining moment. Betrayal revealed, near-death, identity collapse, euphoric breakthrough.

Respond ONLY with valid JSON. No other text.`,
        },
        {
            role: 'user',
            content: `Classify this message:

"""
${messageText}
"""

Return JSON:
{
  "impact": "none|minor|significant|critical",
  "themes": ["theme1", "theme2"],
  "summary": "One sentence describing what shifted (only if significant or critical, otherwise empty string)"${resolutionJsonHint}
}${resolutionPrompt}`,
        },
    ];
}

// =============================================================================
// RESPONSE PARSING
// =============================================================================

/**
 * Parse classifier response, with defensive fallbacks.
 */
function parseClassifierResponse(responseText) {
    const fallback = { impact: 'none', themes: [], summary: '', resolutionProgress: [] };

    if (!responseText || typeof responseText !== 'string') {
        return fallback;
    }

    try {
        // Extract JSON from response (handle markdown code blocks)
        let jsonStr = responseText.trim();
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1].trim();
        }

        // Try to find JSON object in response
        const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (braceMatch) {
            jsonStr = braceMatch[0];
        }

        const parsed = JSON.parse(jsonStr);

        // Validate impact
        const impact = IMPACT_LEVELS.includes(parsed.impact) ? parsed.impact : 'none';

        // Validate themes — only keep ones from our taxonomy
        const themes = Array.isArray(parsed.themes)
            ? parsed.themes.filter(t => ALL_THEMES.includes(t))
            : [];

        // Validate summary
        const summary = typeof parsed.summary === 'string' ? parsed.summary : '';

        // Parse resolution progress (optional)
        const resolutionProgress = Array.isArray(parsed.resolution_progress)
            ? parsed.resolution_progress
                .filter(r => r && r.voiceId && typeof r.progress === 'number')
                .map(r => ({
                    voiceId: r.voiceId,
                    progress: Math.max(0, Math.min(10, Math.round(r.progress))),
                }))
            : [];

        return { impact, themes, summary, resolutionProgress };
    } catch (e) {
        console.warn(`${LOG_PREFIX} Classifier parse failed:`, e.message);
        return fallback;
    }
}

// =============================================================================
// API CALL
// =============================================================================

/**
 * Classify a message via independent API call.
 * Returns { impact, themes[], summary }.
 */
export async function classifyMessage(messageText) {
    if (!messageText || messageText.trim().length < 10) {
        return { impact: 'none', themes: [], summary: '' };
    }

    const ctx = getContext();

    if (!ctx.ConnectionManagerRequestService) {
        console.warn(`${LOG_PREFIX} ConnectionManagerRequestService not available, skipping classification`);
        return { impact: 'none', themes: [], summary: '' };
    }

    try {
        // Resolve connection profile
        const profileId = getProfileId(ctx);
        if (!profileId) {
            console.warn(`${LOG_PREFIX} No connection profile available`);
            return { impact: 'none', themes: [], summary: '' };
        }

        const messages = buildClassifierPrompt(messageText);

        const response = await ctx.ConnectionManagerRequestService.sendRequest(
            profileId,
            messages,
            200, // Short response — just JSON
            {
                extractData: true,
                includePreset: false,
                includeInstruct: false,
            },
            {},
        );

        const result = parseClassifierResponse(response?.content || response);
        console.log(`${LOG_PREFIX} Classified: impact=${result.impact}, themes=[${result.themes.join(', ')}]`);
        return result;
    } catch (e) {
        console.error(`${LOG_PREFIX} Classifier call failed:`, e);
        return { impact: 'none', themes: [], summary: '' };
    }
}

// =============================================================================
// PROFILE RESOLUTION
// =============================================================================

function getProfileId(ctx) {
    const connectionManager = ctx.extensionSettings?.connectionManager;
    if (!connectionManager) return null;

    const profileName = extensionSettings.connectionProfile || 'current';

    if (profileName === 'current' || profileName === 'default') {
        return connectionManager.selectedProfile;
    }

    const profile = connectionManager.profiles?.find(p => p.name === profileName);
    return profile ? profile.id : connectionManager.selectedProfile;
}
