package com.filelenspro.app.service

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.Locale

class VoiceCaptureManager(private val context: Context) {

    private var speechRecognizer: SpeechRecognizer? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private var silenceRunnable: Runnable? = null
    private var accumulatedText = ""
    private var lastRecognizedText = ""
    private var currentIntent: Intent? = null
    private var currentLocaleTag: String = "hi-IN"

    private val _isListening = MutableStateFlow(false)
    val isListening: StateFlow<Boolean> = _isListening.asStateFlow()

    private val _partialTranscript = MutableStateFlow("")
    val partialTranscript: StateFlow<String> = _partialTranscript.asStateFlow()

    private val _finalTranscriptEvents = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val finalTranscriptEvents: SharedFlow<String> = _finalTranscriptEvents.asSharedFlow()

    private val _errorEvents = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val errorEvents: SharedFlow<String> = _errorEvents.asSharedFlow()

    fun startListening(localeTag: String = "hi-IN") {
        mainHandler.post {
            try {
                if (_isListening.value) stopListening()
                accumulatedText = ""
                lastRecognizedText = ""
                _partialTranscript.value = ""
                currentLocaleTag = localeTag.ifBlank { "en-IN" }

                if (!SpeechRecognizer.isRecognitionAvailable(context)) {
                    _errorEvents.tryEmit("Speech recognition is unavailable on this device. Use manual note input.")
                    return@post
                }

                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, currentLocaleTag)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, currentLocaleTag)
                    putExtra(
                        "android.speech.extra.EXTRA_ADDITIONAL_LANGUAGES",
                        arrayOf(currentLocaleTag, "en-IN", "en-US", Locale.getDefault().toLanguageTag())
                    )
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 30000L)
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 5000L)
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 5000L)
                }
                currentIntent = intent

                FileLensBackgroundService.start(context, "Voice Second Brain Active", "Listening ($currentLocaleTag)...")
                createAndStartRecognizer(intent)
                _isListening.value = true
                resetSilenceTimer()
            } catch (e: Exception) {
                _errorEvents.tryEmit(e.message ?: "Failed to start voice capture")
                stopListening()
            }
        }
    }

    private fun createAndStartRecognizer(intent: Intent) {
        try { speechRecognizer?.destroy() } catch (_: Exception) {}
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(context)
        speechRecognizer?.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) = resetSilenceTimer()
            override fun onBeginningOfSpeech() = resetSilenceTimer()
            override fun onRmsChanged(rmsdB: Float) { if (rmsdB > 2f) resetSilenceTimer() }
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}

            override fun onError(error: Int) {
                if (!_isListening.value) return
                if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                    mainHandler.postDelayed({
                        if (_isListening.value && currentIntent != null) {
                            try { speechRecognizer?.startListening(currentIntent) }
                            catch (_: Exception) { createAndStartRecognizer(currentIntent!!) }
                        }
                    }, 300)
                    return
                }
                if ((error == 13 || error == 12) && currentLocaleTag != "en-IN") {
                    currentLocaleTag = "en-IN"
                    currentIntent?.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-IN")
                    mainHandler.postDelayed({
                        if (_isListening.value && currentIntent != null) createAndStartRecognizer(currentIntent!!)
                    }, 300)
                    return
                }
                val msg = when (error) {
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission required"
                    SpeechRecognizer.ERROR_AUDIO -> "Audio recording error"
                    SpeechRecognizer.ERROR_NETWORK -> "Network error (offline pack missing)"
                    else -> "Speech recognition error ($error)"
                }
                _errorEvents.tryEmit(msg)
                stopListening()
            }

            override fun onResults(results: Bundle?) {
                if (!_isListening.value) return
                resetSilenceTimer()
                val segment = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                if (segment.isNotBlank()) {
                    accumulatedText = if (accumulatedText.isBlank()) segment else "$accumulatedText $segment"
                    lastRecognizedText = accumulatedText
                    _partialTranscript.value = accumulatedText
                }
                mainHandler.postDelayed({
                    if (_isListening.value && currentIntent != null) {
                        try { speechRecognizer?.startListening(currentIntent) }
                        catch (_: Exception) { createAndStartRecognizer(currentIntent!!) }
                    }
                }, 200)
            }

            override fun onPartialResults(partialResults: Bundle?) {
                resetSilenceTimer()
                val partial = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                if (partial.isNotBlank()) {
                    val full = if (accumulatedText.isNotBlank()) "$accumulatedText $partial" else partial
                    lastRecognizedText = full
                    _partialTranscript.value = full
                }
            }

            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        speechRecognizer?.startListening(intent)
    }

    fun stopListening() {
        mainHandler.post {
            cancelSilenceTimer()
            val textToEmit = accumulatedText.ifBlank { lastRecognizedText }
            accumulatedText = ""
            lastRecognizedText = ""
            currentIntent = null
            if (textToEmit.isNotBlank()) {
                _finalTranscriptEvents.tryEmit(textToEmit)
            }
            try {
                speechRecognizer?.stopListening()
                speechRecognizer?.destroy()
                speechRecognizer = null
            } catch (_: Exception) {}
            _isListening.value = false
            FileLensBackgroundService.stop(context)
        }
    }

    private fun resetSilenceTimer() {
        cancelSilenceTimer()
        silenceRunnable = Runnable { stopListening() }
        mainHandler.postDelayed(silenceRunnable!!, 35_000L)
    }

    private fun cancelSilenceTimer() {
        silenceRunnable?.let { mainHandler.removeCallbacks(it) }
        silenceRunnable = null
    }
}
