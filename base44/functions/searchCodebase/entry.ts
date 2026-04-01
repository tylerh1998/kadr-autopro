import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { walk } from "https://deno.land/std@0.170.0/fs/walk.ts";

Deno.serve(async (req) => {
    try {
        const results = [];
        for await (const entry of walk("/app/src", { exts: [".js", ".jsx"] })) {
            const content = await Deno.readTextFile(entry.path);
            if (content.includes("InventoryItem")) {
                // Find line numbers
                const lines = content.split("\n");
                lines.forEach((line, i) => {
                    if (line.includes("InventoryItem") && !line.includes("SupabaseProxy") && !line.includes("supabase.from('InventoryItem')")) {
                        results.push({ file: entry.path, line: i + 1, content: line.trim() });
                    }
                });
            }
        }
        return Response.json({ results });
    } catch (e) {
        return Response.json({ error: e.message }, { status: 500 });
    }
});