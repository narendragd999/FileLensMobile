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
    fun detectFromLumaGrid_returnsNullOnUniformBlankFrame() {
        val w = 120
        val h = 100
        val uniform = ByteArray(w * h) { 128.toByte() }
        val quad = DocumentEdgeDetector.detectFromLumaGrid(uniform, w, h)
        assertNull("Uniform frame should not produce false document quad", quad)
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

        // Self-intersecting bowtie quad should fail convexity check
        val bowtie = NormalizedQuad(0.15f, 0.15f, 0.85f, 0.85f, 0.85f, 0.15f, 0.15f, 0.85f)
        assertFalse(DocumentEdgeDetector.isConvexAndValid(bowtie))
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
    fun photoCompressPresets_areOrderedByQualityAndSavings() {
        assertTrue(PhotoCompressPreset.MAX_QUALITY.quality > PhotoCompressPreset.LOSSLESS_LOOK.quality)
        assertTrue(PhotoCompressPreset.LOSSLESS_LOOK.quality > PhotoCompressPreset.ULTRA_COMPACT.quality)
        assertTrue(PhotoCompressPreset.MAX_QUALITY.estimatedRatio > PhotoCompressPreset.ULTRA_COMPACT.estimatedRatio)
    }
}
