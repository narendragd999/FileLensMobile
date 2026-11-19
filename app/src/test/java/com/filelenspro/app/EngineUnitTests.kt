package com.filelenspro.app

import com.filelenspro.app.data.db.FileEntity
import com.filelenspro.app.data.model.SearchFilters
import com.filelenspro.app.data.model.SearchMode
import com.filelenspro.app.data.model.SortColumn
import com.filelenspro.app.data.model.SortOrder
import com.filelenspro.app.domain.engine.EmbeddingEngine
import com.filelenspro.app.domain.engine.MultilingualEngine
import com.filelenspro.app.domain.engine.SearchEngine
import com.filelenspro.app.domain.engine.SmartTaxonomy
import com.filelenspro.app.domain.engine.TemporalExtractor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class EngineUnitTests {

    @Test
    fun multilingualTransliterationAndConceptExpansion() {
        val hindiWord = MultilingualEngine.transliterateHinglishToHindi("dawai")
        assertTrue(hindiWord.isNotBlank())
        val concepts = MultilingualEngine.getCrossLingualConceptVariants("medicine")
        assertTrue(concepts.contains("prescription") || concepts.contains("दवाई"))
    }

    @Test
    fun semanticEmbeddingCosineSimilarity() {
        val v1 = EmbeddingEngine.generateEmbedding("Apollo Hospital prescription medicine tablet paracetamol")
        val v2 = EmbeddingEngine.generateEmbedding("doctor clinic prescription medicine report")
        val v3 = EmbeddingEngine.generateEmbedding("vehicle registration certificate chassis engine number")
        assertTrue(EmbeddingEngine.cosineSimilarity(v1, v2) > EmbeddingEngine.cosineSimilarity(v1, v3))
    }

    @Test
    fun lexicalAndBooleanSearchEngine() {
        val files = listOf(
            FileEntity(id = 1, uri = "file:///a.pdf", name = "Aadhaar_Card.pdf", extension = "pdf", size = 2048, ocrText = "Unique Identification Authority UIDAI 1234 5678 9012"),
            FileEntity(id = 2, uri = "file:///b.pdf", name = "Electricity_Bill.pdf", extension = "pdf", size = 4096, ocrText = "Electricity Invoice Total Amount ₹ 1,450.00")
        )
        val exactHits = SearchEngine.search("UIDAI", SearchMode.EXACT, SearchFilters(), SortColumn.SCORE, SortOrder.DESC, files, emptyList())
        assertEquals(1, exactHits.size)
        assertEquals(1L, exactHits.first().entry.id)

        val boolHits = SearchEngine.search("Electricity AND Invoice NOT Aadhaar", SearchMode.BOOLEAN, SearchFilters(), SortColumn.SCORE, SortOrder.DESC, files, emptyList())
        assertEquals(1, boolHits.size)
        assertEquals(2L, boolHits.first().entry.id)
    }

    @Test
    fun temporalExtractionAndSmartData() {
        val res = TemporalExtractor.extractTemporalAndActionItems("Remind me tomorrow at 5 pm to pay electricity bill Rs 1450")
        assertEquals("future", res.temporalClass)
        assertTrue(res.isHighConfidenceReminder)
        assertTrue(res.actionItems.isNotEmpty())

        val smart = TemporalExtractor.extractSmartData("Paid ₹ 2,500 on 14/09/2026 to contact@clinic.in +91 9876543210 PAN ABCDE1234F")
        assertTrue(smart.amounts.isNotEmpty())
        assertTrue(smart.dates.isNotEmpty())
        assertTrue(smart.emails.isNotEmpty())
        assertTrue(smart.phones.isNotEmpty())
        assertTrue(smart.ids.isNotEmpty())
    }

    @Test
    fun smartTaxonomyCategorization() {
        val cat = SmartTaxonomy.getCardSmartCategory("Aadhaar_Scan.pdf", "", "Unique Identification Authority of India")
        assertEquals("govt_id", cat)
        val med = SmartTaxonomy.getCardSmartCategory("Dr_Sharma_Rx.jpg", "Medical", "Prescription Rx tablet 500mg")
        assertEquals("medical", med)
    }
}
