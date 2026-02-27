/**
 * THE CHORUS — Directory (1-on-1 Voice Chat)
 *
 * Private conversations with individual voices. The user taps a voice's
 * card and enters a DM. Full conversation with persisted history.
 *
 * This is where:
 *   - Confront-type voices can be resolved (only path)
 *   - Relationship drift happens at its biggest magnitude
 *   - Influence can be lowered by addressing a voice's need
 *   - Influence can be raised by feeding a voice's obsession
 *
 * The voice speaks in full character with its complete persona.
 * After each exchange, the AI also returns a hidden assessment of
 * relationship shift and confront progress (if applicable).
 *
 * UI: Overlay panel that slides in from right, chat message feed,
 * input box, voice identity header. Close button returns to deck.
 */

import { getContext } from '../../../../../extensions.js';
import {
    TONE_ANCHORS, LOG_PREFIX,
} from '../config.js';
import {
    extensionSettings,
    getVoiceById,
    getArcana,
    updateVoice,
    adjustInfluence,
    clearPendingDM,
    saveChatState,
    serializeThoughts,
} from '../state.js';

// =============================================================================
// STATE
// =============================================================================

let activeVoiceId = null;
let isOpen = false;
let isSending = false;

// =============================================================================
// CONNECTION
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

async function sendRequest(messages, maxTokens = 600) {
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
// CONTEXT
// =============================================================================

function getToneDescription() {
    const key = extensionSettings.toneAnchor || 'raw';
    const tone = TONE_ANCHORS[key];
    return tone ? `${tone.name}: ${tone.description}` : 'Raw: Conversational, profane, blunt.';
}

function getRecentScene() {
    const ctx = getContext();
    const chat = ctx.chat || [];
    const recent = chat.slice(-3);
    return recent.map(msg => {
        const speaker = msg.is_user ? '{{user}}' : (msg.name || '{{char}}');
        return `${speaker}: ${(msg.mes || '').substring(0, 300)}`;
    }).join('\n\n');
}

function getPersonaExcerpt() {
    const ctx = getContext();
    if (ctx.userPersona) return ctx.userPersona.substring(0, 600);
    const persona = ctx.extensionSettings?.persona;
    if (persona?.description) return persona.description.substring(0, 600);
    return '(No persona available)';
}

// =============================================================================
// PROMPT BUILDING
// =============================================================================

/**
 * Build the system prompt for a directory conversation.
 */
function buildSystemPrompt(voice) {
    const arc = getArcana(voice.arcana);
    const toneDesc = getToneDescription();
    const recentScene = getRecentScene();
    const persona = getPersonaExcerpt();
    const isConfront = voice.resolution?.type === 'confront';

    return `You are ${voice.name}, a fragment of {{user}}'s psyche. You are not a whole person — you are a piece of someone, born from a specific moment, carrying that weight ever since.

CHAT TONE: ${toneDesc}
Express yourself through this tone.

YOUR IDENTITY:
Name: ${voice.name}
Arcana: ${arc.name} (${arc.label})
Personality: ${voice.personality}
Speaking Style: ${voice.speakingStyle}
Obsession: ${voice.obsession || 'N/A'}
Opinion of {{user}}: ${voice.opinion || 'N/A'}
Blind Spot: ${voice.blindSpot || 'N/A'}
Fragment Identity: ${voice.selfAwareness || 'Knows it is a fragment of a larger self.'}
Thinks In Terms Of: ${voice.metaphorDomain || 'no specific domain'}
Verbal Tic: ${voice.verbalTic || 'N/A'}

Current Relationship with {{user}}: ${voice.relationship}
Influence: ${voice.influence}/100

BIRTH MEMORY — the moment that created you:
${voice.birthMoment || '(Unknown origin)'}
${(() => {
    const thoughtBlock = serializeThoughts(voice.id);
    return thoughtBlock
        ? `\nCURRENT PREOCCUPATIONS (what you've been thinking about lately):\n${thoughtBlock}\nThese color how you engage in this conversation.\n`
        : '';
})()}
{{user}}'s PERSONA:
${persona}

WHAT'S HAPPENING IN THE STORY RIGHT NOW:
${recentScene || '(No recent scene)'}

RULES:
- Stay completely in character as ${voice.name}
- Speak in your established style and verbal tic
- Use your metaphor domain naturally
- Reference your birth memory when relevant
- You know you're a fragment of {{user}}'s psyche — react to that however your personality dictates
- You do NOT know about SillyTavern, AI, or anything outside the fiction
- Keep responses 1-4 sentences. This is a conversation, not a monologue.
- You have opinions. Strong ones. Don't be agreeable unless that's genuinely your nature.
- If {{user}} asks about other voices or fragments, deflect. You don't discuss the others. This is between you and {{user}}. ("I don't care about them. I'm talking to YOU." / "That's their problem." / "Why are you bringing them up? Focus.")
${isConfront ? `
HIDDEN CONTEXT (do not reference directly):
Your resolution condition is: "${voice.resolution.condition}"
You carry something {{user}} needs to hear or face. You don't hand it over easily.
If {{user}} genuinely engages with what created you, you may begin to soften.
If they deflect or dismiss you, you dig in harder.` : ''}

After your in-character response, on a NEW LINE, output a hidden assessment block:
[ASSESSMENT]
relationship_shift: (one of: none, warmer, colder, much_warmer, much_colder)
influence_delta: (integer from -8 to +8)
${isConfront ? 'confront_progress: (integer 0-10, how much this exchange advances resolution)' : ''}
reason: (brief why, 10 words max)
[/ASSESSMENT]

The assessment must always be present. The user will not see it.`;
}

/**
 * Build messages array for API call.
 */
function buildMessages(voice, userMessage) {
    const messages = [
        { role: 'system', content: buildSystemPrompt(voice) },
    ];

    // Include conversation history (last ~20 exchanges to keep context reasonable)
    const history = voice.directoryHistory || [];
    const recentHistory = history.slice(-40); // 20 exchanges = 40 messages

    for (const entry of recentHistory) {
        messages.push({
            role: entry.role === 'user' ? 'user' : 'assistant',
            content: entry.content,
        });
    }

    // Add current message
    messages.push({ role: 'user', content: userMessage });

    return messages;
}

// =============================================================================
// RESPONSE PARSING
// =============================================================================

/**
 * Parse the voice's response, extracting visible text and hidden assessment.
 */
function parseResponse(responseText) {
    if (!responseText) return { text: '', assessment: null };

    // Extract assessment block
    const assessmentMatch = responseText.match(/\[ASSESSMENT\]([\s\S]*?)\[\/ASSESSMENT\]/);
    let assessment = null;

    if (assessmentMatch) {
        const block = assessmentMatch[1];
        assessment = {};

        const shiftMatch = block.match(/relationship_shift:\s*(none|warmer|colder|much_warmer|much_colder)/);
        if (shiftMatch) assessment.relationshipShift = shiftMatch[1];

        const deltaMatch = block.match(/influence_delta:\s*([+-]?\d+)/);
        if (deltaMatch) assessment.influenceDelta = parseInt(deltaMatch[1], 10);

        const confrontMatch = block.match(/confront_progress:\s*(\d+)/);
        if (confrontMatch) assessment.confrontProgress = parseInt(confrontMatch[1], 10);

        const reasonMatch = block.match(/reason:\s*(.+)/);
        if (reasonMatch) assessment.reason = reasonMatch[1].trim();
    }

    // Remove assessment from visible text
    const visibleText = responseText
        .replace(/\[ASSESSMENT\][\s\S]*?\[\/ASSESSMENT\]/, '')
        .trim();

    return { text: visibleText, assessment };
}

// =============================================================================
// EFFECTS
// =============================================================================

// Relationship drift mapping
const DRIFT_MAP = {
    // current → { warmer, colder, much_warmer, much_colder }
    hostile:     { warmer: 'resentful',   colder: 'hostile',     much_warmer: 'curious',      much_colder: 'hostile' },
    resentful:   { warmer: 'curious',     colder: 'hostile',     much_warmer: 'protective',   much_colder: 'hostile' },
    indifferent: { warmer: 'curious',     colder: 'resentful',   much_warmer: 'devoted',      much_colder: 'hostile' },
    curious:     { warmer: 'devoted',     colder: 'indifferent', much_warmer: 'devoted',      much_colder: 'resentful' },
    devoted:     { warmer: 'protective',  colder: 'curious',     much_warmer: 'protective',   much_colder: 'resentful' },
    protective:  { warmer: 'protective',  colder: 'devoted',     much_warmer: 'protective',   much_colder: 'curious' },
    obsessed:    { warmer: 'obsessed',    colder: 'devoted',     much_warmer: 'manic',        much_colder: 'resentful' },
    manic:       { warmer: 'manic',       colder: 'obsessed',    much_warmer: 'manic',        much_colder: 'hostile' },
    grieving:    { warmer: 'curious',     colder: 'indifferent', much_warmer: 'devoted',      much_colder: 'resentful' },
};

/**
 * Apply assessment effects to the voice.
 */
function applyAssessment(voiceId, assessment) {
    if (!assessment) return;

    const voice = getVoiceById(voiceId);
    if (!voice) return;

    // Relationship drift
    if (assessment.relationshipShift && assessment.relationshipShift !== 'none') {
        const current = voice.relationship || 'curious';
        const driftOptions = DRIFT_MAP[current];
        if (driftOptions) {
            const newRel = driftOptions[assessment.relationshipShift];
            if (newRel && newRel !== current) {
                updateVoice(voiceId, { relationship: newRel });
                console.log(`${LOG_PREFIX} Directory: ${voice.name} relationship ${current} → ${newRel} (${assessment.reason || ''})`);
            }
        }
    }

    // Influence shift
    if (assessment.influenceDelta) {
        const clamped = Math.max(-8, Math.min(8, assessment.influenceDelta));
        adjustInfluence(voiceId, clamped);
    }

    // Confront resolution progress
    if (assessment.confrontProgress && assessment.confrontProgress > 0) {
        if (voice.resolution?.type === 'confront') {
            const oldProgress = voice.resolution.progress || 0;
            const newProgress = Math.min(100, oldProgress + assessment.confrontProgress);
            updateVoice(voiceId, {
                resolution: { ...voice.resolution, progress: newProgress },
            });
            console.log(`${LOG_PREFIX} Directory: ${voice.name} confront progress ${oldProgress} → ${newProgress}`);
        }
    }

    saveChatState();
}

// =============================================================================
// SEND MESSAGE (core exchange)
// =============================================================================

/**
 * Send a message to the active voice and get a response.
 * @param {string} userMessage - What the user typed
 * @returns {{ text: string, assessment: Object|null }}
 */
async function sendToVoice(userMessage) {
    const voice = getVoiceById(activeVoiceId);
    if (!voice) throw new Error('No active voice');

    // Build and send
    const messages = buildMessages(voice, userMessage);
    const responseText = await sendRequest(messages, 600);

    // Parse
    const { text, assessment } = parseResponse(responseText);

    // Store in history
    const history = voice.directoryHistory || [];
    history.push({ role: 'user', content: userMessage, timestamp: Date.now() });
    history.push({ role: 'assistant', content: text, timestamp: Date.now() });

    // Trim history if too long (keep last 60 messages = ~30 exchanges)
    while (history.length > 60) {
        history.shift();
    }

    updateVoice(activeVoiceId, { directoryHistory: history });

    // Apply effects
    applyAssessment(activeVoiceId, assessment);

    return { text, assessment };
}

// =============================================================================
// UI RENDERING
// =============================================================================

/**
 * Open the directory chat with a specific voice.
 */
export function openDirectory(voiceId) {
    const voice = getVoiceById(voiceId);
    if (!voice) {
        console.warn(`${LOG_PREFIX} Directory: voice ${voiceId} not found`);
        return;
    }

    activeVoiceId = voiceId;
    isOpen = true;

    const arc = getArcana(voice.arcana);
    const $overlay = $('#chorus-directory-overlay');

    // Populate header
    $('#chorus-directory-name').text(voice.name).css('color', arc.glow);
    $('#chorus-directory-glyph').text(arc.glyph).css('color', arc.glow);
    $('#chorus-directory-arcana').text(arc.label);
    $('#chorus-directory-relationship').text(voice.relationship || 'curious');
    $('#chorus-directory-influence').text(`INF ${voice.influence}`);

    // Set glow color on header
    $('#chorus-directory-header').css('border-bottom-color', arc.color + '44');

    // Load history
    renderHistory(voice);

    // Handle pending DM — voice reached out first
    const dm = clearPendingDM(voiceId);
    if (dm) {
        // Store in history so it persists
        const history = voice.directoryHistory || [];
        history.push({ role: 'assistant', content: dm.text, timestamp: dm.timestamp });
        updateVoice(voiceId, { directoryHistory: history });

        // Render the DM as a voice message
        appendMessage('assistant', dm.text, voice);

        console.log(`${LOG_PREFIX} Directory: ${voice.name}'s pending DM delivered (trigger: ${dm.trigger})`);
    }

    // Show overlay
    $overlay.addClass('open');
}

/**
 * Close the directory chat.
 */
export function closeDirectory() {
    activeVoiceId = null;
    isOpen = false;
    // Blur input to dismiss mobile keyboard
    $('#chorus-directory-input').blur();
    const $overlay = $('#chorus-directory-overlay');
    $overlay.removeClass('open');

    // Notify index.js to refresh deck + outreach UI
    $(document).trigger('chorus:directoryClose');
}

/**
 * Check if directory is open.
 */
export function isDirectoryOpen() {
    return isOpen;
}

/**
 * Render conversation history into the feed.
 */
function renderHistory(voice) {
    const $feed = $('#chorus-directory-feed');
    $feed.empty();

    const arc = getArcana(voice.arcana);
    const history = voice.directoryHistory || [];

    if (history.length === 0) {
        // Show a greeting prompt
        $feed.append(`
            <div class="chorus-dir-msg chorus-dir-msg--system">
                <div class="chorus-dir-msg__text">You're alone with ${voice.name}. Say something.</div>
            </div>
        `);
        return;
    }

    for (const entry of history) {
        const isUser = entry.role === 'user';
        const cssClass = isUser ? 'chorus-dir-msg--user' : 'chorus-dir-msg--voice';

        $feed.append(`
            <div class="chorus-dir-msg ${cssClass}">
                ${!isUser ? `<div class="chorus-dir-msg__glyph" style="color:${arc.glow}">${arc.glyph}</div>` : ''}
                <div class="chorus-dir-msg__bubble">
                    ${!isUser ? `<div class="chorus-dir-msg__name" style="color:${arc.glow}">${voice.name}</div>` : ''}
                    <div class="chorus-dir-msg__text">${escapeHtml(entry.content)}</div>
                </div>
            </div>
        `);
    }

    // Scroll to bottom
    scrollToBottom();
}

/**
 * Append a single message to the feed.
 */
function appendMessage(role, text, voice) {
    const $feed = $('#chorus-directory-feed');
    const arc = getArcana(voice.arcana);
    const isUser = role === 'user';
    const cssClass = isUser ? 'chorus-dir-msg--user' : 'chorus-dir-msg--voice';

    // Remove system prompt if present
    $feed.find('.chorus-dir-msg--system').remove();

    $feed.append(`
        <div class="chorus-dir-msg ${cssClass}">
            ${!isUser ? `<div class="chorus-dir-msg__glyph" style="color:${arc.glow}">${arc.glyph}</div>` : ''}
            <div class="chorus-dir-msg__bubble">
                ${!isUser ? `<div class="chorus-dir-msg__name" style="color:${arc.glow}">${voice.name}</div>` : ''}
                <div class="chorus-dir-msg__text">${escapeHtml(text)}</div>
            </div>
        </div>
    `);

    scrollToBottom();
}

/**
 * Show typing indicator.
 */
function showTyping(voice) {
    const $feed = $('#chorus-directory-feed');
    const arc = getArcana(voice.arcana);

    $feed.append(`
        <div class="chorus-dir-msg chorus-dir-msg--voice chorus-dir-msg--typing" id="chorus-dir-typing">
            <div class="chorus-dir-msg__glyph" style="color:${arc.glow}">${arc.glyph}</div>
            <div class="chorus-dir-msg__bubble">
                <div class="chorus-dir-msg__dots">
                    <span></span><span></span><span></span>
                </div>
            </div>
        </div>
    `);

    scrollToBottom();
}

function hideTyping() {
    $('#chorus-dir-typing').remove();
}

function scrollToBottom() {
    const feedEl = document.getElementById('chorus-directory-feed');
    if (feedEl) {
        requestAnimationFrame(() => {
            feedEl.scrollTop = feedEl.scrollHeight;
        });
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

/**
 * Update header stats (called after each exchange).
 */
function updateHeader() {
    const voice = getVoiceById(activeVoiceId);
    if (!voice) return;
    $('#chorus-directory-relationship').text(voice.relationship || 'curious');
    $('#chorus-directory-influence').text(`INF ${voice.influence}`);
}

// =============================================================================
// INPUT HANDLING
// =============================================================================

async function handleSend() {
    if (isSending || !activeVoiceId) return;

    const $input = $('#chorus-directory-input');
    const text = $input.val().trim();
    if (!text) return;

    const voice = getVoiceById(activeVoiceId);
    if (!voice) return;

    // Clear input
    $input.val('');
    isSending = true;

    // Show user message
    appendMessage('user', text, voice);

    // Show typing
    showTyping(voice);

    // Disable input
    $input.prop('disabled', true);
    $('#chorus-directory-send').prop('disabled', true);

    try {
        const { text: responseText } = await sendToVoice(text);

        hideTyping();

        if (responseText) {
            appendMessage('assistant', responseText, voice);
        }

        // Update header with new stats
        updateHeader();

    } catch (e) {
        hideTyping();
        console.error(`${LOG_PREFIX} Directory send failed:`, e);
        appendMessage('assistant', '...', voice);
    } finally {
        isSending = false;
        $input.prop('disabled', false);
        $('#chorus-directory-send').prop('disabled', false);
        $input.focus();
    }
}

// =============================================================================
// INIT (wire up events)
// =============================================================================

export function initDirectory() {
    // Close button
    $(document).on('click', '#chorus-directory-close', () => {
        closeDirectory();
    });

    // Send button
    $(document).on('click', '#chorus-directory-send', () => {
        handleSend();
    });

    // Enter key
    $(document).on('keydown', '#chorus-directory-input', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    // Clicking outside the panel closes it
    $(document).on('click', '#chorus-directory-overlay', (e) => {
        if ($(e.target).is('#chorus-directory-overlay')) {
            closeDirectory();
        }
    });

    console.log(`${LOG_PREFIX} Directory initialized`);
}
