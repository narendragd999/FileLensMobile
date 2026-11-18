# PDF & Native Media Pipeline Invariants

When implementing or modifying PDF rendering, image processing, or native media pipelines:

1. **Pixel Format Invariant (ARGB_8888 for PdfRenderer)**:
   - Android framework native `PdfRenderer.Page.render()` strictly requires the destination `Bitmap` to be configured as `Bitmap.Config.ARGB_8888`.
   - NEVER pass `Bitmap.Config.RGB_565` or other pixel formats to `PdfRenderer.render()` — doing so throws an immediate `IllegalArgumentException: Unsupported pixel format` at the OS level and fails document rendering completely.
   - To manage memory with `ARGB_8888`, constrain bitmap dimensions (e.g. 1280-1440px max) and immediately `recycle()` after encoding.

2. **Synchronous File Guarantee & Direct Writing**:
   - Native modules returning file URIs (such as `renderPdfToImages`) MUST guarantee all files are written and flushed to disk before resolving.
   - Write directly to target files. Avoid relying solely on `File.renameTo()` without a `copyTo()` fallback, as `renameTo` can fail silently across Android filesystems.
   - Never return unwritten file paths or rely on detached background threads to populate paths that callers may immediately consume.

3. **Defensive Stream Validation**:
   - In PDF builders and image encoders (e.g., `buildPdfFromImages`), verify that input files exist and have length > 0.
   - Never write a 0-byte `/DCTDecode` or `/FlateDecode` stream into a PDF object.
   - If a bitmap decode returns `null`, fallback cleanly to a valid placeholder bitmap or abort gracefully instead of corrupting the file structure.

4. **Await Navigation Handoffs**:
   - When navigating between screens that access the same underlying document file (e.g., Viewer -> Organizer, Viewer -> Camera Scanner), always `await` pending batch commits (`handleCloseViewer`) so that concurrent file access cannot corrupt the file descriptor.

5. **Resilient UI States (No Infinite Spinners)**:
   - When a document or page collection returns empty or fails to load, never leave the user trapped on an indefinite `ActivityIndicator`.
   - Invalidate render cache and provide an explicit  Reload Pages retry action with clear iconography.
