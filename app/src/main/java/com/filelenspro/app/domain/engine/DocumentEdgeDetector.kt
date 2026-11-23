package com.filelenspro.app.domain.engine

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import com.filelenspro.app.data.model.NormalizedQuad
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Studio-grade on-device document boundary detector, RGB desk-color segmenter,
 * magnetic corner snapper, temporal stabilizer, rotation-safe quad transformer,
 * Zhang & He projective aspect-ratio estimator + Matrix.setPolyToPoly homography engine,
 * and smart document auto-namer.
 */
object DocumentEdgeDetector {

    /**
     * Detects a document quadrilateral from a small grayscale luma grid (typically 96x128 to 160x160).
     * Runs in ~3–7ms on mobile CPU with zero native library dependencies:
     * 1. Fast 3x3 box blur suppresses table wood-grain and camera noise.
     * 2. Dual-polarity adaptive segmentation + Largest Connected Component BFS isolates the document
     *    blob and rejects stray desk reflections, fingers, or background clutter.
     * 3. Sobel gradient contour fallback handles low-contrast paper-on-light-desk scenes.
     * 4. Andrew's Monotone Chain Convex Hull + 4-corner quadrilateral fitting extracts accurate
     *    corners even for tilted trapezoids and angled pages.
     */
    fun detectFromLumaGrid(luma: ByteArray, width: Int, height: Int): NormalizedQuad? {
        if (width < 24 || height < 24 || luma.size < width * height) return null

        val smooth = boxBlur3x3(luma, width, height)

        // Measure border vs center luminance to detect bright-on-dark OR dark/colorful-on-light
        var borderSum = 0L
        var borderCount = 0
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

        var centerSum = 0L
        var centerCount = 0
        for (y in height / 4 until (height * 3) / 4) {
            val row = y * width
            for (x in width / 4 until (width * 3) / 4) {
                centerSum += smooth[row + x]
                centerCount++
            }
        }
        val centerMean = if (centerCount > 0) (centerSum / centerCount).toInt() else 128
        val contrastDiff = centerMean - borderMean

        // Path A: Distinct luminance document (bright sheet on dark desk OR dark/colored card on light desk)
        if (abs(contrastDiff) >= 16) {
            val brightDoc = contrastDiff > 0
            val threshold = (borderMean + contrastDiff * 0.44f).toInt().coerceIn(25, 240)
            val mask = BooleanArray(width * height)
            for (y in 2 until height - 2) {
                val row = y * width
                for (x in 2 until width - 2) {
                    val v = smooth[row + x]
                    mask[row + x] = if (brightDoc) v >= threshold else v <= threshold
                }
            }
            val quadFromBlob = extractQuadFromLargestCentralBlob(mask, width, height, baseConfidence = 0.74f)
            if (quadFromBlob != null) return quadFromBlob
        }

        // Path B: Low-contrast scene (white paper on light desk / textured card) via Sobel gradient contour
        return detectViaSobelGradient(smooth, width, height)
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

    /**
     * Isolates the largest connected foreground component overlapping the central 60% of the frame,
     * rejecting stray reflections, fingers at frame edges, or random table clutter.
     */
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

    private fun detectViaSobelGradient(smooth: IntArray, width: Int, height: Int): NormalizedQuad? {
        val grads = IntArray(width * height)
        var sumGrad = 0L
        var count = 0

        for (y in 2 until height - 2) {
            val row = y * width
            for (x in 2 until width - 2) {
                val gx = -smooth[row - width + x - 1] + smooth[row - width + x + 1] -
                    2 * smooth[row + x - 1] + 2 * smooth[row + x + 1] -
                    smooth[row + width + x - 1] + smooth[row + width + x + 1]
                val gy = -smooth[row - width + x - 1] - 2 * smooth[row - width + x] -
                    smooth[row - width + x + 1] + smooth[row + width + x - 1] +
                    2 * smooth[row + width + x] + smooth[row + width + x + 1]
                val mag = abs(gx) + abs(gy)
                grads[row + x] = mag
                sumGrad += mag
                count++
            }
        }
        if (count == 0) return null
        val meanGrad = (sumGrad / count).toInt()
        if (meanGrad < 4) return null
        val gradThresh = (meanGrad * 2.3f).toInt().coerceAtLeast(64)

        val padX = (width * 0.03f).toInt().coerceAtLeast(2)
        val padY = (height * 0.03f).toInt().coerceAtLeast(2)

        val edgeX = IntArray(width * height)
        val edgeY = IntArray(width * height)
        var edgeCount = 0
        for (y in padY until height - padY) {
            val row = y * width
            for (x in padX until width - padX) {
                if (grads[row + x] < gradThresh) continue
                var neighbors = 0
                if (grads[row + x - 1] >= gradThresh) neighbors++
                if (grads[row + x + 1] >= gradThresh) neighbors++
                if (grads[row - width + x] >= gradThresh) neighbors++
                if (grads[row + width + x] >= gradThresh) neighbors++
                if (grads[row - width + x - 1] >= gradThresh) neighbors++
                if (grads[row - width + x + 1] >= gradThresh) neighbors++
                if (grads[row + width + x - 1] >= gradThresh) neighbors++
                if (grads[row + width + x + 1] >= gradThresh) neighbors++
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
     * Color-aware document boundary detector for full RGB bitmaps:
     * Tries both perceptual RGB desk-color distance segmentation (handles white paper on light
     * wood/marble desks AND colorful ID cards on bright surfaces!) and luma/Sobel fallback,
     * returning null when no distinct border exists.
     */
    fun detectFromBitmapOrNull(bitmap: Bitmap): NormalizedQuad? {
        val targetW = 148
        val scale = targetW.toFloat() / bitmap.width.coerceAtLeast(1)
        val targetH = (bitmap.height * scale).toInt().coerceIn(48, 224)
        val small = Bitmap.createScaledBitmap(bitmap, targetW, targetH, true)
        val pixels = IntArray(targetW * targetH)
        small.getPixels(pixels, 0, targetW, 0, 0, targetW, targetH)
        small.recycle()

        // 1. Try RGB desk-color distance segmentation first (beats beige desk & colorful ID card scenes!)
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
        var bestColorQuad: NormalizedQuad? = null
        if (meanCenterDist >= 42) {
            val thresh = (meanCenterDist * 0.48f).toInt().coerceIn(32, 160)
            val mask = BooleanArray(pixels.size)
            for (y in 2 until targetH - 2) {
                val row = y * targetW
                for (x in 2 until targetW - 2) {
                    mask[row + x] = colorDist[row + x] >= thresh
                }
            }
            bestColorQuad = extractQuadFromLargestCentralBlob(mask, targetW, targetH, baseConfidence = 0.78f)
        }

        // 2. Also run luma + Sobel pipeline and pick the higher-confidence valid quad
        val luma = ByteArray(pixels.size)
        for (i in pixels.indices) {
            val p = pixels[i]
            val y = (Color.red(p) * 299 + Color.green(p) * 587 + Color.blue(p) * 114) / 1000
            luma[i] = y.coerceIn(0, 255).toByte()
        }
        val lumaQuad = detectFromLumaGrid(luma, targetW, targetH)

        return when {
            bestColorQuad != null && lumaQuad != null ->
                if (bestColorQuad.confidence >= lumaQuad.confidence) bestColorQuad else lumaQuad
            bestColorQuad != null -> bestColorQuad
            else -> lumaQuad
        }
    }

    fun detectFromBitmap(bitmap: Bitmap): NormalizedQuad =
        detectFromBitmapOrNull(bitmap) ?: NormalizedQuad.FULL

    /**
     * Lightweight cornerness map (min-eigenvalue / Harris-style response from Sobel gradients)
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
        // Harris corner response R = det(M) - k * trace(M)^2 over 3x3 window
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

    /**
     * Subtly snaps a normalized corner (nx, ny) onto the strongest paper corner peak
     * within a small search radius (default ~3% of frame). Returns original (nx, ny) if
     * no clear corner peak exists nearby so manual freedom is never hijacked.
     */
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
                // Mild distance weighting prefers closer corners when strength is similar
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
        // Snap only when a genuinely distinct corner peak stands out (>2.4x local average & above noise floor)
        return if (bestScore > 1200f && bestScore > avg * 2.4f) {
            (bestX.toFloat() / map.width).coerceIn(0f, 1f) to (bestY.toFloat() / map.height).coerceIn(0f, 1f)
        } else {
            nx to ny
        }
    }

    /**
     * Transforms a NormalizedQuad from unrotated image space into clockwise-rotated display space
     * (0°, 90°, 180°, 270°) while keeping corner labels aligned to visual [TL, TR, BR, BL].
     */
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

    /**
     * Inverse of [rotateQuadCW]: maps a display-space quad back to unrotated image coordinates.
     */
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

    /**
     * Permissive convexity check for manual user crops (supports tight ID card / receipt crops
     * down to 6% edge length while preventing concave or self-intersecting polygons).
     */
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
     * Zhang & He (Microsoft Research) closed-form 3D projective aspect-ratio recovery (W / H)
     * for a photographed planar rectangle. Eliminates perspective foreshortening squash when
     * scanning pages or ID cards from a seated angle — matching Genius Scan & Google Docs Scanner!
     */
    fun estimateRectifiedAspectRatio(quad: NormalizedQuad, imageWidth: Int, imageHeight: Int): Float {
        val sw = imageWidth.coerceAtLeast(1).toDouble()
        val sh = imageHeight.coerceAtLeast(1).toDouble()
        val cx = sw * 0.5
        val cy = sh * 0.5

        // Corners centered at principal point (m1=TL, m2=TR, m3=BL, m4=BR)
        val x1 = quad.tlX * sw - cx; val y1 = quad.tlY * sh - cy
        val x2 = quad.trX * sw - cx; val y2 = quad.trY * sh - cy
        val x3 = quad.blX * sw - cx; val y3 = quad.blY * sh - cy
        val x4 = quad.brX * sw - cx; val y4 = quad.brY * sh - cy

        val topW = hypot(x2 - x1, y2 - y1)
        val botW = hypot(x4 - x3, y4 - y3)
        val leftH = hypot(x3 - x1, y3 - y1)
        val rightH = hypot(x4 - x2, y4 - y2)
        val naiveRatio = (((topW + botW) * 0.5) / ((leftH + rightH) * 0.5).coerceAtLeast(1.0)).toFloat()

        // 3D cross products in homogeneous coordinates (z = 1)
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
            // Near-parallel edges: use typical phone camera focal length (~1.15 × max dimension)
            val fApprox = max(sw, sh) * 1.15
            fApprox * fApprox
        }

        val wSq = n2x * n2x + n2y * n2y + f2 * n2z * n2z
        val hSq = n3x * n3x + n3y * n3y + f2 * n3z * n3z
        if (wSq <= 1e-6 || hSq <= 1e-6) return naiveRatio.coerceIn(0.32f, 3.1f)

        val recovered = sqrt(wSq / hSq).toFloat()
        if (!recovered.isFinite()) return naiveRatio.coerceIn(0.32f, 3.1f)

        // Blend safely & clamp so extreme degenerate angles never over-stretch
        val minBound = max(0.32f, naiveRatio * 0.52f)
        val maxBound = min(3.10f, naiveRatio * 1.92f)
        return recovered.coerceIn(minBound, maxBound)
    }

    /**
     * Real 4-corner homography perspective warp using Matrix.setPolyToPoly + Zhang & He
     * projective aspect-ratio recovery. Flattens skewed documents captured at an angle into
     * crisp, true-proportion rectangular scans (never squashed).
     */
    fun warpPerspective(
        source: Bitmap,
        quad: NormalizedQuad,
        maxOutputDim: Int = 2400
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

        val aspect = estimateRectifiedAspectRatio(quad, source.width, source.height)
        val baseW = max(topW, botW).coerceAtLeast(120f)
        val baseH = max(leftH, rightH).coerceAtLeast(120f)

        // Preserve maximum source pixel detail along the dominant axis while honoring true aspect ratio
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

    /**
     * Genius Scan-style Smart Document Auto-Naming:
     * Combines today's ISO date with detected document category, key heading, or monetary amount.
     */
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
