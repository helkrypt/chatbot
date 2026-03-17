(function () {
    'use strict';

    /* ─── GUARD: prevent double injection ────────────────────────────────────── */
    if (window.__helkryptLoaded) return;
    window.__helkryptLoaded = true;

    /* ─── CONFIG — les fra script-tag attributter ELLER window.ChatConfig ─────── */
    var _script     = document.currentScript;
    var _config     = window.ChatConfig || {};
    var _clientId   = (_script && _script.getAttribute('data-client'))
                      || _config.clientId
                      || '';
    var _chatTitle  = (_script && _script.getAttribute('data-title'))
                      || _config.title
                      || 'Kundeservice';
    var _baseUrl    = (_script && _script.getAttribute('data-url'))
                      || _config.baseUrl
                      || 'https://app.helkrypt.no';

    if (!_clientId) {
        console.warn('[Helkrypt Widget] Mangler data-client / ChatConfig.clientId');
        return;
    }

    var CHAT_URL        = _baseUrl + '/chat-widget?client=' + _clientId;
    var AUTO_OPEN_DELAY = 5000;   // ms — desktop only
    var BUBBLE_COLOR    = '#0284c7';
    var BUBBLE_SIZE     = 64;     // px
    var CHAT_BOTTOM     = 24;     // px from bottom (desktop)
    var CHAT_RIGHT      = 24;     // px from right  (desktop)

    /* ─── INIT: wait for DOM to be ready ─────────────────────────────────────── */
    function init() {
        // Extra guard: if body still not present, retry in 100 ms
        if (!document.body) {
            setTimeout(init, 100);
            return;
        }
        // Prevent double-build (e.g. DOMContentLoaded fires twice on some WP setups)
        if (document.getElementById('helkrypt-chat-bubble')) return;
        build();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // DOM already ready (script loaded async/defer or inline at bottom)
        init();
    }

    /* ─── BUILD ───────────────────────────────────────────────────────────────── */
    function build() {

        /* ── STYLES ─────────────────────────────────────────────────────────── */
        var style = document.createElement('style');
        style.id = 'helkrypt-chat-style';
        style.textContent = [
            /* Bubble */
            '#helkrypt-chat-bubble{',
            'position:fixed!important;',
            'bottom:' + CHAT_BOTTOM + 'px;',
            'right:' + CHAT_RIGHT + 'px;',
            'width:' + BUBBLE_SIZE + 'px!important;',
            'height:' + BUBBLE_SIZE + 'px!important;',
            'background:' + BUBBLE_COLOR + '!important;',
            'border-radius:50%!important;',
            'display:flex!important;',
            'align-items:center!important;',
            'justify-content:center!important;',
            'cursor:pointer!important;',
            'box-shadow:0 6px 24px rgba(0,0,0,0.25),0 2px 8px rgba(0,0,0,0.15)!important;',
            'z-index:2147483646!important;',
            'transition:transform 0.25s cubic-bezier(0.34,1.56,0.64,1),opacity 0.2s ease;',
            'user-select:none;',
            'opacity:1!important;',
            'visibility:visible!important;',
            '}',
            '#helkrypt-chat-bubble:hover{transform:scale(1.08);}',
            '#helkrypt-chat-bubble.helkrypt-hidden{',
            'opacity:0!important;pointer-events:none!important;transform:scale(0.6)!important;',
            '}',
            '#helkrypt-chat-bubble svg{',
            'width:30px;height:30px;fill:none;stroke:#fff;stroke-width:2;',
            'stroke-linecap:round;stroke-linejoin:round;',
            '}',
            /* Tooltip */
            '#helkrypt-chat-tooltip{',
            'position:fixed!important;',
            'bottom:' + (CHAT_BOTTOM + BUBBLE_SIZE + 12) + 'px;',
            'right:' + CHAT_RIGHT + 'px;',
            'background:#fff!important;color:#1c1c1c!important;',
            'padding:10px 16px;border-radius:12px;',
            'font-size:14px;',
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
            'box-shadow:0 4px 20px rgba(0,0,0,0.15);',
            'z-index:2147483645!important;',
            'max-width:220px;line-height:1.4;cursor:pointer;',
            'transition:opacity 0.3s ease,transform 0.3s ease;',
            'white-space:nowrap;',
            '}',
            '#helkrypt-chat-tooltip::after{',
            'content:"";position:absolute;bottom:-7px;right:22px;',
            'width:14px;height:14px;background:#fff;',
            'transform:rotate(45deg);box-shadow:3px 3px 6px rgba(0,0,0,0.08);',
            '}',
            '#helkrypt-chat-tooltip.helkrypt-hidden{opacity:0!important;pointer-events:none!important;transform:translateY(6px);}',
            /* Iframe wrapper — responsive + safe-area */
            '#helkrypt-chat-iframe-wrap{',
            'position:fixed!important;',
            'right:max(12px, env(safe-area-inset-right))!important;',
            'bottom:max(12px, env(safe-area-inset-bottom))!important;',
            'width:min(420px, calc(100vw - 24px))!important;',
            'height:min(680px, calc(100dvh - 120px))!important;',
            'z-index:2147483647!important;',
            'border-radius:16px!important;overflow:hidden!important;',
            'box-shadow:0 16px 56px rgba(0,0,0,0.28),0 4px 16px rgba(0,0,0,0.14);',
            'transition:transform 0.35s cubic-bezier(0.34,1.25,0.64,1),opacity 0.3s ease;',
            'transform-origin:bottom right;',
            '}',
            '#helkrypt-chat-iframe-wrap.helkrypt-hidden{',
            'opacity:0!important;pointer-events:none!important;',
            'transform:scale(0.85) translateY(20px)!important;',
            '}',
            '#helkrypt-chat-iframe-wrap iframe{',
            'width:100%!important;height:100%!important;',
            'border:none!important;display:block!important;',
            'background:transparent;color-scheme:light;',
            '}',
            /* Mobile / tablet ≤ 900 px → full screen */
            '@media(max-width:900px){',
            '#helkrypt-chat-bubble{',
            'right:max(12px, env(safe-area-inset-right))!important;',
            'bottom:max(12px, env(safe-area-inset-bottom))!important;',
            '}',
            '#helkrypt-chat-tooltip{',
            'right:max(12px, env(safe-area-inset-right))!important;',
            'max-width:calc(100vw - 24px)!important;',
            'white-space:normal!important;',
            '}',
            '#helkrypt-chat-iframe-wrap{',
            'right:0!important;bottom:0!important;',
            'width:100vw!important;height:100dvh!important;',
            'border-radius:0!important;',
            '}',
            '}',
        ].join('');

        (document.head || document.documentElement).appendChild(style);

        /* ── STATE ──────────────────────────────────────────────────────────── */
        var isOpen = false;

        /* ── BUBBLE ─────────────────────────────────────────────────────────── */
        var bubble = document.createElement('div');
        bubble.id = 'helkrypt-chat-bubble';
        bubble.setAttribute('role', 'button');
        bubble.setAttribute('aria-label', 'Åpne chat');
        bubble.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
        document.body.appendChild(bubble);

        /* ── TOOLTIP ────────────────────────────────────────────────────────── */
        var tooltip = document.createElement('div');
        tooltip.id = 'helkrypt-chat-tooltip';
        tooltip.textContent = 'Hei \uD83D\uDC4B ' + _chatTitle + ' \u2014 Hva kan jeg hjelpe deg med?';
        document.body.appendChild(tooltip);

        /* ── IFRAME WRAPPER ─────────────────────────────────────────────────── */
        var wrap = document.createElement('div');
        wrap.id = 'helkrypt-chat-iframe-wrap';
        wrap.classList.add('helkrypt-hidden');

        var iframe = document.createElement('iframe');
        iframe.src = CHAT_URL;
        iframe.title = _chatTitle + ' Chat';
        iframe.setAttribute('allow', 'clipboard-write');
        iframe.setAttribute('loading', 'lazy');
        wrap.appendChild(iframe);
        document.body.appendChild(wrap);

        /* ── OPEN / CLOSE ───────────────────────────────────────────────────── */
        function openChat() {
            isOpen = true;
            wrap.classList.remove('helkrypt-hidden');
            bubble.classList.add('helkrypt-hidden');
            hideTooltip();
            try { iframe.contentWindow.postMessage({ type: 'helkrypt-open' }, '*'); } catch (e) { }
        }

        function closeChat() {
            isOpen = false;
            wrap.classList.add('helkrypt-hidden');
            bubble.classList.remove('helkrypt-hidden');
        }

        /* ── TOOLTIP ────────────────────────────────────────────────────────── */
        var tooltipTimer;

        function showTooltip() { tooltip.classList.remove('helkrypt-hidden'); }
        function hideTooltip() { tooltip.classList.add('helkrypt-hidden'); clearTimeout(tooltipTimer); }

        showTooltip();
        tooltipTimer = setTimeout(function () { if (!isOpen) hideTooltip(); }, 6000);

        /* ── CLICK HANDLERS ─────────────────────────────────────────────────── */
        bubble.addEventListener('click', function () { if (!isOpen) openChat(); });
        tooltip.addEventListener('click', function () { if (!isOpen) openChat(); });

        /* ── MESSAGES FROM IFRAME ───────────────────────────────────────────── */
        window.addEventListener('message', function (event) {
            try {
                if (event.origin !== new URL(CHAT_URL).origin) return;
            } catch (e) { return; }
            var data = event.data;
            if (!data || typeof data !== 'object') return;
            if (data.type === 'helkrypt-close') closeChat();
            if (data.type === 'helkrypt-open') openChat();
        });

        /* ── AUTO-OPEN (desktop only) ───────────────────────────────────────── */
        var isMobile = window.matchMedia('(max-width: 900px)').matches;
        if (!isMobile) {
            setTimeout(function () {
                if (!isOpen) { hideTooltip(); openChat(); }
            }, AUTO_OPEN_DELAY);
        }

        /* ── WATCHDOG: re-check visibility after 2 s ────────────────────────── */
        setTimeout(function () {
            var b = document.getElementById('helkrypt-chat-bubble');
            if (!b) {
                // Something removed our element – rebuild once
                window.__helkryptLoaded = false;
                init();
                return;
            }
            // Force visibility in case a plugin hid it
            if (!isOpen) {
                b.style.setProperty('display', 'flex', 'important');
                b.style.setProperty('opacity', '1', 'important');
                b.style.setProperty('visibility', 'visible', 'important');
                b.style.setProperty('z-index', '2147483646', 'important');
            }
        }, 2000);
    }

})();
