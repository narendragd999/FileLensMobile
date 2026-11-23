package com.filelenspro.app.domain.engine

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import com.filelenspro.app.data.model.NormalizedQuad
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.atan2
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Pro-grade on-device Computer Vision document scanner engine (Genius Scan / Google Docs class):
 * - Gradient-guided Polar Hough Transform + 4-Line Analytical Intersection + Perimeter Edge-Support
 *   Scoring (accurately detects document corners even through dark headers, printed tables,
 *   partial finger occlusion, shadows, and rounded ID card corners).
 * - Multi-channel RGB Max-Gradient + Perceptual Desk-Color Distance + Largest Connected Component
 *   hybrid candidate generation.
 * - Harris-style Magnetic Corner Snapping, perspective-ray edge sliding, illumination-resilient
 *   8x8 page-change fingerprinting, Zhang & He 3D projective aspect-ratio recovery, and
 *   Matrix.setPolyToPoly homography warping.
 */
object DocumentEdgeDetector {

    private const val NUM_THETA = 90 // 2-degree angular bins in [0..180)
    private val COS_TABLE = FloatArray(NUM_THETA) { i -> cos(i * 2.0 * PI / 180.0).toFloat() }
    private val SIN_TABLE = FloatArray(NUM_THETA) { i -> sin(i * 2.0 * PI / 180.0).toFloat() }

    private data class HoughLine(
        val thetaBin: Int,
        val rho: Float,
        val cosT: Float,
        val sinT: Float,
        val votes: Float
    )

    private data class GradientField(
        val gx: IntArray,
        val gy: IntArray,
        val mag: IntArray,
        val meanMag: Int
    )

    /**
     * Detects the optimal document quadrilateral from a grayscale luma grid (e.g. live CameraX
     * Y-plane frame ~96x128). Combines Gradient-Guided Hough 4-Line Intersection candidates
     * with Dual-Polarity Connected Component candidates and selects the highest-scoring
     * perimeter-aligned quadrilateral (~3–6ms on mobile CPU).
     */
    fun detectFromLumaGrid(luma: ByteArray, width: Int, height: Int): NormalizedQuad? {
        if (width < 24 || height < 24 || luma.size < width * height) return null

        val smooth = boxBlur3x3(luma, width, height)
        val grad = computeSobelField(smooth, width, height)
        if (grad.meanMag < 3) return null

        val candidates = ArrayList<NormalizedQuad>(8)

        // Candidate family 1: Gradient-Guided Hough 4-Line Intersection (handles headers, fingers, shadows!)
        detectHough4LineCandidates(grad, width, height, candidates)

        // Candidate family 2: Dual-polarity adaptive segmentation + Largest Central Connected Component
        var borderSum = 0L; var borderCount = 0
        val marginX = (width * 0.08f).toInt().coerceAtLeast(2)
        val marginY = (height * 0.08f).toInt().coerceAtLeast(2)
        for (y in 0 until height) {
            val row = y * width
            for (x in 0 until width) {
                if (x < marginX || x >= width - marginX || y < marginY || y >= height - marginY) {
                    borderSum += smooth[row + x]
                    borderCount++
                }
            }
        }
        val borderMean = if (borderCount > 0) (borderSum / borderCount).toInt() else 128

        var centerSum = 0L; var centerCount = 0
        for (y in height / 4 until (height * 3) / 4) {
            val row = y * width
            for (x in width / 4 until (width * 3) / 4) {
                centerSum += smooth[row + x]
                centerCount++
            }
        }
        val centerMean = if (centerCount > 0) (centerSum / centerCount).toInt() else 128
        val contrastDiff = centerMean - borderMean

        if (abs(contrastDiff) >= 15) {
            val brightDoc = contrastDiff > 0
            val threshold = (borderMean + contrastDiff * 0.44f).toInt().coerceIn(24, 240)
            val mask = BooleanArray(width * height)
            for (y in 2 until height - 2) {
                val row = y * width
                for (x in 2 until width - 2) {
                    val v = smooth[row + x]
                    mask[row + x] = if (brightDoc) v >= threshold else v <= threshold
                }
            }
            extractQuadFromLargestCentralBlob(mask, width, height, baseConfidence = 0.74f)?.let {
                candidates.add(it)
            }
        }

        // Candidate family 3: Sobel contour convex-hull fallback
        detectViaSobelContour(grad, width, height)?.let { candidates.add(it) }

        return pickBestScoredCandidate(candidates, grad, width, height)
    }

    /**
     * Full-RGB color-aware document boundary detector for still photos & Auto Detect:
     * Uses max-channel RGB Sobel gradients (catches colored headers & beige-on-wood desks),
     * Gradient-Guided Hough 4-Line Intersections, perceptual desk-color segmentation, and
     * luma fallback—then scores every candidate on true edge support!
     */
    fun detectFromBitmapOrNull(bitmap: Bitmap): NormalizedQuad? {
        val targetW = 152
        val scale = targetW.toFloat() / bitmap.width.coerceAtLeast(1)
        val targetH = (bitmap.height * scale).toInt().coerceIn(48, 228)
        val small = Bitmap.createScaledBitmap(bitmap, targetW, targetH, true)
        val pixels = IntArray(targetW * targetH)
        small.getPixels(pixels, 0, targetW, 0, 0, targetW, targetH)
        small.recycle()

        val rArr = ByteArray(pixels.size)
        val gArr = ByteArray(pixels.size)
        val bArr = ByteArray(pixels.size)
        val luma = ByteArray(pixels.size)
        for (i in pixels.indices) {
            val p = pixels[i]
            val r = Color.red(p)
            val g = Color.green(p)
            val b = Color.blue(p)
            rArr[i] = r.toByte()
            gArr[i] = g.toByte()
            bArr[i] = b.toByte()
            luma[i] = ((r * 299 + g * 587 + b * 114) / 1000).coerceIn(0, 255).toByte()
        }

        // Multi-channel RGB Sobel field (picks strongest gradient across R, G, B channels at every pixel!)
        val rgbGrad = computeMaxChannelRgbSobel(
            boxBlur3x3(rArr, targetW, targetH),
            boxBlur3x3(gArr, targetW, targetH),
            boxBlur3x3(bArr, targetW, targetH),
            targetW,
            targetH
        )
        if (rgbGrad.meanMag < 3) return null

        val candidates = ArrayList<NormalizedQuad>(10)

        // 1. RGB Max-Channel Gradient-Guided Hough 4-Line Intersections (flagship detector!)
        detectHough4LineCandidates(rgbGrad, targetW, targetH, candidates)

        // 2. Perceptual RGB desk-color distance segmentation (beats wood desks & colorful ID cards!)
        val marginX = (targetW * 0.08f).toInt().coerceAtLeast(2)
        val marginY = (targetH * 0.08f).toInt().coerceAtLeast(2)
        var bR = 0L; var bG = 0L; var bB = 0L; var bCnt = 0
        for (y in 0 until targetH) {
            val row = y * targetW
            for (x in 0 until targetW) {
                if (x < marginX || x >= targetW - marginX || y < marginY || y >= targetH - marginY) {
                    val p = pixels[row + x]
                    bR += Color.red(p); bG += Color.green(p); bB += Color.blue(p)
                    bCnt++
                }
            }
        }
        val bgR = if (bCnt > 0) (bR / bCnt).toInt() else 128
        val bgG = if (bCnt > 0) (bG / bCnt).toInt() else 128
        val bgB = if (bCnt > 0) (bB / bCnt).toInt() else 128

        var centerDistSum = 0L; var centerCnt = 0
        val colorDist = IntArray(pixels.size)
        for (y in 0 until targetH) {
            val row = y * targetW
            for (x in 0 until targetW) {
                val p = pixels[row + x]
                val d = abs(Color.red(p) - bgR) + abs(Color.green(p) - bgG) + abs(Color.blue(p) - bgB)
                colorDist[row + x] = d
                if (x in (targetW / 4) until (targetW * 3 / 4) && y in (targetH / 4) until (targetH * 3 / 4)) {
                    centerDistSum += d
                    centerCnt++
                }
            }
        }
        val meanCenterDist = if (centerCnt > 0) (centerDistSum / centerCnt).toInt() else 0
        if (meanCenterDist >= 38) {
            val thresh = (meanCenterDist * 0.46f).toInt().coerceIn(28, 160)
            val mask = BooleanArray(pixels.size)
            for (y in 2 until targetH - 2) {
                val row = y * targetW
                for (x in 2 until targetW - 2) {
                    mask[row + x] = colorDist[row + x] >= thresh
                }
            }
            extractQuadFromLargestCentralBlob(mask, targetW, targetH, baseConfidence = 0.78f)?.let {
                candidates.add(it)
            }
        }

        // 3. Luma pipeline candidate
        detectFromLumaGrid(luma, targetW, targetH)?.let { candidates.add(it) }

        return pickBestScoredCandidate(candidates, rgbGrad, targetW, targetH)
    }

    fun detectFromBitmap(bitmap: Bitmap): NormalizedQuad =
        detectFromBitmapOrNull(bitmap) ?: NormalizedQuad.FULL

    private fun computeSobelField(smooth: IntArray, width: Int, height: Int): GradientField {
        val total = width * height
        val gxArr = IntArray(total)
        val gyArr = IntArray(total)
        val magArr = IntArray(total)
        var sum = 0L
        var cnt = 0
        for (y in 1 until height - 1) {
            val row = y * width
            for (x in 1 until width - 1) {
                val gx = -smooth[row - width + x - 1] + smooth[row - width + x + 1] -
                    2 * smooth[row + x - 1] + 2 * smooth[row + x + 1] -
                    smooth[row + width + x - 1] + smooth[row + width + x + 1]
                val gy = -smooth[row - width + x - 1] - 2 * smooth[row - width + x] -
                    smooth[row - width + x + 1] + smooth[row + width + x - 1] +
                    2 * smooth[row + width + x] + smooth[row + width + x + 1]
                val m = abs(gx) + abs(gy)
                gxArr[row + x] = gx
                gyArr[row + x] = gy
                magArr[row + x] = m
                sum += m
                cnt++
            }
        }
        return GradientField(gxArr, gyArr, magArr, if (cnt > 0) (sum / cnt).toInt() else 0)
    }

    private fun computeMaxChannelRgbSobel(
        r: IntArray,
        g: IntArray,
        b: IntArray,
        width: Int,
        height: Int
    ): GradientField {
        val total = width * height
        val gxArr = IntArray(total)
        val gyArr = IntArray(total)
        val magArr = IntArray(total)
        var sum = 0L
        var cnt = 0
        for (y in 1 until height - 1) {
            val row = y * width
            for (x in 1 until width - 1) {
                val gxR = -r[row - width + x - 1] + r[row - width + x + 1] - 2 * r[row + x - 1] + 2 * r[row + x + 1] - r[row + width + x - 1] + r[row + width + x + 1]
                val gyR = -r[row - width + x - 1] - 2 * r[row - width + x] - r[row - width + x + 1] + r[row + width + x - 1] + 2 * r[row + width + x] + r[row + width + x + 1]
                val mR = abs(gxR) + abs(gyR)

                val gxG = -g[row - width + x - 1] + g[row - width + x + 1] - 2 * g[row + x - 1] + 2 * g[row + x + 1] - g[row + width + x - 1] + g[row + width + x + 1]
                val gyG = -g[row - width + x - 1] - 2 * g[row - width + x] - g[row - width + x + 1] + g[row + width + x - 1] + 2 * g[row + width + x] + g[row + width + x + 1]
                val mG = abs(gxG) + abs(gyG)

                val gxB = -b[row - width + x - 1] + b[row - width + x + 1] - 2 * b[row + x - 1] + 2 * b[row + x + 1] - b[row + width + x - 1] + b[row + width + x + 1]
                val gyB = -b[row - width + x - 1] - 2 * b[row - width + x] - b[row - width + x + 1] + b[row + width + x - 1] + 2 * b[row + width + x] + b[row + width + x + 1]
                val mB = abs(gxB) + abs(gyB)

                if (mR >= mG && mR >= mB) {
                    gxArr[row + x] = gxR; gyArr[row + x] = gyR; magArr[row + x] = mR; sum += mR
                } else if (mG >= mB) {
                    gxArr[row + x] = gxG; gyArr[row + x] = gyG; magArr[row + x] = mG; sum += mG
                } else {
                    gxArr[row + x] = gxB; gyArr[row + x] = gyB; magArr[row + x] = mB; sum += mB
                }
                cnt++
            }
        }
        return GradientField(gxArr, gyArr, magArr, if (cnt > 0) (sum / cnt).toInt() else 0)
    }

    /**
     * Gradient-Guided Non-Maximum-Suppressed Polar Hough Transform:
     * Finds the strongest straight outer boundary lines and analytically intersects
     * (Top, Bottom, Left, Right) combinations into crisp exact 4-corner quadrilaterals.
     */
    private fun detectHough4LineCandidates(
        grad: GradientField,
        width: Int,
        height: Int,
        outCandidates: MutableList<NormalizedQuad>
    ) {
        val thresh = (grad.meanMag * 2.1f).toInt().coerceAtLeast(48)
        val maxRho = ceil(hypot(width.toDouble(), height.toDouble())).toInt()
        val numRho = maxRho * 2 + 1
        val accum = FloatArray(NUM_THETA * numRho)

        val padX = 2
        val padY = 2
        for (y in padY until height - padY) {
            val row = y * width
            for (x in padX until width - padX) {
                val m = grad.mag[row + x]
                if (m < thresh) continue

                val gx = grad.gx[row + x]
                val gy = grad.gy[row + x]
                val ax = abs(gx)
                val ay = abs(gy)

                // Fast 4-direction Non-Maximum Suppression thins blurry edges to 1px straight lines
                val isLocalMax = when {
                    ax > ay * 2 -> m >= grad.mag[row + x - 1] && m >= grad.mag[row + x + 1]
                    ay > ax * 2 -> m >= grad.mag[row - width + x] && m >= grad.mag[row + width + x]
                    (gx > 0 && gy > 0) || (gx < 0 && gy < 0) ->
                        m >= grad.mag[row - width + x - 1] && m >= grad.mag[row + width + x + 1]
                    else ->
                        m >= grad.mag[row - width + x + 1] && m >= grad.mag[row + width + x - 1]
                }
                if (!isLocalMax) continue

                var angleDeg = atan2(gy.toDouble(), gx.toDouble()) * 180.0 / PI
                if (angleDeg < 0.0) angleDeg += 180.0
                if (angleDeg >= 180.0) angleDeg -= 180.0
                val baseBin = ((angleDeg / 2.0).roundToInt()) % NUM_THETA
                val weight = min(m.toFloat(), 320f)

                // Vote into baseBin and immediate ±1 angular neighbors
                for (dBin in -1..1) {
                    val b = (baseBin + dBin + NUM_THETA) % NUM_THETA
                    val rhoF = x * COS_TABLE[b] + y * SIN_TABLE[b]
                    val rIdx = (rhoF.roundToInt() + maxRho).coerceIn(0, numRho - 1)
                    accum[b * numRho + rIdx] += if (dBin == 0) weight else weight * 0.45f
                }
            }
        }

        // Extract top 14 non-maximum-suppressed peaks from Hough space
        val peaks = ArrayList<HoughLine>(16)
        val minVotes = (min(width, height) * 18f)
        val used = BooleanArray(accum.size)

        repeat(14) {
            var bestVal = minVotes
            var bestIdx = -1
            for (i in accum.indices) {
                if (!used[i] && accum[i] > bestVal) {
                    bestVal = accum[i]
                    bestIdx = i
                }
            }
            if (bestIdx < 0) return@repeat
            val tb = bestIdx / numRho
            val ri = bestIdx - tb * numRho
            val rho = (ri - maxRho).toFloat()
            peaks.add(HoughLine(tb, rho, COS_TABLE[tb], SIN_TABLE[tb], bestVal))

            // Suppress ±5 angular bins (10°) and ±7px rho neighborhood
            for (dt in -5..5) {
                val nb = (tb + dt + NUM_THETA) % NUM_THETA
                for (dr in -7..7) {
                    val nr = ri + dr
                    if (nr in 0 until numRho) {
                        used[nb * numRho + nr] = true
                    }
                }
            }
        }

        if (peaks.size < 4) return

        // Group lines into roughly horizontal (Top/Bottom) and roughly vertical (Left/Right)
        val midX = width * 0.5f
        val midY = height * 0.5f
        val topLines = ArrayList<HoughLine>(5)
        val botLines = ArrayList<HoughLine>(5)
        val leftLines = ArrayList<HoughLine>(5)
        val rightLines = ArrayList<HoughLine>(5)

        peaks.forEach { line ->
            val deg = line.thetaBin * 2
            val isHorizEdge = deg in 50..130 // Normal is vertical -> edge is horizontal
            val isVertEdge = deg <= 40 || deg >= 140 // Normal is horizontal -> edge is vertical
            if (isHorizEdge && abs(line.sinT) > 0.25f) {
                val yAtMid = (line.rho - midX * line.cosT) / line.sinT
                if (yAtMid < midY && topLines.size < 4) topLines.add(line)
                else if (yAtMid >= midY && botLines.size < 4) botLines.add(line)
            } else if (isVertEdge && abs(line.cosT) > 0.25f) {
                val xAtMid = (line.rho - midY * line.sinT) / line.cosT
                if (xAtMid < midX && leftLines.size < 4) leftLines.add(line)
                else if (xAtMid >= midX && rightLines.size < 4) rightLines.add(line)
            }
        }

        if (topLines.isEmpty() || botLines.isEmpty() || leftLines.isEmpty() || rightLines.isEmpty()) return

        fun intersect(a: HoughLine, b: HoughLine): Pair<Float, Float>? {
            val det = a.cosT * b.sinT - b.cosT * a.sinT
            if (abs(det) < 0.22f) return null
            val x = (b.sinT * a.rho - a.sinT * b.rho) / det
            val y = (a.cosT * b.rho - b.cosT * a.rho) / det
            return x to y
        }

        val wF = width.toFloat()
        val hF = height.toFloat()

        var bestHoughQuad: NormalizedQuad? = null
        var bestHoughScore = 0f

        for (t in topLines) {
            for (b in botLines) {
                for (l in leftLines) {
                    for (r in rightLines) {
                        val pTL = intersect(t, l) ?: continue
                        val pTR = intersect(t, r) ?: continue
                        val pBR = intersect(b, r) ?: continue
                        val pBL = intersect(b, l) ?: continue

                        // Ensure all 4 vertices are within/near the frame bounds
                        val pts = listOf(pTL, pTR, pBR, pBL)
                        if (pts.any { (x, y) -> x < -wF * 0.04f || x > wF * 1.04f || y < -hF * 0.04f || y > hF * 1.04f }) {
                            continue
                        }

                        val q = NormalizedQuad(
                            tlX = (pTL.first / wF).coerceIn(0.005f, 0.995f),
                            tlY = (pTL.second / hF).coerceIn(0.005f, 0.995f),
                            trX = (pTR.first / wF).coerceIn(0.005f, 0.995f),
                            trY = (pTR.second / hF).coerceIn(0.005f, 0.995f),
                            brX = (pBR.first / wF).coerceIn(0.005f, 0.995f),
                            brY = (pBR.second / hF).coerceIn(0.005f, 0.995f),
                            blX = (pBL.first / wF).coerceIn(0.005f, 0.995f),
                            blY = (pBL.second / hF).coerceIn(0.005f, 0.995f),
                            confidence = 0.82f
                        )
                        val area = computeQuadArea(q)
                        if (area < 0.14f || area > 0.96f) continue
                        if (!isConvexAndValid(q) || !hasReasonableCornerAngles(q)) continue

                        val sc = scoreQuadPerimeter(q, grad, width, height)
                        if (sc > bestHoughScore) {
                            bestHoughScore = sc
                            bestHoughQuad = q.copy(confidence = (0.62f + sc * 0.36f).coerceIn(0.55f, 0.99f))
                        }
                    }
                }
            }
        }

        if (bestHoughQuad != null && bestHoughScore >= 0.24f) {
            outCandidates.add(bestHoughQuad)
        }
    }

    /**
     * Scores a candidate quadrilateral by sampling directional gradient support along all 4 edges.
     * Rewards quads where ALL 4 sides sit directly on crisp perpendicular image edges.
     */
    private fun scoreQuadPerimeter(q: NormalizedQuad, grad: GradientField, width: Int, height: Int): Float {
        val pts = arrayOf(
            q.tlX * (width - 1) to q.tlY * (height - 1),
            q.trX * (width - 1) to q.trY * (height - 1),
            q.brX * (width - 1) to q.brY * (height - 1),
            q.blX * (width - 1) to q.blY * (height - 1)
        )
        val normDenom = (grad.meanMag * 3.4f).coerceAtLeast(75f)
        val samplesPerEdge = 24
        var sumEdgeScores = 0f
        var minEdgeScore = 1f

        for (e in 0 until 4) {
            val (x0, y0) = pts[e]
            val (x1, y1) = pts[(e + 1) % 4]
            val dx = x1 - x0
            val dy = y1 - y0
            val len = hypot(dx.toDouble(), dy.toDouble()).toFloat().coerceAtLeast(1f)
            // Unit edge normal
            val nx = -dy / len
            val ny = dx / len

            var edgeHitSum = 0f
            for (s in 1..samplesPerEdge) {
                val t = s.toFloat() / (samplesPerEdge + 1)
                val sx = x0 + dx * t
                val sy = y0 + dy * t
                var bestLocal = 0f
                // Check ±1.5px perpendicular to edge to tolerate minor discretization
                for (off in -1..1) {
                    val px = (sx + nx * off).roundToInt().coerceIn(1, width - 2)
                    val py = (sy + ny * off).roundToInt().coerceIn(1, height - 2)
                    val idx = py * width + px
                    val gx = grad.gx[idx].toFloat()
                    val gy = grad.gy[idx].toFloat()
                    // Directional alignment with edge normal rejects stray interior text perpendicular to border
                    val aligned = abs(gx * nx + gy * ny)
                    if (aligned > bestLocal) bestLocal = aligned
                }
                edgeHitSum += (bestLocal / normDenom).coerceIn(0f, 1f)
            }
            val edgeScore = edgeHitSum / samplesPerEdge
            sumEdgeScores += edgeScore
            if (edgeScore < minEdgeScore) minEdgeScore = edgeScore
        }

        val meanEdge = sumEdgeScores * 0.25f
        val areaBonus = sqrt(computeQuadArea(q).coerceIn(0.10f, 0.95f)) * 0.14f
        return (meanEdge * 0.62f + minEdgeScore * 0.38f + areaBonus).coerceIn(0f, 1.15f)
    }

    private fun pickBestScoredCandidate(
        candidates: List<NormalizedQuad>,
        grad: GradientField,
        width: Int,
        height: Int
    ): NormalizedQuad? {
        if (candidates.isEmpty()) return null
        var best: NormalizedQuad? = null
        var bestScore = -1f
        for (cand in candidates) {
            if (!isConvexAndValid(cand)) continue
            val area = computeQuadArea(cand)
            if (area < 0.12f || area > 0.96f) continue
            val perim = scoreQuadPerimeter(cand, grad, width, height)
            val total = perim + cand.confidence * 0.18f
            if (total > bestScore) {
                bestScore = total
                best = cand.copy(confidence = (0.52f + perim * 0.44f).coerceIn(0.48f, 0.99f))
            }
        }
        return best
    }

    private fun hasReasonableCornerAngles(q: NormalizedQuad): Boolean {
        val pts = arrayOf(
            q.tlX to q.tlY,
            q.trX to q.trY,
            q.brX to q.brY,
            q.blX to q.blY
        )
        for (i in 0 until 4) {
            val prev = pts[(i + 3) % 4]
            val cur = pts[i]
            val next = pts[(i + 1) % 4]
            val v1x = prev.first - cur.first; val v1y = prev.second - cur.second
            val v2x = next.first - cur.first; val v2y = next.second - cur.second
            val d1 = hypot(v1x.toDouble(), v1y.toDouble())
            val d2 = hypot(v2x.toDouble(), v2y.toDouble())
            if (d1 < 1e-4 || d2 < 1e-4) return false
            val cosA = ((v1x * v2x + v1y * v2y) / (d1 * d2)).coerceIn(-1.0, 1.0)
            val angleDeg = acos(cosA) * 180.0 / PI
            if (angleDeg < 45.0 || angleDeg > 138.0) return false
        }
        return true
    }

    private fun boxBlur3x3(luma: ByteArray, width: Int, height: Int): IntArray {
        val smooth = IntArray(width * height)
        for (y in 0 until height) {
            val row = y * width
            for (x in 0 until width) {
                if (x == 0 || y == 0 || x == width - 1 || y == height - 1) {
                    smooth[row + x] = luma[row + x].toInt() and 0xFF
                } else {
                    val sum =
                        (luma[row - width + x - 1].toInt() and 0xFF) +
                            (luma[row - width + x].toInt() and 0xFF) +
                            (luma[row - width + x + 1].toInt() and 0xFF) +
                            (luma[row + x - 1].toInt() and 0xFF) +
                            (luma[row + x].toInt() and 0xFF) +
                            (luma[row + x + 1].toInt() and 0xFF) +
                            (luma[row + width + x - 1].toInt() and 0xFF) +
                            (luma[row + width + x].toInt() and 0xFF) +
                            (luma[row + width + x + 1].toInt() and 0xFF)
                    smooth[row + x] = sum / 9
                }
            }
        }
        return smooth
    }

    private fun extractQuadFromLargestCentralBlob(
        mask: BooleanArray,
        width: Int,
        height: Int,
        baseConfidence: Float
    ): NormalizedQuad? {
        val total = width * height
        val visited = BooleanArray(total)
        val queue = IntArray(total)

        val cxMin = (width * 0.20f).toInt()
        val cxMax = (width * 0.80f).toInt()
        val cyMin = (height * 0.20f).toInt()
        val cyMax = (height * 0.80f).toInt()

        var bestStart = -1
        var bestSize = 0
        val minBlobPixels = (total * 0.10f).toInt().coerceAtLeast(48)

        for (y in cyMin until cyMax) {
            val row = y * width
            for (x in cxMin until cxMax) {
                val startIdx = row + x
                if (!mask[startIdx] || visited[startIdx]) continue
                var head = 0
                var tail = 0
                queue[tail++] = startIdx
                visited[startIdx] = true

                while (head < tail) {
                    val cur = queue[head++]
                    val cy = cur / width
                    val cx = cur - cy * width
                    if (cx > 1 && mask[cur - 1] && !visited[cur - 1]) {
                        visited[cur - 1] = true; queue[tail++] = cur - 1
                    }
                    if (cx < width - 2 && mask[cur + 1] && !visited[cur + 1]) {
                        visited[cur + 1] = true; queue[tail++] = cur + 1
                    }
                    if (cy > 1 && mask[cur - width] && !visited[cur - width]) {
                        visited[cur - width] = true; queue[tail++] = cur - width
                    }
                    if (cy < height - 2 && mask[cur + width] && !visited[cur + width]) {
                        visited[cur + width] = true; queue[tail++] = cur + width
                    }
                }
                if (tail > bestSize) {
                    bestSize = tail
                    bestStart = startIdx
                }
            }
        }

        if (bestStart < 0 || bestSize < minBlobPixels) return null

        val inBlob = BooleanArray(total)
        var head = 0
        var tail = 0
        queue[tail++] = bestStart
        inBlob[bestStart] = true
        while (head < tail) {
            val cur = queue[head++]
            val cy = cur / width
            val cx = cur - cy * width
            if (cx > 1 && mask[cur - 1] && !inBlob[cur - 1]) {
                inBlob[cur - 1] = true; queue[tail++] = cur - 1
            }
            if (cx < width - 2 && mask[cur + 1] && !inBlob[cur + 1]) {
                inBlob[cur + 1] = true; queue[tail++] = cur + 1
            }
            if (cy > 1 && mask[cur - width] && !inBlob[cur - width]) {
                inBlob[cur - width] = true; queue[tail++] = cur - width
            }
            if (cy < height - 2 && mask[cur + width] && !inBlob[cur + width]) {
                inBlob[cur + width] = true; queue[tail++] = cur + width
            }
        }

        val edgeX = IntArray(tail)
        val edgeY = IntArray(tail)
        var edgeCount = 0
        for (i in 0 until tail) {
            val idx = queue[i]
            val y = idx / width
            val x = idx - y * width
            if (x <= 1 || x >= width - 2 || y <= 1 || y >= height - 2 ||
                !inBlob[idx - 1] || !inBlob[idx + 1] || !inBlob[idx - width] || !inBlob[idx + width]
            ) {
                edgeX[edgeCount] = x
                edgeY[edgeCount] = y
                edgeCount++
            }
        }
        if (edgeCount < 24) return null

        return fitQuadFromContourPoints(edgeX, edgeY, edgeCount, width, height, baseConfidence)
    }

    private fun detectViaSobelContour(grad: GradientField, width: Int, height: Int): NormalizedQuad? {
        if (grad.meanMag < 4) return null
        val gradThresh = (grad.meanMag * 2.3f).toInt().coerceAtLeast(64)
        val padX = (width * 0.03f).toInt().coerceAtLeast(2)
        val padY = (height * 0.03f).toInt().coerceAtLeast(2)

        val edgeX = IntArray(width * height)
        val edgeY = IntArray(width * height)
        var edgeCount = 0
        for (y in padY until height - padY) {
            val row = y * width
            for (x in padX until width - padX) {
                if (grad.mag[row + x] < gradThresh) continue
                var neighbors = 0
                if (grad.mag[row + x - 1] >= gradThresh) neighbors++
                if (grad.mag[row + x + 1] >= gradThresh) neighbors++
                if (grad.mag[row - width + x] >= gradThresh) neighbors++
                if (grad.mag[row + width + x] >= gradThresh) neighbors++
                if (grad.mag[row - width + x - 1] >= gradThresh) neighbors++
                if (grad.mag[row - width + x + 1] >= gradThresh) neighbors++
                if (grad.mag[row + width + x - 1] >= gradThresh) neighbors++
                if (grad.mag[row + width + x + 1] >= gradThresh) neighbors++
                if (neighbors >= 2) {
                    edgeX[edgeCount] = x
                    edgeY[edgeCount] = y
                    edgeCount++
                }
            }
        }
        if (edgeCount < 32) return null

        return fitQuadFromContourPoints(edgeX, edgeY, edgeCount, width, height, baseConfidence = 0.56f)
    }

    private fun fitQuadFromContourPoints(
        xs: IntArray,
        ys: IntArray,
        count: Int,
        width: Int,
        height: Int,
        baseConfidence: Float
    ): NormalizedQuad? {
        if (count < 4) return null

        val packed = LongArray(count) { i ->
            (xs[i].toLong() shl 32) or (ys[i].toLong() and 0xFFFFFFFFL)
        }
        packed.sort()

        fun px(p: Long) = (p ushr 32).toInt()
        fun py(p: Long) = p.toInt()
        fun cross(o: Long, a: Long, b: Long): Long =
            (px(a) - px(o)).toLong() * (py(b) - py(o)).toLong() -
                (py(a) - py(o)).toLong() * (px(b) - px(o)).toLong()

        val hull = LongArray(count * 2)
        var k = 0
        for (i in 0 until count) {
            val p = packed[i]
            while (k >= 2 && cross(hull[k - 2], hull[k - 1], p) <= 0L) k--
            hull[k++] = p
        }
        val t = k + 1
        for (i in count - 2 downTo 0) {
            val p = packed[i]
            while (k >= t && cross(hull[k - 2], hull[k - 1], p) <= 0L) k--
            hull[k++] = p
        }
        val hullSize = (k - 1).coerceAtLeast(0)
        if (hullSize < 4) return null

        var tlIdx = 0; var trIdx = 0; var brIdx = 0; var blIdx = 0
        var minSum = Int.MAX_VALUE; var maxSum = Int.MIN_VALUE
        var maxDiff = Int.MIN_VALUE; var minDiff = Int.MAX_VALUE
        for (i in 0 until hullSize) {
            val x = px(hull[i])
            val y = py(hull[i])
            val s = x + y
            val d = x - y
            if (s < minSum) { minSum = s; tlIdx = i }
            if (s > maxSum) { maxSum = s; brIdx = i }
            if (d > maxDiff) { maxDiff = d; trIdx = i }
            if (d < minDiff) { minDiff = d; blIdx = i }
        }

        val distinctCount = setOf(tlIdx, trIdx, brIdx, blIdx).size
        val cornerPoints: List<Pair<Int, Int>> = if (distinctCount == 4) {
            listOf(
                px(hull[tlIdx]) to py(hull[tlIdx]),
                px(hull[trIdx]) to py(hull[trIdx]),
                px(hull[brIdx]) to py(hull[brIdx]),
                px(hull[blIdx]) to py(hull[blIdx])
            )
        } else {
            val step = max(1, hullSize / 28)
            val cand = ArrayList<Pair<Int, Int>>(32)
            var idx = 0
            while (idx < hullSize) {
                cand.add(px(hull[idx]) to py(hull[idx]))
                idx += step
            }
            if (cand.size < 4) return null
            var bestArea = -1L
            var bestQuad = listOf(cand[0], cand[1], cand[2], cand[3])
            val n = cand.size
            for (a in 0 until n - 3) {
                for (b in a + 1 until n - 2) {
                    for (c in b + 1 until n - 1) {
                        for (d in c + 1 until n) {
                            val pa = cand[a]; val pb = cand[b]; val pc = cand[c]; val pd = cand[d]
                            val area2 = abs(
                                pa.first.toLong() * pb.second - pa.second.toLong() * pb.first +
                                    pb.first.toLong() * pc.second - pb.second.toLong() * pc.first +
                                    pc.first.toLong() * pd.second - pc.second.toLong() * pd.first +
                                    pd.first.toLong() * pa.second - pd.second.toLong() * pa.first
                            )
                            if (area2 > bestArea) {
                                bestArea = area2
                                bestQuad = listOf(pa, pb, pc, pd)
                            }
                        }
                    }
                }
            }
            orderCornersClockwise(bestQuad)
        }

        val ordered = orderCornersClockwise(cornerPoints)
        val wF = width.toFloat()
        val hF = height.toFloat()

        val q = NormalizedQuad(
            tlX = (ordered[0].first / wF).coerceIn(0.01f, 0.99f),
            tlY = (ordered[0].second / hF).coerceIn(0.01f, 0.99f),
            trX = (ordered[1].first / wF).coerceIn(0.01f, 0.99f),
            trY = (ordered[1].second / hF).coerceIn(0.01f, 0.99f),
            brX = (ordered[2].first / wF).coerceIn(0.01f, 0.99f),
            brY = (ordered[2].second / hF).coerceIn(0.01f, 0.99f),
            blX = (ordered[3].first / wF).coerceIn(0.01f, 0.99f),
            blY = (ordered[3].second / hF).coerceIn(0.01f, 0.99f),
            confidence = 0f
        )

        val area = computeQuadArea(q)
        if (area < 0.12f || area > 0.96f) return null
        if (!isConvexAndValid(q)) return null

        val conf = (baseConfidence + (area * 0.28f)).coerceIn(0.45f, 0.98f)
        return q.copy(confidence = conf)
    }

    private fun orderCornersClockwise(pts: List<Pair<Int, Int>>): List<Pair<Int, Int>> {
        val sortedByY = pts.sortedBy { it.second }
        val topTwo = sortedByY.take(2).sortedBy { it.first }
        val bottomTwo = sortedByY.drop(2).sortedBy { it.first }
        return listOf(topTwo[0], topTwo[1], bottomTwo[1], bottomTwo[0])
    }

    /**
     * Google Docs Scanner–style perspective-ray edge sliding:
     * Translates edge [edgeIndex] (0=Top, 1=Right, 2=Bottom, 3=Left) parallel to itself
     * while sliding its two endpoints strictly along the converging perspective lines
     * of the two adjacent edges (keeping both corners inside [0..1]).
     */
    fun slideEdgeAlongPerspective(
        q: NormalizedQuad,
        edgeIndex: Int,
        dx: Float,
        dy: Float
    ): NormalizedQuad {
        val pts = arrayOf(
            q.tlX to q.tlY,
            q.trX to q.trY,
            q.brX to q.brY,
            q.blX to q.blY
        )
        val iA = edgeIndex % 4
        val iB = (edgeIndex + 1) % 4
        val iPrev = (edgeIndex + 3) % 4
        val iNext = (edgeIndex + 2) % 4

        val a = pts[iA]
        val b = pts[iB]
        val prev = pts[iPrev]
        val next = pts[iNext]

        // Edge direction & unit normal
        val ex = b.first - a.first
        val ey = b.second - a.second
        val eLen = hypot(ex.toDouble(), ey.toDouble()).toFloat().coerceAtLeast(1e-4f)
        val nx = -ey / eLen
        val ny = ex / eLen

        // Project drag delta onto edge normal
        val shift = dx * nx + dy * ny

        // Intersect shifted edge line with adjacent perspective rays (prev -> a) and (next -> b)
        fun movePointAlongRay(origin: Pair<Float, Float>, anchor: Pair<Float, Float>): Pair<Float, Float> {
            val rx = anchor.first - origin.first
            val ry = anchor.second - origin.second
            val denom = rx * nx + ry * ny
            if (abs(denom) < 1e-4f) {
                return (anchor.first + nx * shift).coerceIn(0f, 1f) to (anchor.second + ny * shift).coerceIn(0f, 1f)
            }
            val t = shift / denom
            val nxPt = (anchor.first + rx * t).coerceIn(0f, 1f)
            val nyPt = (anchor.second + ry * t).coerceIn(0f, 1f)
            return nxPt to nyPt
        }

        val newA = movePointAlongRay(prev, a)
        val newB = movePointAlongRay(next, b)

        val out = pts.copyOf()
        out[iA] = newA
        out[iB] = newB
        return q.copy(
            tlX = out[0].first, tlY = out[0].second,
            trX = out[1].first, trY = out[1].second,
            brX = out[2].first, brY = out[2].second,
            blX = out[3].first, blY = out[3].second
        )
    }

    /**
     * Lightweight cornerness map (Harris corner response from Sobel gradients)
     * used for Genius Scan-style optional Magnetic Corner Snapping on handle release.
     */
    data class EdgeCornerMap(
        val width: Int,
        val height: Int,
        val cornerScores: FloatArray
    )

    fun computeEdgeCornerMap(bitmap: Bitmap, targetW: Int = 160): EdgeCornerMap {
        val scale = targetW.toFloat() / bitmap.width.coerceAtLeast(1)
        val targetH = (bitmap.height * scale).toInt().coerceIn(48, 240)
        val small = Bitmap.createScaledBitmap(bitmap, targetW, targetH, true)
        val pixels = IntArray(targetW * targetH)
        small.getPixels(pixels, 0, targetW, 0, 0, targetW, targetH)
        small.recycle()

        val luma = ByteArray(pixels.size)
        for (i in pixels.indices) {
            val p = pixels[i]
            luma[i] = ((Color.red(p) * 299 + Color.green(p) * 587 + Color.blue(p) * 114) / 1000).coerceIn(0, 255).toByte()
        }
        return computeEdgeCornerMapFromLuma(luma, targetW, targetH)
    }

    fun computeEdgeCornerMapFromLuma(luma: ByteArray, width: Int, height: Int): EdgeCornerMap {
        val smooth = boxBlur3x3(luma, width, height)
        val gxArr = FloatArray(width * height)
        val gyArr = FloatArray(width * height)
        for (y in 1 until height - 1) {
            val row = y * width
            for (x in 1 until width - 1) {
                val gx = (-smooth[row - width + x - 1] + smooth[row - width + x + 1] -
                    2 * smooth[row + x - 1] + 2 * smooth[row + x + 1] -
                    smooth[row + width + x - 1] + smooth[row + width + x + 1]).toFloat()
                val gy = (-smooth[row - width + x - 1] - 2 * smooth[row - width + x] -
                    smooth[row - width + x + 1] + smooth[row + width + x - 1] +
                    2 * smooth[row + width + x] + smooth[row + width + x + 1]).toFloat()
                gxArr[row + x] = gx
                gyArr[row + x] = gy
            }
        }
        val scores = FloatArray(width * height)
        for (y in 2 until height - 2) {
            for (x in 2 until width - 2) {
                var sxx = 0f; var syy = 0f; var sxy = 0f
                for (dy in -1..1) {
                    val r = (y + dy) * width
                    for (dx in -1..1) {
                        val ix = gxArr[r + x + dx]
                        val iy = gyArr[r + x + dx]
                        sxx += ix * ix
                        syy += iy * iy
                        sxy += ix * iy
                    }
                }
                val det = sxx * syy - sxy * sxy
                val trace = sxx + syy
                val harris = det - 0.05f * trace * trace
                if (harris > 0f) {
                    scores[y * width + x] = sqrt(harris)
                }
            }
        }
        return EdgeCornerMap(width, height, scores)
    }

    fun snapCornerToEdge(
        nx: Float,
        ny: Float,
        map: EdgeCornerMap,
        searchRadiusNorm: Float = 0.032f
    ): Pair<Float, Float> {
        val cx = (nx * map.width).toInt().coerceIn(2, map.width - 3)
        val cy = (ny * map.height).toInt().coerceIn(2, map.height - 3)
        val rx = (searchRadiusNorm * map.width).toInt().coerceIn(2, 8)
        val ry = (searchRadiusNorm * map.height).toInt().coerceIn(2, 8)

        var bestScore = 0f
        var bestX = cx
        var bestY = cy
        var sumScore = 0f
        var count = 0

        for (y in (cy - ry).coerceAtLeast(2)..(cy + ry).coerceAtMost(map.height - 3)) {
            val row = y * map.width
            for (x in (cx - rx).coerceAtLeast(2)..(cx + rx).coerceAtMost(map.width - 3)) {
                val sc = map.cornerScores[row + x]
                sumScore += sc
                count++
                val distFactor = 1f - 0.18f * (hypot((x - cx).toDouble(), (y - cy).toDouble()).toFloat() / max(rx, ry).coerceAtLeast(1))
                val weighted = sc * distFactor
                if (weighted > bestScore) {
                    bestScore = weighted
                    bestX = x
                    bestY = y
                }
            }
        }
        val avg = if (count > 0) sumScore / count else 0f
        return if (bestScore > 1200f && bestScore > avg * 2.4f) {
            (bestX.toFloat() / map.width).coerceIn(0f, 1f) to (bestY.toFloat() / map.height).coerceIn(0f, 1f)
        } else {
            nx to ny
        }
    }

    /**
     * Compact 8x8 central-region luma fingerprint (64 cell means in [0..255]) computed in <0.1ms
     * directly from the live camera Y-plane grid to detect when the user actually swaps/turns
     * a document page in Batch or ID Card auto-capture mode.
     */
    fun computeLumaFingerprint(luma: ByteArray, width: Int, height: Int): FloatArray {
        val bins = 8
        val out = FloatArray(bins * bins)
        if (width < 16 || height < 16 || luma.size < width * height) return out

        val x0 = (width * 0.14f).toInt()
        val x1 = (width * 0.86f).toInt().coerceAtLeast(x0 + bins)
        val y0 = (height * 0.14f).toInt()
        val y1 = (height * 0.86f).toInt().coerceAtLeast(y0 + bins)
        val spanW = (x1 - x0).toFloat()
        val spanH = (y1 - y0).toFloat()

        for (by in 0 until bins) {
            val syStart = y0 + ((by * spanH) / bins).toInt()
            val syEnd = (y0 + (((by + 1) * spanH) / bins).toInt()).coerceAtLeast(syStart + 1).coerceAtMost(height)
            for (bx in 0 until bins) {
                val sxStart = x0 + ((bx * spanW) / bins).toInt()
                val sxEnd = (x0 + (((bx + 1) * spanW) / bins).toInt()).coerceAtLeast(sxStart + 1).coerceAtMost(width)
                var sum = 0L
                var cnt = 0
                for (y in syStart until syEnd) {
                    val row = y * width
                    for (x in sxStart until sxEnd) {
                        sum += (luma[row + x].toInt() and 0xFF)
                        cnt++
                    }
                }
                out[by * bins + bx] = if (cnt > 0) sum.toFloat() / cnt.toFloat() else 0f
            }
        }
        return out
    }

    fun fingerprintDifference(a: FloatArray, b: FloatArray): Float {
        if (a.size != b.size || a.isEmpty()) return 1f
        var meanA = 0f
        var meanB = 0f
        for (i in a.indices) {
            meanA += a[i]
            meanB += b[i]
        }
        meanA /= a.size
        meanB /= b.size

        var normDiffSum = 0f
        var rawDiffSum = 0f
        for (i in a.indices) {
            val da = a[i] - meanA
            val db = b[i] - meanB
            normDiffSum += abs(da - db)
            rawDiffSum += abs(a[i] - b[i])
        }
        val normDiff = (normDiffSum / (a.size * 128f)).coerceIn(0f, 1f)
        val rawDiff = (rawDiffSum / (a.size * 255f)).coerceIn(0f, 1f)
        return (normDiff * 0.65f + rawDiff * 0.35f).coerceIn(0f, 1f)
    }

    fun rotateQuadCW(quad: NormalizedQuad, degrees: Int): NormalizedQuad {
        val steps = (((degrees % 360) + 360) % 360) / 90
        var cur = quad
        repeat(steps) {
            cur = NormalizedQuad(
                tlX = (1f - cur.blY).coerceIn(0f, 1f),
                tlY = cur.blX.coerceIn(0f, 1f),
                trX = (1f - cur.tlY).coerceIn(0f, 1f),
                trY = cur.tlX.coerceIn(0f, 1f),
                brX = (1f - cur.trY).coerceIn(0f, 1f),
                brY = cur.trX.coerceIn(0f, 1f),
                blX = (1f - cur.brY).coerceIn(0f, 1f),
                blY = cur.brX.coerceIn(0f, 1f),
                confidence = cur.confidence
            )
        }
        return cur
    }

    fun rotateQuadInverse(displayQuad: NormalizedQuad, degrees: Int): NormalizedQuad {
        val invDeg = (360 - (((degrees % 360) + 360) % 360)) % 360
        return rotateQuadCW(displayQuad, invDeg)
    }

    fun smoothQuad(previous: NormalizedQuad?, current: NormalizedQuad, alpha: Float = 0.35f): NormalizedQuad {
        if (previous == null) return current
        val a = alpha.coerceIn(0.05f, 1f)
        val inv = 1f - a
        return NormalizedQuad(
            tlX = previous.tlX * inv + current.tlX * a,
            tlY = previous.tlY * inv + current.tlY * a,
            trX = previous.trX * inv + current.trX * a,
            trY = previous.trY * inv + current.trY * a,
            brX = previous.brX * inv + current.brX * a,
            brY = previous.brY * inv + current.brY * a,
            blX = previous.blX * inv + current.blX * a,
            blY = previous.blY * inv + current.blY * a,
            confidence = previous.confidence * inv + current.confidence * a
        )
    }

    fun quadDelta(a: NormalizedQuad, b: NormalizedQuad): Float {
        return maxOf(
            hypot((a.tlX - b.tlX).toDouble(), (a.tlY - b.tlY).toDouble()).toFloat(),
            hypot((a.trX - b.trX).toDouble(), (a.trY - b.trY).toDouble()).toFloat(),
            hypot((a.brX - b.brX).toDouble(), (a.brY - b.brY).toDouble()).toFloat(),
            hypot((a.blX - b.blX).toDouble(), (a.blY - b.blY).toDouble()).toFloat()
        )
    }

    fun computeQuadArea(q: NormalizedQuad): Float {
        val sum1 = q.tlX * q.trY + q.trX * q.brY + q.brX * q.blY + q.blX * q.tlY
        val sum2 = q.tlY * q.trX + q.trY * q.brX + q.brY * q.blX + q.blY * q.tlX
        return abs(sum1 - sum2) * 0.5f
    }

    fun isConvexAndValid(q: NormalizedQuad): Boolean = isConvexWithMinEdge(q, minEdge = 0.14)

    fun isConvexForWarp(q: NormalizedQuad): Boolean = isConvexWithMinEdge(q, minEdge = 0.06)

    private fun isConvexWithMinEdge(q: NormalizedQuad, minEdge: Double): Boolean {
        val pts = arrayOf(
            q.tlX to q.tlY,
            q.trX to q.trY,
            q.brX to q.brY,
            q.blX to q.blY
        )
        var sign = 0f
        for (i in 0 until 4) {
            val (x0, y0) = pts[i]
            val (x1, y1) = pts[(i + 1) % 4]
            val (x2, y2) = pts[(i + 2) % 4]
            val cross = (x1 - x0) * (y2 - y1) - (y1 - y0) * (x2 - x1)
            if (abs(cross) < 1e-5f) return false
            if (sign == 0f) sign = cross else if (cross * sign < 0f) return false
        }
        val topW = hypot((q.trX - q.tlX).toDouble(), (q.trY - q.tlY).toDouble())
        val botW = hypot((q.brX - q.blX).toDouble(), (q.brY - q.blY).toDouble())
        val leftH = hypot((q.blX - q.tlX).toDouble(), (q.blY - q.tlY).toDouble())
        val rightH = hypot((q.brX - q.trX).toDouble(), (q.brY - q.trY).toDouble())
        return min(topW, botW) > minEdge && min(leftH, rightH) > minEdge
    }

    /**
     * Zhang & He (Microsoft Research) closed-form 3D projective aspect-ratio recovery (W / H).
     */
    fun estimateRectifiedAspectRatio(quad: NormalizedQuad, imageWidth: Int, imageHeight: Int): Float {
        val sw = imageWidth.coerceAtLeast(1).toDouble()
        val sh = imageHeight.coerceAtLeast(1).toDouble()
        val cx = sw * 0.5
        val cy = sh * 0.5

        val x1 = quad.tlX * sw - cx; val y1 = quad.tlY * sh - cy
        val x2 = quad.trX * sw - cx; val y2 = quad.trY * sh - cy
        val x3 = quad.blX * sw - cx; val y3 = quad.blY * sh - cy
        val x4 = quad.brX * sw - cx; val y4 = quad.brY * sh - cy

        val topW = hypot(x2 - x1, y2 - y1)
        val botW = hypot(x4 - x3, y4 - y3)
        val leftH = hypot(x3 - x1, y3 - y1)
        val rightH = hypot(x4 - x2, y4 - y2)
        val naiveRatio = (((topW + botW) * 0.5) / ((leftH + rightH) * 0.5).coerceAtLeast(1.0)).toFloat()

        fun cross(ax: Double, ay: Double, bx: Double, by: Double): DoubleArray =
            doubleArrayOf(ay - by, bx - ax, ax * by - ay * bx)
        fun dot(a: DoubleArray, bx: Double, by: Double): Double =
            a[0] * bx + a[1] * by + a[2]

        val m1xm4 = cross(x1, y1, x4, y4)
        val m2xm4 = cross(x2, y2, x4, y4)
        val m3xm4 = cross(x3, y3, x4, y4)

        val den2 = dot(m2xm4, x3, y3)
        val den3 = dot(m3xm4, x2, y2)
        if (abs(den2) < 1e-6 || abs(den3) < 1e-6) return naiveRatio.coerceIn(0.32f, 3.1f)

        val k2 = dot(m1xm4, x3, y3) / den2
        val k3 = dot(m1xm4, x2, y2) / den3

        val n2x = k2 * x2 - x1; val n2y = k2 * y2 - y1; val n2z = k2 - 1.0
        val n3x = k3 * x3 - x1; val n3y = k3 * y3 - y1; val n3z = k3 - 1.0

        val n2z3z = n2z * n3z
        val numF2 = -(n2x * n3x + n2y * n3y)
        val f2 = if (abs(n2z3z) > 1e-4 && numF2 / n2z3z > 0.0) {
            (numF2 / n2z3z).coerceIn((min(sw, sh) * 0.45).let { it * it }, (max(sw, sh) * 3.5).let { it * it })
        } else {
            val fApprox = max(sw, sh) * 1.15
            fApprox * fApprox
        }

        val wSq = n2x * n2x + n2y * n2y + f2 * n2z * n2z
        val hSq = n3x * n3x + n3y * n3y + f2 * n3z * n3z
        if (wSq <= 1e-6 || hSq <= 1e-6) return naiveRatio.coerceIn(0.32f, 3.1f)

        val recovered = sqrt(wSq / hSq).toFloat()
        if (!recovered.isFinite()) return naiveRatio.coerceIn(0.32f, 3.1f)

        val minBound = max(0.32f, naiveRatio * 0.52f)
        val maxBound = min(3.10f, naiveRatio * 1.92f)
        return recovered.coerceIn(minBound, maxBound)
    }

    /**
     * Real 4-corner homography perspective warp using Matrix.setPolyToPoly + Zhang & He
     * projective aspect-ratio recovery (or optional explicit proportion lock).
     */
    fun warpPerspective(
        source: Bitmap,
        quad: NormalizedQuad,
        maxOutputDim: Int = 2400,
        forcedAspectRatio: Float? = null
    ): Bitmap {
        if (quad.isFullFrame() || !isConvexForWarp(quad)) {
            return source
        }
        val sw = source.width.toFloat()
        val sh = source.height.toFloat()

        val srcPts = floatArrayOf(
            quad.tlX * sw, quad.tlY * sh,
            quad.trX * sw, quad.trY * sh,
            quad.brX * sw, quad.brY * sh,
            quad.blX * sw, quad.blY * sh
        )

        val topW = hypot((srcPts[2] - srcPts[0]).toDouble(), (srcPts[3] - srcPts[1]).toDouble()).toFloat()
        val botW = hypot((srcPts[4] - srcPts[6]).toDouble(), (srcPts[5] - srcPts[7]).toDouble()).toFloat()
        val leftH = hypot((srcPts[6] - srcPts[0]).toDouble(), (srcPts[7] - srcPts[1]).toDouble()).toFloat()
        val rightH = hypot((srcPts[4] - srcPts[2]).toDouble(), (srcPts[5] - srcPts[3]).toDouble()).toFloat()

        val aspect = forcedAspectRatio?.coerceIn(0.35f, 2.85f)
            ?: estimateRectifiedAspectRatio(quad, source.width, source.height)
        val baseW = max(topW, botW).coerceAtLeast(120f)
        val baseH = max(leftH, rightH).coerceAtLeast(120f)

        var rawW: Float
        var rawH: Float
        if (baseW / baseH >= aspect) {
            rawW = baseW
            rawH = baseW / aspect
        } else {
            rawH = baseH
            rawW = baseH * aspect
        }

        val limit = maxOutputDim.coerceAtLeast(240).toFloat()
        val maxSide = max(rawW, rawH)
        if (maxSide > limit) {
            val scale = limit / maxSide
            rawW *= scale
            rawH *= scale
        }

        val outW = rawW.toInt().coerceAtLeast(64)
        val outH = rawH.toInt().coerceAtLeast(64)

        val dstPts = floatArrayOf(
            0f, 0f,
            outW.toFloat(), 0f,
            outW.toFloat(), outH.toFloat(),
            0f, outH.toFloat()
        )

        val matrix = Matrix()
        val ok = matrix.setPolyToPoly(srcPts, 0, dstPts, 0, 4)
        if (!ok) return source

        val output = Bitmap.createBitmap(outW, outH, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(output)
        canvas.drawColor(Color.WHITE)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG)
        canvas.drawBitmap(source, matrix, paint)
        return output
    }

    fun suggestSmartDocumentTitle(ocrText: String, fallbackPrefix: String = "Scan"): String {
        val dateStr = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE)
        val cleaned = ocrText.trim()
        if (cleaned.length < 4) return "${dateStr}_${fallbackPrefix}"

        val lower = cleaned.lowercase()
        val detectedType = when {
            lower.contains("aadhaar") || lower.contains("unique identification") -> "Aadhaar_Card"
            lower.contains("permanent account") || lower.contains("income tax") -> "PAN_Card"
            lower.contains("passport") -> "Passport"
            lower.contains("driving licen") -> "Driving_License"
            lower.contains("registration certificate") || lower.contains("chassis") -> "Vehicle_RC"
            lower.contains("prescription") || lower.contains("rx ") || lower.contains("diagnosis") || lower.contains("pathology") -> "Medical_Report"
            lower.contains("tax invoice") || lower.contains("gstin") || lower.contains("invoice") -> "Invoice"
            lower.contains("electricity") || lower.contains("water bill") || lower.contains("gas bill") -> "Utility_Bill"
            lower.contains("receipt") || lower.contains("total") || lower.contains("grand total") -> "Receipt"
            lower.contains("marksheet") || lower.contains("certificate") || lower.contains("university") -> "Certificate"
            lower.contains("agreement") || lower.contains("contract") || lower.contains("lease") -> "Agreement"
            lower.contains("bank statement") || lower.contains("ifsc") -> "Bank_Statement"
            else -> null
        }

        val smartData = TemporalExtractor.extractSmartData(cleaned)
        val amountSuffix = smartData.amounts.firstOrNull()
            ?.replace(Regex("[^0-9.]"), "")
            ?.take(8)
            ?.takeIf { it.isNotBlank() }

        if (detectedType != null) {
            return if (amountSuffix != null && detectedType in setOf("Invoice", "Receipt", "Utility_Bill")) {
                "${dateStr}_${detectedType}_${amountSuffix}"
            } else {
                "${dateStr}_${detectedType}"
            }
        }

        val firstLine = cleaned.lines()
            .map { it.trim() }
            .firstOrNull { line -> line.length in 4..42 && line.any { it.isLetter() } }
            ?.replace(Regex("[^a-zA-Z0-9]+"), "_")
            ?.trim('_')
            ?.take(28)

        return if (!firstLine.isNullOrBlank()) "${dateStr}_${firstLine}" else "${dateStr}_${fallbackPrefix}"
    }
}
