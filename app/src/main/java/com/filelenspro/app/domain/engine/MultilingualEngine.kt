package com.filelenspro.app.domain.engine

import java.text.Normalizer
import java.util.Locale

object MultilingualEngine {

    private val TRANSLIT_MAP: Map<String, String> = mapOf(
        "main" to "मैं", "mein" to "मैं", "hum" to "हम", "aap" to "आप",
        "hai" to "है", "hain" to "हैं", "karna" to "करना", "jana" to "जाना",
        "aana" to "आना", "dena" to "देना", "lena" to "लेना", "bolna" to "बोलना",
        "naam" to "नाम", "kaam" to "काम", "ghar" to "घर", "paani" to "पानी",
        "samay" to "समय", "din" to "दिन", "raat" to "रात", "subah" to "सुबह",
        "shaam" to "शाम", "saal" to "साल", "mahina" to "महीना", "hafta" to "हफ़्ता",
        "bharat" to "भारत", "sarkar" to "सरकार", "aadhar" to "आधार", "aadhaar" to "आधार",
        "praman" to "प्रमाण", "patra" to "पत्र", "bijli" to "बिजली", "bill" to "बिल",
        "rasid" to "रसीद", "raseed" to "रसीद", "khata" to "खाता", "bank" to "बैंक",
        "dawai" to "दवाई", "doctor" to "डॉक्टर", "aspatal" to "अस्पताल",
        "pariksha" to "परीक्षा", "school" to "स्कूल", "college" to "कॉलेज",
        "gaadi" to "गाड़ी", "bima" to "बीमा", "pan" to "पैन", "kal" to "कल"
    )

    private val CONCEPT_GROUPS: List<Set<String>> = listOf(
        setOf("aadhaar", "aadhar", "uidai", "आधार"),
        setOf("pan", "income tax", "पैन"),
        setOf("passport", "visa", "पासपोर्ट"),
        setOf("license", "licence", "dl", "driving", "लाइसेंस"),
        setOf("bill", "invoice", "receipt", "challan", "बिल", "रसीद"),
        setOf("electricity", "power", "bijli", "बिजली"),
        setOf("water", "paani", "jal", "पानी", "जल"),
        setOf("medical", "prescription", "doctor", "medicine", "rx", "दवाई", "डॉक्टर"),
        setOf("hospital", "clinic", "aspatal", "अस्पताल"),
        setOf("insurance", "policy", "bima", "बीमा"),
        setOf("vehicle", "car", "bike", "rc", "gaadi", "गाड़ी", "वाहन"),
        setOf("bank", "statement", "account", "khata", "बैंक", "खाता"),
        setOf("salary", "payslip", "pay", "vetan", "वेतन", "सैलरी"),
        setOf("tax", "gst", "itr", "form 16", "टैक्स"),
        setOf("marksheet", "degree", "certificate", "diploma", "exam", "परीक्षा"),
        setOf("rent", "lease", "agreement", "kiraya", "किराया"),
        setOf("ticket", "flight", "train", "pnr", "boarding", "टिकट"),
        setOf("meeting", "call", "appointment", "baithak", "बैठक")
    )

    private val CONSONANTS: List<Pair<String, String>> = listOf(
        "chh" to "छ", "kh" to "ख", "gh" to "घ", "ch" to "च", "jh" to "झ",
        "th" to "थ", "dh" to "ध", "ph" to "फ", "bh" to "भ", "sh" to "श",
        "ksh" to "क्ष", "tr" to "त्र", "gy" to "ज्ञ",
        "k" to "क", "g" to "ग", "j" to "ज", "t" to "त", "d" to "द",
        "n" to "न", "p" to "प", "b" to "ब", "m" to "म", "y" to "य",
        "r" to "र", "l" to "ल", "v" to "व", "w" to "व", "s" to "स", "h" to "ह"
    )

    private val VOWEL_MATRAS: List<Pair<String, String>> = listOf(
        "aa" to "ा", "ee" to "ी", "ii" to "ी", "oo" to "ू", "uu" to "ू",
        "ai" to "ै", "au" to "ौ", "e" to "े", "o" to "ो", "i" to "ि", "u" to "ु", "a" to "ा"
    )

    private val INDEPENDENT_VOWELS: List<Pair<String, String>> = listOf(
        "aa" to "आ", "ee" to "ई", "ii" to "ई", "oo" to "ऊ", "uu" to "ऊ",
        "ai" to "ऐ", "au" to "औ", "a" to "अ", "i" to "इ", "u" to "उ", "e" to "ए", "o" to "ओ"
    )

    fun normalizeText(text: String): String {
        if (text.isBlank()) return ""
        return Normalizer.normalize(text, Normalizer.Form.NFC)
            .lowercase(Locale.ROOT)
            .replace(Regex("[\\x00-\\x1F\\x7F]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
    }

    fun hasDevanagari(text: String): Boolean {
        return text.any { ch -> ch.code in 0x0900..0x097F }
    }

    fun transliterateSingleWord(word: String): List<String> {
        val w = word.lowercase(Locale.ROOT).trim()
        if (w.isEmpty()) return emptyList()
        val variants = linkedSetOf<String>()
        TRANSLIT_MAP[w]?.let { variants.add(it) }

        if (w.all { it in 'a'..'z' }) {
            val sb = StringBuilder()
            var i = 0
            var afterConsonant = false
            while (i < w.length) {
                val matchedConsonant = CONSONANTS.firstOrNull { (lat, _) -> w.startsWith(lat, i) }
                if (matchedConsonant != null) {
                    sb.append(matchedConsonant.second)
                    i += matchedConsonant.first.length
                    afterConsonant = true
                    continue
                }
                val vowelList = if (afterConsonant) VOWEL_MATRAS else INDEPENDENT_VOWELS
                val matchedVowel = vowelList.firstOrNull { (lat, _) -> w.startsWith(lat, i) }
                if (matchedVowel != null) {
                    if (!(afterConsonant && matchedVowel.first == "a" && i == w.length - 1)) {
                        sb.append(matchedVowel.second)
                    } else if (afterConsonant && matchedVowel.first == "a") {
                        // implicit schwa inside consonant
                    }
                    i += matchedVowel.first.length
                    afterConsonant = false
                    continue
                }
                sb.append(w[i])
                i++
                afterConsonant = false
            }
            val built = sb.toString()
            if (built.isNotBlank() && hasDevanagari(built)) {
                variants.add(built)
            }
        }
        return variants.toList()
    }

    fun transliterateHinglishToHindi(text: String): String {
        if (text.isBlank()) return text
        return text.split(Regex("\\s+")).joinToString(" ") { word ->
            val clean = word.lowercase(Locale.ROOT).trim()
            TRANSLIT_MAP[clean] ?: transliterateSingleWord(clean).firstOrNull() ?: word
        }
    }

    fun getCrossLingualConceptVariants(token: String): List<String> {
        val lower = token.lowercase(Locale.ROOT).trim()
        if (lower.isBlank()) return emptyList()
        val out = linkedSetOf<String>()
        for (group in CONCEPT_GROUPS) {
            if (group.any { it == lower || (lower.length >= 4 && it.contains(lower)) }) {
                out.addAll(group)
            }
        }
        out.addAll(transliterateSingleWord(lower))
        return out.toList()
    }

    fun toUniversalSoundex(word: String): String {
        val clean = normalizeText(word)
        if (clean.isEmpty()) return ""
        val sb = StringBuilder()
        var lastCode = '\u0000'
        for (ch in clean) {
            val code = when (ch) {
                'k', 'c', 'q', 'g', 'क', 'ख', 'ग', 'घ' -> 'K'
                't', 'd', 'त', 'थ', 'द', 'ध', 'ट', 'ठ', 'ड', 'ढ' -> 'T'
                'p', 'b', 'f', 'v', 'w', 'प', 'फ', 'ब', 'भ', 'व' -> 'P'
                'm', 'n', 'म', 'न', 'ण' -> 'M'
                'r', 'l', 'र', 'ल' -> 'R'
                's', 'z', 'c', 'स', 'श', 'ष', 'ज' -> 'S'
                'y', 'य' -> 'Y'
                'h', 'ह' -> 'H'
                in '0'..'9' -> ch
                else -> '\u0000'
            }
            if (code != '\u0000' && code != lastCode) {
                sb.append(code)
                lastCode = code
            }
        }
        return sb.toString()
    }
}
