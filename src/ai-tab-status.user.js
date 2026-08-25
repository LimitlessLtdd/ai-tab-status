// ==UserScript==
// @name         AI Tab Status - ChatGPT + Claude Code
// @namespace    https://github.com/LimitlessLtdd/ai-tab-status
// @version      1.0.0
// @description  See at a glance when ChatGPT or Claude Code is working or really done. Favicon status + completion sound.
// @author       LimitlessLtdd
// @license      MIT
// @match        https://chatgpt.com/*
// @match        https://claude.ai/*
// @run-at       document-idle
// @grant        none
// @homepageURL  https://github.com/LimitlessLtdd/ai-tab-status
// @supportURL   https://github.com/LimitlessLtdd/ai-tab-status/issues
// @downloadURL  https://raw.githubusercontent.com/LimitlessLtdd/ai-tab-status/main/src/ai-tab-status.user.js
// @updateURL    https://raw.githubusercontent.com/LimitlessLtdd/ai-tab-status/main/src/ai-tab-status.user.js
// ==/UserScript==

(() => {
    'use strict';

    // ============================================================
    // CONFIGURATION
    // ============================================================

    const CHECK_INTERVAL_MS = 250;
    const FINISH_CONFIRMATIONS = 4;
    const FAVICON_CHECK_INTERVAL_MS = 1000;

    const COLORS = {
        READY: '#6b7280',
        WORKING: '#f59e0b',
        FINISHED: '#22c55e',
    };

    const DEBUG = false;

    // ============================================================
    // ENVIRONMENT
    // ============================================================

    const isFirefox = /Firefox\//i.test(navigator.userAgent);
    const isChatGPT = location.hostname === 'chatgpt.com';
    const isClaude = location.hostname === 'claude.ai';

    function isClaudeCodePage() {
        return (
            location.hostname === 'claude.ai' &&
            (location.pathname === '/code' || location.pathname.startsWith('/code/'))
        );
    }

    const AI = isChatGPT
        ? {
            name: 'ChatGPT',
            letter: 'G',
            frequencies: [784, 988],
        }
        : {
            name: 'Claude',
            letter: 'C',
            frequencies: [523, 659],
        };

    // ============================================================
    // INTERNAL STATE
    // ============================================================

    let initialized = false;
    let working = false;
    let finishChecks = 0;
    let currentState = null;
    let currentFavicon = null;
    let audioContext = null;

    // This userscript intentionally NEVER modifies document.title.

    // ============================================================
    // DOM HELPERS
    // ============================================================

    function isVisible(element) {
        if (!element) {
            return false;
        }

        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    function normalizeText(value) {
        return String(value ?? '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    // ============================================================
    // CHATGPT DETECTION
    // ============================================================

    function detectChatGPTWorking() {
        const selectors = [
            '[data-testid="stop-button"]',
            'button[data-testid="stop-button"]',
            'button[aria-label="Stop generating"]',
            'button[aria-label="Stop streaming"]',
            'button[aria-label="Arrêter la génération"]',
            'button[aria-label="Arrêter de générer"]',
        ];

        for (const selector of selectors) {
            try {
                for (const element of document.querySelectorAll(selector)) {
                    if (isVisible(element)) {
                        return true;
                    }
                }
            } catch {
                // A DOM change must not stop the userscript.
            }
        }

        return false;
    }

    // ============================================================
    // CLAUDE CHAT DETECTION
    // ============================================================

    function detectClaudeChatWorking() {
        const selectors = [
            'button[aria-label="Stop response"]',
            'button[aria-label="Stop generating"]',
            'button[aria-label="Arrêter la réponse"]',
            'button[aria-label="Arrêter la génération"]',
            '[data-is-streaming="true"]',
        ];

        for (const selector of selectors) {
            try {
                for (const element of document.querySelectorAll(selector)) {
                    if (isVisible(element)) {
                        return true;
                    }
                }
            } catch {
                // A DOM change must not stop the userscript.
            }
        }

        return false;
    }

    // ============================================================
    // CLAUDE CODE / REMOTE CONTROL DETECTION
    // ============================================================

    function detectClaudeCodeMainTask() {
        // Exact marker observed while Claude Code is actively working.
        // Presence is enough; Firefox can report unreliable dimensions
        // after tab restoration, so this intentionally avoids isVisible().
        return Boolean(
            document.querySelector('[data-testid="code-prompt-stop"]')
        );
    }

    function detectClaudeCodeBackgroundTasks() {
        const transcript = document.querySelector(
            '[data-testid="epitaxy-virtual-transcript"]'
        );

        if (!transcript) {
            return false;
        }

        const patterns = [
            /^\d+\s+tâche\s+en\s+cours$/i,
            /^\d+\s+tâches\s+en\s+cours$/i,
            /^\d+\s+task\s+running$/i,
            /^\d+\s+tasks\s+running$/i,
            /^\d+\s+task\s+in\s+progress$/i,
            /^\d+\s+tasks\s+in\s+progress$/i,
        ];

        const candidates = transcript.querySelectorAll(
            'button, [role="button"], [role="status"]'
        );

        for (const element of candidates) {
            const text = normalizeText(element.textContent);

            if (text && patterns.some((pattern) => pattern.test(text))) {
                return true;
            }
        }

        return false;
    }

    function getClaudeCodeState() {
        if (detectClaudeCodeMainTask()) {
            return 'WORKING';
        }

        // Claude may have returned an intermediate response while a shell
        // command or other background task is still running. That is NOT done.
        if (detectClaudeCodeBackgroundTasks()) {
            return 'WORKING';
        }

        // Exact marker observed after Claude Code returns to the prompt.
        // disabled=true is valid when the prompt is empty and is ignored.
        if (document.querySelector('[data-testid="code-prompt-send"]')) {
            return 'IDLE';
        }

        return 'UNKNOWN';
    }

    // ============================================================
    // FAVICON DRAWING
    // ============================================================

    function createPngFavicon(color) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;

        const ctx = canvas.getContext('2d');

        ctx.beginPath();
        ctx.arc(32, 32, 29, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        ctx.lineWidth = 4;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 34px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(AI.letter, 32, 34);

        return canvas.toDataURL('image/png');
    }

    function createSvgFavicon(color) {
        const nonce = `${Date.now()}-${Math.random()}`;
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
                <!-- ${nonce} -->
                <circle cx="32" cy="32" r="29" fill="${color}" stroke="#ffffff" stroke-width="4" />
                <text x="32" y="34" text-anchor="middle" dominant-baseline="middle"
                    font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#ffffff">${AI.letter}</text>
            </svg>
        `;

        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }

    // ============================================================
    // FIREFOX FAVICON STRATEGY
    // ============================================================

    function installFirefoxFavicon(url) {
        document
            .querySelectorAll('link[data-ai-tab-status]')
            .forEach((element) => element.remove());

        const icon = document.createElement('link');
        icon.rel = 'icon';
        icon.type = 'image/png';
        icon.href = url;
        icon.dataset.aiTabStatus = 'true';

        document.head.appendChild(icon);
    }

    function ensureFirefoxFavicon() {
        if (!currentFavicon) {
            return;
        }

        const ourIcon = document.querySelector('link[data-ai-tab-status]');

        if (!ourIcon) {
            installFirefoxFavicon(currentFavicon);
            return;
        }

        const icons = [...document.querySelectorAll('link[rel~="icon"]')];

        if (icons.length && icons[icons.length - 1] !== ourIcon) {
            ourIcon.remove();
            document.head.appendChild(ourIcon);
        }
    }

    // ============================================================
    // CHROMIUM / BRAVE FAVICON STRATEGY
    // ============================================================

    function removeChromiumFavicons() {
        document
            .querySelectorAll(
                [
                    'link[rel="icon"]',
                    'link[rel="shortcut icon"]',
                    'link[rel="apple-touch-icon"]',
                    'link[rel="apple-touch-icon-precomposed"]',
                ].join(',')
            )
            .forEach((element) => element.remove());
    }

    function installChromiumFavicon(url) {
        removeChromiumFavicons();

        const icon = document.createElement('link');
        icon.rel = 'icon';
        icon.type = 'image/svg+xml';
        icon.href = url;
        icon.dataset.aiTabStatus = 'true';
        document.head.appendChild(icon);

        const shortcut = document.createElement('link');
        shortcut.rel = 'shortcut icon';
        shortcut.type = 'image/svg+xml';
        shortcut.href = url;
        shortcut.dataset.aiTabStatus = 'true';
        document.head.appendChild(shortcut);
    }

    function ensureChromiumFavicon() {
        if (!currentFavicon) {
            return;
        }

        const allIcons = [
            ...document.querySelectorAll(
                'link[rel="icon"], link[rel="shortcut icon"]'
            ),
        ];

        const ours = allIcons.filter(
            (element) => element.dataset.aiTabStatus === 'true'
        );

        const foreign = allIcons.filter(
            (element) => element.dataset.aiTabStatus !== 'true'
        );

        if (ours.length !== 2 || foreign.length > 0) {
            installChromiumFavicon(currentFavicon);
        }
    }

    function applyFavicon(color) {
        currentFavicon = isFirefox
            ? createPngFavicon(color)
            : createSvgFavicon(color);

        if (isFirefox) {
            installFirefoxFavicon(currentFavicon);
        } else {
            installChromiumFavicon(currentFavicon);
        }
    }

    function ensureFavicon() {
        if (isFirefox) {
            ensureFirefoxFavicon();
        } else {
            ensureChromiumFavicon();
        }
    }

    function setState(state) {
        if (currentState === state) {
            return;
        }

        currentState = state;

        switch (state) {
            case 'WORKING':
                applyFavicon(COLORS.WORKING);
                break;
            case 'FINISHED':
                applyFavicon(COLORS.FINISHED);
                break;
            case 'READY':
            default:
                applyFavicon(COLORS.READY);
                break;
        }

        if (DEBUG) {
            console.debug(`[AI Tab Status] ${AI.name}: ${state}`);
        }
    }

    // ============================================================
    // COMPLETION SOUND
    // ============================================================

    function initializeAudio() {
        if (audioContext) {
            return;
        }

        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioContext = new AudioContext();
        } catch {
            audioContext = null;
        }
    }

    async function unlockAudio() {
        initializeAudio();

        if (audioContext?.state === 'suspended') {
            try {
                await audioContext.resume();
            } catch {
                // Audio is optional and must never break state tracking.
            }
        }
    }

    document.addEventListener('pointerdown', unlockAudio, {
        once: true,
        capture: true,
    });

    document.addEventListener('keydown', unlockAudio, {
        once: true,
        capture: true,
    });

    async function playFinishedSound() {
        initializeAudio();

        if (!audioContext) {
            return;
        }

        try {
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }

            const now = audioContext.currentTime;

            AI.frequencies.forEach((frequency, index) => {
                const oscillator = audioContext.createOscillator();
                const gain = audioContext.createGain();

                const start = now + index * 0.16;
                const end = start + 0.13;

                oscillator.type = 'sine';
                oscillator.frequency.value = frequency;

                gain.gain.setValueAtTime(0.0001, start);
                gain.gain.exponentialRampToValueAtTime(0.15, start + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, end);

                oscillator.connect(gain);
                gain.connect(audioContext.destination);

                oscillator.start(start);
                oscillator.stop(end + 0.02);
            });
        } catch {
            // Audio is optional and must never break state tracking.
        }
    }

    // ============================================================
    // STATE MACHINES
    // ============================================================

    function checkClaudeCode() {
        const state = getClaudeCodeState();

        if (!initialized) {
            initialized = true;
            working = state === 'WORKING';
            setState(working ? 'WORKING' : 'READY');
            return;
        }

        if (state === 'WORKING') {
            finishChecks = 0;

            if (!working) {
                working = true;
                setState('WORKING');
            }

            return;
        }

        if (state === 'UNKNOWN') {
            finishChecks = 0;
            return;
        }

        if (state === 'IDLE' && working) {
            finishChecks += 1;

            if (finishChecks < FINISH_CONFIRMATIONS) {
                return;
            }

            finishChecks = 0;
            working = false;
            setState('FINISHED');
            playFinishedSound();
        }
    }

    function checkClassicChat() {
        const generating = isChatGPT
            ? detectChatGPTWorking()
            : detectClaudeChatWorking();

        if (!initialized) {
            initialized = true;
            working = generating;
            setState(generating ? 'WORKING' : 'READY');
            return;
        }

        if (generating) {
            finishChecks = 0;

            if (!working) {
                working = true;
                setState('WORKING');
            }

            return;
        }

        if (!working) {
            return;
        }

        finishChecks += 1;

        if (finishChecks < FINISH_CONFIRMATIONS) {
            return;
        }

        finishChecks = 0;
        working = false;
        setState('FINISHED');
        playFinishedSound();
    }

    function checkStatus() {
        if (isClaudeCodePage()) {
            checkClaudeCode();
        } else {
            checkClassicChat();
        }
    }

    // React/SPA transitions can happen faster than the polling interval.
    const observer = new MutationObserver(() => {
        checkStatus();
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });

    checkStatus();

    window.setInterval(checkStatus, CHECK_INTERVAL_MS);
    window.setInterval(ensureFavicon, FAVICON_CHECK_INTERVAL_MS);
})();
