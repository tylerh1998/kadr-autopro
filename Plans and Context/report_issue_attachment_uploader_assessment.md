# Assessment: PDF/Image Attachments (incl. Paste-Screenshot) on Report Issue

**Status:** Assessment only — not yet approved/started. **Scope:** both `kadr-autopro` and `WorkPro2` (sister repo, `C:\Users\tyler\OneDrive\Documents\GitHub\WorkPro2`), explicitly directed in-scope together since the feature is near-identical in both.

## 1) Current state (confirmed near-identical in both repos)

| | AutoPRO | WorkPro2 |
|---|---|---|
| Modal | `src/components/layout/ReportIssueModal.jsx` | `src/components/layout/ReportIssueModal.jsx` |
| Fields | title, description, error message, severity | same |
| Writes to | `IssueReport` table (direct insert) | same table, same Supabase project (`hbcrwkmgsazqrvsrmxyr`) |
| Notify | fire-and-forget invoke of `autopro-report-issue` (email only, Resend) | fire-and-forget invoke of `workpro-report-issue` (email only, Resend) — note the naming prefix differs per repo convention, unlike most `autopro-` functions |
| Attachments today | none | none |

**`IssueReport`'s schema is untracked** — no `CREATE TABLE` exists in either repo's migrations; it predates the migrations folder. Before writing the `ALTER TABLE` for this feature, pull the *live* column list via introspection on both dev and prod rather than trust the insert payload as proof (this repo has repeated, confirmed history of dev/prod schema drift — see master_context.md).

**Upload/paste precedent — thin, and not shared:**
- AutoPRO has 3 near-identical inline upload blocks (`PartsInvoiceOCRModal.jsx`, `WOPartsImportModal.jsx`, `LegacyWorkOrderImportModal.jsx`), all uploading to one bucket (`kadr-digital_invoice_uploads`, under a `temp/` prefix) — filename-chip only, no thumbnail, no drag-drop, no reusable hook.
- WorkPro2 has **zero** Storage usage anywhere in `src/`.
- **Clipboard paste (`ClipboardEvent`/`clipboardData`/`onPaste`) has zero precedent in either repo.** This is net-new in both.
- Both repos use the same UI stack (shadcn/ui, "new-york" style, Tailwind, Radix primitives) — a component built for one translates directly to the other with no framework friction.

**Security:** `IssueReport` and `storage.objects` (table-wide, not bucket-scoped) both already carry the AAL2/passkey `staff_strong_auth()` gate from the recent RLS overhaul. A new bucket inherits this automatically — no extra policy work, assuming everyone who can already reach Report Issue is expected to be AAL2 (should be true, this is a staff-only feature in both apps).

## 2) Proposed approach

- **New dedicated Storage bucket** (e.g. `kadr-issue-report-attachments`) rather than reusing `kadr-digital_invoice_uploads` — that bucket's `temp/`-prefix convention implies short-lived staging consumed by an OCR/import pipeline, semantically different from a permanent attachment tied to a support ticket.
- **New `attachments` jsonb column on `IssueReport`** — array of `{path, filename, size, mime_type}`, mirroring the array-of-objects jsonb convention already used elsewhere in this schema (`line_items`, `payments`, etc.). Single nullable additive column, zero risk to existing rows.
- **Upload flow:** client uploads directly to the new bucket (same `supabase.storage.from(bucket).upload(path, file)` call already used in AutoPRO), then the resulting path(s) go into `attachments` on the same insert that already creates the `IssueReport` row. Multiple attachments per report, client-validated type (`image/png`, `image/jpeg`, `image/webp`, `application/pdf`) and size (recommend ~10MB/file cap, both client-side and at the bucket level).
- **UI — net-new, since nothing to reuse:**
  - Drag-and-drop + click-to-browse dropzone.
  - **Thumbnail preview grid for images** (not just filename chips like the existing precedent) — the whole point is screenshots, so you want to see what you're attaching before submitting. Plain filename chip for PDFs (no meaningful visual preview).
  - **Paste-to-attach:** an `onPaste` handler reading `event.clipboardData.items`, filtering `image/*`, `.getAsFile()` into the same attachment list. Standard API, no library needed, well-supported across modern browsers. Paste realistically only ever carries images, never a PDF — PDFs stay file-picker/drop-only.
- **One component, ported to both repos:** given the modal/table/function trio is already independently-maintained-but-deliberately-identical across both repos, I'd build the uploader once (e.g. `AttachmentUploader.jsx`) and copy it into both — same pattern the two `ReportIssueModal.jsx` files already follow. No shared npm package — that's new infra this task doesn't justify.
- **Optional:** add signed-URL attachment links to the notification email (`createSignedUrl`, short expiry) in both `*-report-issue` edge functions. Not required for the core feature — attachments are already visible on the `IssueReport` row itself.

## 3) Effort estimate

| Item | Estimate |
|---|---|
| Migration: `attachments` jsonb column (dev + prod) | ~15 min |
| `AttachmentUploader` component (dropzone, paste, thumbnails, upload, remove) — the real work, zero precedent to build from | ~2–3 hrs |
| Wire into both `ReportIssueModal.jsx` | ~30 min each |
| New bucket + confirm RLS inheritance | ~15 min |
| Optional: signed-URL links in both notification emails | ~30 min each |
| **Total** | **~half a day**, plus live-verification time on both apps' test environments |

## 4) Open questions / risks

1. **WorkPro2's environment split isn't confirmed** — does it have a dev/prod pair like AutoPRO's `test.kensauto.ca`/`autopro.kensauto.ca`, or something else? Need this before promising a matching two-stage rollout.
2. **Bucket choice:** recommend a dedicated new bucket over reusing `kadr-digital_invoice_uploads` — flag if you'd rather reuse it.
3. **Size/type caps** — proposing ~10MB/file, PNG/JPEG/WEBP/PDF. Adjust if you want something different.
4. Confirm `IssueReport`'s live schema via introspection before writing the migration (see above) — not a design question, just a "don't skip this step" flag.

## 5) Recommendation

Build it once, port to both — the two apps' Report Issue trio (modal/table/edge-function) is already near-identical by design, so keeping the new attachment piece identical too is the lowest-risk option and keeps both apps' behavior in sync.
