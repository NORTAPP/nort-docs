"use strict";

/* ====== Define JS Constants ====== */
const sidebarToggler = document.getElementById('docs-sidebar-toggler');
const sidebar        = document.getElementById('docs-sidebar');
const sidebarLinks   = document.querySelectorAll('#docs-sidebar .scrollto');

/* ===== Responsive Sidebar ====== */
window.onload  = function() { responsiveSidebar(); };
window.onresize = function() { responsiveSidebar(); };

function isDesktop() { return window.innerWidth >= 1200; }

function responsiveSidebar() {
    if (isDesktop()) {
        sidebar.classList.remove('sidebar-hidden');
        sidebar.classList.add('sidebar-visible');
        sidebar.style.display = '';   // always show on desktop
    } else {
        sidebar.classList.remove('sidebar-visible');
        sidebar.classList.add('sidebar-hidden');
    }
}

sidebarToggler.addEventListener('click', () => {
    // Only allow toggling on mobile (< 1200px)
    if (window.innerWidth >= 1200) return;
    if (sidebar.classList.contains('sidebar-visible')) {
        sidebar.classList.remove('sidebar-visible');
        sidebar.classList.add('sidebar-hidden');
    } else {
        sidebar.classList.remove('sidebar-hidden');
        sidebar.classList.add('sidebar-visible');
    }
});

/* ===== Smooth scrolling ====== */
sidebarLinks.forEach((sidebarLink) => {
    sidebarLink.addEventListener('click', (e) => {
        e.preventDefault();

        // Immediately apply active highlight on click
        document.querySelectorAll('#docs-nav .nav-link').forEach(l => l.classList.remove('active'));
        sidebarLink.classList.add('active');

        // If clicking a section title, that's sufficient
        // If clicking a sub-item, also highlight its parent section
        var href = sidebarLink.getAttribute('href') || '';
        if (href.indexOf('item-') !== -1) {
            var parts = href.replace('#item-', '').split('-');
            var sectionLink = document.querySelector('#docs-nav a[href="#section-' + parts[0] + '"]');
            if (sectionLink) sectionLink.classList.add('active');
        }

        var target = href.replace('#', '');
        var el = document.getElementById(target);
        if (el) el.scrollIntoView({ behavior: 'smooth' });

        // Only close sidebar on mobile after clicking a link
        if (!isDesktop() && sidebar.classList.contains('sidebar-visible')) {
            sidebar.classList.remove('sidebar-visible');
            sidebar.classList.add('sidebar-hidden');
        }
    });
});

/* ===== Gumshoe ScrollSpy ===== */
var spy = new Gumshoe('#docs-nav a', {
    offset: 80,
    reflow: true,
    events: true
});

// When Gumshoe marks a link active, also highlight the parent section title
document.addEventListener('gumshoeActivate', function (e) {
    // Remove all active states first
    document.querySelectorAll('#docs-nav .nav-link').forEach(function(l) {
        l.classList.remove('active');
    });

    var activeLink = e.detail.link;
    if (!activeLink) return;

    // Mark the active link
    activeLink.classList.add('active');

    // If it's a sub-item (href="#item-X-X"), find and also highlight its section title
    var href = activeLink.getAttribute('href') || '';
    if (href.indexOf('item-') !== -1) {
        // e.g. #item-3-2 → section prefix is "section-3"
        var parts = href.replace('#item-', '').split('-');
        var sectionId = '#section-' + parts[0];
        var sectionLink = document.querySelector('#docs-nav a[href="' + sectionId + '"]');
        if (sectionLink) sectionLink.classList.add('active');
    }
}, false);

// Also handle deactivate to cleanly remove stale active states
document.addEventListener('gumshoeDeactivate', function (e) {
    var link = e.detail.link;
    if (link) link.classList.remove('active');
}, false);

/* ====== SimpleLightbox ======= */
var lightbox = new SimpleLightbox('.simplelightbox-gallery a', {});


/* ===================================================
   SEARCH — client-side full-text search with live suggestions
   Scans every heading, paragraph, li, td, th in
   .docs-content, highlights matches, shows a floating
   results panel with live suggestions as you type.
   =================================================== */
(function () {

    // ── build the results panel once ──────────────────
    const panel = document.createElement('div');
    panel.id = 'nort-search-panel';
    panel.style.cssText = [
        'display:none',
        'position:fixed',
        'top:70px',
        'right:24px',
        'width:360px',
        'max-height:520px',
        'overflow-y:auto',
        'z-index:9999',
        'background:rgba(10,22,40,0.97)',
        'border:1px solid rgba(45,212,191,0.35)',
        'border-radius:12px',
        'box-shadow:0 8px 48px rgba(0,0,0,0.6)',
        'padding:16px',
        'backdrop-filter:blur(24px)'
    ].join(';');
    document.body.appendChild(panel);

    // close panel when clicking outside
    document.addEventListener('click', (e) => {
        if (!panel.contains(e.target) && !e.target.closest('.search-form')) {
            closePanel();
        }
    });

    function closePanel() {
        panel.style.display = 'none';
        clearHighlights();
    }


    // ── highlight helpers ──────────────────────────────
    function highlightNode(node, regex) {
        if (node.nodeType === 3) {
            const text = node.nodeValue;
            if (!regex.test(text)) return null;
            regex.lastIndex = 0;
            const frag = document.createDocumentFragment();
            let last = 0, m;
            while ((m = regex.exec(text)) !== null) {
                frag.appendChild(document.createTextNode(text.slice(last, m.index)));
                const mark = document.createElement('mark');
                mark.className = 'nort-highlight';
                mark.style.cssText = 'background:rgba(45,212,191,0.35);color:#fff;border-radius:3px;padding:0 2px';
                mark.textContent = m[0];
                frag.appendChild(mark);
                last = m.index + m[0].length;
            }
            frag.appendChild(document.createTextNode(text.slice(last)));
            node.parentNode.replaceChild(frag, node);
            return true;
        }
        return null;
    }

    function walkAndHighlight(el, regex) {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
        const nodes = [];
        let n;
        while ((n = walker.nextNode())) nodes.push(n);
        nodes.forEach(n => highlightNode(n, regex));
    }

    function clearHighlights() {
        document.querySelectorAll('mark.nort-highlight').forEach(mark => {
            const parent = mark.parentNode;
            parent.replaceChild(document.createTextNode(mark.textContent), mark);
            parent.normalize();
        });
    }


    // ── collect all searchable content once ───────────
    function getSearchIndex() {
        const content = document.querySelector('.docs-content');
        if (!content) return [];
        const els = content.querySelectorAll('h1,h2,h3,h4,h5,p,li,td,th');
        const index = [];
        els.forEach(el => {
            const text = (el.textContent || '').trim();
            if (text.length < 3) return;
            const section = el.closest('[id]');
            const id = section ? section.id : null;
            // grab the nearest heading for context label
            let heading = '';
            let prev = el.previousElementSibling || el.parentElement;
            for (let i = 0; i < 8 && prev; i++) {
                if (/^H[1-5]$/.test(prev.tagName)) { heading = prev.textContent.trim(); break; }
                prev = prev.previousElementSibling || prev.parentElement;
            }
            const snippet = text.length > 130 ? text.slice(0, 130) + '…' : text;
            index.push({ el, id, snippet, text, heading, tag: el.tagName });
        });
        return index;
    }

    let searchIndex = null;

    // ── build suggestions (live, as-you-type) ─────────
    function runSuggestions(query) {
        clearHighlights();
        panel.style.display = 'none';
        const q = query.trim();
        if (q.length < 2) return;

        if (!searchIndex) searchIndex = getSearchIndex();

        const terms = q.split(/\s+/).filter(Boolean);
        const regex = new RegExp('(' + terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');

        const hits = [];
        searchIndex.forEach(item => {
            regex.lastIndex = 0;
            if (regex.test(item.text)) hits.push(item);
        });

        buildPanel(q, hits, terms, /*fullSearch=*/false);
    }


    // ── full search (on Enter / submit) ───────────────
    function runSearch(query) {
        clearHighlights();
        panel.style.display = 'none';
        const q = query.trim();
        if (q.length < 2) return;

        if (!searchIndex) searchIndex = getSearchIndex();

        const terms = q.split(/\s+/).filter(Boolean);
        const regex = new RegExp('(' + terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');

        const hits = [];
        searchIndex.forEach(item => {
            regex.lastIndex = 0;
            if (regex.test(item.text)) hits.push(item);
        });

        // highlight in page
        const content = document.querySelector('.docs-content');
        if (content) {
            regex.lastIndex = 0;
            walkAndHighlight(content, new RegExp('(' + terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi'));
        }

        buildPanel(q, hits, terms, /*fullSearch=*/true);

        // scroll to first hit
        if (hits.length > 0) {
            hits[0].el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }


    // ── build the results panel UI ────────────────────
    function buildPanel(query, hits, terms, fullSearch) {
        panel.innerHTML = '';

        // deduplicate by section id
        const seen = new Set();
        const unique = hits.filter(h => {
            const key = h.id || h.snippet.slice(0, 40);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, fullSearch ? 12 : 6);

        // header row
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px';
        const title = document.createElement('span');
        title.style.cssText = 'font-family:"DM Mono",monospace;font-size:10px;letter-spacing:0.6px;text-transform:uppercase;color:#2DD4BF';
        title.textContent = unique.length > 0
            ? (fullSearch ? hits.length : unique.length) + ' result' + (hits.length !== 1 ? 's' : '') + ' for "' + query + '"'
            : 'No results for "' + query + '"';
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'background:none;border:none;color:rgba(255,255,255,0.5);cursor:pointer;font-size:14px;padding:0;line-height:1';
        closeBtn.addEventListener('click', closePanel);
        header.appendChild(title);
        header.appendChild(closeBtn);
        panel.appendChild(header);

        if (unique.length === 0) {
            const empty = document.createElement('p');
            empty.style.cssText = 'color:rgba(255,255,255,0.5);font-size:13px;margin:8px 0 0';
            empty.textContent = 'Try a different search term.';
            panel.appendChild(empty);
        } else {
            unique.forEach(hit => {
                const item = document.createElement('div');
                item.style.cssText = [
                    'padding:10px 12px',
                    'margin-bottom:6px',
                    'border-radius:8px',
                    'background:rgba(255,255,255,0.04)',
                    'border:1px solid rgba(255,255,255,0.07)',
                    'cursor:pointer',
                    'transition:border-color 0.15s'
                ].join(';');
                item.addEventListener('mouseenter', () => item.style.borderColor = 'rgba(45,212,191,0.4)');
                item.addEventListener('mouseleave', () => item.style.borderColor = 'rgba(255,255,255,0.07)');


                // heading label (section context)
                if (hit.heading) {
                    const label = document.createElement('div');
                    label.style.cssText = 'font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:#2DD4BF;margin-bottom:4px;opacity:0.7';
                    label.textContent = hit.heading;
                    item.appendChild(label);
                }

                const snippetEl = document.createElement('p');
                snippetEl.style.cssText = 'margin:0;font-size:12px;color:rgba(255,255,255,0.75);line-height:1.5';
                snippetEl.innerHTML = hit.snippet.replace(
                    new RegExp('(' + terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi'),
                    '<strong style="color:#2DD4BF">$1</strong>'
                );
                item.appendChild(snippetEl);

                item.addEventListener('click', () => {
                    hit.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    closePanel();
                    hit.el.style.transition = 'background 0.3s';
                    hit.el.style.background = 'rgba(45,212,191,0.08)';
                    setTimeout(() => { hit.el.style.background = ''; }, 1800);
                });
                panel.appendChild(item);
            });

            // hint to press Enter for full search (only in suggestion mode)
            if (!fullSearch) {
                const hint = document.createElement('div');
                hint.style.cssText = 'text-align:center;margin-top:8px;font-size:10px;color:rgba(255,255,255,0.3)';
                hint.textContent = 'Press Enter to search all results';
                panel.appendChild(hint);
            }
        }

        panel.style.display = 'block';
    }


    // ── debounce helper ────────────────────────────────
    function debounce(fn, ms) {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), ms);
        };
    }

    const debouncedSuggest = debounce(runSuggestions, 180);

    // ── wire up both search forms (header + sidebar) ──
    document.querySelectorAll('.search-form').forEach(form => {
        const input = form.querySelector('.search-input');

        // submit / Enter → full search
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            if (input) runSearch(input.value);
        });

        if (input) {
            // live suggestions as user types
            input.addEventListener('input', () => {
                const val = input.value.trim();
                if (val === '') {
                    clearHighlights();
                    panel.style.display = 'none';
                } else {
                    debouncedSuggest(val);
                }
            });

            // Enter key triggers full search
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    runSearch(input.value);
                }
                // Escape closes panel
                if (e.key === 'Escape') {
                    closePanel();
                    input.blur();
                }
            });
        }
    });

})(); // end search IIFE

// ── auto-run search from URL ?q= param (from index.html) ──
(function() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (q && q.trim().length >= 2) {
        // pre-fill all search inputs and run search
        document.querySelectorAll('.search-input').forEach(i => i.value = q);
        // slight delay to ensure DOM is ready
        setTimeout(function() {
            const event = new Event('submit', { bubbles: true, cancelable: true });
            const form = document.querySelector('.search-form');
            if (form) form.dispatchEvent(event);
        }, 300);
    }
})();
