# VIN Decode Update Plan

**Status:** Planning — awaiting approval. No code changes made yet.
**Scope:** Swap the NHTSA endpoint used by `autopro-decodeVin` from `DecodeVin` (array-of-variables) to `DecodeVinValues` (flat object). Nothing else.

---

## 1) Overview & Objectives

`autopro-decodeVin` currently calls NHTSA's `DecodeVin` endpoint, which returns ~150+ `{Variable, Value}` objects per VIN, and extracts fields via repeated `.find()` scans. NHTSA also exposes `DecodeVinValues`, which returns the same underlying data pre-flattened into a single object per VIN (`Make`, `Model`, `ModelYear`, `Trim`, `Series`, etc. as direct keys). This plan covers switching to that endpoint.

**Goals:**
- Replace the `.find()`-loop extraction with direct property access on the flat object.
- Preserve the function's existing external contract exactly: same response shape (`{year, make, model, trim, engine}` or `{error: "..."}`), same HTTP 200-always convention, same input validation. Zero frontend changes required.
- Deploy to the `development` Supabase branch first and compare output against the current implementation before touching production.

**Explicitly not in scope for this change** (raised in prior discussion, tracked separately, not addressed here):
- Trim-level accuracy (e.g. Lariat vs. XLT) — this is a data-availability problem, not a response-format problem. `DecodeVinValues` surfaces the *same underlying NHTSA data* NHTSA has always had, just reshaped. **This change should not be expected to improve trim accuracy** — that requires either a different data source (e.g. DataOne) or supplementary input beyond the bare VIN. Don't read "trim came back better" or "trim came back the same" on a handful of test VINs as a verdict on this endpoint switch — it's not what this change targets.
- Canadian-market-exclusive vehicle coverage (e.g. Acura EL) — same reasoning; both `DecodeVin` and `DecodeVinValues` read from the same NHTSA vPIC database, so a VIN NHTSA can't decode today won't decode via either endpoint.
- ISO 3779 check-digit validation, HTTP status code changes, secondary fallback vendor integration, engine-string formatting bug (`V${cylinders}` for non-V engines) — all discussed previously, all deliberately excluded here to keep this a single, isolated, testable change.

---

## 2) Assumptions & Verification

| # | Item | Status | Notes / How Verified |
|---|------|--------|----|
| 1 | Current function lives at `supabase/functions/autopro-decodeVin/index.ts`, calls `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/{vin}?format=json` | **VERIFIED** | Read directly. |
| 2 | `DecodeVinValues` response shape: `{Count, Message, SearchCriteria, Results: [<one flat object>]}` | **VERIFIED** | Called live against two real VINs from production data during this session (`JA3AU86U48U601029`, `2HHES36672H003826`). `Results[0]` present both times with `ModelYear`, `Make`, `Model`, `Trim`, `Series`, `DisplacementL`, `EngineCylinders`, `EngineConfiguration`, `FuelTypePrimary`, `ErrorCode`, `ErrorText`, `VehicleType`, `BodyClass`, `PlantCountry` all present as flat keys. |
| 3 | `DecodeVinValues` always returns exactly one `Results` element (never an empty array) for any well-formed request | **ASSUMED** | Only tested against 2 real VINs, both returned exactly 1 result (including a VIN with `ErrorCode: "5,14"`, i.e. even a poor decode still returned a populated object). NHTSA's own docs describe this endpoint as always returning one record. New code will defensively keep the `!vehicle` guard rather than assume this can never be empty — costs nothing, protects against the untested edge case. |
| 4 | Blank/unavailable fields come back as `""` (empty string), not `null`/`undefined`/omitted key | **ASSUMED** (moderate confidence) | Confirmed `""` for `Trim`, `Series`, `EngineCylinders`, `EngineConfiguration` on both live test VINs. Not confirmed across every possible field — some NHTSA fields are documented to return the literal string `"Not Applicable"` rather than `""` depending on vehicle type. **Mitigation already built into the plan below:** new code keeps the existing `!== 'Not Applicable'` filter *in addition to* the truthiness/emptiness check, so this holds regardless of which convention a given field uses. |
| 5 | No other code in this repo calls NHTSA directly or calls `autopro-decodeVin` besides `VehicleForm.jsx` | **VERIFIED** | `grep -i "decodeVin\|DecodeVin"` across the full repo. Only hits: `VehicleForm.jsx` (the caller), `autopro-decodeVin/index.ts` (the function itself), `base44/functions/decodeVin/entry.ts` (legacy pre-migration source, dead — confirmed the live call site uses `supabase.functions.invoke`, not any `base44.*` proxy path), and mentions in planning docs. |
| 6 | Full caller inventory across sibling repos (raised explicitly — "not sure what workpro_app uses") | **VERIFIED** | Checked all 5 sibling repos on disk: `kadr-customer-portal` (no VIN decode references at all), `WorkPro2` (`workpro2` — Vite web app, no VIN decode references), `myKADR` (`temp-app` — no VIN decode references), `workpro_app` (`workpro-mobile` — **does** call this function, see below). |
| 7 | `workpro_app` (React Native/Expo mobile app, package name `workpro-mobile`) calls the same `autopro-decodeVin` function | **VERIFIED** | `src/lib/vin-decode.ts` calls `supabase.functions.invoke("autopro-decodeVin", { body: { vin } })` and casts the response directly to `DecodedVin = {year, make, model, trim, engine}` — same shape, same function, same invocation pattern as `VehicleForm.jsx`. |
| 8 | `Vehicle.vin` values in production don't uniformly satisfy a strict 17-char format | **VERIFIED** | Queried live: 3,609 vehicles total, all have a `vin` value, only 2,669 (74%) are exactly 17 characters. Current backend validation (`vin.length < 11`) is deliberately loose — this plan does **not** tighten it. |
| 9 | Function's external response contract is depended on differently by its two callers | **VERIFIED** — flagged as a pre-existing risk, not something this change introduces (see Risk Assessment) | `VehicleForm.jsx` checks both `decodeError` (network-level) and `decoded?.error` (app-level body). `workpro_app`'s `vin-decode.ts` only checks the network-level `error` and throws — it never inspects `data.error`, so if the function ever returns `{error: "..."}`, the mobile app currently displays it as a "successful" decode with all fields blank instead of surfacing the error message. |

---

## 3) Proposed Changes

**Single file touched:** `supabase/functions/autopro-decodeVin/index.ts` (this repo, `kadr-autopro`).

**No changes to:**
- `src/components/vehicles/VehicleForm.jsx` (web caller) — contract unchanged.
- `workpro_app/src/lib/vin-decode.ts` / `app/(tabs)/vin-tool.tsx` (mobile caller) — contract unchanged.
- Any database schema/table.

**Code change, conceptually:**
1. Change the fetch URL from `.../api/vehicles/DecodeVin/{vin}?format=json` to `.../api/vehicles/DecodeVinValues/{vin}?format=json`.
2. Replace `data.Results` (array-of-variables) + `getValue()` `.find()` helper with `data.Results?.[0]` (single flat object) + direct property reads:
   - `getValue('Model Year')` → `vehicle.ModelYear`
   - `getValue('Make')` → `vehicle.Make`
   - `getValue('Model')` → `vehicle.Model`
   - `getValue('Trim')` → `vehicle.Trim`
   - `getValue('Series')` → `vehicle.Series`
   - `getValue('Engine Number of Cylinders')` → `vehicle.EngineCylinders`
   - `getValue('Displacement (L)')` → `vehicle.DisplacementL`
   - `getValue('Fuel Type - Primary')` → `vehicle.FuelTypePrimary`
3. Keep the existing "Not Applicable" filter logic and the existing "essential data missing → return error" check (`!decodedData.year || !decodedData.make || !decodedData.model`) exactly as-is, just reading from the new field locations (see Assumption #4).
4. Keep the exact same response envelope: HTTP 200 always, `{year, make, model, trim, engine}` on success, `{error: "..."}` on failure. **Do not** adopt HTTP status codes for errors — that was discussed separately and would break both callers' error handling (see prior discussion / Risk Assessment #1).
5. Leave `serve()` (`std/http/server.ts`) as-is rather than switching to `Deno.serve` — also discussed separately, not part of this change, avoids mixing an unrelated runtime change into this test.
6. Leave the `V${cylinders}` engine-string formatting as-is — pre-existing, unrelated bug, tracked separately.

**Deployment target:** the `development` Supabase branch (project ref `sitihbdnuxifwibontcm`) only, matching how the recent `autopro-createPortalSnapshot` change was handled this session. Production (`hbcrwkmgsazqrvsrmxyr`) is not touched until this has been compared side-by-side.

---

## 4) Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `workpro_app`'s silent-blank-on-error behavior (Assumption #9) gets tickled more often if `DecodeVinValues` fails/errors differently than `DecodeVin` did on the same VIN | Low | Medium (mobile user sees a blank decode card instead of an error alert) | Not fixing in this change (out of scope, pre-existing). Worth a quick manual check during testing: intentionally decode an invalid VIN from the mobile app and confirm current (pre-existing) behavior, so it's not mistaken for a regression later. |
| A field NHTSA marks `"Not Applicable"` instead of `""` slips through differently than before | Low | Low | Both checks (`!== 'Not Applicable'` and truthiness) are kept, same as current code — behavior preserved regardless of which convention a given field uses. |
| `DecodeVinValues` returns a genuinely empty `Results` array for some malformed input | Low | Low | New code keeps a `!vehicle` guard before field access, same defensive posture as current code's `!results || results.length === 0` check. |
| Output differs subtly from today's for some VINs (e.g. `Trim`/`Series` combination differs in edge cases) | Medium | Low | This is explicitly why we're deploying to `development` first and comparing outputs side-by-side before production — see Testing Plan. |
| Someone reads "we switched VIN decoders" as "the trim/Canadian-coverage problems are fixed" | Medium | Medium (expectation mismatch) | Called out explicitly in Objectives — this endpoint switch doesn't touch either underlying problem. |

---

## 5) Verification & Testing Plan

**Test VINs** (reuse real ones already surfaced this session, plus a couple of fresh ones from production for variety):
- `JA3AU86U48U601029` — known checksum-"fail" but NHTSA-decodable (2008 Mitsubishi Lancer)
- `2HHES36672H003826` — known Canadian-exclusive, partial decode only (2002 Acura EL, `ErrorCode: 5,14`)
- 2-3 additional VINs pulled fresh from `Vehicle` table at test time, chosen to include at least one full-length 17-char VIN and one under 17 characters, to confirm the loose length check still behaves.

**Steps:**
1. Deploy updated function to the `development` branch only.
2. For each test VIN, call the deployed dev function directly (or via `supabase.functions.invoke` from a scratch script) and diff the output against what the *current* (production) function returns for the same VIN today. Confirm `year`/`make`/`model`/`trim`/`engine` match, or if they differ, that the difference is explainable (e.g. `DecodeVinValues` genuinely has a more complete `Trim`/`Series` value than the array form did for that VIN).
3. In a browser pointed at the `development` branch, open `VehicleForm.jsx` ("New Vehicle" → enter a real VIN → Decode) and confirm the form populates identically to today's behavior.
4. From the mobile app (`workpro_app`) pointed at `development`, run the VIN scan tool against at least one valid VIN and confirm the decoded card populates correctly.
5. From the mobile app, deliberately trigger an error case (e.g. a VIN under 11 characters) and confirm current (pre-existing) error-handling behavior — document what actually happens without changing it.
6. Only after 2-5 pass cleanly: deploy the same code to production.

**Checklist:**
- [ ] Update `supabase/functions/autopro-decodeVin/index.ts`: swap endpoint URL + field extraction logic per Section 3
- [ ] Deploy to `development` branch (`sitihbdnuxifwibontcm`)
- [ ] Diff output against current production behavior for the 2 known test VINs + 2-3 fresh production VINs
- [ ] Manually test web flow (`VehicleForm.jsx`) against `development`
- [ ] Manually test mobile flow (`workpro_app` VIN tool) against `development`, including one deliberate error case
- [ ] Confirm no regression in the loose (`>= 11` char) length validation for shorter VINs
- [ ] Deploy to production (`hbcrwkmgsazqrvsrmxyr`) once the above all pass
- [ ] Update `master_context.md` with the outcome (endpoint used, and an explicit note that trim/Canadian-coverage gaps remain open, tracked separately)

---

## 6) Completion Notes & Context

*(Live section — to be filled in during/after execution.)*

- Planned vs. actual:
- Deviations / fixes made during implementation:
- Anything learned about `DecodeVinValues` behavior that wasn't apparent from the pre-implementation testing above:
- Follow-up items spun out of this change (if any):
