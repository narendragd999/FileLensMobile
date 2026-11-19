package com.filelenspro.app.ui.screens

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.HelpOutline
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.CleaningServices
import androidx.compose.material.icons.rounded.CreateNewFolder
import androidx.compose.material.icons.rounded.DarkMode
import androidx.compose.material.icons.rounded.DeleteForever
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.Sync
import androidx.compose.material.icons.rounded.Verified
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.filelenspro.app.ui.components.FileLensTopBar
import com.filelenspro.app.ui.components.PrivacyPolicyDialog
import com.filelenspro.app.ui.components.TutorialDialog
import com.filelenspro.app.ui.navigation.LicenseRoute
import com.filelenspro.app.ui.theme.LocalFileLensColors
import com.filelenspro.app.ui.viewmodel.SearchViewModel
import com.filelenspro.app.ui.viewmodel.ToolsViewModel

@Composable
fun SettingsScreen(
    searchViewModel: SearchViewModel,
    toolsViewModel: ToolsViewModel,
    onOpenQuickNav: () -> Unit,
    onNavigate: (Any) -> Unit
) {
    val palette = LocalFileLensColors.current
    val prefs by toolsViewModel.userPrefs.collectAsState()
    val stats by searchViewModel.indexStats.collectAsState()
    val indexTargets by searchViewModel.indexTargets.collectAsState()

    var activeTab by remember { mutableIntStateOf(0) }
    var showTutorial by remember { mutableStateOf(false) }
    var showPrivacy by remember { mutableStateOf(false) }

    var aiUrl by remember(prefs.aiEndpointUrl) { mutableStateOf(prefs.aiEndpointUrl) }
    var aiModel by remember(prefs.aiModel) { mutableStateOf(prefs.aiModel) }
    var aiKey by remember(prefs.aiApiKey) { mutableStateOf(prefs.aiApiKey) }

    val safFolderLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri: Uri? ->
        if (uri != null) {
            searchViewModel.addSafFolder(uri) { synced ->
                toolsViewModel.postToast("Linked & indexed $synced file(s)")
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.bg),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        FileLensTopBar(
            title = "Settings",
            subtitle = "On-Device Engine · Preferences & Index",
            onOpenQuickNav = onOpenQuickNav
        )

        Column(modifier = Modifier.widthIn(max = 600.dp).fillMaxSize()) {
            TabRow(selectedTabIndex = activeTab, containerColor = palette.surface, contentColor = palette.accent) {
                Tab(selected = activeTab == 0, onClick = { activeTab = 0 }, text = { Text("General") })
                Tab(selected = activeTab == 1, onClick = { activeTab = 1 }, text = { Text("OCR & Index") })
                Tab(selected = activeTab == 2, onClick = { activeTab = 2 }, text = { Text("AI & Pro") })
                Tab(selected = activeTab == 3, onClick = { activeTab = 3 }, text = { Text("About") })
            }

            LazyColumn(
                contentPadding = PaddingValues(14.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                when (activeTab) {
                    0 -> {
                        item {
                            SettingCard {
                                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                                    Icon(Icons.Rounded.DarkMode, contentDescription = null, tint = palette.accent)
                                    Spacer(Modifier.width(12.dp))
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text("Titanium Dark Theme", style = MaterialTheme.typography.titleMedium, color = palette.text)
                                        Text("Switch between Alabaster Light & Titanium Dark", style = MaterialTheme.typography.bodyMedium, color = palette.muted)
                                    }
                                    Switch(
                                        checked = prefs.isDarkTheme,
                                        onCheckedChange = { toolsViewModel.setDarkTheme(it) },
                                        modifier = Modifier.testTag("settings_dark_theme_switch")
                                    )
                                }
                            }
                        }
                        item {
                            SettingCard {
                                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                                    Icon(Icons.Rounded.Shield, contentDescription = null, tint = palette.success)
                                    Spacer(Modifier.width(12.dp))
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text("100% On-Device Vault", style = MaterialTheme.typography.titleMedium, color = palette.text)
                                        Text("Zero cloud uploads, zero telemetry", style = MaterialTheme.typography.bodyMedium, color = palette.muted)
                                    }
                                    OutlinedButton(onClick = { showPrivacy = true }) { Text("Audit") }
                                }
                            }
                        }
                        item {
                            SettingCard {
                                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                                    Icon(Icons.Rounded.CleaningServices, contentDescription = null, tint = palette.warning)
                                    Spacer(Modifier.width(12.dp))
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text("Clean Temporary Cache", style = MaterialTheme.typography.titleMedium, color = palette.text)
                                        Text("Clears PDF page render & export cache safely", style = MaterialTheme.typography.bodyMedium, color = palette.muted)
                                    }
                                    Button(onClick = { toolsViewModel.cleanJunkCache() }) { Text("Clean") }
                                }
                            }
                        }
                    }

                    1 -> {
                        item {
                            SettingCard {
                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text("Index Telemetry", style = MaterialTheme.typography.titleMedium, color = palette.text)
                                    Text(
                                        "${stats.totalFiles} Files · ${stats.ocrDone} OCR Done · ${stats.ocrPending} Pending · ${stats.cardsCount} Cards",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = palette.muted
                                    )
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                                        Button(
                                            onClick = {
                                                searchViewModel.syncIndex(forceReindex = false) { c ->
                                                    toolsViewModel.postToast(if (c > 0) "Synced $c new/updated file(s)" else "Index is up to date")
                                                }
                                            },
                                            modifier = Modifier.weight(1f).testTag("settings_sync_now_btn")
                                        ) {
                                            Icon(Icons.Rounded.Sync, contentDescription = null, modifier = Modifier.size(16.dp))
                                            Spacer(Modifier.width(6.dp))
                                            Text("Auto-Sync New")
                                        }
                                        OutlinedButton(
                                            onClick = {
                                                searchViewModel.syncIndex(forceReindex = true) { c ->
                                                    toolsViewModel.postToast("Re-indexed $c document(s)")
                                                }
                                            },
                                            modifier = Modifier.weight(1f).testTag("settings_force_reindex_btn")
                                        ) {
                                            Icon(Icons.Rounded.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                                            Spacer(Modifier.width(6.dp))
                                            Text("Re-Index All")
                                        }
                                    }
                                }
                            }
                        }

                        item {
                            SettingCard {
                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text("Auto-Indexed Folders (${indexTargets.size})", style = MaterialTheme.typography.titleMedium, color = palette.text)
                                            Text("Persisted folders checked automatically on launch", style = MaterialTheme.typography.bodyMedium, color = palette.muted)
                                        }
                                        OutlinedButton(onClick = { safFolderLauncher.launch(null) }) {
                                            Icon(Icons.Rounded.CreateNewFolder, contentDescription = null, modifier = Modifier.size(16.dp))
                                            Spacer(Modifier.width(4.dp))
                                            Text("Add")
                                        }
                                    }
                                    indexTargets.forEach { target ->
                                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                                            Text("📁 ${target.label}", style = MaterialTheme.typography.bodyMedium, color = palette.text, modifier = Modifier.weight(1f))
                                            IconButton(onClick = { searchViewModel.removeSafFolder(target.id) }) {
                                                Icon(Icons.Rounded.DeleteOutline, contentDescription = "Unlink Folder", tint = palette.danger)
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        item {
                            SettingCard {
                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text("OCR Recognition Language", style = MaterialTheme.typography.titleMedium, color = palette.text)
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        listOf("eng+hin" to "English + Hindi", "eng" to "English Only", "hin" to "Hindi Only").forEach { (code, label) ->
                                            FilterChip(
                                                selected = prefs.ocrLanguage == code,
                                                onClick = { toolsViewModel.setOcrLanguage(code) },
                                                label = { Text(label) }
                                            )
                                        }
                                    }
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Button(onClick = { toolsViewModel.rerunAllPendingOcr() }, modifier = Modifier.weight(1f)) {
                                            Text("Run Pending OCR")
                                        }
                                        OutlinedButton(
                                            onClick = { toolsViewModel.clearSearchIndex() },
                                            colors = ButtonDefaults.outlinedButtonColors(contentColor = palette.danger),
                                            modifier = Modifier.weight(1f)
                                        ) {
                                            Icon(Icons.Rounded.DeleteForever, contentDescription = null, modifier = Modifier.size(16.dp))
                                            Spacer(Modifier.width(4.dp))
                                            Text("Clear Index")
                                        }
                                    }
                                }
                            }
                        }
                    }

                    2 -> {
                        item {
                            SettingCard {
                                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                                    Icon(Icons.Rounded.AutoAwesome, contentDescription = null, tint = palette.accent)
                                    Spacer(Modifier.width(12.dp))
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text("On-Device Semantic Vector AI", style = MaterialTheme.typography.titleMedium, color = palette.text)
                                        Text("384-dim offline bilingual embeddings for Natural Language search", style = MaterialTheme.typography.bodyMedium, color = palette.muted)
                                    }
                                    Switch(
                                        checked = prefs.semanticAiEnabled,
                                        onCheckedChange = { toolsViewModel.setSemanticAiEnabled(it) }
                                    )
                                }
                            }
                        }
                        item {
                            SettingCard {
                                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                                        Icon(Icons.Rounded.Verified, contentDescription = null, tint = palette.success)
                                        Spacer(Modifier.width(10.dp))
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(if (prefs.isProActivated) "FileSearchPro Active" else "Upgrade to FileSearchPro", style = MaterialTheme.typography.titleMedium, color = palette.text)
                                            Text("Unlock cross-platform license & full Pro suite", style = MaterialTheme.typography.bodyMedium, color = palette.muted)
                                        }
                                        Button(onClick = { onNavigate(LicenseRoute) }, modifier = Modifier.testTag("settings_license_btn")) {
                                            Text(if (prefs.isProActivated) "Manage" else "Activate")
                                        }
                                    }
                                }
                            }
                        }
                        item {
                            SettingCard {
                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text("Optional Custom OpenAI-Compatible Endpoint", style = MaterialTheme.typography.titleMedium, color = palette.text)
                                    OutlinedTextField(value = aiUrl, onValueChange = { aiUrl = it }, label = { Text("Endpoint URL") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                                    OutlinedTextField(value = aiModel, onValueChange = { aiModel = it }, label = { Text("Model") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                                    OutlinedTextField(value = aiKey, onValueChange = { aiKey = it }, label = { Text("API Key (Stored Locally)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                                    Button(onClick = { toolsViewModel.saveAiConfig(aiUrl, aiModel, aiKey) }) { Text("Save Endpoint") }
                                }
                            }
                        }
                    }

                    3 -> {
                        item {
                            SettingCard {
                                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Text("FileSearchPro v2.0.0 (Native Kotlin)", style = MaterialTheme.typography.titleLarge, color = palette.text)
                                    Text("On-Device Document Intelligence · Second Brain · Smart Cards · PDF Tools · LAN Explorer", style = MaterialTheme.typography.bodyMedium, color = palette.muted)
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Button(onClick = { showTutorial = true }, modifier = Modifier.weight(1f)) {
                                            Icon(Icons.AutoMirrored.Rounded.HelpOutline, contentDescription = null, modifier = Modifier.size(16.dp))
                                            Spacer(Modifier.width(6.dp))
                                            Text("Interactive Guide")
                                        }
                                        OutlinedButton(onClick = { showPrivacy = true }, modifier = Modifier.weight(1f)) {
                                            Icon(Icons.Rounded.Shield, contentDescription = null, modifier = Modifier.size(16.dp))
                                            Spacer(Modifier.width(6.dp))
                                            Text("Privacy Policy")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showTutorial) TutorialDialog(onDismiss = { showTutorial = false })
    if (showPrivacy) PrivacyPolicyDialog(onDismiss = { showPrivacy = false })
}

@Composable
private fun SettingCard(content: @Composable () -> Unit) {
    val palette = LocalFileLensColors.current
    Surface(
        color = palette.surface,
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, palette.border, RoundedCornerShape(16.dp))
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            content()
        }
    }
}
