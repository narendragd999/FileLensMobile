package com.filelenspro.app.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Verified
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.filelenspro.app.ui.theme.LocalFileLensColors
import com.filelenspro.app.ui.viewmodel.ToolsViewModel

@Composable
fun LicenseScreen(
    toolsViewModel: ToolsViewModel,
    onBack: () -> Unit
) {
    val palette = LocalFileLensColors.current
    val context = LocalContext.current
    val prefs by toolsViewModel.userPrefs.collectAsState()
    var keyInput by remember(prefs.licenseKey) { mutableStateOf(prefs.licenseKey) }

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
                    Text("FileSearchPro License", style = MaterialTheme.typography.titleLarge, color = palette.text)
                    Text(if (prefs.isProActivated) "Active on this device" else "Activate Offline Pro Key", style = MaterialTheme.typography.bodyMedium, color = palette.muted)
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
            Surface(
                color = palette.surface,
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth().border(1.dp, palette.border, RoundedCornerShape(16.dp))
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Rounded.Verified,
                            contentDescription = null,
                            tint = if (prefs.isProActivated) palette.success else palette.accent,
                            modifier = Modifier.size(28.dp)
                        )
                        Spacer(Modifier.width(10.dp))
                        Text(
                            if (prefs.isProActivated) "Pro License Verified" else "Free / Standard Mode",
                            style = MaterialTheme.typography.titleLarge,
                            color = palette.text
                        )
                    }
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Device Machine ID", style = MaterialTheme.typography.labelLarge, color = palette.muted)
                            Text(prefs.machineId.ifBlank { "Generating…" }, style = MaterialTheme.typography.labelSmall, color = palette.text)
                        }
                        IconButton(onClick = {
                            val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                            cm.setPrimaryClip(ClipData.newPlainText("Machine ID", prefs.machineId))
                            toolsViewModel.postToast("Copied Machine ID")
                        }) {
                            Icon(Icons.Rounded.ContentCopy, contentDescription = "Copy Machine ID", tint = palette.accent)
                        }
                    }
                }
            }

            Surface(
                color = palette.surface,
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth().border(1.dp, palette.border, RoundedCornerShape(16.dp))
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = keyInput,
                        onValueChange = { keyInput = it },
                        label = { Text("License Key (FL-XX-XXXX-XXXX-XXXX)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth().testTag("license_key_input")
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        Button(
                            onClick = { toolsViewModel.activateLicense(keyInput) },
                            modifier = Modifier.weight(1f).testTag("license_activate_btn")
                        ) { Text("Activate Key") }
                        if (prefs.isProActivated) {
                            OutlinedButton(
                                onClick = { toolsViewModel.releaseLicense() },
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = palette.danger),
                                modifier = Modifier.weight(1f)
                            ) { Text("Release") }
                        }
                    }
                }
            }

            Surface(
                color = palette.surface,
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth().border(1.dp, palette.border, RoundedCornerShape(16.dp))
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Included Pro Capabilities", style = MaterialTheme.typography.titleMedium, color = palette.text)
                    listOf(
                        "Unlimited Bilingual On-Device OCR (English + Devanagari)",
                        "384-Dim Offline Semantic Vector Search & Natural Language",
                        "50-Page ML Kit Document Scanner + 2-in-1 A4 ID Card Builder",
                        "PDF Page Organizer (Merge, Extract, Rotate, Reorder, Delete)",
                        "LAN Wi-Fi HTTP & FTP PC Explorer + Second Brain Checklists"
                    ).forEach { feat ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Rounded.CheckCircle, contentDescription = null, tint = palette.success, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text(feat, style = MaterialTheme.typography.bodyMedium, color = palette.textSecondary)
                        }
                    }
                }
            }
        }
    }
}
