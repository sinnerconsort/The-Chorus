/**
 * THE CHORUS — Panel UI
 * Panel shell, FAB, draggable, tab switching, settings wiring.
 */

import { renderExtensionTemplateAsync, getContext } from '../../../../../extensions.js';
import { EXTENSION_NAME, LOG_PREFIX, TONE_ANCHORS } from '../config.js';
import { extensionSettings, getContainer, panelOpen, setPanelOpen, saveSettings } from '../state.js';
import { renderDeck, cleanupCanvases } from './deck.js';
import { initReadingTab, clearSidebar } from './reading.js';
import { activateCouncil, deactivateCouncil } from '../social/council.js';
import { renderLog } from './log.js';

// =============================================================================
// PANEL TOGGLE
// =============================================================================

export function togglePanel(forceState) {
    const panel = $('#chorus-panel');
    const shouldOpen = typeof forceState === 'boolean' ? forceState : !panelOpen;

    if (shouldOpen && !panelOpen) {
        panel.addClass('open');
        setPanelOpen(true);
        $('#chorus-fab').addClass('chorus-fab--active');
    } else if (!shouldOpen && panelOpen) {
        panel.removeClass('open');
        setPanelOpen(false);
        $('#chorus-fab').removeClass('chorus-fab--active');
        // Deactivate council when panel closes
        deactivateCouncil();
    }
}

// Track active tab for lifecycle
let currentTab = 'reading';

// =============================================================================
// TAB SWITCHING
// =============================================================================

function switchTab(tabName) {
    // Deactivate previous tab
    if (currentTab === 'council') {
        deactivateCouncil();
    }

    $('.chorus-tabs__btn').removeClass('active');
    $(`.chorus-tabs__btn[data-tab="${tabName}"]`).addClass('active');

    $('.chorus-page').removeClass('active');
    $(`#chorus-page-${tabName}`).addClass('active');

    $('.chorus-content').scrollTop(0);

    // Activate new tab
    currentTab = tabName;
    if (tabName === 'council') {
        activateCouncil();
    }
    if (tabName === 'log') {
        renderLog();
    }
    if (tabName === 'deck') {
        renderDeck();
    }
}

// =============================================================================
// DRAGGABLE FAB
// =============================================================================

function setupDraggableFab() {
    const $wrapper = $('#chorus-fab-wrapper');
    const $fab = $('#chorus-fab');
    if (!$wrapper.length) return;

    let isDragging = false;
    let wasDragged = false;
    let touchStartTime = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let fabStartX = 0;
    let fabStartY = 0;

    const MOVE_THRESHOLD = 8;

    $wrapper.on('touchstart', function (e) {
        const touch = e.originalEvent.touches[0];
        touchStartTime = Date.now();
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;

        const rect = this.getBoundingClientRect();
        fabStartX = rect.left;
        fabStartY = rect.top;

        isDragging = false;
        wasDragged = false;
    });

    $wrapper.on('touchmove', function (e) {
        const touch = e.originalEvent.touches[0];
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        if (!isDragging && distance > MOVE_THRESHOLD) {
            isDragging = true;
            wasDragged = true;
        }

        if (isDragging) {
            e.preventDefault();

            let newX = fabStartX + deltaX;
            let newY = fabStartY + deltaY;

            const w = $wrapper.outerWidth();
            const h = $wrapper.outerHeight();
            const pad = 5;
            newX = Math.max(pad, Math.min(window.innerWidth - w - pad, newX));
            newY = Math.max(pad, Math.min(window.innerHeight - h - pad, newY));

            $wrapper.css({
                'left': newX + 'px',
                'top': newY + 'px',
                'right': 'auto',
                'transition': 'none',
            });
        }
    });

    $wrapper.on('touchend', function () {
        isDragging = false;
        $wrapper.css('transition', '');

        if (wasDragged) {
            const pos = {
                left: $wrapper.css('left'),
                top: $wrapper.css('top'),
            };
            try {
                localStorage.setItem('chorus-fab-pos', JSON.stringify(pos));
            } catch (e) { /* ignore */ }
        }
    });

    // Click — only toggle if not a drag
    $fab.off('click').on('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (wasDragged) {
            wasDragged = false;
            return;
        }

        // If flipped (voice has pending DM), open directory for that voice
        if ($fab.hasClass('chorus-fab--flipped')) {
            const voiceId = $fab.data('dm-voice-id');
            if (voiceId) {
                $(document).trigger('chorus:openDirectory', { voiceId });
                return;
            }
        }

        togglePanel();
        wasDragged = false;
    });

    // Restore saved position
    try {
        const saved = JSON.parse(localStorage.getItem('chorus-fab-pos'));
        if (saved && saved.left && saved.top) {
            $wrapper.css({
                'left': saved.left,
                'top': saved.top,
                'right': 'auto',
            });
        }
    } catch (e) { /* ignore */ }
}

// =============================================================================
// CONNECTION PROFILE POPULATION
// =============================================================================

function populateConnectionProfiles() {
    const $select = $('#chorus-setting-connection');
    $select.empty();

    // Always have "Current Profile" option
    $select.append('<option value="current">Current Profile</option>');

    try {
        const ctx = getContext();
        const connectionManager = ctx.extensionSettings?.connectionManager;

        if (connectionManager?.profiles?.length) {
            for (const profile of connectionManager.profiles) {
                if (profile.name && profile.id) {
                    $select.append(`<option value="${profile.id}">${profile.name}</option>`);
                }
            }
        }
    } catch (e) {
        console.warn(`${LOG_PREFIX} Could not load connection profiles:`, e);
    }

    // Set current value
    const current = extensionSettings.connectionProfile || 'current';
    $select.val(current);

    // If the saved value doesn't exist in dropdown, fall back to current
    if ($select.val() !== current) {
        $select.val('current');
        extensionSettings.connectionProfile = 'current';
    }
}

// =============================================================================
// UI INIT / DESTROY
// =============================================================================

export async function initUI() {
    try {
        const panelHtml = await renderExtensionTemplateAsync(EXTENSION_NAME, 'template');

        const $temp = $('<div>').html(panelHtml);

        const $container = getContainer();
        $temp.children().appendTo($container);

        // Move overlays to document.body so they aren't clipped by
        // #sheld transforms (Moonlit Echoes, mobile, etc.)
        $('#chorus-directory-overlay').appendTo('body');
        $('#chorus-awakening-overlay').appendTo('body');
        $('#chorus-dissolution-overlay').appendTo('body');
        $('#chorus-transform-overlay').appendTo('body');

        // Move FAB wrapper out of panel so it's always visible
        // (template already contains it, just reposition to container root)
        $('#chorus-fab-wrapper').appendTo($container);

        setupDraggableFab();

        // Header buttons
        $('#chorus-btn-close').on('click', () => togglePanel(false));
        $('#chorus-btn-narrator').on('click', function () { $(this).toggleClass('active'); });
        $('#chorus-btn-mute').on('click', function () { $(this).toggleClass('active'); });

        // Tabs
        $('.chorus-tabs__btn').on('click', function () {
            switchTab($(this).data('tab'));
        });

        // Toggles
        $('.chorus-toggle').on('click', function () {
            $(this).toggleClass('on');
        });

        // Pickers
        $('.chorus-picker__opt').on('click', function () {
            $(this).siblings().removeClass('active');
            $(this).addClass('active');
        });

        // Spread pills handled by reading.js initReadingTab() via switchSpread

        // Sliders
        $('#chorus-setting-max-voices').on('input', function () {
            $('#chorus-max-voices-val').text(this.value);
            extensionSettings.maxVoices = parseInt(this.value);
            saveSettings();
        });
        $('#chorus-setting-birth-sensitivity').on('input', function () {
            const labels = ['HAIR', 'LOW', 'MED', 'HIGH', 'EXTREME'];
            $('#chorus-birth-sensitivity-val').text(labels[this.value - 1]);
            extensionSettings.birthSensitivity = parseInt(this.value);
            saveSettings();
        });
        $('#chorus-setting-draw-freq').on('input', function () {
            $('#chorus-draw-freq-val').text(this.value);
            extensionSettings.drawFrequency = parseInt(this.value);
            saveSettings();
        });
        $('#chorus-setting-reversal-chance').on('input', function () {
            $('#chorus-reversal-chance-val').text(this.value + '%');
            extensionSettings.reversalChance = parseInt(this.value);
            saveSettings();
        });
        $('#chorus-setting-gain-rate').on('input', function () {
            const labels = ['SLOW', 'LOW', 'MED', 'FAST', 'RAPID'];
            $('#chorus-gain-rate-val').text(labels[this.value - 1]);
            extensionSettings.influenceGainRate = parseInt(this.value);
            saveSettings();
        });

        // ── Connection profile dropdown ──
        populateConnectionProfiles();
        $('#chorus-setting-connection').on('change', function () {
            extensionSettings.connectionProfile = $(this).val();
            saveSettings();
            console.log(`${LOG_PREFIX} Connection profile: ${extensionSettings.connectionProfile}`);
        });

        // ── Tone anchor dropdown ──
        $('#chorus-setting-tone').val(extensionSettings.toneAnchor || 'raw');
        $('#chorus-setting-tone').on('change', function () {
            extensionSettings.toneAnchor = $(this).val();
            saveSettings();
            console.log(`${LOG_PREFIX} Tone anchor: ${extensionSettings.toneAnchor}`);
        });

        // ── Draw mode picker ──
        const $drawModePicker = $('#chorus-setting-draw-mode');
        $drawModePicker.find('.chorus-picker__opt').removeClass('active');
        $drawModePicker.find(`[data-value="${extensionSettings.drawMode || 'auto'}"]`).addClass('active');
        $drawModePicker.find('.chorus-picker__opt').on('click', function () {
            $(this).siblings().removeClass('active');
            $(this).addClass('active');
            extensionSettings.drawMode = $(this).data('value');
            saveSettings();
        });

        // ── Narrator archetype picker ──
        const $narratorPicker = $('#chorus-setting-narrator');
        $narratorPicker.find('.chorus-picker__opt').removeClass('active');
        $narratorPicker.find(`[data-value="${extensionSettings.narratorArchetype || 'stage_manager'}"]`).addClass('active');
        $narratorPicker.find('.chorus-picker__opt').on('click', function () {
            $(this).siblings().removeClass('active');
            $(this).addClass('active');
            extensionSettings.narratorArchetype = $(this).data('value');
            saveSettings();
        });

        // Render tabs
        renderDeck();
        initReadingTab();

        console.log(`${LOG_PREFIX} UI initialized`);
    } catch (error) {
        console.error(`${LOG_PREFIX} UI init failed:`, error);
        toastr.error(`UI failed: ${error.message}`, 'The Chorus', { timeOut: 10000 });
        throw error;
    }
}

export function destroyUI() {
    cleanupCanvases();

    $('#chorus-panel').remove();
    $('#chorus-fab-wrapper').remove();
    // These were moved to body in initUI
    $('#chorus-directory-overlay').remove();
    $('#chorus-awakening-overlay').remove();
    $('#chorus-dissolution-overlay').remove();
    $('#chorus-transform-overlay').remove();
    setPanelOpen(false);
}

/**
 * Re-render all tab content with current state.
 * Called on chat switch after loadChatState().
 */
export function refreshUI() {
    // Only refresh if UI is actually mounted
    if (!$('#chorus-panel').length) return;

    renderDeck();
    clearSidebar();

    // Clear spread area
    $('#chorus-spread-area').empty();
    $('#chorus-commentary-area').html(`
        <div class="chorus-commentary-empty" id="chorus-commentary-empty">
            <div class="chorus-commentary-empty__glyph">\u263E</div>
            <div class="chorus-commentary-empty__text">Draw a spread to hear from your voices</div>
        </div>
    `);

    // Re-populate connection profiles (may have changed)
    populateConnectionProfiles();

    console.log('[The Chorus] UI refreshed');
}
