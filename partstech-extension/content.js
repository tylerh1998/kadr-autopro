console.log("🚀 [PartsTech Ext] Content Script loaded into frame:", window.location.href);

// Inject the interceptor into the main page world
const s = document.createElement('script');
s.src = chrome.runtime.getURL('inject.js');
s.onload = function() {
    console.log("🚀 [PartsTech Ext] Successfully injected inject.js");
    this.remove();
};
(document.head || document.documentElement).appendChild(s);

// Listen for intercepted API data from inject.js
window.addEventListener('message', function(e) {
    // Only accept messages from the same window
    if (e.source !== window) return;
    
    if (e.data && e.data.type === 'PT_API_INTERCEPT') {
        console.log("🚀 [PartsTech Ext] Forwarding intercepted data for:", e.data.url);
        // Send this raw data up to the parent window (test.kensauto.ca)
        // so the Supabase app can parse it and add it to the work order!
        window.parent.postMessage({
            type: 'PARTSTECH_EXT_DATA',
            payload: e.data.payload,
            url: e.data.url
        }, '*');
    }
});

// Listen for a direct request from the parent window to scrape the page text
window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'REQUEST_CART_TEXT') {
        console.log("🚀 [PartsTech Ext] Received request for page text. Extracting innerText...");
        
        // Grab the full visible text of the PartsTech page
        const rawText = document.body.innerText || "";
        
        window.parent.postMessage({
            type: 'PARTSTECH_EXT_TEXT',
            payload: rawText,
            url: window.location.href
        }, '*');
    }
});
