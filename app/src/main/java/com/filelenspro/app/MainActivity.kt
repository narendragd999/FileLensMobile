package com.filelenspro.app

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CreditCard
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Psychology
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import com.filelenspro.app.domain.engine.SmartTaxonomy
import com.filelenspro.app.ui.components.QuickNavSheet
import com.filelenspro.app.ui.components.TutorialDialog
import com.filelenspro.app.ui.navigation.BookmarksRoute
import com.filelenspro.app.ui.navigation.CardsRoute
import com.filelenspro.app.ui.navigation.CreateCardRoute
import com.filelenspro.app.ui.navigation.DocScannerRoute
import com.filelenspro.app.ui.navigation.DocumentsRoute
import com.filelenspro.app.ui.navigation.FileAnalyserRoute
import com.filelenspro.app.ui.navigation.FileManagerRoute
import com.filelenspro.app.ui.navigation.LicenseRoute
import com.filelenspro.app.ui.navigation.PageOrganizerRoute
import com.filelenspro.app.ui.navigation.PdfViewerRoute
import com.filelenspro.app.ui.navigation.SavedSearchesRoute
import com.filelenspro.app.ui.navigation.SearchRoute
import com.filelenspro.app.ui.navigation.SecondBrainRoute
import com.filelenspro.app.ui.navigation.SettingsRoute
import com.filelenspro.app.ui.screens.BookmarksScreen
import com.filelenspro.app.ui.screens.CardsScreen
import com.filelenspro.app.ui.screens.CreateCardScreen
import com.filelenspro.app.ui.screens.DocScannerScreen
import com.filelenspro.app.ui.screens.DocumentsScreen
import com.filelenspro.app.ui.screens.FileAnalyserScreen
import com.filelenspro.app.ui.screens.FileManagerScreen
import com.filelenspro.app.ui.screens.LicenseScreen
import com.filelenspro.app.ui.screens.PageOrganizerScreen
import com.filelenspro.app.ui.screens.PdfViewerScreen
import com.filelenspro.app.ui.screens.SavedSearchesScreen
import com.filelenspro.app.ui.screens.SearchScreen
import com.filelenspro.app.ui.screens.SecondBrainScreen
import com.filelenspro.app.ui.screens.SettingsScreen
import com.filelenspro.app.ui.theme.FileLensTheme
import com.filelenspro.app.ui.theme.LocalFileLensColors
import com.filelenspro.app.ui.viewmodel.SearchViewModel
import com.filelenspro.app.ui.viewmodel.SecondBrainViewModel
import com.filelenspro.app.ui.viewmodel.SharedPayload
import com.filelenspro.app.ui.viewmodel.ToolsViewModel

class MainActivity : ComponentActivity() {

    private var latestIntentState by mutableStateOf<Intent?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        latestIntentState = intent

        setContent {
            val searchViewModel: SearchViewModel = viewModel()
            val brainViewModel: SecondBrainViewModel = viewModel()
            val toolsViewModel: ToolsViewModel = viewModel()

            val prefs by searchViewModel.userPrefs.collectAsState()
            val toastMsg by toolsViewModel.toastMessage.collectAsState()
            val pendingShare by searchViewModel.pendingSharePayload.collectAsState()

            val snackbarHostState = remember { SnackbarHostState() }

            LaunchedEffect(toastMsg) {
                val msg = toastMsg
                if (!msg.isNullOrBlank()) {
                    snackbarHostState.showSnackbar(msg)
                    toolsViewModel.clearToast()
                }
            }

            LaunchedEffect(latestIntentState) {
                val incoming = latestIntentState ?: return@LaunchedEffect
                if (incoming.action == Intent.ACTION_SEND || incoming.action == Intent.ACTION_SEND_MULTIPLE) {
                    val text = incoming.getStringExtra(Intent.EXTRA_TEXT)
                    val uris = mutableListOf<Uri>()
                    if (incoming.action == Intent.ACTION_SEND) {
                        val single = if (Build.VERSION.SDK_INT >= 33) {
                            incoming.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
                        } else {
                            @Suppress("DEPRECATION")
                            incoming.getParcelableExtra(Intent.EXTRA_STREAM)
                        }
                        if (single != null) uris.add(single)
                    } else {
                        val multi = if (Build.VERSION.SDK_INT >= 33) {
                            incoming.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
                        } else {
                            @Suppress("DEPRECATION")
                            incoming.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
                        }
                        if (multi != null) uris.addAll(multi)
                    }
                    if (!text.isNullOrBlank() || uris.isNotEmpty()) {
                        val rec = SmartTaxonomy.classifyIncomingIntent(
                            textOrName = text ?: uris.firstOrNull()?.lastPathSegment.orEmpty(),
                            isDocumentOrImage = uris.isNotEmpty()
                        )
                        searchViewModel.setPendingShare(
                            SharedPayload(
                                text = text,
                                uris = uris,
                                suggestedTarget = rec.target,
                                displayLabel = text?.take(60) ?: "${uris.size} shared file(s)"
                            )
                        )
                    }
                    latestIntentState = null
                }
            }

            FileLensTheme(darkTheme = prefs.isDarkTheme) {
                FileLensRootShell(
                    searchViewModel = searchViewModel,
                    brainViewModel = brainViewModel,
                    toolsViewModel = toolsViewModel,
                    isProActivated = prefs.isProActivated,
                    snackbarHostState = snackbarHostState,
                    pendingShare = pendingShare,
                    onClearShare = { searchViewModel.setPendingShare(null) }
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        latestIntentState = intent
    }
}

@Composable
private fun FileLensRootShell(
    searchViewModel: SearchViewModel,
    brainViewModel: SecondBrainViewModel,
    toolsViewModel: ToolsViewModel,
    isProActivated: Boolean,
    snackbarHostState: SnackbarHostState,
    pendingShare: SharedPayload?,
    onClearShare: () -> Unit
) {
    val palette = LocalFileLensColors.current
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val destination = navBackStackEntry?.destination

    var showQuickNav by remember { mutableStateOf(false) }
    var showTutorial by remember { mutableStateOf(false) }

    val isMainTab = destination == null ||
        destination.hasRoute<DocumentsRoute>() ||
        destination.hasRoute<SecondBrainRoute>() ||
        destination.hasRoute<SearchRoute>() ||
        destination.hasRoute<CardsRoute>() ||
        destination.hasRoute<SettingsRoute>()

    fun navigateTop(route: Any) {
        navController.navigate(route) {
            launchSingleTop = true
        }
    }

    Scaffold(
        containerColor = palette.bg,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
        bottomBar = {
            if (isMainTab) {
                FileLensBottomNavBar(
                    isDocs = destination?.hasRoute<DocumentsRoute>() == true,
                    isBrain = destination?.hasRoute<SecondBrainRoute>() == true,
                    isSearch = destination == null || destination.hasRoute<SearchRoute>(),
                    isCards = destination?.hasRoute<CardsRoute>() == true,
                    isSettings = destination?.hasRoute<SettingsRoute>() == true,
                    onSelect = { route -> navigateTop(route) }
                )
            }
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .padding(innerPadding)
        ) {
            NavHost(navController = navController, startDestination = SearchRoute) {
                composable<SearchRoute> {
                    SearchScreen(
                        searchViewModel = searchViewModel,
                        toolsViewModel = toolsViewModel,
                        onOpenQuickNav = { showQuickNav = true },
                        onNavigate = { navigateTop(it) }
                    )
                }
                composable<DocumentsRoute> {
                    DocumentsScreen(
                        searchViewModel = searchViewModel,
                        toolsViewModel = toolsViewModel,
                        onOpenQuickNav = { showQuickNav = true },
                        onNavigate = { navigateTop(it) }
                    )
                }
                composable<SecondBrainRoute> {
                    SecondBrainScreen(
                        viewModel = brainViewModel,
                        toolsViewModel = toolsViewModel,
                        onOpenQuickNav = { showQuickNav = true }
                    )
                }
                composable<CardsRoute> {
                    CardsScreen(
                        searchViewModel = searchViewModel,
                        toolsViewModel = toolsViewModel,
                        onOpenQuickNav = { showQuickNav = true },
                        onNavigate = { navigateTop(it) }
                    )
                }
                composable<SettingsRoute> {
                    SettingsScreen(
                        searchViewModel = searchViewModel,
                        toolsViewModel = toolsViewModel,
                        onOpenQuickNav = { showQuickNav = true },
                        onNavigate = { navigateTop(it) }
                    )
                }
                composable<FileManagerRoute> {
                    FileManagerScreen(
                        toolsViewModel = toolsViewModel,
                        onBack = { navController.popBackStack() }
                    )
                }
                composable<FileAnalyserRoute> {
                    FileAnalyserScreen(
                        toolsViewModel = toolsViewModel,
                        onBack = { navController.popBackStack() }
                    )
                }
                composable<DocScannerRoute> { entry ->
                    val args = entry.toRoute<DocScannerRoute>()
                    DocScannerScreen(
                        initialMode = args.mode,
                        toolsViewModel = toolsViewModel,
                        onBack = { navController.popBackStack() }
                    )
                }
                composable<PageOrganizerRoute> { entry ->
                    val args = entry.toRoute<PageOrganizerRoute>()
                    PageOrganizerScreen(
                        initialPdfUri = args.pdfUri,
                        initialFileName = args.fileName,
                        toolsViewModel = toolsViewModel,
                        onBack = { navController.popBackStack() }
                    )
                }
                composable<PdfViewerRoute> { entry ->
                    val args = entry.toRoute<PdfViewerRoute>()
                    PdfViewerScreen(
                        uri = args.uri,
                        title = args.title,
                        toolsViewModel = toolsViewModel,
                        onOpenOrganizer = { navigateTop(PageOrganizerRoute(args.uri, args.title)) },
                        onBack = { navController.popBackStack() }
                    )
                }
                composable<CreateCardRoute> { entry ->
                    val args = entry.toRoute<CreateCardRoute>()
                    CreateCardScreen(
                        fileUri = args.fileUri,
                        fileId = args.fileId,
                        fileName = args.fileName,
                        initialTag = args.initialTag,
                        toolsViewModel = toolsViewModel,
                        onBack = { navController.popBackStack() }
                    )
                }
                composable<BookmarksRoute> {
                    BookmarksScreen(
                        searchViewModel = searchViewModel,
                        toolsViewModel = toolsViewModel,
                        onNavigate = { navigateTop(it) },
                        onBack = { navController.popBackStack() }
                    )
                }
                composable<SavedSearchesRoute> {
                    SavedSearchesScreen(
                        searchViewModel = searchViewModel,
                        onRunSearchAndGoHome = { q, mode ->
                            searchViewModel.runSavedSearch(q, mode)
                            navigateTop(SearchRoute)
                        },
                        onBack = { navController.popBackStack() }
                    )
                }
                composable<LicenseRoute> {
                    LicenseScreen(
                        toolsViewModel = toolsViewModel,
                        onBack = { navController.popBackStack() }
                    )
                }
            }
        }
    }

    if (showQuickNav) {
        QuickNavSheet(
            isProActivated = isProActivated,
            onDismiss = { showQuickNav = false },
            onNavigate = { navigateTop(it) },
            onOpenTutorial = { showTutorial = true }
        )
    }

    if (showTutorial) {
        TutorialDialog(onDismiss = { showTutorial = false })
    }

    pendingShare?.let { share ->
        AlertDialog(
            onDismissRequest = onClearShare,
            containerColor = palette.surface,
            title = { Text("Import Shared Content", color = palette.text) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(share.displayLabel, style = MaterialTheme.typography.bodyLarge, color = palette.textSecondary)
                    Text(
                        "Recommended: ${if (share.suggestedTarget == "card") "Save to Smart Cards Wallet" else "Create Second Brain Note"}",
                        style = MaterialTheme.typography.labelLarge,
                        color = palette.accent
                    )
                }
            },
            confirmButton = {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = {
                        if (!share.text.isNullOrBlank()) {
                            brainViewModel.prepareNoteConfirmation(share.text)
                        } else if (share.uris.isNotEmpty()) {
                            brainViewModel.attachImageForNextNote(share.uris.first())
                            brainViewModel.prepareNoteConfirmation("Shared Attachment")
                        }
                        onClearShare()
                        navigateTop(SecondBrainRoute)
                    }) { Text("Second Brain") }

                    Button(onClick = {
                        if (share.uris.isNotEmpty()) {
                            searchViewModel.importUris(share.uris)
                            toolsViewModel.postToast("Indexing shared file(s)…")
                        }
                        onClearShare()
                        navigateTop(CardsRoute)
                    }) { Text("Smart Cards") }
                }
            },
            dismissButton = { TextButton(onClick = onClearShare) { Text("Dismiss") } }
        )
    }
}

@Composable
private fun FileLensBottomNavBar(
    isDocs: Boolean,
    isBrain: Boolean,
    isSearch: Boolean,
    isCards: Boolean,
    isSettings: Boolean,
    onSelect: (Any) -> Unit
) {
    val palette = LocalFileLensColors.current
    Surface(
        color = palette.surface,
        tonalElevation = 3.dp,
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.navigationBarsPadding()) {
            Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(palette.border))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(66.dp)
                    .padding(horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceAround
            ) {
                BottomTabItem("Docs", Icons.Rounded.Description, isDocs, "nav_tab_docs") { onSelect(DocumentsRoute) }
                BottomTabItem("Brain", Icons.Rounded.Psychology, isBrain, "nav_tab_brain") { onSelect(SecondBrainRoute) }

                // Elevated Cobalt Center Search Button
                Box(
                    modifier = Modifier
                        .offset(y = (-8).dp)
                        .size(56.dp)
                        .shadow(8.dp, CircleShape)
                        .clip(CircleShape)
                        .background(if (isSearch) palette.accent else palette.surface2)
                        .clickable { onSelect(SearchRoute) }
                        .testTag("nav_tab_search"),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        Icons.Rounded.Search,
                        contentDescription = "Search",
                        tint = if (isSearch) Color.White else palette.text,
                        modifier = Modifier.size(28.dp)
                    )
                }

                BottomTabItem("Cards", Icons.Rounded.CreditCard, isCards, "nav_tab_cards") { onSelect(CardsRoute) }
                BottomTabItem("Settings", Icons.Rounded.Settings, isSettings, "nav_tab_settings") { onSelect(SettingsRoute) }
            }
        }
    }
}

@Composable
private fun BottomTabItem(
    label: String,
    icon: ImageVector,
    selected: Boolean,
    tag: String,
    onClick: () -> Unit
) {
    val palette = LocalFileLensColors.current
    val tint = if (selected) palette.accent else palette.muted
    Column(
        modifier = Modifier
            .size(width = 62.dp, height = 52.dp)
            .clip(CircleShape)
            .clickable(onClick = onClick)
            .testTag(tag),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(icon, contentDescription = label, tint = tint, modifier = Modifier.size(22.dp))
        Spacer(Modifier.height(2.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            color = tint,
            maxLines = 1
        )
    }
}
