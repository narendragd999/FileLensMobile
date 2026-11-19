package com.filelenspro.app

import com.filelenspro.app.ui.components.SmartToastClassifier
import com.filelenspro.app.ui.components.SmartToastType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SmartToastClassifierTest {

    @Test
    fun classifiesSuccessWarningErrorAndInfoAccurately() {
        assertEquals(SmartToastType.SUCCESS, SmartToastClassifier.classify("Saved Scan_102.pdf (3 pg)"))
        assertEquals(SmartToastType.SUCCESS, SmartToastClassifier.classify("Shrunk 12 photo(s) · Saved 18.4 MB with full clarity"))
        assertEquals(SmartToastType.SUCCESS, SmartToastClassifier.classify("Copied note"))
        assertEquals(SmartToastType.ERROR, SmartToastClassifier.classify("Failed to build PDF from scan."))
        assertEquals(SmartToastType.ERROR, SmartToastClassifier.classify("Unable to access PDF for rotation."))
        assertEquals(SmartToastType.WARNING, SmartToastClassifier.classify("Deleted 4 exact duplicate(s)"))
        assertEquals(SmartToastType.WARNING, SmartToastClassifier.classify("Select at least one photo to compress."))
        assertEquals(SmartToastType.INFO, SmartToastClassifier.classify("Indexing shared file(s)…"))
    }

    @Test
    fun computesSmartAdaptiveDurationsAndUniqueIds() {
        val shortSuccess = SmartToastClassifier.create("Copied note")
        val longSummary = SmartToastClassifier.create("Shrunk 12 photo(s) · Saved 18.4 MB with full clarity across camera folder")
        val errorAlert = SmartToastClassifier.create("Could not rotate PDF page(s) — file may be protected.")

        assertTrue(shortSuccess.durationMs < longSummary.durationMs)
        assertTrue(errorAlert.durationMs >= 3000L)
        assertNotEquals(shortSuccess.id, SmartToastClassifier.create("Copied note").id)
    }

    @Test
    fun actionableUndoToastGetsExtendedVisibilityWindow() {
        val undoToast = SmartToastClassifier.create(
            message = "Deleted \"Electric Bill\"",
            actionLabel = "Undo",
            onAction = {}
        )
        assertEquals("Undo", undoToast.actionLabel)
        assertTrue(undoToast.durationMs >= 4200L)
    }
}
