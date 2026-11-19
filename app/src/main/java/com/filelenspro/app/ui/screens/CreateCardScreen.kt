package com.filelenspro.app.ui.screens

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CreditCard
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.filelenspro.app.domain.engine.SmartTaxonomy
import com.filelenspro.app.ui.theme.LocalFileLensColors
import com.filelenspro.app.ui.viewmodel.ToolsViewModel

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CreateCardScreen(
    fileUri: String,
    fileId: Long,
    fileName: String,
    initialTag: String,
    toolsViewModel: ToolsViewModel,
    onBack: () -> Unit
) {
    val palette = LocalFileLensColors.current
    var tagInput by remember { mutableStateOf(initialTag.ifBlank { "ID Card" }) }

    BackHandler(onBack = onBack)

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
                Column {
                    Text("Save Smart Card", style = MaterialTheme.typography.titleLarge, color = palette.text)
                    Text(fileName.ifBlank { "New Digital Card" }, style = MaterialTheme.typography.bodyMedium, color = palette.muted)
                }
            }
        }

        Column(
            modifier = Modifier
                .widthIn(max = 600.dp)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            if (fileUri.isNotBlank() && !fileUri.endsWith(".pdf", true)) {
                AsyncImage(
                    model = fileUri,
                    contentDescription = fileName,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(190.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .border(1.dp, palette.border, RoundedCornerShape(16.dp))
                )
            } else {
                Surface(
                    color = palette.surface,
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth().border(1.dp, palette.border, RoundedCornerShape(16.dp))
                ) {
                    Row(modifier = Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.CreditCard, contentDescription = null, tint = palette.accent, modifier = Modifier.size(36.dp))
                        Spacer(Modifier.width(12.dp))
                        Text(fileName.ifBlank { "Digital Card" }, style = MaterialTheme.typography.titleMedium, color = palette.text)
                    }
                }
            }

            OutlinedTextField(
                value = tagInput,
                onValueChange = { tagInput = it },
                label = { Text("Card Tag / Category") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().testTag("create_card_tag_input")
            )

            Text("Quick Card Tags", style = MaterialTheme.typography.titleMedium, color = palette.text)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SmartTaxonomy.QUICK_CARD_TAGS.forEach { tag ->
                    FilterChip(
                        selected = tagInput.equals(tag, ignoreCase = true),
                        onClick = { tagInput = tag },
                        label = { Text(tag) },
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = palette.accent, selectedLabelColor = Color.White)
                    )
                }
            }

            Button(
                onClick = {
                    val finalTag = tagInput.trim().ifBlank { "Document" }
                    if (fileId > 0L) {
                        toolsViewModel.updateCardTag(fileId, finalTag)
                        onBack()
                    } else if (fileUri.isNotBlank()) {
                        toolsViewModel.createOrUpdateCardFromUri(Uri.parse(fileUri), finalTag) { onBack() }
                    } else {
                        onBack()
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
                modifier = Modifier.fillMaxWidth().height(52.dp).testTag("create_card_save_btn")
            ) {
                Icon(Icons.Rounded.Check, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Save to Smart Cards Wallet")
            }
        }
    }
}
