Deno.serve((req) => {
    console.log("--- Minimal Test Function: START ---");
    try {
        console.log("--- Minimal Test Function: Request received for URL:", req.url);
        return new Response("OK", { 
            status: 200,
            headers: { "Content-Type": "text/plain" }
        });
    } catch (e) {
        console.error("--- Minimal Test Function: CRITICAL ERROR ---", e.message);
        return new Response("Error", { status: 500 });
    }
});