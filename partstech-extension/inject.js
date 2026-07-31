console.log("🚀 [PartsTech Ext] Inject Script successfully loaded!");

// Let's also just check if the store is exposed globally
setTimeout(() => {
    if (window.store) {
        console.log("🚀 [PartsTech Ext] FOUND window.store!", window.store.getState());
    }
    if (window.__REDUX_DEVTOOLS_EXTENSION__) {
        console.log("🚀 [PartsTech Ext] FOUND Redux DevTools!");
    }
}, 2000);

const originalFetch = window.fetch;

window.fetch = async function(...args) {
    const urlString = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
    const response = await originalFetch.apply(this, args);
    
    try {
        const urlObj = new URL(urlString, window.location.href);
        // Only intercept requests going to PartsTech domains, and ignore tracking
        if (urlObj.hostname.includes('partstech.com') && (urlObj.pathname.includes('graphql') || urlObj.pathname.includes('cart') || urlObj.pathname.includes('api'))) {
            
            console.log("🚀 [PartsTech Ext] Intercepted PT API:", urlObj.href);
            
            const clone = response.clone();
            clone.text().then(text => {
                if (!text) return; // ignore empty responses
                try {
                    const data = JSON.parse(text);
                    console.log("🚀 [PartsTech Ext] Extracted JSON!", data);
                    // Send it to content.js
                    window.postMessage({ 
                        type: 'PT_API_INTERCEPT', 
                        payload: data,
                        url: urlObj.href
                    }, '*');
                } catch(e) {
                    console.log("🚀 [PartsTech Ext] Response was not JSON:", text.substring(0, 50));
                }
            }).catch(e => {
                console.log("🚀 [PartsTech Ext] Failed to read response text", e);
            });
        }
    } catch (e) {
        // Ignore URL parsing errors
    }
    
    return response;
};

// Also intercept XMLHttpRequest just in case they use Axios without the fetch adapter
const originalXHR = window.XMLHttpRequest.prototype.open;
window.XMLHttpRequest.prototype.open = function(method, url) {
    this.addEventListener('load', function() {
        if (typeof url === 'string' && (url.includes('/graphql') || url.includes('/carts') || url.includes('/quotes') || url.includes('api.partstech.com'))) {
            try {
                const data = JSON.parse(this.responseText);
                window.postMessage({ 
                    type: 'PT_API_INTERCEPT', 
                    payload: data,
                    url: url
                }, '*');
            } catch(e) {}
        }
    });
    originalXHR.apply(this, arguments);
};
