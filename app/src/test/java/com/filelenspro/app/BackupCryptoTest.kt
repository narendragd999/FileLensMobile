package com.filelenspro.app

import com.filelenspro.app.service.BackupManager
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import javax.crypto.AEADBadTagException

class BackupCryptoTest {

    @Test
    fun encryptAndDecryptRoundTripSucceedsWithAes256Gcm() {
        val payload = """{"formatVersion":1,"voiceNotes":[{"title":"Pay Electricity Bill","recurrenceRule":"monthly"}]}"""
            .toByteArray(Charsets.UTF_8)

        val encrypted = BackupManager.encryptBytes(payload, "MySecretPass!42")
        assertTrue(encrypted.size > payload.size)
        // Starts with FSPB magic header
        assertEqualsHeader(encrypted)
        // Ciphertext must not equal plaintext
        assertFalse(encrypted.contentEquals(payload))

        val decrypted = BackupManager.decryptBytes(encrypted, "MySecretPass!42")
        assertArrayEquals(payload, decrypted)
    }

    @Test(expected = AEADBadTagException::class)
    fun wrongPasswordRejectsDecryption() {
        val payload = "Sensitive offline backup".toByteArray(Charsets.UTF_8)
        val encrypted = BackupManager.encryptBytes(payload, "CorrectPass123")
        BackupManager.decryptBytes(encrypted, "WrongPass123")
    }

    @Test(expected = IllegalArgumentException::class)
    fun corruptedMagicHeaderIsRejected() {
        val bogus = ByteArray(64) { 0x42 }
        BackupManager.decryptBytes(bogus, "Pass1234")
    }

    private fun assertEqualsHeader(bytes: ByteArray) {
        assertTrue(bytes.size >= 4)
        assertTrue(bytes[0] == 'F'.code.toByte())
        assertTrue(bytes[1] == 'S'.code.toByte())
        assertTrue(bytes[2] == 'P'.code.toByte())
        assertTrue(bytes[3] == 'B'.code.toByte())
    }
}
