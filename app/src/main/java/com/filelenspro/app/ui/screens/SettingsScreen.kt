package com.filelenspro.app.ui.screens

import android.Manifest
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material.icons.rounded.Backup
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.CleaningServices
import androidx.compose.material.icons.rounded.CreateNewFolder
import androidx.compose.material.icons.rounded.DarkMode
import androidx.compose.material.icons.rounded.DeleteForever
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Fingerprint
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.LockOpen
import androidx.compose.material.icons.rounded.PhoneAndroid
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Restore
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.Storage
import androidx.compose.material.icons.rounded.Sync
import androidx.compose.material.icons.rounded.Verified
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.filelenspro.app.ui.components.AllFilesPermissionDialog
import com.filelenspro.app.ui.components.BiometricAuthHelper
import com.filelenspro.app.ui.components.FileLensTopBar
import com.filelenspro.app.ui.components.LastIndexSummaryStrip
import com.filelenspro.app.ui.components.PrivacyPolicyDialog
import com.filelenspro.app.ui.components.RichIndexingProgressBanner
import com.filelenspro.app.ui.components.TutorialDialog
import com.filelenspro.app.ui.navigation.LicenseRoute
import com.filelenspro.app.ui.theme.LocalFileLensColors
import com.filelenspro.app.ui.viewmodel.SearchViewModel
import com.filelenspro.app.ui.viewmodel.ToolsViewModel
import com.filelenspro.app.util.FormatUtils
import com.filelenspro.app.util.StoragePermissionHelper

@Composable
fun SettingsScreen(
    searchViewModel: SearchViewModel,
    toolsViewModel: ToolsViewModel,
    onOpenQuickNav: () -> Unit,
    onNavigate: (Any) -> Unit
) {
    val palette = LocalFileLensColors.current
    val context = LocalContext.current
    val prefs by toolsViewModel.userPrefs.collectAsState()
    val stats by searchViewModel.indexStats.collectAsState()
    val indexTargets by searchViewModel.indexTargets.collectAsState()
    val hasAllFiles by searchViewModel.hasAllFilesPermission.collectAsState()
    val isIndexing by searchViewModel.isIndexing.collectAsState()
    val indexProgress by searchViewModel.indexProgress.collectAsState()
    val lastSummary by searchViewModel.lastIndexSummary.collectAsState()
    val isBackupBusy by toolsViewModel.isBackupBusy.collectAsState()

    var activeTab by remember { mutableIntStateOf(0) }
    var showTutorial by remember { mutableStateOf(false) }
    var showPrivacy by remember { mutableStateOf(false) }
    var showAllFilesDialog by remember { mutableStateOf(false) }
    var pendingBackupExportUri by remember { mutableStateOf<Uri?>(null) }
    var pendingBackupImportUri by remember { mutableStateOf<Uri?>(null) }

    var aiUrl by remember(prefs.aiEndpointUrl) { mutableStateOf(prefs.aiEndpointUrl) }
    var aiModel by remember(prefs.aiModel) { mutableStateOf(prefs.aiModel) }
    var aiKey by remember(prefs.aiApiKey) { mutableStateOf(prefs.aiApiKey) }

    val exportBackupLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/octet-stream")
    ) { uri: Uri? ->
        if (uri != null) pendingBackupExportUri = uri
    }

    val importBackupLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        if (uri != null) pendingBackupImportUri = uri
    }

    val safFolderLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri: Uri? ->
        if (uri != null) {
            searchViewModel.addSafFolder(uri) { synced ->
                toolsViewModel.postToast("Linked & indexed $synced file(s)")
            }
        }
    }

    val legacyReadLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        searchViewModel.refreshStoragePermission()
        toolsViewModel.refreshFolderRoots()
        if (granted) {
            searchViewModel.indexEntireDevice(forceReindex = false) { s ->
                if (s != null) toolsViewModel.postToast("Indexed +${s.newOrUpdated} files (${s.skippedUnchanged} unchanged skipped)")
            }
        }
    }

    fun startDeviceIndex(forceReindex: Boolean) {
        if (hasAllFiles || StoragePermissionHelper.hasAllFilesAccess(context)) {
            searchViewModel.refreshStoragePermission()
            toolsViewModel.postToast(if (forceReindex) "Re-indexing entire device…" else "Running incremental device index…")
            searchViewModel.indexEntireDevice(forceReindex = forceReindex) { s ->
                if (s != null) {
                    toolsViewModel.postToast("Synced +${s.newOrUpdated} new/updated · ${s.skippedUnchanged} unchanged skipped")
                }
            }
        } else {
            showAllFilesDialog = true
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
            subtitle = "On-Device Engine · Preferences & Full Index",
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
                                    TintedSettingIcon(Icons.Rounded.DarkMode, palette.accent)
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
                                    TintedSettingIcon(
                                        Icons.Rounded.Storage,
                                        if (hasAllFiles) palette.success else palette.warning
                                    )
                                    Spacer(Modifier.width(12.dp))
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text("All Files Storage Access", style = MaterialTheme.typography.titleMedium, color = palette.text)
                                        Text(
                                            if (hasAllFiles) "Granted — Entire device search & File Manager active" else "Tap Allow for 1-click full device indexing",
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = palette.muted
                                        )
                                    }
                                    if (hasAllFiles) {
                                        Surface(color = palette.success.copy(alpha = 0.14f), shape = RoundedCornerShape(8.dp)) {
                                            Text(
                                                "Active",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = palette.success,
                                                fontWeight = FontWeight.Bold,
                                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                            )
                                        }
                                    } else {
                                        Button(
                                            onClick = { showAllFilesDialog = true },
                                            colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
                                            modifier = Modifier.testTag("settings_general_allow_all_files_btn")
                                        ) { Text("Allow") }
                                    }
                                }
                            }
                        }
                        item {
                            SettingCard {
                                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                                        TintedSettingIcon(Icons.Rounded.Fingerprint, palette.purpleAccent)
                                        Spacer(Modifier.width(12.dp))
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text("Biometric Vault Lock", style = MaterialTheme.typography.titleMedium, color = palette.text, fontWeight = FontWeight.Bold)
                                            Text("Fingerprint, Face, or Device PIN protection", style = MaterialTheme.typography.bodySmall, color = palette.muted)
                                        }
                                    }
                                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text("Lock Smart Cards Vault", style = MaterialTheme.typography.bodyMedium, color = palette.text, fontWeight = FontWeight.Medium)
                                            Text("Requires authentication before opening ID cards", style = MaterialTheme.typography.labelSmall, color = palette.muted)
                                        }
                                        Switch(
                                            checked = prefs.biometricCardsLock,
                                            onCheckedChange = { target ->
                                                BiometricAuthHelper.authenticate(
                                                    context = context,
                                                    title = if (target) "Enable Smart Cards Lock" else "Disable Smart Cards Lock",
                                                    subtitle = "Confirm identity with biometrics or PIN",
                                                    onSuccess = { toolsViewModel.setBiometricCardsLock(target) },
                                                    onError = { err -> toolsViewModel.postToast(err) }
                                                )
                                            },
                                            modifier = Modifier.testTag("settings_biometric_cards_switch")
                                        )
                                    }
                                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text("Lock Entire App on Launch", style = MaterialTheme.typography.bodyMedium, color = palette.text, fontWeight = FontWeight.Medium)
                                            Text("Protects all documents, Second Brain & searches", style = MaterialTheme.typography.labelSmall, color = palette.muted)
                                        }
                                        Switch(
                                            checked = prefs.biometricAppLock,
                                            onCheckedChange = { target ->
                                                BiometricAuthHelper.authenticate(
                                                    context = context,
                                                    title = if (target) "Enable Full App Lock" else "Disable Full App Lock",
                                                    subtitle = "Confirm identity with biometrics or PIN",
                                                    onSuccess = { toolsViewModel.setBiometricAppLock(target) },
                                                    onError = { err -> toolsViewModel.postToast(err) }
                                                )
                                            },
                                            modifier = Modifier.testTag("settings_biometric_app_switch")
                                        )
                                    }
                                }
                            }
                        }
                        item {
                            SettingCard {
                                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                                        TintedSettingIcon(Icons.Rounded.Backup, palette.accent)
                                        Spacer(Modifier.width(12.dp))
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text("Encrypted Offline Backup", style = MaterialTheme.typography.titleMedium, color = palette.text, fontWeight = FontWeight.Bold)
                                            Text("AES-256-GCM .fspbackup for notes, bookmarks, tags & signatures", style = MaterialTheme.typography.bodySmall, color = palette.muted)
                                        }
                                    }
                                    if (isBackupBusy) {
                                        LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                                    }
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                                        Button(
                                            enabled = !isBackupBusy,
                                            onClick = {
                                                exportBackupLauncher.launch("FileSearchPro_Backup_${System.currentTimeMillis() % 100000}.fspbackup")
                                            },
                                            modifier = Modifier.weight(1f).testTag("settings_export_backup_btn")
                                        ) {
                                            Icon(Icons.Rounded.Backup, contentDescription = null, modifier = Modifier.size(16.dp))
                                            Spacer(Modifier.width(6.dp))
                                            Text("Export")
                                        }
                                        OutlinedButton(
                                            enabled = !isBackupBusy,
                                            onClick = { importBackupLauncher.launch(arrayOf("*/*")) },
                                            modifier = Modifier.weight(1f).testTag("settings_import_backup_btn")
                                        ) {
                                            Icon(Icons.Rounded.Restore, contentDescription = null, modifier = Modifier.size(16.dp))
                                            Spacer(Modifier.width(6.dp))
                                            Text("Restore")
                                        }
                                    }
                                }
                            }
                        }
                        item {
                            SettingCard {
                                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                                    TintedSettingIcon(Icons.Rounded.Shield, palette.success)
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
                                    TintedSettingIcon(Icons.Rounded.CleaningServices, palette.warning)
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
                        if (isIndexing) {
                            item {
                                RichIndexingProgressBanner(
                                    isIndexing = isIndexing,
                                    progress = indexProgress,
                                    onCancel = { searchViewModel.cancelIndexing() }
                                )
                            }
                        }

                        // Entire Device Incremental Index Hero Card
                        item {
                            Surface(
                                shape = RoundedCornerShape(20.dp),
                                shadowElevation = 4.dp,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(
                                    modifier = Modifier
                                        .background(
                                            Brush.linearGradient(
                                                listOf(palette.accentGradientStart, palette.accentGradientEnd)
                                            )
                                        )
                                        .padding(16.dp),
                                    verticalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                        Box(
                                            modifier = Modifier
                                                .size(40.dp)
                                                .clip(RoundedCornerShape(12.dp))
                                                .background(Color.White.copy(alpha = 0.18f)),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Icon(Icons.Rounded.PhoneAndroid, contentDescription = null, tint = Color.White, modifier = Modifier.size(22.dp))
                                        }
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text("Entire Device Index Engine", style = MaterialTheme.typography.titleMedium, color = Color.White, fontWeight = FontWeight.Bold)
                                            Text(
                                                if (hasAllFiles) "All Files Access granted · Incremental delta sync enabled" else "Grant All Files Access to scan all folders at once",
                                                style = MaterialTheme.typography.bodyMedium,
                                                color = Color.White.copy(alpha = 0.85f)
                                            )
                                        }
                                        Icon(
                                            if (hasAllFiles) Icons.Rounded.CheckCircle else Icons.Rounded.LockOpen,
                                            contentDescription = null,
                                            tint = if (hasAllFiles) Color(0xFF34D399) else Color.White,
                                            modifier = Modifier.size(22.dp)
                                        )
                                    }

                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                                        Button(
                                            onClick = { startDeviceIndex(forceReindex = false) },
                                            enabled = !isIndexing,
                                            colors = ButtonDefaults.buttonColors(
                                                containerColor = Color.White,
                                                contentColor = palette.accentGradientStart
                                            ),
                                            shape = RoundedCornerShape(12.dp),
                                            modifier = Modifier.weight(1f).testTag("settings_index_entire_device_btn")
                                        ) {
                                            Icon(Icons.Rounded.Sync, contentDescription = null, modifier = Modifier.size(16.dp))
                                            Spacer(Modifier.width(6.dp))
                                            Text(if (hasAllFiles) "Incremental Sync" else "Allow & Index All", fontWeight = FontWeight.Bold)
                                        }
                                        OutlinedButton(
                                            onClick = { startDeviceIndex(forceReindex = true) },
                                            enabled = !isIndexing,
                                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                                            border = androidx.compose.foundation.BorderStroke(1.dp, Color.White.copy(alpha = 0.4f)),
                                            shape = RoundedCornerShape(12.dp),
                                            modifier = Modifier.weight(0.9f).testTag("settings_force_reindex_btn")
                                        ) {
                                            Icon(Icons.Rounded.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                                            Spacer(Modifier.width(6.dp))
                                            Text("Full Rebuild")
                                        }
                                    }
                                }
                            }
                        }

                        if (lastSummary != null && !isIndexing) {
                            item { LastIndexSummaryStrip(summary = lastSummary) }
                        }

                        item {
                            SettingCard {
                                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Text("Index Telemetry", style = MaterialTheme.typography.titleMedium, color = palette.text, fontWeight = FontWeight.Bold)
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        MiniStatTile("${stats.totalFiles}", "Files", palette.accent, Modifier.weight(1f))
                                        MiniStatTile("${stats.ocrDone}", "OCR Done", palette.success, Modifier.weight(1f))
                                        MiniStatTile("${stats.ocrPending}", "Pending", palette.warning, Modifier.weight(1f))
                                        MiniStatTile("${stats.cardsCount}", "Cards", palette.purpleAccent, Modifier.weight(1f))
                                    }
                                    Button(
                                        onClick = {
                                            searchViewModel.syncIndex(forceReindex = false) { c ->
                                                toolsViewModel.postToast(if (c > 0) "Synced +$c new/updated file(s)" else "Index is already up to date")
                                            }
                                        },
                                        enabled = !isIndexing,
                                        colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
                                        modifier = Modifier.fillMaxWidth().testTag("settings_sync_now_btn")
                                    ) {
                                        Icon(Icons.Rounded.Sync, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text("Auto-Sync New & Changed Files")
                                    }
                                }
                            }
                        }

                        // Background Incremental Auto-Sync (WorkManager)
                        item {
                            SettingCard {
                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                                        TintedSettingIcon(Icons.Rounded.Schedule, palette.success)
                                        Spacer(Modifier.width(12.dp))
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text("Background Auto-Sync", style = MaterialTheme.typography.titleMedium, color = palette.text, fontWeight = FontWeight.Bold)
                                            Text(
                                                if (prefs.lastBackgroundSyncMs > 0L)
                                                    "Last auto-sync: ${FormatUtils.formatDateTime(java.time.Instant.ofEpochMilli(prefs.lastBackgroundSyncMs).toString())}"
                                                else
                                                    "Automatically indexes new downloads & photos every 6 hours",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = palette.muted
                                            )
                                        }
                                        Switch(
                                            checked = prefs.autoBackgroundSyncEnabled,
                                            onCheckedChange = { enabled ->
                                                toolsViewModel.setAutoBackgroundSync(enabled, prefs.autoSyncChargingOnly)
                                            },
                                            modifier = Modifier.testTag("settings_bg_sync_switch")
                                        )
                                    }
                                    if (prefs.autoBackgroundSyncEnabled) {
                                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text("Only While Charging", style = MaterialTheme.typography.bodyMedium, color = palette.text)
                                                Text("Preserves battery by waiting for power adapter", style = MaterialTheme.typography.labelSmall, color = palette.muted)
                                            }
                                            Switch(
                                                checked = prefs.autoSyncChargingOnly,
                                                onCheckedChange = { chargingOnly ->
                                                    toolsViewModel.setAutoBackgroundSync(true, chargingOnly)
                                                },
                                                modifier = Modifier.testTag("settings_bg_sync_charging_switch")
                                            )
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
                                            Text("Persisted SAF folders checked incrementally on launch", style = MaterialTheme.typography.bodyMedium, color = palette.muted)
                                        }
                                        OutlinedButton(onClick = { safFolderLauncher.launch(null) }) {
                                            Icon(Icons.Rounded.CreateNewFolder, contentDescription = null, modifier = Modifier.size(16.dp))
                                            Spacer(Modifier.width(4.dp))
                                            Text("Add")
                                        }
                                    }
                                    indexTargets.forEach { target ->
                                        Surface(
                                            color = palette.surface2,
                                            shape = RoundedCornerShape(10.dp),
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                                            ) {
                                                Icon(Icons.Rounded.Folder, contentDescription = null, tint = palette.warning, modifier = Modifier.size(18.dp))
                                                Spacer(Modifier.width(8.dp))
                                                Text(target.label, style = MaterialTheme.typography.bodyMedium, color = palette.text, modifier = Modifier.weight(1f))
                                                IconButton(onClick = { searchViewModel.removeSafFolder(target.id) }) {
                                                    Icon(Icons.Rounded.DeleteOutline, contentDescription = "Unlink Folder", tint = palette.danger)
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        item {
                            SettingCard {
                                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Text("OCR Recognition Language", style = MaterialTheme.typography.titleMedium, color = palette.text)
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        listOf("eng+hin" to "English + Hindi", "eng" to "English Only", "hin" to "Hindi Only").forEach { (code, label) ->
                                            FilterChip(
                                                selected = prefs.ocrLanguage == code,
                                                onClick = { toolsViewModel.setOcrLanguage(code) },
                                                label = { Text(label) },
                                                colors = FilterChipDefaults.filterChipColors(
                                                    selectedContainerColor = palette.accent,
                                                    selectedLabelColor = Color.White
                                                )
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
                                    TintedSettingIcon(Icons.Rounded.AutoAwesome, palette.accent)
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
                                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                                    TintedSettingIcon(Icons.Rounded.Verified, palette.success)
                                    Spacer(Modifier.width(12.dp))
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
                                    Text("FileSearchPro v2.0.0 (Native Kotlin)", style = MaterialTheme.typography.titleLarge, color = palette.text, fontWeight = FontWeight.Bold)
                                    Text("On-Device Document Intelligence · Incremental Full-Device Indexer · Second Brain · Smart Cards · PDF Tools · LAN Explorer", style = MaterialTheme.typography.bodyMedium, color = palette.muted)
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

    if (showAllFilesDialog) {
        AllFilesPermissionDialog(
            onGrantPermission = {
                showAllFilesDialog = false
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    StoragePermissionHelper.launchAllFilesAccessSettings(context)
                } else {
                    legacyReadLauncher.launch(Manifest.permission.READ_EXTERNAL_STORAGE)
                }
            },
            onUseFolderPicker = {
                showAllFilesDialog = false
                safFolderLauncher.launch(null)
            },
            onDismiss = { showAllFilesDialog = false }
        )
    }

    if (showTutorial) TutorialDialog(onDismiss = { showTutorial = false })
    if (showPrivacy) PrivacyPolicyDialog(onDismiss = { showPrivacy = false })

    pendingBackupExportUri?.let { destUri ->
        var pwd by remember { mutableStateOf("") }
        var confirmPwd by remember { mutableStateOf("") }
        val valid = pwd.length >= 4 && pwd == confirmPwd
        AlertDialog(
            onDismissRequest = { pendingBackupExportUri = null },
            containerColor = palette.surface,
            title = { Text("Encrypt Offline Backup", color = palette.text, fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Set a password (min 4 chars) to encrypt your vault with AES-256-GCM:", style = MaterialTheme.typography.bodySmall, color = palette.muted)
                    OutlinedTextField(
                        value = pwd,
                        onValueChange = { pwd = it },
                        label = { Text("Backup Password") },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        modifier = Modifier.fillMaxWidth().testTag("backup_export_pwd_input")
                    )
                    OutlinedTextField(
                        value = confirmPwd,
                        onValueChange = { confirmPwd = it },
                        label = { Text("Confirm Password") },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    enabled = valid,
                    onClick = {
                        toolsViewModel.exportEncryptedBackup(destUri, pwd)
                        pendingBackupExportUri = null
                    }
                ) { Text("Encrypt & Save") }
            },
            dismissButton = { TextButton(onClick = { pendingBackupExportUri = null }) { Text("Cancel") } }
        )
    }

    pendingBackupImportUri?.let { srcUri ->
        var pwd by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { pendingBackupImportUri = null },
            containerColor = palette.surface,
            title = { Text("Restore Encrypted Backup", color = palette.text, fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Enter the password used when creating this .fspbackup file:", style = MaterialTheme.typography.bodySmall, color = palette.muted)
                    OutlinedTextField(
                        value = pwd,
                        onValueChange = { pwd = it },
                        label = { Text("Backup Password") },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        modifier = Modifier.fillMaxWidth().testTag("backup_import_pwd_input")
                    )
                }
            },
            confirmButton = {
                Button(
                    enabled = pwd.length >= 4,
                    onClick = {
                        toolsViewModel.importEncryptedBackup(srcUri, pwd)
                        pendingBackupImportUri = null
                    }
                ) { Text("Decrypt & Restore") }
            },
            dismissButton = { TextButton(onClick = { pendingBackupImportUri = null }) { Text("Cancel") } }
        )
    }
}

@Composable
private fun TintedSettingIcon(icon: ImageVector, tint: Color) {
    Box(
        modifier = Modifier
            .size(40.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(tint.copy(alpha = 0.14f)),
        contentAlignment = Alignment.Center
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(21.dp))
    }
}

@Composable
private fun MiniStatTile(value: String, label: String, tint: Color, modifier: Modifier = Modifier) {
    val palette = LocalFileLensColors.current
    Surface(
        color = tint.copy(alpha = 0.1f),
        shape = RoundedCornerShape(12.dp),
        modifier = modifier
    ) {
        Column(
            modifier = Modifier.padding(vertical = 8.dp, horizontal = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(value, style = MaterialTheme.typography.titleMedium, color = tint, fontWeight = FontWeight.Bold)
            Text(label, style = MaterialTheme.typography.labelSmall, color = palette.muted)
        }
    }
}

@Composable
private fun SettingCard(content: @Composable () -> Unit) {
    val palette = LocalFileLensColors.current
    Surface(
        color = palette.surface,
        shape = RoundedCornerShape(18.dp),
        shadowElevation = 1.dp,
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, palette.border, RoundedCornerShape(18.dp))
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            content()
        }
    }
}
