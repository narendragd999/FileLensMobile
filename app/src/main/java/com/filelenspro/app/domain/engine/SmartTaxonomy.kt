package com.filelenspro.app.domain.engine

import com.filelenspro.app.data.db.FileEntity
import com.filelenspro.app.data.model.IncomingIntentRecommendation
import com.filelenspro.app.data.model.RelatedCardMatch
import com.filelenspro.app.data.model.SemanticDuplicateGroup
import com.filelenspro.app.data.model.SmartCategory
import java.time.LocalDate
import java.util.Locale

object SmartTaxonomy {

    val SMART_CATEGORIES = listOf(
        SmartCategory("medical", "Medical & Health", "दवाई व स्वास्थ्य", "doctor prescription clinic hospital pharmacy medicine tablet lab report"),
        SmartCategory("vehicle", "Vehicle & Travel", "वाहन व यात्रा", "vehicle rc car bike insurance policy puc challan train flight ticket boarding pass"),
        SmartCategory("finance", "Finance & Bills", "बिल व टैक्स", "tax invoice gst bill electricity water salary slip form 16 bank statement receipt"),
        SmartCategory("govt_id", "Govt IDs & Proofs", "सरकारी पहचान पत्र", "aadhaar card pan card passport driving license voter id birth certificate kyc"),
        SmartCategory("education", "Education & Career", "शिक्षा व परीक्षा", "degree marksheet diploma exam admit card university college school certificate"),
        SmartCategory("personal", "Personal & Notes", "व्यक्तिगत नोट्स", "personal diary agreement contract warranty rent lease affidavit letter note")
    )

    val QUICK_CARD_TAGS = listOf(
        "ID Card", "Receipt", "Business Card", "Invoice",
        "Pass", "Govt Document", "Medical", "Note",
        "Vehicle RC", "Insurance", "Education"
    )

    fun getCardSmartCategory(name: String, customTag: String, ocrText: String?): String {
        val combined = "${name.lowercase(Locale.ROOT)} ${customTag.lowercase(Locale.ROOT)} ${(ocrText ?: "").lowercase(Locale.ROOT)}"
        return when {
            listOf("aadhaar", "aadhar", "pan card", "passport", "voter", "driving licen", "kyc", "unique identification", "income tax department", "election commission", "id card")
                .any { combined.contains(it) } -> "govt_id"
            listOf("marksheet", "degree", "diploma", "admit card", "hall ticket", "university", "college", "school", "education", "certificate", "cbse")
                .any { combined.contains(it) } -> "education"
            listOf("medical", "prescription", "doctor", "clinic", "hospital", "pharmacy", "medicine", "lab report", "blood test", "pathology", "rx")
                .any { combined.contains(it) } -> "medical"
            listOf("vehicle", "car", "bike", "rc", "puc", "pollution", "challan", "flight", "train", "ticket", "boarding pass", "pnr", "fastag")
                .any { combined.contains(it) } -> "vehicle"
            listOf("invoice", "gst", "bill", "receipt", "electricity", "water bill", "salary", "bank statement", "form 16", "tax", "finance", "emi")
                .any { combined.contains(it) } -> "finance"
            else -> "personal"
        }
    }

    fun detectSmartTags(fileName: String, contentText: String?, ocrText: String?): List<String> {
        val combined = "${fileName.lowercase(Locale.ROOT)} ${(contentText ?: "").lowercase(Locale.ROOT)} ${(ocrText ?: "").lowercase(Locale.ROOT)}"
        val rules = listOf(
            "Aadhaar Card" to listOf("aadhaar", "aadhar", "uidai", "unique identification"),
            "PAN Card" to listOf("permanent account number", "income tax department", "pan card"),
            "Passport" to listOf("passport", "republic of india"),
            "Driving License" to listOf("driving licence", "driving license", "transport department"),
            "Tax Invoice" to listOf("tax invoice", "gstin", "cgst", "sgst"),
            "Cash Receipt" to listOf("receipt", "paid", "total amount"),
            "Bank Statement" to listOf("bank statement", "account number", "ifsc"),
            "Prescription (Rx)" to listOf("prescription", "rx", "tablet", "capsule", "dr."),
            "Lab Test Report" to listOf("pathology", "hemoglobin", "laboratory", "test report"),
            "Vehicle RC" to listOf("registration certificate", "chassis", "engine no"),
            "Insurance" to listOf("insurance", "policy no", "premium", "sum insured"),
            "Electricity Bill" to listOf("electricity", "kwh", "meter no", "bijli"),
            "Degree / Diploma" to listOf("university", "degree", "bachelor", "master", "marksheet"),
            "Rent Agreement" to listOf("rent agreement", "lease deed", "tenant", "landlord")
        )
        return rules.filter { (_, keywords) -> keywords.any { combined.contains(it) } }.map { it.first }.take(4)
    }

    fun findRelatedCards(target: FileEntity, allCards: List<FileEntity>, maxResults: Int = 3): List<RelatedCardMatch> {
        val targetText = "${target.name} ${target.customTag} ${target.ocrText.orEmpty()}"
        if (targetText.isBlank()) return emptyList()
        val targetVec = EmbeddingEngine.generateEmbedding(targetText)

        return allCards.filter { it.id != target.id }
            .mapNotNull { candidate ->
                val candText = "${candidate.name} ${candidate.customTag} ${candidate.ocrText.orEmpty()}"
                if (candText.isBlank()) return@mapNotNull null
                val sim = EmbeddingEngine.cosineSimilarity(targetVec, EmbeddingEngine.generateEmbedding(candText))
                if (sim >= 0.30) RelatedCardMatch(candidate.id, candidate.name, candidate.customTag, sim) else null
            }
            .sortedByDescending { it.similarity }
            .take(maxResults)
    }

    fun detectCardExpiryAlert(card: FileEntity): String? {
        val text = (card.ocrText ?: "") + " " + (card.contentText ?: "")
        if (text.isBlank()) return null
        val expiryMatch = Regex("(?:valid\\s*thru|valid\\s*upto|expiry|exp\\.?\\s*date|expires\\s*on)\\s*[:\\-]?\\s*(\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4})", RegexOption.IGNORE_CASE)
            .find(text) ?: return null
        val dateStr = expiryMatch.groupValues[1]
        val parts = dateStr.split('/', '-')
        if (parts.size == 3) {
            val d = parts[0].toIntOrNull() ?: return null
            val m = parts[1].toIntOrNull() ?: return null
            val yRaw = parts[2].toIntOrNull() ?: return null
            val y = if (yRaw < 100) 2000 + yRaw else yRaw
            return try {
                val exp = LocalDate.of(y, m, d)
                val today = LocalDate.now()
                when {
                    exp.isBefore(today) -> "Expired on $dateStr"
                    exp.isBefore(today.plusDays(45)) -> "Expires soon ($dateStr)"
                    else -> null
                }
            } catch (_: Exception) {
                null
            }
        }
        return null
    }

    fun findSemanticDuplicates(files: List<FileEntity>, threshold: Double = 0.86): List<SemanticDuplicateGroup> {
        val candidates = files.filter { !it.ocrText.isNullOrBlank() || !it.contentText.isNullOrBlank() }.take(120)
        val vectors = candidates.associateWith { f ->
            val txt = "${f.name} ${f.contentText.orEmpty()} ${f.ocrText.orEmpty()}".take(1200)
            EmbeddingEngine.generateEmbedding(txt)
        }
        val visited = mutableSetOf<Long>()
        val groups = mutableListOf<SemanticDuplicateGroup>()

        for (i in candidates.indices) {
            val a = candidates[i]
            if (a.id in visited) continue
            val vecA = vectors[a] ?: continue
            val groupMembers = mutableListOf(a)
            var minSim = 1.0

            for (j in i + 1 until candidates.size) {
                val b = candidates[j]
                if (b.id in visited) continue
                val vecB = vectors[b] ?: continue
                val sim = EmbeddingEngine.cosineSimilarity(vecA, vecB)
                if (sim >= threshold) {
                    groupMembers.add(b)
                    minSim = minOf(minSim, sim)
                    visited.add(b.id)
                }
            }

            if (groupMembers.size > 1) {
                visited.add(a.id)
                val sorted = groupMembers.sortedByDescending { it.size }
                groups.add(
                    SemanticDuplicateGroup(
                        groupId = "sem_${a.id}",
                        similarity = minSim,
                        files = sorted,
                        selectedIds = sorted.drop(1).map { it.id }.toSet()
                    )
                )
            }
        }
        return groups
    }

    fun classifyIncomingIntent(textOrName: String, isDocumentOrImage: Boolean): IncomingIntentRecommendation {
        val lower = textOrName.lowercase(Locale.ROOT)
        val cardSignals = listOf("aadhaar", "pan", "passport", "license", "invoice", "receipt", "bill", "certificate", "id", "insurance", "policy", "pdf")
        val brainSignals = listOf("remind", "tomorrow", "kal", "today", "meeting", "call", "todo", "task", "note", "http", "https")

        val cardScore = cardSignals.count { lower.contains(it) } + if (isDocumentOrImage) 2 else 0
        val brainScore = brainSignals.count { lower.contains(it) } + if (!isDocumentOrImage) 2 else 0

        return if (cardScore >= brainScore) {
            IncomingIntentRecommendation("card", 0.85, textOrName.take(40))
        } else {
            IncomingIntentRecommendation("brain", 0.85, textOrName.take(40))
        }
    }
}
