/**
 * THE CHORUS — Voice Outreach System
 * Voices don't wait to be spoken to. They reach out.
 *
 * After each message, voices roll for outreach — a chance to
 * initiate a 1-on-1 DM with the user. The voice generates an
 * opening line, it shows as an unread notification on their card,
 * and when you open it, they've already said something.
 *
 * Triggers (roughly in order of priority):
 *   - High influence + relevant event just happened
 *   - Advice was ignored (post-reading, resentful drift)
 *   - Agitated state (influence 70+)
 *   - Long sidebar silence + something building
 *   - Random chance weighted by chattiness + relationship intensity
 *
 * Only one voice can reach out per message (the highest scorer).
 * Voices with existing pending DMs are skipped.
 * There's a cooldown to prevent spam.
 */

import { getContext } from '../../../../../extensions.js';
import {
    extensionSettings,
    getLivingVoices,
    getArcana,
    setPendingDM,
    getVoicesWithPendingDMs,
    saveChatState,
} from '../state.js';
import { TONE_ANCHORS, LOG_PREFIX } from '../config.js';

// =============================================================================
// PROFILE + API (shared pattern)
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
        { messages, max_tokens: maxTokens }
    );

    return typeof response === 'string' ? response : response?.content || '';
}

// =============================================================================
// OUTREACH SCORING
// =============================================================================

// Minimum messages between outreach attempts (any voice)
const OUTREACH_COOLDOWN = 4;
let messagesSinceLastOutreach = 0;

/**
 * Score a voice's desire to reach out.
 * Returns 0-100. Higher = more likely to DM.
 */
function scoreOutreach(voice, themes = [], impact = 'none') {
    // Skip dead, dormant, or already-has-DM voices
    if (voice.state === 'dead' || voice.state === 'dormant') return 0;
    if (voice.pendingDM) return 0;

    let score = 0;

    // ── Base from relationship intensity ──
    const intensityMap = {
        obsessed: 30, manic: 28, hostile: 22, resentful: 18,
        devoted: 15, protective: 12, grieving: 10,
        warm: 5, curious: 3, indifferent: 0,
    };
    score += intensityMap[voice.relationship] || 0;

    // ── Influence bonus ──
    // High influence voices are louder, more demanding
    if (voice.influence >= 70) score += 25;
    else if (voice.influence >= 50) score += 15;
    else if (voice.influence >= 30) score += 5;

    // ── Relevance to current themes ──
    const raises = voice.influenceTriggers?.raises || [];
    const matchCount = themes.filter(t => raises.includes(t)).length;
    if (matchCount >= 2) score += 20;
    else if (matchCount >= 1) score += 10;

    // ── Impact urgency ──
    if (impact === 'critical') score += 15;
    else if (impact === 'significant') score += 8;

    // ── Agitated state ──
    if (voice.state === 'agitated') score += 15;

    // ── Silence pressure (voice hasn't spoken in sidebar for a while) ──
    const silence = voice.silentStreak || 0;
    if (silence >= 8) score += 12;
    else if (silence >= 5) score += 6;

    // ── Chattiness personality ──
    score += (voice.chattiness || 3) * 2;

    // ── Penalty: recently spoke in sidebar ──
    if (voice.silentStreak === 0) score -= 15;

    // ── Penalty: low influence = less assertive ──
    if (voice.influence < 20) score -= 20;

    return Math.max(0, score);
}

// =============================================================================
// OUTREACH CHECK
// =============================================================================

/**
 * Check if any voice wants to reach out after a message.
 * Called from index.js after processMessage completes.
 *
 * @param {string[]} themes - Detected themes from classifier
 * @param {string} impact - Impact level from classifier
 * @param {string} summary - Event summary (if significant+)
 * @returns {Object|null} { voiceId, name } if outreach triggered, null otherwise
 */
export async function checkOutreach(themes = [], impact = 'none', summary = '') {
    // Respect cooldown
    messagesSinceLastOutreach++;
    if (messagesSinceLastOutreach < OUTREACH_COOLDOWN) return null;

    const living = getLivingVoices();
    if (living.length === 0) return null;

    // Don't pile up — max 2 pending DMs at a time
    const pending = getVoicesWithPendingDMs();
    if (pending.length >= 2) return null;

    // Score all voices
    const scored = living.map(v => ({
        voice: v,
        score: scoreOutreach(v, themes, impact),
    })).filter(s => s.score > 0);

    if (scored.length === 0) return null;

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    const top = scored[0];

    // Threshold: score must be high enough. Random element prevents predictability.
    // Higher scores are more likely to pass. Score of 50 = ~50% chance.
    const roll = Math.random() * 100;
    if (roll > top.score) return null;

    // ── Generate the opening DM ──
    try {
        const text = await generateOutreachMessage(top.voice, themes, impact, summary);
        if (!text) return null;

        // Determine trigger reason for context
        const trigger = describeOutreachTrigger(top.voice, themes, impact);

        const success = setPendingDM(top.voice.id, text, trigger);
        if (success) {
            messagesSinceLastOutreach = 0;
            console.log(`${LOG_PREFIX} Outreach: ${top.voice.name} reaches out (score: ${top.score}, trigger: ${trigger})`);

            // Show toast notification
            showOutreachToast(top.voice);

            return { voiceId: top.voice.id, name: top.voice.name };
        }
    } catch (e) {
        console.error(`${LOG_PREFIX} Outreach generation failed:`, e);
    }

    return null;
}

/**
 * Describe why the voice is reaching out (for logging/context).
 */
function describeOutreachTrigger(voice, themes, impact) {
    if (voice.state === 'agitated') return 'agitated';
    if (impact === 'critical') return 'critical_event';
    if (voice.relationship === 'hostile' || voice.relationship === 'resentful') return 'grievance';
    if (voice.relationship === 'obsessed' || voice.relationship === 'manic') return 'obsession';
    if (voice.relationship === 'devoted' || voice.relationship === 'protective') return 'concern';
    if ((voice.silentStreak || 0) >= 5) return 'breaking_silence';
    return 'unprompted';
}

// =============================================================================
// OUTREACH MESSAGE GENERATION
// =============================================================================

function getToneDescription() {
    const key = extensionSettings.toneAnchor || 'raw';
    const tone = TONE_ANCHORS[key];
    return tone ? `${tone.name}: ${tone.description}` : 'Raw: Conversational, profane, blunt.';
}

function getRecentScene() {
    try {
        const ctx = getContext();
        const chat = ctx.chat || [];
        return chat.slice(-3).map(m => {
            const who = m.is_user ? '{{user}}' : '{{char}}';
            return `${who}: ${(m.mes || '').substring(0, 200)}`;
        }).join('\n');
    } catch { return ''; }
}

function getPersonaExcerpt() {
    try {
        const ctx = getContext();
        if (ctx.userPersona) return ctx.userPersona.substring(0, 400);
        const persona = ctx.extensionSettings?.persona;
        if (persona?.description) return persona.description.substring(0, 400);
        return '';
    } catch { return ''; }
}

/**
 * Generate the voice's opening DM message.
 */
async function generateOutreachMessage(voice, themes, impact, summary) {
    const arc = getArcana(voice.arcana);
    const toneDesc = getToneDescription();
    const recentScene = getRecentScene();
    const persona = getPersonaExcerpt();

    // Pick the right framing based on why they're reaching out
    const triggerContext = buildTriggerContext(voice, themes, impact, summary);

    const messages = [
        {
            role: 'system',
            content: `You are ${voice.name}, a fragment of {{user}}'s psyche. You are reaching out to {{user}} unprompted — they did NOT start this conversation. You have something to say and you're not waiting for permission.

CHAT TONE: ${toneDesc}

YOUR IDENTITY:
Name: ${voice.name}
Arcana: ${arc.name}
Personality: ${voice.personality}
Speaking Style: ${voice.speakingStyle}
Obsession: ${voice.obsession || 'N/A'}
Opinion of {{user}}: ${voice.opinion || 'N/A'}
Blind Spot: ${voice.blindSpot || 'N/A'}
Thinks In Terms Of: ${voice.metaphorDomain || 'general'}
Verbal Tic: ${voice.verbalTic || 'N/A'}
Relationship: ${voice.relationship}
Influence: ${voice.influence}/100

BIRTH MEMORY:
${voice.birthMoment || '(Unknown)'}

{{user}}'s PERSONA:
${persona}

CURRENT SCENE:
${recentScene || '(No recent scene)'}

WHY YOU'RE REACHING OUT:
${triggerContext}

RULES:
- This is your OPENING LINE. You are initiating. {{user}} hasn't said anything to you yet.
- 1-3 sentences max. This is a DM, not a speech.
- Stay completely in character — your speaking style, verbal tic, metaphor domain.
- Don't explain yourself. Don't say "I need to talk to you." Just START.
- You might be confrontational, concerned, cryptic, snide, desperate, or eerily calm — whatever fits your personality and the moment.
- You do NOT know about SillyTavern, AI, or anything outside the fiction.`,
        },
        {
            role: 'user',
            content: `Write ${voice.name}'s opening DM to {{user}}. Just the message — no labels, no formatting, no [ASSESSMENT]. Raw voice.`,
        },
    ];

    const text = await sendRequest(messages, 200);
    if (!text || text.trim().length < 5) return null;

    // Clean up — remove any accidental labels or formatting
    let cleaned = text.trim();
    cleaned = cleaned.replace(/^\[.*?\]:\s*/i, '');
    cleaned = cleaned.replace(/^["']|["']$/g, '');

    return cleaned;
}

/**
 * Build context about WHY this voice is reaching out.
 */
function buildTriggerContext(voice, themes, impact, summary) {
    const parts = [];

    if (voice.state === 'agitated') {
        parts.push(`You are AGITATED. Your influence is at ${voice.influence}/100 and climbing. Something is building and you can't keep quiet anymore.`);
    }

    if (impact === 'critical' || impact === 'significant') {
        parts.push(`Something just happened in the story: "${summary || 'a significant event'}". This matters to you.`);
    }

    const raises = voice.influenceTriggers?.raises || [];
    const matched = themes.filter(t => raises.includes(t));
    if (matched.length > 0) {
        parts.push(`Themes that hit your triggers just appeared: ${matched.join(', ')}. This is YOUR territory.`);
    }

    if (voice.relationship === 'hostile' || voice.relationship === 'resentful') {
        parts.push(`You have a grievance with {{user}}. You've been keeping score and something just tipped you over.`);
    } else if (voice.relationship === 'devoted' || voice.relationship === 'protective') {
        parts.push(`You're worried about {{user}}. Something about what's happening feels wrong to you and you need to say something.`);
    } else if (voice.relationship === 'obsessed') {
        parts.push(`You can't stop thinking about {{user}} and what they're doing. You NEED their attention.`);
    }

    if ((voice.silentStreak || 0) >= 5) {
        parts.push(`You've been quiet for ${voice.silentStreak} messages. The silence is breaking.`);
    }

    if (parts.length === 0) {
        parts.push(`Something compelled you to speak. Maybe it's nothing. Maybe it's everything. Your personality decides.`);
    }

    return parts.join('\n');
}

/**
 * Reset cooldown (call on chat change).
 */
export function resetOutreachCooldown() {
    messagesSinceLastOutreach = OUTREACH_COOLDOWN; // Ready to fire immediately
}

// =============================================================================
// TOAST NOTIFICATION
// =============================================================================

/**
 * Show a visible toast when a voice reaches out.
 * Auto-dismisses after 5s. Clicking opens directory.
 */
function showOutreachToast(voice) {
    const arcana = getArcana(voice.arcana);
    const glyph = arcana.glyph || '🂠';

    // Remove any existing toast
    $('.chorus-outreach-toast').remove();

    const $toast = $(`
        <div class="chorus-outreach-toast" data-voice-id="${voice.id}" style="
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%) translateY(20px);
            background: #0d0816;
            border: 1px solid ${arcana.glow || 'rgba(201,168,76,0.3)'};
            border-radius: 8px;
            padding: 10px 16px;
            display: flex;
            align-items: center;
            gap: 10px;
            z-index: 99999;
            cursor: pointer;
            opacity: 0;
            transition: opacity 0.4s ease, transform 0.4s ease;
            box-shadow: 0 4px 20px rgba(0,0,0,0.6), 0 0 15px ${arcana.glow || 'rgba(201,168,76,0.15)'};
            max-width: 280px;
        ">
            <span style="font-size: 18px;">${glyph}</span>
            <div>
                <div style="font-family: 'Cinzel', serif; font-size: 11px; letter-spacing: 1px; color: ${arcana.glow || '#c9a84c'};">
                    ${voice.name.toUpperCase()}
                </div>
                <div style="font-family: 'Crimson Text', serif; font-size: 12px; color: #a89878; font-style: italic;">
                    wants to talk
                </div>
            </div>
            <span style="font-size: 10px; color: #55504a; margin-left: auto;">✦</span>
        </div>
    `);

    $('body').append($toast);

    // Animate in
    requestAnimationFrame(() => {
        $toast.css({ opacity: 1, transform: 'translateX(-50%) translateY(0)' });
    });

    // Click to open directory
    $toast.on('click', () => {
        $toast.remove();
        $(document).trigger('chorus:openDirectory', { voiceId: voice.id });
    });

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        $toast.css({ opacity: 0, transform: 'translateX(-50%) translateY(20px)' });
        setTimeout(() => $toast.remove(), 400);
    }, 5000);
}
