/**
 * THE CHORUS — Panel UI
 * Panel shell, FAB, draggable, tab switching, settings wiring.
 */

import { renderExtensionTemplateAsync } from '../../../../../extensions.js';
import { EXTENSION_NAME, LOG_PREFIX } from '../config.js';
import { extensionSettings, getContainer, panelOpen, setPanelOpen } from '../state.js';
import { renderDeck, cleanupCanvases } from './deck.js';
import { initReadingTab } from './reading.js';

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
    }
}

// =============================================================================
// TAB SWITCHING
// =============================================================================

function switchTab(tabName) {
    $('.chorus-tabs__btn').removeClass('active');
    $(`.chorus-tabs__btn[data-tab="${tabName}"]`).addClass('active');

    $('.chorus-page').removeClass('active');
    $(`#chorus-page-${tabName}`).addClass('active');

    $('.chorus-content').scrollTop(0);
}

// =============================================================================
// DRAGGABLE FAB
// =============================================================================

function setupDraggableFab() {
    const $fab = $('#chorus-fab');
    if (!$fab.length) return;

    let isDragging = false;
    let wasDragged = false;
    let touchStartTime = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let fabStartX = 0;
    let fabStartY = 0;

    const MOVE_THRESHOLD = 8;

    $fab.on('touchstart', function (e) {
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

    $fab.on('touchmove', function (e) {
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

            const w = $fab.outerWidth();
            const h = $fab.outerHeight();
            const pad = 5;
            newX = Math.max(pad, Math.min(window.innerWidth - w - pad, newX));
            newY = Math.max(pad, Math.min(window.innerHeight - h - pad, newY));

            $fab.css({
                'left': newX + 'px',
                'top': newY + 'px',
                'right': 'auto',
                'transition': 'none',
            });
        }
    });

    $fab.on('touchend', function () {
        isDragging = false;
        $fab.css('transition', '');

        if (wasDragged) {
            const pos = {
                left: $fab.css('left'),
                top: $fab.css('top'),
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
        if (!wasDragged) {
            togglePanel();
        }
        wasDragged = false;
    });

    // Restore saved position
    try {
        const saved = JSON.parse(localStorage.getItem('chorus-fab-pos'));
        if (saved && saved.left && saved.top) {
            $fab.css({
                'left': saved.left,
                'top': saved.top,
                'right': 'auto',
            });
        }
    } catch (e) { /* ignore */ }
}

// =============================================================================
// UI INIT / DESTROY
// =============================================================================

export async function initUI() {
    try {
        const panelHtml = await renderExtensionTemplateAsync(EXTENSION_NAME, 'template');

        const $temp = $('<div>').html(panelHtml);
        $temp.find('#chorus-fab').remove();

        const $container = getContainer();
        $temp.children().appendTo($container);

        // Create FAB with absolute positioning
        const $fab = $(`<button id="chorus-fab" class="chorus-fab" title="The Chorus">
            <span class="chorus-fab__glyph">\u25C6</span>
            <div class="chorus-fab__ink"></div>
            <div class="chorus-fab__pip"></div>
        </button>`);
        $fab.css({
            'position': 'absolute',
            'z-index': '99999',
            'top': 'calc(100vh - 140px)',
            'right': '15px',
        });
        $container.append($fab);

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

        // Spread pills
        $('.chorus-spread-pill').on('click', function () {
            $(this).siblings().removeClass('active');
            $(this).addClass('active');
        });

        // Sliders
        $('#chorus-setting-max-voices').on('input', function () {
            $('#chorus-max-voices-val').text(this.value);
        });
        $('#chorus-setting-birth-sensitivity').on('input', function () {
            const labels = ['HAIR', 'LOW', 'MED', 'HIGH', 'EXTREME'];
            $('#chorus-birth-sensitivity-val').text(labels[this.value - 1]);
        });
        $('#chorus-setting-draw-freq').on('input', function () {
            $('#chorus-draw-freq-val').text(this.value);
        });
        $('#chorus-setting-reversal-chance').on('input', function () {
            $('#chorus-reversal-chance-val').text(this.value + '%');
        });
        $('#chorus-setting-gain-rate').on('input', function () {
            const labels = ['SLOW', 'LOW', 'MED', 'FAST', 'RAPID'];
            $('#chorus-gain-rate-val').text(labels[this.value - 1]);
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
    $('#chorus-fab').remove();
    $('#chorus-awakening-overlay').remove();
    $('#chorus-dissolution-overlay').remove();
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
    // Reading tab re-initializes its empty spread on render
    // (full re-init not needed — just clear any stale reading)
    $('#chorus-spread-area').empty();
    $('#chorus-commentary-area').html(`
        <div class="chorus-commentary-empty" id="chorus-commentary-empty">
            <div class="chorus-commentary-empty__glyph">\u263E</div>
            <div class="chorus-commentary-empty__text">Draw a spread to hear from your voices</div>
        </div>
    `);

    console.log('[The Chorus] UI refreshed');
}
