package com.filelenspro.app.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.filelenspro.app.ui.theme.LocalFileLensColors
import com.filelenspro.app.ui.viewmodel.SearchViewModel
import com.filelenspro.app.util.FormatUtils

@Composable
fun SavedSearchesScreen(
    searchViewModel: SearchViewModel,
    onRunSearchAndGoHome: (String, String) -> Unit,
    onBack: () -> Unit
) {
    val palette = LocalFileLensColors.current
    val searches by searchViewModel.savedSearches.collectAsState()

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
                Column(modifier = Modifier.weight(1f)) {
                    Text("Saved Searches", style = MaterialTheme.typography.titleLarge, color = palette.text)
                    Text("${searches.size} one-tap query preset(s)", style = MaterialTheme.typography.bodyMedium, color = palette.muted)
                }
                if (searches.isNotEmpty()) {
                    TextButton(onClick = { searchViewModel.clearSavedSearches() }) {
                        Text("Clear All", color = palette.danger)
                    }
                }
            }
        }

        Column(modifier = Modifier.widthIn(max = 600.dp).fillMaxSize()) {
            if (searches.isEmpty()) {
                Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Rounded.Star, contentDescription = null, tint = palette.dim, modifier = Modifier.size(50.dp))
                        Spacer(Modifier.height(8.dp))
                        Text("No Saved Searches", style = MaterialTheme.typography.titleLarge, color = palette.text)
                        Text("Tap the bookmark icon in the Search bar to save frequent queries.", style = MaterialTheme.typography.bodyMedium, color = palette.muted)
                    }
                }
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(searches, key = { it.id }) { s ->
                        Surface(
                            color = palette.surface,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .border(1.dp, palette.border, RoundedCornerShape(14.dp))
                                .clip(RoundedCornerShape(14.dp))
                                .clickable { onRunSearchAndGoHome(s.query, s.mode) }
                        ) {
                            Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Rounded.Search, contentDescription = null, tint = palette.accent)
                                Spacer(Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(s.query, style = MaterialTheme.typography.titleMedium, color = palette.text)
                                    Text("Mode: ${s.mode} · ${FormatUtils.formatDate(s.createdAt)}", style = MaterialTheme.typography.labelSmall, color = palette.muted)
                                }
                                IconButton(onClick = { searchViewModel.deleteSavedSearch(s.id) }) {
                                    Icon(Icons.Rounded.DeleteOutline, contentDescription = "Delete Saved Search", tint = palette.danger)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
