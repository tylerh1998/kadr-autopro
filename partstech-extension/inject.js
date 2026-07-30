// This runs in the actual PartsTech page context
const originalFetch = window.fetch;

window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    
    try {
        const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
        
        // We only care about GraphQL or Cart requests
        if (url.includes('/graphql') || url.includes('/carts') || url.includes('/quotes') || url.includes('api.partstech.com')) {
            const clone = response.clone();
            clone.json().then(data => {
                // Send it to content.js
                window.postMessage({ 
                    type: 'PT_API_INTERCEPT', 
                    payload: data,
                    url: url
                }, '*');
            }).catch(e => {});
        }
    } catch (e) {
        // Ignore parsing errors
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
