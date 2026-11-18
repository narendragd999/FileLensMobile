package expo.modules.pdftoimage

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import java.util.Locale

class VoiceCaptureManager private constructor() {

    companion object {
        val instance by lazy { VoiceCaptureManager() }
        private const val SILENCE_TIMEOUT_MS = 35000L // 35 seconds of global silence auto-stop
    }

    private var speechRecognizer: SpeechRecognizer? = null
    private var isListening = false
    private val mainHandler = Handler(Looper.getMainLooper())
    private var silenceRunnable: Runnable? = null
    private var accumulatedText: String = ""
    private var lastRecognizedText: String = ""
    private var currentIntent: Intent? = null
    private var currentContext: Context? = null
    private var currentLocaleTag: String? = null

    var onPartialResult: ((String) -> Unit)? = null
    var onFinalResult: ((String) -> Unit)? = null
    var onError: ((String) -> Unit)? = null
    var onStateChange: ((Boolean) -> Unit)? = null

    fun isCapturing(): Boolean = isListening

    fun startListening(context: Context, localeTag: String? = null) {
        mainHandler.post {
            try {
                if (isListening) {
                    stopListening(context)
                }

                accumulatedText = ""
                lastRecognizedText = ""
                currentContext = context
                currentLocaleTag = localeTag

                if (!SpeechRecognizer.isRecognitionAvailable(context)) {
                    onError?.invoke("Speech recognition is not available on this device")
                    return@post
                }

                val targetLocale = if (!localeTag.isNullOrBlank()) {
                    localeTag
                } else {
                    "en-IN" // Default Indian English/Hinglish
                }

                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, targetLocale)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, targetLocale)
                    putExtra("android.speech.extra.EXTRA_ADDITIONAL_LANGUAGES", arrayOf(targetLocale, "en-IN", "en-US", Locale.getDefault().toLanguageTag()))
                    // Prevent Google Speech from aggressively cutting off after short pauses
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 30000L)
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 5000L)
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 5000L)
                }
                currentIntent = intent

                // Start native foreground notification during capture
                FileLensBackgroundService.start(
                    context,
                    "Voice Second Brain Active",
                    "Listening ($targetLocale)..."
                )

                createAndStartRecognizer(context, intent)
                isListening = true
                onStateChange?.invoke(true)
                resetSilenceTimer(context)
            } catch (e: Exception) {
                e.printStackTrace()
                onError?.invoke(e.message ?: "Failed to start speech recognizer")
                stopListening(context)
            }
        }
    }

    private fun createAndStartRecognizer(context: Context, intent: Intent) {
        try {
            speechRecognizer?.destroy()
        } catch (e: Exception) {}

        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(context)
        speechRecognizer?.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                resetSilenceTimer(context)
            }

            override fun onBeginningOfSpeech() {
                resetSilenceTimer(context)
            }

            override fun onRmsChanged(rmsdB: Float) {
                if (rmsdB > 2.0f) {
                    resetSilenceTimer(context)
                }
            }

            override fun onBufferReceived(buffer: ByteArray?) {}

            override fun onEndOfSpeech() {}

            override fun onError(error: Int) {
                if (!isListening) return

                // If error is timeout or no-match (user paused or was thinking), KEEP LISTENING!
                if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                    mainHandler.postDelayed({
                        if (isListening && currentIntent != null) {
                            try {
                                speechRecognizer?.startListening(currentIntent)
                            } catch (e: Exception) {
                                createAndStartRecognizer(context, currentIntent!!)
                            }
                        }
                    }, 300)
                    return
                }

                // If offline language pack error, fallback to en-IN
                if ((error == 13 || error == 12) && !currentLocaleTag.isNullOrBlank() && currentLocaleTag != "en-IN") {
                    currentLocaleTag = "en-IN"
                    currentIntent?.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-IN")
                    currentIntent?.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "en-IN")
                    mainHandler.postDelayed({
                        if (isListening && currentIntent != null) {
                            createAndStartRecognizer(context, currentIntent!!)
                        }
                    }, 300)
                    return
                }

                val message = when (error) {
                    SpeechRecognizer.ERROR_AUDIO -> "Audio recording error"
                    SpeechRecognizer.ERROR_CLIENT -> "Client side error"
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission required"
                    SpeechRecognizer.ERROR_NETWORK -> "Network error"
                    SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network timeout"
                    SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Speech recognizer is busy"
                    SpeechRecognizer.ERROR_SERVER -> "Server error"
                    12 -> "Language not supported by current speech engine"
                    13 -> "Language pack not available offline"
                    else -> "Recognition error: $error"
                }
                onError?.invoke(message)
                stopListening(context)
            }

            override fun onResults(results: Bundle?) {
                if (!isListening) return
                resetSilenceTimer(context)

                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                val segment = matches?.firstOrNull() ?: ""

                if (segment.isNotBlank()) {
                    accumulatedText = if (accumulatedText.isBlank()) {
                        segment
                    } else {
                        "$accumulatedText $segment"
                    }
                    lastRecognizedText = accumulatedText
                    onPartialResult?.invoke(accumulatedText)
                }

                // Restart recognizer seamlessly so the user can continue speaking subsequent sentences!
                mainHandler.postDelayed({
                    if (isListening && currentIntent != null) {
                        try {
                            speechRecognizer?.startListening(currentIntent)
                        } catch (e: Exception) {
                            createAndStartRecognizer(context, currentIntent!!)
                        }
                    }
                }, 200)
            }

            override fun onPartialResults(partialResults: Bundle?) {
                resetSilenceTimer(context)
                val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                val partial = matches?.firstOrNull() ?: ""
                if (partial.isNotBlank()) {
                    val fullPreview = if (accumulatedText.isNotBlank()) "$accumulatedText $partial" else partial
                    lastRecognizedText = fullPreview
                    onPartialResult?.invoke(fullPreview)
                }
            }

            override fun onEvent(eventType: Int, params: Bundle?) {}
        })

        speechRecognizer?.startListening(intent)
    }

    fun stopListening(context: Context) {
        mainHandler.post {
            cancelSilenceTimer()
            val textToEmit = if (accumulatedText.isNotBlank()) accumulatedText else lastRecognizedText
            accumulatedText = ""
            lastRecognizedText = ""
            currentIntent = null

            if (textToEmit.isNotBlank()) {
                onFinalResult?.invoke(textToEmit)
            }

            try {
                speechRecognizer?.stopListening()
                speechRecognizer?.destroy()
                speechRecognizer = null
            } catch (e: Exception) {
                e.printStackTrace()
            }

            if (isListening) {
                isListening = false
                onStateChange?.invoke(false)
            }

            try {
                FileLensBackgroundService.stop(context)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    private fun resetSilenceTimer(context: Context) {
        cancelSilenceTimer()
        silenceRunnable = Runnable {
            stopListening(context)
        }
        mainHandler.postDelayed(silenceRunnable!!, SILENCE_TIMEOUT_MS)
    }

    private fun cancelSilenceTimer() {
        silenceRunnable?.let { mainHandler.removeCallbacks(it) }
        silenceRunnable = null
    }
}
