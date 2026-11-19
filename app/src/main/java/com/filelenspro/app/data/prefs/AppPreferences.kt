package com.filelenspro.app.data.prefs

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.util.UUID

private val Context.dataStore by preferencesDataStore(name = "filelens_prefs")

data class UserPrefs(
    val isDarkTheme: Boolean = false,
    val ocrLanguage: String = "eng+hin",
    val semanticAiEnabled: Boolean = true,
    val awarenessBellEnabled: Boolean = false,
    val morningDigestEnabled: Boolean = false,
    val voiceLocale: String = "hi-IN",
    val licenseKey: String = "",
    val isProActivated: Boolean = false,
    val machineId: String = "",
    val aiEndpointUrl: String = "https://api.openai.com/v1/chat/completions",
    val aiModel: String = "gpt-4o-mini",
    val aiApiKey: String = ""
)

class AppPreferences(private val context: Context) {

    private object Keys {
        val DARK_THEME = booleanPreferencesKey("dark_theme")
        val OCR_LANGUAGE = stringPreferencesKey("ocr_language")
        val SEMANTIC_AI_ENABLED = booleanPreferencesKey("semantic_ai_enabled")
        val AWARENESS_BELL = booleanPreferencesKey("awareness_bell")
        val MORNING_DIGEST = booleanPreferencesKey("morning_digest")
        val VOICE_LOCALE = stringPreferencesKey("voice_locale")
        val LICENSE_KEY = stringPreferencesKey("license_key")
        val PRO_ACTIVATED = booleanPreferencesKey("pro_activated")
        val MACHINE_ID = stringPreferencesKey("machine_id")
        val AI_URL = stringPreferencesKey("ai_url")
        val AI_MODEL = stringPreferencesKey("ai_model")
        val AI_KEY = stringPreferencesKey("ai_key")
    }

    val prefsFlow: Flow<UserPrefs> = context.dataStore.data.map { prefs ->
        UserPrefs(
            isDarkTheme = prefs[Keys.DARK_THEME] ?: false,
            ocrLanguage = prefs[Keys.OCR_LANGUAGE] ?: "eng+hin",
            semanticAiEnabled = prefs[Keys.SEMANTIC_AI_ENABLED] ?: true,
            awarenessBellEnabled = prefs[Keys.AWARENESS_BELL] ?: false,
            morningDigestEnabled = prefs[Keys.MORNING_DIGEST] ?: false,
            voiceLocale = prefs[Keys.VOICE_LOCALE] ?: "hi-IN",
            licenseKey = prefs[Keys.LICENSE_KEY] ?: "",
            isProActivated = prefs[Keys.PRO_ACTIVATED] ?: false,
            machineId = prefs[Keys.MACHINE_ID] ?: "",
            aiEndpointUrl = prefs[Keys.AI_URL] ?: "https://api.openai.com/v1/chat/completions",
            aiModel = prefs[Keys.AI_MODEL] ?: "gpt-4o-mini",
            aiApiKey = prefs[Keys.AI_KEY] ?: ""
        )
    }

    suspend fun setDarkTheme(enabled: Boolean) {
        context.dataStore.edit { it[Keys.DARK_THEME] = enabled }
    }

    suspend fun setOcrLanguage(lang: String) {
        context.dataStore.edit { it[Keys.OCR_LANGUAGE] = lang }
    }

    suspend fun setSemanticAiEnabled(enabled: Boolean) {
        context.dataStore.edit { it[Keys.SEMANTIC_AI_ENABLED] = enabled }
    }

    suspend fun setAwarenessBell(enabled: Boolean) {
        context.dataStore.edit { it[Keys.AWARENESS_BELL] = enabled }
    }

    suspend fun setMorningDigest(enabled: Boolean) {
        context.dataStore.edit { it[Keys.MORNING_DIGEST] = enabled }
    }

    suspend fun setVoiceLocale(locale: String) {
        context.dataStore.edit { it[Keys.VOICE_LOCALE] = locale }
    }

    suspend fun ensureMachineId(): String {
        var existing = ""
        context.dataStore.edit { prefs ->
            val current = prefs[Keys.MACHINE_ID]
            if (current.isNullOrBlank()) {
                val generated = "FL-AND-" + UUID.randomUUID().toString().take(8).uppercase()
                prefs[Keys.MACHINE_ID] = generated
                existing = generated
            } else {
                existing = current
            }
        }
        return existing
    }

    suspend fun saveLicense(key: String, activated: Boolean) {
        context.dataStore.edit {
            it[Keys.LICENSE_KEY] = key
            it[Keys.PRO_ACTIVATED] = activated
        }
    }

    suspend fun saveAiConfig(url: String, model: String, apiKey: String) {
        context.dataStore.edit {
            it[Keys.AI_URL] = url
            it[Keys.AI_MODEL] = model
            it[Keys.AI_KEY] = apiKey
        }
    }
}
