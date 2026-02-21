/**
 * THE CHORUS — Council (Group Voice Chat)
 *
 * The 3am insomnia channel. All voices in one room arguing amongst
 * themselves. The user can participate or just watch.
 *
 * This is NOT scene-reactive like sidebar commentary. It's a
 * self-sustaining conversation loop — voices respond to EACH OTHER,
 * form opinions, spiral, give unsolicited advice, and notice when
 * you're ignoring them.
 *
 * Architecture:
 *   - Open council tab → initial burst (2-3 voices react)
 *   - Auto-continue on interval (8-15s) generates 1-3 messages
 *   - Voices respond to each other, not just scene
 *   - User types → all voices get fresh reaction, timer resets
 *   - Idle awareness: voices notice extended silence
 *   - Voice-to-voice relationships emerge from hidden dynamics
 *   - Only generates when council tab is active
 *
 * Context scope:
 *   - All voices' full personas
 *   - User's persona
 *   - Recent scene context (last 3 messages from main chat)
 *   - Council's own conversation history (last 20-30 messages)
 */

import { getContext } from '../../../../../extensions.js';
import {
    TONE_ANCHORS, LOG_PREFIX,
} from '../config.js';
import {
    extensionSettings,
    getLivingVoices,
    getVoiceById,
    getArcana,
    getCouncilHistory,
    addCouncilMessages,
    clearCouncilHistory,
    updateVoiceRelationships,
    updateVoice,
    adjustInfluence,
    saveChatState,
} from '../state.js';

// =============================================================================
// STATE
// =============================================================================

let isActive = false;          // Council tab is visible
let isGenerating = false;      // Currently making an API call
let autoTimer = null;          // setInterval reference
let silentTurns = 0;           // Turns since user last spoke
let totalTurns = 0;            // Total auto-generated turns this session
let hasHadInitialBurst = false; // Whether we've done the opening burst

// =============================================================================
// CONNECTION (same pattern as directory/outreach)
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

async function sendRequest(messages, maxTokens = 800) {
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
// CONTEXT BUILDERS
// =============================================================================

function getToneDescription() {
    const key = extensionSettings.toneAnchor || 'raw';
    const tone = TONE_ANCHORS[key];
    return tone ? `${tone.name}: ${tone.description}` : 'Raw: Conversational, profane, blunt.';
}

function getPersonaExcerpt() {
    try {
        const ctx = getContext();
        if (ctx.userPersona) return ctx.userPersona.substring(0, 500);
        const persona = ctx.extensionSettings?.persona;
        if (persona?.description) return persona.description.substring(0, 500);
        return '';
    } catch { return ''; }
}

function getRecentScene() {
    try {
        const ctx = getContext();
        const chat = ctx.chat || [];
        return chat.slice(-3).map(m => {
            const who = m.is_user ? '{{user}}' : '{{char}}';
            return `${who}: ${(m.mes || '').substring(0, 250)}`;
        }).join('\n');
    } catch { return ''; }
}

/**
 * Build the voice roster block for the system prompt.
 */
function buildVoiceRoster(voices) {
    return voices.map(v => {
        const arc = getArcana(v.arcana);
        const voiceRelationships = v.relationships || {};
        const relLines = Object.entries(voiceRelationships)
            .map(([otherId, opinion]) => {
                const other = getVoiceById(otherId);
                return other ? `  → ${other.name}: ${opinion}` : null;
            })
            .filter(Boolean)
            .join('\n');

        return `---
VOICE: ${v.name} (${arc.name})
Personality: ${v.personality}
Speaking Style: ${v.speakingStyle}
Obsession: ${v.obsession || 'N/A'}
Opinion of {{user}}: ${v.opinion || 'N/A'}
Blind Spot: ${v.blindSpot || 'N/A'}
Thinks In Terms Of: ${v.metaphorDomain || 'general'}
Verbal Tic: ${v.verbalTic || 'N/A'}
Relationship with {{user}}: ${v.relationship} | Influence: ${v.influence}/100
Self-Awareness: ${v.selfAwareness || 'N/A'}
${relLines ? `Opinions of other voices:\n${relLines}` : ''}`;
    }).join('\n');
}

/**
 * Build the recent council history for the prompt.
 */
function buildHistoryBlock() {
    const history = getCouncilHistory();
    if (history.length === 0) return '(No prior council conversation)';

    // Last 25 messages for context
    const recent = history.slice(-25);
    return recent.map(m => {
        if (m.role === 'user') {
            return `{{user}}: ${m.content}`;
        }
        return `${m.name}: ${m.content}`;
    }).join('\n');
}

// =============================================================================
// GENERATION
// =============================================================================

/**
 * Generate council messages. Returns parsed array of voice messages
 * plus optional dynamics.
 */
async function generateCouncilMessages(userMessage = null) {
    const voices = getLivingVoices();
    if (voices.length === 0) return null;

    const toneDesc = getToneDescription();
    const persona = getPersonaExcerpt();
    const scene = getRecentScene();
    const roster = buildVoiceRoster(voices);
    const historyBlock = buildHistoryBlock();

    // Idle awareness context
    let idleContext = '';
    if (silentTurns >= 8) {
        idleContext = `\n\nIDLE AWARENESS: {{user}} has been watching in silence for ${silentTurns} turns. The voices have noticed. Some are annoyed. Some are performing. Some want {{user}} to speak. Some prefer they don't.`;
    } else if (silentTurns >= 4) {
        idleContext = `\n\nIDLE AWARENESS: {{user}} has been quiet for a while. Some voices are starting to notice.`;
    }

    // How many voices should speak
    const voiceCount = voices.length;
    const speakerCount = userMessage
        ? Math.min(voiceCount, 3)   // User spoke — more react
        : Math.min(voiceCount, Math.random() < 0.4 ? 1 : 2); // Auto — 1-2

    const messages = [
        {
            role: 'system',
            content: `You are generating the internal voices of {{user}}'s psyche in a group conversation. These voices are fragments — born from extreme moments, carrying grudges, obsessions, and blind spots. They exist inside {{user}}'s head, inside the fiction.

This is THE COUNCIL — a freeform group conversation where all voices can argue, agree, spiral, give unsolicited advice, mock each other, form alliances, or ignore each other entirely. This is the 3am insomnia channel. Intrusive thoughts having a meeting.

CHAT TONE: ${toneDesc}

{{user}}'s PERSONA:
${persona}

RECENT SCENE (from main story — for context, not the focus):
${scene || '(No recent scene)'}

VOICES PRESENT:
${roster}

COUNCIL CONVERSATION SO FAR:
${historyBlock}
${idleContext}

RULES:
- Generate ${speakerCount} voice${speakerCount > 1 ? 's' : ''} speaking. Pick whoever has the most to say RIGHT NOW based on the conversation momentum.
- Voices respond to EACH OTHER, not just the scene. The conversation has its own momentum.
- Voices can argue, mock, agree reluctantly, go silent, spiral into their obsession, give unsolicited advice, or make snide observations.
- Stay in each voice's character: speaking style, verbal tic, metaphor domain, blind spot.
- If a voice has nothing to add: don't force it. Only generate voices that WANT to speak.
- Keep each voice's response to 1-3 sentences. This is a chat, not speeches.
- Voices do NOT know about SillyTavern, AI, or anything outside the fiction.
- Do NOT repeat what was just said. Push the conversation forward.
${userMessage ? '- {{user}} just spoke directly to the council. Voices should react to what they said.' : '- This is an auto-continuation. The conversation keeps going on its own.'}

FORMAT:
[VOICE_NAME]: their message

After all voice messages, on a NEW line, output voice-to-voice dynamics:
[COUNCIL_DYNAMICS]
voice_name → other_voice_name: brief_opinion_shift (e.g. "hostile — mocked their advice", "allied — backed them up", "dismissive — ignored them", "curious — intrigued by their point", "protective — defended them")

Only include dynamics that actually changed this turn. If nothing shifted, write: [COUNCIL_DYNAMICS] none

After dynamics, if any voice had a genuine moment of self-awareness, breakthrough, or realization during this exchange (NOT forced — only if it genuinely happened):
[COUNCIL_INSIGHTS]
voice_name: brief description of what shifted (e.g. "acknowledged its blind spot for the first time", "admitted it might be wrong about trust", "realized it was projecting", "let go of something small")

Only include insights that are REAL and EARNED. Most turns have none. Write: [COUNCIL_INSIGHTS] none if nothing meaningful shifted. False breakthroughs are worse than silence.`,
        },
        {
            role: 'user',
            content: userMessage
                ? `{{user}} speaks to the council: "${userMessage}"\n\nGenerate voice reactions.`
                : `The conversation continues. Generate the next ${speakerCount} voice${speakerCount > 1 ? 's' : ''} speaking.`,
        },
    ];

    const response = await sendRequest(messages, 600);
    if (!response) return null;

    return parseCouncilResponse(response, voices);
}

/**
 * Parse the AI response into structured messages + dynamics + insights.
 */
function parseCouncilResponse(raw, voices) {
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    const voiceMessages = [];
    let dynamicsRaw = '';
    let insightsRaw = '';
    let section = 'messages'; // messages | dynamics | insights

    for (const line of lines) {
        if (line.startsWith('[COUNCIL_DYNAMICS]')) {
            section = 'dynamics';
            dynamicsRaw = line.replace('[COUNCIL_DYNAMICS]', '').trim();
            continue;
        }
        if (line.startsWith('[COUNCIL_INSIGHTS]')) {
            section = 'insights';
            insightsRaw = line.replace('[COUNCIL_INSIGHTS]', '').trim();
            continue;
        }

        if (section === 'dynamics') {
            dynamicsRaw += ' ' + line;
            continue;
        }
        if (section === 'insights') {
            insightsRaw += ' ' + line;
            continue;
        }

        // Try to match [VOICE_NAME]: message
        const match = line.match(/^\[?([^\]:\[]+?)\]?\s*:\s*(.+)$/);
        if (match) {
            const rawName = match[1].trim();
            const text = match[2].trim();

            // Find matching voice
            const voice = voices.find(v =>
                v.name.toLowerCase() === rawName.toLowerCase() ||
                v.name.toLowerCase().replace(/^the\s+/, '') === rawName.toLowerCase().replace(/^the\s+/, '')
            );

            if (voice && text.length > 0) {
                voiceMessages.push({
                    voiceId: voice.id,
                    name: voice.name,
                    arcana: voice.arcana,
                    relationship: voice.relationship,
                    content: text,
                });
            }
        }
    }

    // Parse dynamics
    const dynamics = parseDynamics(dynamicsRaw, voices);

    // Parse insights
    const insights = parseInsights(insightsRaw, voices);

    return { messages: voiceMessages, dynamics, insights };
}

/**
 * Parse [COUNCIL_DYNAMICS] block into relationship updates.
 */
function parseDynamics(raw, voices) {
    if (!raw || raw === 'none') return [];

    const updates = [];
    // Match patterns like: voice_name → other_voice: opinion
    const segments = raw.split(/[,;]/);

    for (const seg of segments) {
        const match = seg.match(/(.+?)\s*(?:→|->)+\s*(.+?):\s*(.+)/);
        if (!match) continue;

        const fromName = match[1].trim();
        const toName = match[2].trim();
        const opinion = match[3].trim();

        const fromVoice = voices.find(v =>
            v.name.toLowerCase().includes(fromName.toLowerCase()) ||
            fromName.toLowerCase().includes(v.name.toLowerCase().replace(/^the\s+/, ''))
        );
        const toVoice = voices.find(v =>
            v.name.toLowerCase().includes(toName.toLowerCase()) ||
            toName.toLowerCase().includes(v.name.toLowerCase().replace(/^the\s+/, ''))
        );

        if (fromVoice && toVoice && fromVoice.id !== toVoice.id) {
            updates.push({
                fromId: fromVoice.id,
                toId: toVoice.id,
                toName: toVoice.name,
                opinion: opinion.substring(0, 60),
            });
        }
    }

    return updates;
}

/**
 * Parse [COUNCIL_INSIGHTS] block into resolution progress events.
 * Format: voice_name: description of what shifted
 */
function parseInsights(raw, voices) {
    if (!raw || raw === 'none' || raw.trim() === '') return [];

    const insights = [];
    // Match "voice_name: insight description"
    const segments = raw.split(/[;]|\n/).map(s => s.trim()).filter(Boolean);

    for (const seg of segments) {
        const match = seg.match(/(.+?):\s*(.+)/);
        if (!match) continue;

        const voiceName = match[1].trim();
        const insight = match[2].trim();

        const voice = voices.find(v =>
            v.name.toLowerCase().includes(voiceName.toLowerCase()) ||
            voiceName.toLowerCase().includes(v.name.toLowerCase().replace(/^the\s+/, ''))
        );

        if (voice && insight.length > 5) {
            insights.push({
                voiceId: voice.id,
                name: voice.name,
                insight: insight.substring(0, 120),
            });
        }
    }

    return insights;
}

// =============================================================================
// COUNCIL TURN PROCESSING
// =============================================================================

/**
 * Process a council turn — generate, store, render, update relationships + resolution.
 */
async function processCouncilTurn(userMessage = null) {
    if (isGenerating || !isActive) return;
    isGenerating = true;

    showThinking();

    try {
        const result = await generateCouncilMessages(userMessage);
        if (!result || result.messages.length === 0) {
            isGenerating = false;
            hideThinking();
            return;
        }

        // Store messages in history
        const historyEntries = result.messages.map(m => ({
            role: 'voice',
            voiceId: m.voiceId,
            name: m.name,
            content: m.content,
            timestamp: Date.now(),
        }));
        addCouncilMessages(historyEntries);

        // Render each message with stagger
        for (let i = 0; i < result.messages.length; i++) {
            if (i > 0) await sleep(400 + Math.random() * 300);
            hideThinking();
            renderCouncilMessage(result.messages[i]);
            updatePipSpeaking(result.messages[i].voiceId);
            if (i < result.messages.length - 1) showThinking();
        }

        // Apply dynamics (voice-to-voice relationships)
        if (result.dynamics && result.dynamics.length > 0) {
            for (const d of result.dynamics) {
                updateVoiceRelationships(d.fromId, { [d.toId]: d.opinion });
            }
            console.log(`${LOG_PREFIX} Council dynamics:`, result.dynamics.map(d => `${d.fromId} → ${d.toName}: ${d.opinion}`));
        }

        // Apply insights (resolution progress from council breakthroughs)
        if (result.insights && result.insights.length > 0) {
            for (const ins of result.insights) {
                const voice = getVoiceById(ins.voiceId);
                if (!voice || !voice.resolution) continue;

                // Only heal, witness, confront, and transform can progress from council
                const progressable = ['heal', 'witness', 'confront', 'transform'];
                if (!progressable.includes(voice.resolution.type)) continue;

                // Council insights give moderate progress (less than directory, more than passive)
                const progress = 5 + Math.floor(Math.random() * 5); // 5-10 points
                const oldProgress = voice.resolution.progress || 0;
                const newProgress = Math.min(100, oldProgress + progress);

                updateVoice(ins.voiceId, {
                    resolution: { ...voice.resolution, progress: newProgress },
                });

                console.log(`${LOG_PREFIX} Council insight: ${voice.name} resolution ${oldProgress} → ${newProgress} ("${ins.insight}")`);
            }
        }

        // Track turns
        if (!userMessage) {
            silentTurns++;
        }
        totalTurns++;

    } catch (e) {
        console.error(`${LOG_PREFIX} Council generation failed:`, e);
    }

    hideThinking();
    isGenerating = false;
}

// =============================================================================
// AUTO-CONTINUE TIMER
// =============================================================================

/**
 * Start the auto-continue loop. Generates on interval with jitter.
 * Speed and auto-continue controlled by settings.
 */
function startAutoTimer() {
    stopAutoTimer();

    // Check if auto-continue is enabled
    if (extensionSettings.councilAutoContinue === false) {
        console.log(`${LOG_PREFIX} Council auto-continue disabled`);
        return;
    }

    const tick = () => {
        if (!isActive || isGenerating) return;
        // Re-check setting each tick (user might toggle mid-session)
        if (extensionSettings.councilAutoContinue === false) return;

        processCouncilTurn();

        // Speed-based intervals:
        //   fast:   5-8s
        //   normal: 8-15s
        //   slow:   15-25s
        const speed = extensionSettings.councilSpeed || 'normal';
        let baseInterval, jitterRange;
        switch (speed) {
            case 'fast':
                baseInterval = 6500;
                jitterRange = 3000;
                break;
            case 'slow':
                baseInterval = 20000;
                jitterRange = 10000;
                break;
            default: // normal
                baseInterval = 10000;
                jitterRange = 7000;
                break;
        }

        const jitter = (Math.random() - 0.5) * jitterRange;
        const next = Math.max(4000, baseInterval + jitter);

        autoTimer = setTimeout(tick, next);
    };

    // First auto-tick after a delay
    const initialDelay = hasHadInitialBurst ? (8000 + Math.random() * 4000) : 2000;
    autoTimer = setTimeout(tick, initialDelay);
}

function stopAutoTimer() {
    if (autoTimer) {
        clearTimeout(autoTimer);
        autoTimer = null;
    }
}

// =============================================================================
// TAB LIFECYCLE
// =============================================================================

/**
 * Called when council tab becomes visible.
 */
export function activateCouncil() {
    if (isActive) return;
    isActive = true;

    const voices = getLivingVoices();
    if (voices.length === 0) {
        renderEmpty('No voices yet. Voices will appear as the story unfolds.');
        return;
    }

    // Render pips
    renderPips(voices);

    // Load existing history
    const history = getCouncilHistory();
    if (history.length > 0) {
        renderFullHistory(history);
    }

    // Initial burst if this is first activation this session
    if (!hasHadInitialBurst) {
        hasHadInitialBurst = true;
        silentTurns = 0;
        totalTurns = 0;
        processCouncilTurn();
    }

    // Start auto-continue
    startAutoTimer();

    console.log(`${LOG_PREFIX} Council activated (${voices.length} voices, ${history.length} history messages)`);
}

/**
 * Called when council tab is hidden.
 */
export function deactivateCouncil() {
    if (!isActive) return;
    isActive = false;
    stopAutoTimer();
    console.log(`${LOG_PREFIX} Council deactivated`);
}

/**
 * Full reset on chat change.
 */
export function resetCouncil() {
    deactivateCouncil();
    hasHadInitialBurst = false;
    silentTurns = 0;
    totalTurns = 0;
    clearCouncilFeed();
}

// =============================================================================
// USER INPUT
// =============================================================================

/**
 * Handle user sending a message to the council.
 */
export async function sendCouncilMessage(text) {
    if (!text || !text.trim()) return;

    const cleaned = text.trim();

    // Store in history
    addCouncilMessages([{
        role: 'user',
        content: cleaned,
        timestamp: Date.now(),
    }]);

    // Render user message
    renderUserMessage(cleaned);

    // Reset idle
    silentTurns = 0;

    // Restart timer (voices react, then auto-continue resumes)
    stopAutoTimer();

    // Generate voice reactions
    await processCouncilTurn(cleaned);

    // Resume auto-continue
    startAutoTimer();
}

// =============================================================================
// UI RENDERING
// =============================================================================

function renderCouncilMessage(msg) {
    const $feed = $('#chorus-council-messages');
    const arc = getArcana(msg.arcana);

    $feed.find('.chorus-council-empty').remove();

    $feed.append(`
        <div class="chorus-council-msg" data-voice-id="${msg.voiceId}">
            <div class="chorus-council-msg__header">
                <span class="chorus-council-msg__glyph" style="color:${arc.glow}">${arc.glyph}</span>
                <span class="chorus-council-msg__name" style="color:${arc.glow}">${msg.name}</span>
                <span class="chorus-council-msg__rel">${msg.relationship || ''}</span>
            </div>
            <div class="chorus-council-msg__text">${escapeHtml(msg.content)}</div>
        </div>
    `);

    scrollFeed();
    trimFeed();
}

function renderUserMessage(text) {
    const $feed = $('#chorus-council-messages');
    $feed.find('.chorus-council-empty').remove();

    $feed.append(`
        <div class="chorus-council-msg chorus-council-msg--user">
            <div class="chorus-council-msg__header">
                <span class="chorus-council-msg__name chorus-council-msg__name--user">YOU</span>
            </div>
            <div class="chorus-council-msg__text">${escapeHtml(text)}</div>
        </div>
    `);

    scrollFeed();
}

function renderFullHistory(history) {
    const $feed = $('#chorus-council-messages');
    $feed.empty();

    for (const entry of history) {
        if (entry.role === 'user') {
            $feed.append(`
                <div class="chorus-council-msg chorus-council-msg--user">
                    <div class="chorus-council-msg__header">
                        <span class="chorus-council-msg__name chorus-council-msg__name--user">YOU</span>
                    </div>
                    <div class="chorus-council-msg__text">${escapeHtml(entry.content)}</div>
                </div>
            `);
        } else {
            const voice = getVoiceById(entry.voiceId);
            const arc = voice ? getArcana(voice.arcana) : { glyph: '◇', glow: '#888' };

            $feed.append(`
                <div class="chorus-council-msg" data-voice-id="${entry.voiceId || ''}">
                    <div class="chorus-council-msg__header">
                        <span class="chorus-council-msg__glyph" style="color:${arc.glow}">${arc.glyph}</span>
                        <span class="chorus-council-msg__name" style="color:${arc.glow}">${entry.name || 'Unknown'}</span>
                    </div>
                    <div class="chorus-council-msg__text">${escapeHtml(entry.content)}</div>
                </div>
            `);
        }
    }

    scrollFeed();
}

function renderPips(voices) {
    const $pips = $('#chorus-council-pips');
    $pips.empty();

    for (const v of voices) {
        const arc = getArcana(v.arcana);
        $pips.append(`
            <div class="chorus-council-pip" id="chorus-pip-${v.id}"
                 style="border:1px solid ${arc.color}44;--pip-color:${arc.glow}"
                 title="${v.name}">
                <span style="color:${arc.glow}">${arc.glyph}</span>
            </div>
        `);
    }
}

function updatePipSpeaking(voiceId) {
    // Remove all speaking states
    $('.chorus-council-pip').removeClass('chorus-council-pip--speaking');
    // Add to current speaker
    $(`#chorus-pip-${voiceId}`).addClass('chorus-council-pip--speaking');

    // Clear after 3s
    setTimeout(() => {
        $(`#chorus-pip-${voiceId}`).removeClass('chorus-council-pip--speaking');
    }, 3000);
}

function renderEmpty(text) {
    const $feed = $('#chorus-council-messages');
    $feed.empty();
    $feed.append(`
        <div class="chorus-council-empty">
            <div class="chorus-council-empty__glyph">◇</div>
            <div class="chorus-council-empty__text">${text}</div>
        </div>
    `);
}

function showThinking() {
    const $feed = $('#chorus-council-messages');
    if ($feed.find('#chorus-council-thinking').length > 0) return;

    $feed.append(`
        <div class="chorus-council-thinking" id="chorus-council-thinking">
            <span></span><span></span><span></span>
        </div>
    `);
    scrollFeed();
}

function hideThinking() {
    $('#chorus-council-thinking').remove();
}

function clearCouncilFeed() {
    $('#chorus-council-messages').empty();
    $('#chorus-council-pips').empty();
}

function scrollFeed() {
    const el = document.getElementById('chorus-council-messages');
    if (el) {
        requestAnimationFrame(() => {
            el.scrollTop = el.scrollHeight;
        });
    }
}

function trimFeed() {
    const $msgs = $('#chorus-council-messages .chorus-council-msg');
    if ($msgs.length > 50) {
        $msgs.slice(0, $msgs.length - 50).remove();
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// =============================================================================
// INIT — wire up input events
// =============================================================================

export function initCouncil() {
    // Send on button click
    $(document).on('click', '#chorus-council-send', () => {
        const $input = $('#chorus-council-input');
        const text = $input.val();
        if (text && text.trim()) {
            $input.val('');
            sendCouncilMessage(text);
        }
    });

    // Send on Enter (shift+enter for newline)
    $(document).on('keydown', '#chorus-council-input', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const $input = $(e.target);
            const text = $input.val();
            if (text && text.trim()) {
                $input.val('');
                sendCouncilMessage(text);
            }
        }
    });

    // Clear council history button
    $(document).on('click', '#chorus-council-clear', () => {
        clearCouncilHistory();
        clearCouncilFeed();
        hasHadInitialBurst = false;
        silentTurns = 0;
        totalTurns = 0;
        renderEmpty('Council cleared. Open this tab again to start a new session.');
    });

    console.log(`${LOG_PREFIX} Council initialized`);
}
