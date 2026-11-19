package com.filelenspro.app

import com.filelenspro.app.data.db.FileEntity
import com.filelenspro.app.data.model.ExpiryUrgency
import com.filelenspro.app.domain.engine.ExpiryRadarEngine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class ExpiryRadarEngineTest {

    private fun fakeFile(
        id: Long,
        name: String,
        ocrText: String,
        isCard: Boolean = true,
        customTag: String = ""
    ) = FileEntity(
        id = id,
        uri = "file:///storage/$name",
        name = name,
        extension = "pdf",
        size = 120_000L,
        modified = "2026-06-01T00:00:00Z",
        ocrText = ocrText,
        isCard = isCard,
        customTag = customTag
    )

    @Test
    fun detectsPassportDrivingLicenseInsuranceAndSortsByUrgency() {
        val today = LocalDate.of(2026, 6, 1)
        val files = listOf(
            fakeFile(1L, "Health_Policy.pdf", "Health Insurance Policy No 9981\nPolicy End: 2026-08-15"),
            fakeFile(2L, "Indian_Passport.pdf", "REPUBLIC OF INDIA PASSPORT\nDate of Expiry: 10/06/2026"),
            fakeFile(3L, "Driving_License.pdf", "Driving Licence MCWG\nValid Till 20/05/2026"),
            fakeFile(4L, "Car_RC.pdf", "Registration Certificate Parivahan\nFitness Upto: 15 Dec 2027"),
            fakeFile(5L, "Notes.pdf", "Meeting agenda with no expiry date", isCard = false)
        )

        val items = ExpiryRadarEngine.scan(files, today = today)
        assertEquals(4, items.size)

        // Sorted ascending by daysRemaining: Expired (-12d) -> Critical (9d) -> Upcoming (75d) -> Safe (562d)
        assertEquals(3L, items[0].file.id)
        assertEquals(ExpiryUrgency.EXPIRED, items[0].urgency)
        assertEquals("Driving License", items[0].docType)
        assertTrue(items[0].daysRemaining < 0L)

        assertEquals(2L, items[1].file.id)
        assertEquals(ExpiryUrgency.CRITICAL, items[1].urgency)
        assertEquals("Passport", items[1].docType)
        assertEquals(9L, items[1].daysRemaining)

        assertEquals(1L, items[2].file.id)
        assertEquals(ExpiryUrgency.UPCOMING, items[2].urgency)
        assertEquals("Insurance Policy", items[2].docType)
        assertEquals(75L, items[2].daysRemaining)

        assertEquals(4L, items[3].file.id)
        assertEquals(ExpiryUrgency.SAFE, items[3].urgency)
        assertEquals("Vehicle RC", items[3].docType)
        assertEquals("2027-12-15", items[3].expiryDateIso)
    }

    @Test
    fun parsesMonthYearExpiryWhenAnchoredToValidThru() {
        val today = LocalDate.of(2026, 6, 1)
        val card = fakeFile(10L, "HDFC_Card.jpg", "Debit Card\nVALID THRU 06/26", customTag = "Bank Card")
        val items = ExpiryRadarEngine.scan(listOf(card), today = today)
        assertEquals(1, items.size)
        assertEquals("2026-06-30", items[0].expiryDateIso)
        assertEquals(ExpiryUrgency.CRITICAL, items[0].urgency)
        assertEquals("Bank Card", items[0].docType)
    }
}
