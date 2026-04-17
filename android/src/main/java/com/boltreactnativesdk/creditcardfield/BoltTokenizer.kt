package com.boltreactnativesdk.creditcardfield

import android.util.Base64
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Android port of the Bolt tokenizer client.
 *
 * Protocol (mirrors iOS BoltTokenizer.swift):
 * 1. GET /public_key → base64-encoded 32-byte Curve25519 server public key
 * 2. Generate client Curve25519 key pair via TweetNaCl
 * 3. Build plaintext {"cc":"<digits>","cvv":"<digits>"} from raw CharArray (no String)
 * 4. Encrypt with crypto_box (Curve25519-XSalsa20-Poly1305)
 * 5. POST /token with { payload, nonce, public_key } (all base64)
 * 6. Decrypt response with crypto_box_open
 * 7. Response: { token, bin, last4 }
 *
 * Must be called from a background thread (performs network I/O).
 */
class BoltTokenizer(environment: String) {

    data class TokenResult(
        val token: String,
        val bin: String,
        val last4: String
    )

    sealed class TokenizerError : Exception() {
        class PublicKeyFetchFailed(msg: String) : TokenizerError() {
            override val message = "Failed to fetch public key: $msg"
        }
        object EncryptionFailed : TokenizerError() {
            override val message = "Failed to encrypt card data"
        }
        class RequestFailed(msg: String) : TokenizerError() {
            override val message = "Tokenization request failed: $msg"
        }
        object DecryptionFailed : TokenizerError() {
            override val message = "Failed to decrypt tokenization response"
        }
        object InvalidResponse : TokenizerError() {
            override val message = "Invalid tokenization response"
        }
    }

    private val baseURL: String
    private val fallbackURL: String
    private val timeoutMs = 20_000

    init {
        when (environment) {
            "production" -> {
                baseURL = "https://production.bolttk.com"
                fallbackURL = "https://tokenizer.bolt.com"
            }
            "sandbox" -> {
                baseURL = "https://sandbox.bolttk.com"
                fallbackURL = "https://tokenizer-sandbox.bolt.com"
            }
            else -> { // staging
                baseURL = "https://staging.bolttk.com"
                fallbackURL = "https://tokenizer-staging.bolt.com"
            }
        }
    }

    /**
     * Tokenize card data. panDigits and cvvDigits are raw digit values (0-9),
     * NOT ASCII — they are the CharArray digit values stored in BoltCardFieldView.
     *
     * Must be called off the main thread.
     * Throws TokenizerError on failure.
     */
    @Throws(Exception::class)
    fun tokenize(panDigits: CharArray, panLength: Int,
                 cvvDigits: CharArray, cvvLength: Int): TokenResult {

        // Step 1: Fetch server public key
        val serverPublicKey = fetchPublicKey()

        // Step 2: Generate client Curve25519 key pair
        val clientPk = ByteArray(TweetNaCl.BOX_PUBLIC_KEY_BYTES)
        val clientSk = ByteArray(TweetNaCl.BOX_SECRET_KEY_BYTES)
        try {
        if (TweetNaCl.crypto_box_keypair(clientPk, clientSk) != 0) {
            throw TokenizerError.EncryptionFailed
        }

        // Step 3: Build plaintext JSON from raw digits (no String for CHD)
        // {"cc":"<digits>","cvv":"<digits>"}
        // panDigits[i] holds the char '0'..'9', so digit value = panDigits[i].code - '0'.code
        val prefix1 = "{\"cc\":\"".toByteArray(Charsets.UTF_8)
        val infix   = "\",\"cvv\":\"".toByteArray(Charsets.UTF_8)
        val suffix  = "\"}".toByteArray(Charsets.UTF_8)
        val plaintextLen = prefix1.size + panLength + infix.size + cvvLength + suffix.size

        // Allocate with 32-byte zero padding required by crypto_box
        val paddedLen = TweetNaCl.BOX_ZEROBYTES + plaintextLen
        val padded = ByteArray(paddedLen) // zero-initialized
        var pos = TweetNaCl.BOX_ZEROBYTES

        prefix1.forEach { padded[pos++] = it }
        for (i in 0 until panLength) {
            padded[pos++] = (panDigits[i].code).toByte() // panDigits stores '0'..'9' chars
        }
        infix.forEach { padded[pos++] = it }
        for (i in 0 until cvvLength) {
            padded[pos++] = (cvvDigits[i].code).toByte()
        }
        suffix.forEach { padded[pos++] = it }

        // Step 4: Encrypt
        val nonce = ByteArray(TweetNaCl.BOX_NONCE_BYTES)
        TweetNaCl.randombytes(nonce)

        val cipherPadded = ByteArray(paddedLen)
        if (TweetNaCl.crypto_box(cipherPadded, padded, paddedLen.toLong(),
                                  nonce, serverPublicKey, clientSk) != 0) {
            padded.fill(0)
            throw TokenizerError.EncryptionFailed
        }

        // Zero plaintext immediately after encryption
        padded.fill(0)

        // Strip leading 16 BOXZEROBYTES → ciphertext = MAC (16) + encrypted body
        val ciphertext = cipherPadded.copyOfRange(TweetNaCl.BOX_BOXZEROBYTES, paddedLen)

        // Step 5: POST /token
        val postBody = JSONObject().apply {
            put("payload",    Base64.encodeToString(ciphertext, Base64.NO_WRAP))
            put("nonce",      Base64.encodeToString(nonce,      Base64.NO_WRAP))
            put("public_key", Base64.encodeToString(clientPk,   Base64.NO_WRAP))
        }.toString().toByteArray(Charsets.UTF_8)

        val encryptedResponse = postToken(postBody)

        // Step 6: Decrypt response
        val payloadB64 = encryptedResponse.optString("payload", "")
        val nonceB64   = encryptedResponse.optString("nonce",   "")
        if (payloadB64.isEmpty() || nonceB64.isEmpty()) throw TokenizerError.InvalidResponse

        val respPayload = Base64.decode(payloadB64, Base64.DEFAULT)
        val respNonce   = Base64.decode(nonceB64,   Base64.DEFAULT)

        // Re-pad with BOXZEROBYTES before passing to crypto_box_open
        val respPaddedLen = TweetNaCl.BOX_BOXZEROBYTES + respPayload.size
        val respPadded = ByteArray(respPaddedLen)
        respPayload.copyInto(respPadded, TweetNaCl.BOX_BOXZEROBYTES)

        val plainPadded = ByteArray(respPaddedLen)
        if (TweetNaCl.crypto_box_open(plainPadded, respPadded, respPaddedLen.toLong(),
                                       respNonce, serverPublicKey, clientSk) != 0) {
            throw TokenizerError.DecryptionFailed
        }

        // Strip leading ZEROBYTES from decrypted output
        val decryptedBytes = plainPadded.copyOfRange(TweetNaCl.BOX_ZEROBYTES, respPaddedLen)
        val json = try {
            JSONObject(String(decryptedBytes, Charsets.UTF_8))
        } catch (e: Exception) {
            throw TokenizerError.InvalidResponse
        }

        val token = json.optString("token", "")
        if (token.isEmpty()) throw TokenizerError.InvalidResponse

        return TokenResult(
            token = token,
            bin   = json.optString("bin",   ""),
            last4 = json.optString("last4", "")
        )
        } finally {
            // Zero client secret key on all exit paths
            clientSk.fill(0)
        }
    }

    // MARK: - Network helpers

    private fun fetchPublicKey(): ByteArray {
        val raw = fetchWithFallback("/public_key", "GET", null)
        val keyStr = String(raw, Charsets.UTF_8).trim()
        return try {
            Base64.decode(keyStr, Base64.DEFAULT)
        } catch (e: Exception) {
            throw TokenizerError.PublicKeyFetchFailed("Invalid key format")
        }
    }

    private fun postToken(body: ByteArray): JSONObject {
        val raw = fetchWithFallback("/token", "POST", body)
        return try {
            JSONObject(String(raw, Charsets.UTF_8))
        } catch (e: Exception) {
            throw TokenizerError.InvalidResponse
        }
    }

    private fun fetchWithFallback(path: String, method: String, body: ByteArray?): ByteArray {
        return try {
            fetch("$baseURL$path", method, body)
        } catch (e: Exception) {
            // Try fallback URL
            fetch("$fallbackURL$path", method, body)
        }
    }

    // SR-10: Transport security is provided by NaCl crypto_box encryption,
    // not certificate pinning. See iOS BoltTokenizer.swift for rationale.

    private fun fetch(urlStr: String, method: String, body: ByteArray?): ByteArray {
        val conn = URL(urlStr).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = method
            conn.connectTimeout = timeoutMs
            conn.readTimeout    = timeoutMs
            if (body != null) {
                conn.setRequestProperty("Content-Type", "application/json")
                conn.doOutput = true
                conn.outputStream.use { it.write(body) }
            }

            val code = conn.responseCode
            if (code != 200) {
                val msg = conn.errorStream?.bufferedReader()?.readText() ?: "HTTP $code"
                throw TokenizerError.RequestFailed("HTTP $code: $msg")
            }
            return conn.inputStream.readBytes()
        } finally {
            conn.disconnect()
        }
    }

    companion object {
        /** Derive environment string from the Bolt API URL (matches iOS logic). */
        fun environmentFromApiUrl(apiUrl: String): String = when {
            apiUrl.contains("sandbox") -> "sandbox"
            apiUrl.contains("staging") -> "staging"
            else                       -> "production"
        }
    }
}
