// Inject the interceptor into the main page world
const s = document.createElement('script');
s.src = chrome.runtime.getURL('inject.js');
s.onload = function() {
    this.remove();
};
(document.head || document.documentElement).appendChild(s);

// Listen for intercepted API data from inject.js
window.addEventListener('message', function(e) {
    // Only accept messages from the same window
    if (e.source !== window) return;
    
    if (e.data && e.data.type === 'PT_API_INTERCEPT') {
        // Send this raw data up to the parent window (test.kensauto.ca)
        // so the Supabase app can parse it and add it to the work order!
        window.parent.postMessage({
            type: 'PARTSTECH_EXT_DATA',
            payload: e.data.payload,
            url: e.data.url
        }, '*');
    }
});
