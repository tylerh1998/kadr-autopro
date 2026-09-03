import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { encodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Response helper ensuring 200 OK with { error: string } pattern per master_context.md
const jsonResponse = (data: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(data), {
    status: 200, // Always 200 so Supabase JS client doesn't swallow JSON error bodies
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Decodes JWT payload directly without external network call
const decodeJwtPayload = (token: string): any => {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  try {
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
};

const hasStrongAuth = (claims: any): boolean => {
  if (!claims) return false;
  if (claims.aal === 'aal2') return true;
  const amr = Array.isArray(claims.amr) ? claims.amr : [];
  return amr.some((entry: any) => {
    const method = (entry?.method || '').toLowerCase();
    return method.includes('webauthn') || method.includes('passkey');
  });
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Authentication required" });
    }

    const token = authHeader.replace("Bearer ", "");
    const claims = decodeJwtPayload(token);
    if (!claims) {
      return jsonResponse({ error: "Invalid authorization token" });
    }

    // Gated on strong auth (AAL2 or passkey)
    if (!hasStrongAuth(claims)) {
      return jsonResponse({ error: "AAL2 or passkey authentication required to access PayPRO OCR." });
    }

    const body = await req.json().catch(() => ({}));
    const { pdfData, mimeType = "application/pdf", driverNameHint, monthHint } = body;

    if (!pdfData) {
      return jsonResponse({ error: "Missing pdfData in request body." });
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return jsonResponse({ error: "GEMINI_API_KEY is not configured on the server." });
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;

    const prompt = `You are a specialized parser for Alberta Commercial School Bus "Driver Duty Record (Time Sheet/Daily Log)" documents used by Ken's Auto / Buffalo Trail Public Schools (BTPS).

Analyze this monthly driver log document carefully. The document contains handwritten rows for each day of the month (Days 1 to 31), columns for Shift Start/End times (AM and PM), Total On-Duty Time, Description (regular run, field trip, servicing), Unit #, and bottom summary notes.

Extract the following information with maximum precision:

1. **Header Information**:
   - "driver_name": Extracted driver name (e.g., "Cheryl Lawrence", "Anne Fehr"). If unclear, use hint: "${driverNameHint || ''}".
   - "carrier_name": Extracted carrier name (e.g. "Ken's Auto", "Ken's Auto & Diesel Repair").
   - "month_year_text": Extracted month and year text (e.g. "March, 2026", "12/2025", "Dec, 2025").
   - "year": 4-digit integer year (e.g. 2026).
   - "month": 1-indexed integer month (1 to 12).
   - "date_signed": Date written next to Driver Signature at the bottom, if present.

2. **Field Trips & Special Extra Runs (CRITICAL - WAIT TIME INCLUDED)**:
   Under our new pay model, regular daily school route runs are covered by a fixed monthly salary, BUT all Field Trips and special extra runs are paid hourly ($25.00/hr).
   Look through every day's Description column and shift times for entries indicating field trips, swim lessons, ski trips, auction mart trips, sports trips, or extra non-route duties:
   - Examples of field trip descriptions:
     * "Reg Run - Ski Trip 9-10:34 3:30 5:33"
     * "FIELD TRIP 11:55-12:38 2:40-3:16 Vermilion Auction Mart"
     * "Swim Lessons - Lloyd (4.5 hr) 11:50-12:50 2:40-3:32"
     * "Swim Lessons - Lloyd 12:00-12:50 2:36-3:27"
   - **CRITICAL WAIT TIME RULE FOR FIELD TRIPS**:
     Drivers record ONLY their active driving shift intervals on this sheet due to commercial vehicle Hours of Service logging rules (e.g. logging "11:55-12:38" for driving there and "2:40-3:16" for driving back).
     HOWEVER, school bus drivers are compensated for the ENTIRE continuous duration including wait time from first departure to final return!
     Therefore:
     * "start_time": First departure time (e.g. "11:55 AM" or "9:00 AM").
     * "end_time": Final return arrival time (e.g. "3:16 PM" or "5:33 PM").
     * "driving_intervals": Text of driving intervals logged (e.g. "11:55-12:38, 2:40-3:16").
     * "time_breakdown": Full span summary, e.g. "11:55 AM - 3:16 PM (Wait time included; Drive: 11:55-12:38, 2:40-3:16)".
     * "hours": Calculate total continuous elapsed decimal hours from the FIRST departure time to the FINAL return time!
       - Example: 11:55 AM to 3:16 PM (15:16) = 3 hours and 21 minutes = 3.35 hours (payable).
       - Example: Ski trip 9:00 AM to 5:33 PM (17:33) = 8 hours and 33 minutes = 8.55 hours (payable).
       - If the driver explicitly wrote a total payable hour count like "(4.5 hr)" or "4.5", use that explicit written number (4.50).
       - Round to 2 decimal places.
     * "unit_number": bus unit number if noted (e.g. "933", "327", "VRD1").
     * "is_overtime": true if total field trip hours on this single day exceed 8.0 hours; false otherwise.

3. **Winter Plug-in / Cord Charging (November to March)**:
   - Bus drivers plug in bus block heaters during cold months and receive a winter plug-in allowance ($56.65).
   - Look for handwritten notes on the sheet (especially in the bottom right corner, margins, or description lines) such as "x2 Cord Charging", "Cord Charging", "x1 Cord", "Plug-in".
   - "winter_plugin_count": integer count of cord chargings / plug-ins (e.g. 2 if "x2 Cord Charging" is written, 1 if noted, or 0 if none written).
   - "winter_plugin_notes": exact text found (e.g. "x2 Cord Charging").

4. **Training & Professional Development (PD) Days**:
   - Look for entries indicating staff meetings, PD days, or training (e.g. "Off - Pd day", "OFF Staff Meeting", "Staff Meeting").
   - "pd_days": array of objects:
     * "day": integer
     * "date": YYYY-MM-DD
     * "description": e.g. "Off - Pd day", "Staff Meeting"

5. **Regular Route Run Tallies & Weather/Road Anomalies (Audit Context)**:
   - "regular_runs_count": number of regular school run days completed or handwritten tally (e.g. "15 Reg" -> 15).
   - "stat_holidays_count": number of stat holidays indicated or handwritten tally (e.g. "2 Stat" -> 2).
   - "anomalies": array of strings noting any unusual occurrences, cancellations, or weather closures written on the sheet (e.g. "AM canceled - Icy Rd cond.", "Early Dismissal (storm) 2:00pm", "Turned Around AM / Shutdown PM", "Division Shutdown / Aaron - Anne took 2 families home").

Format the output EXACTLY as a JSON object matching this schema with NO markdown code fences and NO conversational text:
{
  "driver_name": "Cheryl Lawrence",
  "carrier_name": "Ken's Auto",
  "month_year_text": "March, 2026",
  "year": 2026,
  "month": 3,
  "date_signed": "Mar 31, 26",
  "field_trips": [
    {
      "day": 6,
      "date": "2026-03-06",
      "description": "Ski Trip",
      "start_time": "9:00 AM",
      "end_time": "5:33 PM",
      "driving_intervals": "9:00-10:34, 3:30-5:33",
      "time_breakdown": "9:00 AM - 5:33 PM (Wait time included)",
      "hours": 8.55,
      "unit_number": "933",
      "is_overtime": true
    },
    {
      "day": 18,
      "date": "2026-03-18",
      "description": "Vermilion Auction Mart",
      "start_time": "11:55 AM",
      "end_time": "3:16 PM",
      "driving_intervals": "11:55-12:38, 2:40-3:16",
      "time_breakdown": "11:55 AM - 3:16 PM (Wait time included)",
      "hours": 3.35,
      "unit_number": "VRD1",
      "is_overtime": false
    }
  ],
  "winter_plugin_count": 0,
  "winter_plugin_notes": "",
  "pd_days": [
    {
      "day": 27,
      "date": "2026-03-27",
      "description": "Off - Pd day"
    }
  ],
  "regular_runs_count": 20,
  "stat_holidays_count": 0,
  "anomalies": [
    "AM canceled - Icy Rd cond. on Day 17"
  ],
  "confidence_notes": "High clarity; verified all trip times."
}`;

    const requestBody = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: pdfData,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        response_mime_type: "application/json",
      },
    };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API Error:", errorText);
      return jsonResponse({
        error: "Failed to process document with Gemini API",
        details: errorText,
      });
    }

    const geminiResult = await response.json();
    const candidateText =
      geminiResult?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!candidateText) {
      return jsonResponse({
        error: "No text returned from Gemini model.",
        raw: geminiResult,
      });
    }

    let parsedData = null;
    try {
      parsedData = JSON.parse(candidateText.trim());
    } catch (parseErr) {
      console.error("Failed to parse JSON from Gemini:", candidateText);
      return jsonResponse({
        error: "Failed to parse structured JSON from OCR result.",
        rawText: candidateText,
      });
    }

    return jsonResponse({
      success: true,
      data: parsedData,
    });
  } catch (err: any) {
    console.error("Unexpected error in paypro-processDriverLogOCR:", err);
    return jsonResponse({
      error: err.message || "Internal server error during OCR processing.",
    });
  }
});
