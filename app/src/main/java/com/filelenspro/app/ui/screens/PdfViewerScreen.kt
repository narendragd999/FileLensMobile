package com.filelenspro.app.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Layers
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.filelenspro.app.ui.theme.LocalFileLensColors
import com.filelenspro.app.ui.viewmodel.ToolsViewModel
import com.filelenspro.app.util.FormatUtils
import java.io.File

@Composable
fun PdfViewerScreen(
    uri: String,
    title: String,
    toolsViewModel: ToolsViewModel,
    onOpenOrganizer: () -> Unit,
    onBack: () -> Unit
) {
    val palette = LocalFileLensColors.current
    val context = LocalContext.current
    var pages by remember { mutableStateOf<List<String>>(emptyList()) }
    var currentIndex by remember { mutableIntStateOf(0) }
    var loading by remember { mutableStateOf(true) }

    BackHandler(onBack = onBack)

    LaunchedEffect(uri) {
        loading = true
        pages = toolsViewModel.engine.renderPdfToImages(uri, limit = 80, maxDim = 1600)
        loading = false
    }

    Column(
        modifier = Modifier.fillMaxSize().background(palette.bg),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Surface(color = palette.surface, modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBack, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back", tint = palette.text)
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(title, style = MaterialTheme.typography.titleMedium, color = palette.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        if (pages.isNotEmpty()) "Page ${currentIndex + 1} of ${pages.size}" else "Loading PDF…",
                        style = MaterialTheme.typography.bodyMedium,
                        color = palette.muted
                    )
                }
                IconButton(onClick = onOpenOrganizer, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.Rounded.Layers, contentDescription = "Organize PDF Pages", tint = palette.accent)
                }
                IconButton(onClick = { FormatUtils.shareFileOrText(context, uri, title, title) }, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.Rounded.Share, contentDescription = "Share PDF", tint = palette.text)
                }
            }
        }

        Column(modifier = Modifier.widthIn(max = 600.dp).fillMaxSize()) {
            if (loading) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())

            if (pages.isEmpty() && !loading) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Unable to render PDF pages.", color = palette.muted)
                }
            } else if (pages.isNotEmpty()) {
                AsyncImage(
                    model = File(pages[currentIndex.coerceIn(0, pages.lastIndex)]),
                    contentDescription = "PDF Page ${currentIndex + 1}",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.weight(1f).fillMaxWidth().padding(12.dp)
                )
                if (pages.size > 1) {
                    Surface(color = palette.surface, modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("Page ${currentIndex + 1}", style = MaterialTheme.typography.labelLarge, color = palette.text)
                                Text("${pages.size} total", style = MaterialTheme.typography.labelSmall, color = palette.muted)
                            }
                            Slider(
                                value = currentIndex.toFloat(),
                                onValueChange = { currentIndex = it.toInt() },
                                valueRange = 0f..(pages.lastIndex).toFloat(),
                                steps = (pages.size - 2).coerceAtLeast(0)
                            )
                        }
                    }
                }
            }
        }
    }
}
