package com.filelenspro.app

import com.filelenspro.app.data.model.NormalizedQuad
import com.filelenspro.app.data.model.PhotoCompressPreset
import com.filelenspro.app.domain.engine.DocumentEdgeDetector
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DocumentEdgeDetectorTest {

    @Test
    fun detectFromLumaGrid_findsBrightDocumentOnDarkDesk() {
        val w = 120
        val h = 100
        val grid = ByteArray(w * h) { 35.toByte() } // dark desk background

        // Place bright white sheet occupying [20..100, 15..85]
        for (y in 15..85) {
            for (x in 20..100) {
                grid[y * w + x] = 235.toByte()
            }
        }

        val quad = DocumentEdgeDetector.detectFromLumaGrid(grid, w, h)
        assertNotNull("Expected document quad to be detected", quad)
        quad!!
        assertEquals(20f / w, quad.tlX, 0.04f)
        assertEquals(15f / h, quad.tlY, 0.04f)
        assertEquals(100f / w, quad.brX, 0.04f)
        assertEquals(85f / h, quad.brY, 0.04f)
        assertTrue(DocumentEdgeDetector.isConvexAndValid(quad))
        assertTrue(quad.confidence >= 0.6f)
    }

    @Test
    fun detectFromLumaGrid_ignoresStrayBrightDeskGlareOutsideDocument() {
        val w = 120
        val h = 100
        val grid = ByteArray(w * h) { 30.toByte() }

        // Main sheet in [28..92, 22..78]
        for (y in 22..78) {
            for (x in 28..92) {
                grid[y * w + x] = 235.toByte()
            }
        }
        // Stray bright lamp glare near top-left [5..9, 5..9] and bottom-right [108..114, 88..94]
        for (y in 5..9) for (x in 5..9) grid[y * w + x] = 250.toByte()
        for (y in 88..94) for (x in 108..114) grid[y * w + x] = 250.toByte()

        val quad = DocumentEdgeDetector.detectFromLumaGrid(grid, w, h)
        assertNotNull("Expected main sheet quad despite stray glare", quad)
        quad!!
        // Corners must hug the sheet [28..92, 22..78], NOT be hijacked by glare at (5,5) or (114,94)
        assertEquals(28f / w, quad.tlX, 0.05f)
        assertEquals(22f / h, quad.tlY, 0.05f)
        assertEquals(92f / w, quad.brX, 0.05f)
        assertEquals(78f / h, quad.brY, 0.05f)
    }

    @Test
    fun detectFromLumaGrid_findsDarkIdCardOnLightDesk() {
        val w = 120
        val h = 100
        val grid = ByteArray(w * h) { 230.toByte() } // bright white desk

        // Dark/colored ID card in [18..102, 25..75]
        for (y in 25..75) {
            for (x in 18..102) {
                grid[y * w + x] = 75.toByte()
            }
        }

        val quad = DocumentEdgeDetector.detectFromLumaGrid(grid, w, h)
        assertNotNull("Expected dark ID card on bright desk to be detected", quad)
        quad!!
        assertEquals(18f / w, quad.tlX, 0.05f)
        assertEquals(25f / h, quad.tlY, 0.05f)
        assertEquals(102f / w, quad.brX, 0.05f)
        assertEquals(75f / h, quad.brY, 0.05f)
    }

    @Test
    fun detectFromLumaGrid_tracksSkewedTrapezoidPerspective() {
        val w = 120
        val h = 100
        val grid = ByteArray(w * h) { 30.toByte() }

        // Trapezoid narrower at top [32..88] at y=16, wider at bottom [16..104] at y=84
        for (y in 16..84) {
            val t = (y - 16).toFloat() / (84 - 16).toFloat()
            val left = (32f - 16f * t).toInt()
            val right = (88f + 16f * t).toInt()
            for (x in left..right) {
                grid[y * w + x] = 240.toByte()
            }
        }

        val quad = DocumentEdgeDetector.detectFromLumaGrid(grid, w, h)
        assertNotNull("Expected skewed trapezoid document to be detected", quad)
        quad!!
        assertTrue("Top edge should be narrower than bottom edge", (quad.trX - quad.tlX) < (quad.brX - quad.blX) - 0.12f)
        assertTrue(DocumentEdgeDetector.isConvexForWarp(quad))
    }

    @Test
    fun detectFromLumaGrid_returnsNullOnUniformBlankFrame() {
        val w = 120
        val h = 100
        val uniform = ByteArray(w * h) { 128.toByte() }
        val quad = DocumentEdgeDetector.detectFromLumaGrid(uniform, w, h)
        assertNull("Uniform frame should not produce false document quad", quad)
    }

    @Test
    fun rotateQuadCW_and_Inverse_roundTripAllOrientations() {
        val original = NormalizedQuad(
            tlX = 0.12f, tlY = 0.18f,
            trX = 0.84f, trY = 0.14f,
            brX = 0.90f, brY = 0.86f,
            blX = 0.08f, blY = 0.80f,
            confidence = 0.9f
        )

        // Four 90° CW rotations must equal original
        var fullTurn = original
        repeat(4) { fullTurn = DocumentEdgeDetector.rotateQuadCW(fullTurn, 90) }
        assertEquals(original.tlX, fullTurn.tlX, 0.001f)
        assertEquals(original.tlY, fullTurn.tlY, 0.001f)
        assertEquals(original.brX, fullTurn.brX, 0.001f)
        assertEquals(original.brY, fullTurn.brY, 0.001f)

        // Inverse must exactly undo every rotation angle
        for (deg in listOf(0, 90, 180, 270)) {
            val rotated = DocumentEdgeDetector.rotateQuadCW(original, deg)
            val restored = DocumentEdgeDetector.rotateQuadInverse(rotated, deg)
            assertEquals("tlX mismatch at $deg", original.tlX, restored.tlX, 0.001f)
            assertEquals("tlY mismatch at $deg", original.tlY, restored.tlY, 0.001f)
            assertEquals("trX mismatch at $deg", original.trX, restored.trX, 0.001f)
            assertEquals("trY mismatch at $deg", original.trY, restored.trY, 0.001f)
            assertEquals("brX mismatch at $deg", original.brX, restored.brX, 0.001f)
            assertEquals("brY mismatch at $deg", original.brY, restored.brY, 0.001f)
            assertEquals("blX mismatch at $deg", original.blX, restored.blX, 0.001f)
            assertEquals("blY mismatch at $deg", original.blY, restored.blY, 0.001f)
        }
    }

    @Test
    fun smoothQuad_and_quadDelta_convergeSmoothly() {
        val a = NormalizedQuad(0.10f, 0.10f, 0.90f, 0.10f, 0.90f, 0.90f, 0.10f, 0.90f, 0.8f)
        val b = NormalizedQuad(0.20f, 0.10f, 0.90f, 0.10f, 0.90f, 0.90f, 0.10f, 0.90f, 0.9f)

        val smoothed = DocumentEdgeDetector.smoothQuad(a, b, alpha = 0.5f)
        assertEquals(0.15f, smoothed.tlX, 0.001f)
        assertEquals(0.10f, DocumentEdgeDetector.quadDelta(a, b), 0.001f)
        assertEquals(0.05f, DocumentEdgeDetector.quadDelta(a, smoothed), 0.001f)
    }

    @Test
    fun quadArea_and_convexityValidation_workCorrectly() {
        val full = NormalizedQuad.FULL
        assertTrue(full.isFullFrame())
        assertEquals(1.0f, DocumentEdgeDetector.computeQuadArea(full), 0.001f)
        assertTrue(DocumentEdgeDetector.isConvexAndValid(full))

        val custom = NormalizedQuad(0.15f, 0.15f, 0.85f, 0.15f, 0.85f, 0.85f, 0.15f, 0.85f)
        assertFalse(custom.isFullFrame())
        assertEquals(0.49f, DocumentEdgeDetector.computeQuadArea(custom), 0.01f)
        assertTrue(DocumentEdgeDetector.isConvexAndValid(custom))

        // Tight receipt/stamp crop (10% height) should pass manual warp convexity
        val tightCard = NormalizedQuad(0.20f, 0.40f, 0.80f, 0.40f, 0.80f, 0.50f, 0.20f, 0.50f)
        assertTrue(DocumentEdgeDetector.isConvexForWarp(tightCard))

        // Self-intersecting bowtie quad should fail both convexity checks
        val bowtie = NormalizedQuad(0.15f, 0.15f, 0.85f, 0.85f, 0.85f, 0.15f, 0.15f, 0.85f)
        assertFalse(DocumentEdgeDetector.isConvexAndValid(bowtie))
        assertFalse(DocumentEdgeDetector.isConvexForWarp(bowtie))
    }

    @Test
    fun suggestSmartDocumentTitle_identifiesInvoicesIdsAndMedicalReports() {
        val invoiceTitle = DocumentEdgeDetector.suggestSmartDocumentTitle("TAX INVOICE\nGSTIN 27ABCDE1234F1Z5\nGrand Total Rs. 4590")
        assertTrue(invoiceTitle.contains("Invoice"))
        assertTrue(invoiceTitle.contains("4590"))

        val aadhaarTitle = DocumentEdgeDetector.suggestSmartDocumentTitle("Unique Identification Authority of India\nAadhaar")
        assertTrue(aadhaarTitle.endsWith("Aadhaar_Card"))

        val medicalTitle = DocumentEdgeDetector.suggestSmartDocumentTitle("Pathology Lab Report\nDiagnosis: Normal")
        assertTrue(medicalTitle.endsWith("Medical_Report"))

        val genericTitle = DocumentEdgeDetector.suggestSmartDocumentTitle("Project Roadmap Q4\nDetails follow...")
        assertTrue(genericTitle.contains("Project_Roadmap_Q4"))
    }

    @Test
    fun estimateRectifiedAspectRatio_preservesFlatRectAndUnsquashesAngledTrapezoid() {
        // 1. Flat A4-like rectangle in a 1000x1400 image (width=700, height=1000 -> ratio=0.70)
        val flat = NormalizedQuad(
            tlX = 0.15f, tlY = 0.1428f,
            trX = 0.85f, trY = 0.1428f,
            brX = 0.85f, brY = 0.8571f,
            blX = 0.15f, blY = 0.8571f
        )
        val flatRatio = DocumentEdgeDetector.estimateRectifiedAspectRatio(flat, 1000, 1400)
        assertEquals(0.70f, flatRatio, 0.04f)

        // 2. Angled/foreshortened trapezoid (paper tilted away from camera: narrower top, compressed height)
        val tilted = NormalizedQuad(
            tlX = 0.24f, tlY = 0.22f,
            trX = 0.76f, trY = 0.22f,
            brX = 0.88f, brY = 0.80f,
            blX = 0.12f, blY = 0.80f
        )
        val tiltedRatio = DocumentEdgeDetector.estimateRectifiedAspectRatio(tilted, 1000, 1400)
        // Must recover a realistic portrait/document aspect ratio instead of extreme squash
        assertTrue("Expected recovered ratio in [0.45, 0.95], got $tiltedRatio", tiltedRatio in 0.45f..0.95f)
    }

    @Test
    fun snapCornerToEdge_locksOntoCrispPaperCornerAndLeavesUniformAreaUntouched() {
        val w = 120
        val h = 100
        val grid = ByteArray(w * h) { 30.toByte() }
        for (y in 20..80) {
            for (x in 24..96) {
                grid[y * w + x] = 240.toByte()
            }
        }
        val map = DocumentEdgeDetector.computeEdgeCornerMapFromLuma(grid, w, h)
        // Slightly off top-left corner (22/120, 18/100) should snap right onto ~(24/120, 20/100)
        val (snappedX, snappedY) = DocumentEdgeDetector.snapCornerToEdge(22f / w, 18f / h, map)
        assertEquals(24f / w, snappedX, 0.025f)
        assertEquals(20f / h, snappedY, 0.025f)

        // Center of uniform white sheet (60/120, 50/100) has no corner -> stays untouched
        val (freeX, freeY) = DocumentEdgeDetector.snapCornerToEdge(0.50f, 0.50f, map)
        assertEquals(0.50f, freeX, 0.0001f)
        assertEquals(0.50f, freeY, 0.0001f)
    }

    @Test
    fun lumaFingerprint_ignoresExposureFlickerAndDetectsPageSwap() {
        val w = 96
        val h = 128
        // Page 1: bright paper with dark header band at top
        val page1 = ByteArray(w * h) { idx ->
            val y = idx / w
            if (y in 25..42) 45.toByte() else 225.toByte()
        }
        // Same page 1 with slight camera auto-exposure brightness shift (+8)
        val page1Flicker = ByteArray(w * h) { idx ->
            val base = page1[idx].toInt() and 0xFF
            (base + 8).coerceIn(0, 255).toByte()
        }
        // Page 2: different printed layout (dark content block in lower half)
        val page2 = ByteArray(w * h) { idx ->
            val y = idx / w
            if (y in 70..105) 45.toByte() else 225.toByte()
        }
        // Empty dark desk while swapping sheets
        val emptyDesk = ByteArray(w * h) { 35.toByte() }

        val fp1 = DocumentEdgeDetector.computeLumaFingerprint(page1, w, h)
        val fp1Flicker = DocumentEdgeDetector.computeLumaFingerprint(page1Flicker, w, h)
        val fp2 = DocumentEdgeDetector.computeLumaFingerprint(page2, w, h)
        val fpDesk = DocumentEdgeDetector.computeLumaFingerprint(emptyDesk, w, h)

        val flickerDiff = DocumentEdgeDetector.fingerprintDifference(fp1, fp1Flicker)
        val swapDiff = DocumentEdgeDetector.fingerprintDifference(fp1, fp2)
        val deskDiff = DocumentEdgeDetector.fingerprintDifference(fp1, fpDesk)

        assertTrue("Exposure flicker should stay below threshold (<0.05), got $flickerDiff", flickerDiff < 0.05f)
        assertTrue("Swapping to a different page should exceed threshold (>=0.11), got $swapDiff", swapDiff >= 0.11f)
        assertTrue("Removing sheet onto dark desk should exceed threshold (>=0.11), got $deskDiff", deskDiff >= 0.11f)
    }

    @Test
    fun detectFromLumaGrid_recoversTrueCornersThroughDarkHeaderAndFingerNotch() {
        val w = 120
        val h = 100
        val grid = ByteArray(w * h) { 28.toByte() } // dark desk

        // Bright paper sheet in [20..100, 14..86]
        for (y in 14..86) {
            for (x in 20..100) {
                grid[y * w + x] = 236.toByte()
            }
        }
        // Dark printed letterhead banner inside top of sheet [24..96, 20..30]
        for (y in 20..30) {
            for (x in 24..96) {
                grid[y * w + x] = 42.toByte()
            }
        }
        // Finger notch occluding middle of left edge [18..28, 45..58]
        for (y in 45..58) {
            for (x in 18..28) {
                grid[y * w + x] = 70.toByte()
            }
        }

        val quad = DocumentEdgeDetector.detectFromLumaGrid(grid, w, h)
        assertNotNull("Expected Hough 4-line + CC hybrid to find sheet despite header & finger notch", quad)
        quad!!
        assertEquals(20f / w, quad.tlX, 0.05f)
        assertEquals(14f / h, quad.tlY, 0.05f)
        assertEquals(100f / w, quad.brX, 0.05f)
        assertEquals(86f / h, quad.brY, 0.05f)
        assertTrue(DocumentEdgeDetector.isConvexAndValid(quad))
    }

    @Test
    fun slideEdgeAlongPerspective_movesTopEdgeAlongConvergingSideRays() {
        // Symmetric trapezoid: narrower at top [0.30..0.70] at y=0.20, wider at bottom [0.10..0.90] at y=0.80
        // Left ray slope: x = 0.30 - (0.20 / 0.60) * (y - 0.20)
        // Right ray slope: x = 0.70 + (0.20 / 0.60) * (y - 0.20)
        val trapezoid = NormalizedQuad(
            tlX = 0.30f, tlY = 0.20f,
            trX = 0.70f, trY = 0.20f,
            brX = 0.90f, brY = 0.80f,
            blX = 0.10f, blY = 0.80f
        )

        // Slide top edge (edgeIndex = 0) downward by dy = +0.15
        val slid = DocumentEdgeDetector.slideEdgeAlongPerspective(trapezoid, edgeIndex = 0, dx = 0f, dy = 0.15f)
        // Top edge should move down to y=0.35 and expand outward along the perspective rays to [0.25..0.75]
        assertEquals(0.35f, slid.tlY, 0.02f)
        assertEquals(0.35f, slid.trY, 0.02f)
        assertTrue("Top-left should move outward left along perspective ray (expected ~0.25, got ${slid.tlX})", slid.tlX < 0.28f)
        assertTrue("Top-right should move outward right along perspective ray (expected ~0.75, got ${slid.trX})", slid.trX > 0.72f)
        // Bottom corners must stay anchored
        assertEquals(0.10f, slid.blX, 0.001f)
        assertEquals(0.80f, slid.blY, 0.001f)
        assertEquals(0.90f, slid.brX, 0.001f)
        assertEquals(0.80f, slid.brY, 0.001f)
        assertTrue(DocumentEdgeDetector.isConvexForWarp(slid))
    }

    @Test
    fun squareUpQuadToRectangle_levelsSkewedTrapezoidIntoExact90DegreeRect() {
        val skewed = NormalizedQuad(
            tlX = 0.22f, tlY = 0.16f,
            trX = 0.78f, trY = 0.20f,
            brX = 0.86f, brY = 0.82f,
            blX = 0.14f, blY = 0.86f
        )
        val rect = DocumentEdgeDetector.squareUpQuadToRectangle(skewed)
        assertEquals(rect.tlX, rect.blX, 0.0001f)
        assertEquals(rect.trX, rect.brX, 0.0001f)
        assertEquals(rect.tlY, rect.trY, 0.0001f)
        assertEquals(rect.blY, rect.brY, 0.0001f)
        assertTrue(rect.trX > rect.tlX + 0.4f)
        assertTrue(rect.blY > rect.tlY + 0.4f)
        assertTrue(DocumentEdgeDetector.isConvexForWarp(rect))
    }

    @Test
    fun photoCompressPresets_areOrderedByQualityAndSavings() {
        assertTrue(PhotoCompressPreset.MAX_QUALITY.quality > PhotoCompressPreset.LOSSLESS_LOOK.quality)
        assertTrue(PhotoCompressPreset.LOSSLESS_LOOK.quality > PhotoCompressPreset.ULTRA_COMPACT.quality)
        assertTrue(PhotoCompressPreset.MAX_QUALITY.estimatedRatio > PhotoCompressPreset.ULTRA_COMPACT.estimatedRatio)
    }
}
