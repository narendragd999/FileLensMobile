package com.filelenspro.app.ui.viewmodel

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.filelenspro.app.FileLensApplication
import com.filelenspro.app.data.db.BookmarkEntity
import com.filelenspro.app.data.db.FileEntity
import com.filelenspro.app.data.db.SavedSearchEntity
import com.filelenspro.app.data.model.IndexStats
import com.filelenspro.app.data.model.SearchFilters
import com.filelenspro.app.data.model.SearchMode
import com.filelenspro.app.data.model.SearchResult
import com.filelenspro.app.data.model.SortColumn
import com.filelenspro.app.data.model.SortOrder
import com.filelenspro.app.domain.engine.SearchEngine
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import java.time.Instant

data class SharedPayload(
    val text: String? = null,
    val uris: List<Uri> = emptyList(),
    val suggestedTarget: String = "card",
    val displayLabel: String = ""
)

class SearchViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application as FileLensApplication
    private val dao = app.database.dao()
    private val prefs = app.preferences
    private val indexer = app.documentIndexer

    val userPrefs = prefs.prefsFlow.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5000),
        com.filelenspro.app.data.prefs.UserPrefs()
    )

    val allFiles = dao.observeAllFiles().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val bookmarks = dao.observeBookmarks().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val savedSearches = dao.observeSavedSearches().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val indexTargets = dao.observeIndexTargets().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val isIndexing = indexer.isIndexing
    val indexProgress = indexer.progress

    val indexStats: StateFlow<IndexStats> = allFiles.combine(userPrefs) { files, _ ->
        IndexStats(
            totalFiles = files.size,
            ocrDone = files.count { it.ocrStatus == "done" },
            ocrPending = files.count { it.ocrStatus == "pending" },
            cardsCount = files.count { it.isCard }
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), IndexStats())

    private val _searchQuery = MutableStateFlow("")
    val searchQuery = _searchQuery.asStateFlow()

    private val _searchMode = MutableStateFlow(SearchMode.PARTIAL)
    val searchMode = _searchMode.asStateFlow()

    private val _sortColumn = MutableStateFlow(SortColumn.SCORE)
    val sortColumn = _sortColumn.asStateFlow()

    private val _sortOrder = MutableStateFlow(SortOrder.DESC)
    val sortOrder = _sortOrder.asStateFlow()

    private val _filters = MutableStateFlow(SearchFilters())
    val filters = _filters.asStateFlow()

    private val _searchResults = MutableStateFlow<List<SearchResult>>(emptyList())
    val searchResults = _searchResults.asStateFlow()

    private val _isSearching = MutableStateFlow(false)
    val isSearching = _isSearching.asStateFlow()

    private val _searchElapsedMs = MutableStateFlow(0L)
    val searchElapsedMs = _searchElapsedMs.asStateFlow()

    private val _pendingSharePayload = MutableStateFlow<SharedPayload?>(null)
    val pendingSharePayload = _pendingSharePayload.asStateFlow()

    private var searchJob: Job? = null

    init {
        viewModelScope.launch {
            indexer.syncAndReindexAll(ocrLanguage = userPrefs.value.ocrLanguage, forceReindex = false)
        }
    }

    fun syncIndex(forceReindex: Boolean = false, onComplete: (Int) -> Unit = {}) {
        viewModelScope.launch {
            val count = indexer.syncAndReindexAll(
                ocrLanguage = userPrefs.value.ocrLanguage,
                forceReindex = forceReindex
            )
            if (_searchQuery.value.isNotBlank()) triggerSearch(immediate = true)
            onComplete(count)
        }
    }

    fun addSafFolder(treeUri: Uri, onComplete: (Int) -> Unit = {}) {
        viewModelScope.launch {
            val count = indexer.addSafFolderTarget(treeUri, userPrefs.value.ocrLanguage)
            if (_searchQuery.value.isNotBlank()) triggerSearch(immediate = true)
            onComplete(count)
        }
    }

    fun removeSafFolder(targetId: Long) {
        viewModelScope.launch(Dispatchers.IO) {
            dao.deleteIndexTarget(targetId)
        }
    }

    fun setQuery(q: String) {
        _searchQuery.value = q
        triggerSearch()
    }

    fun setMode(mode: SearchMode) {
        _searchMode.value = mode
        triggerSearch()
    }

    fun toggleSort(column: SortColumn) {
        if (_sortColumn.value == column) {
            _sortOrder.value = if (_sortOrder.value == SortOrder.ASC) SortOrder.DESC else SortOrder.ASC
        } else {
            _sortColumn.value = column
            _sortOrder.value = if (column == SortColumn.SCORE || column == SortColumn.MODIFIED || column == SortColumn.SIZE) SortOrder.DESC else SortOrder.ASC
        }
        triggerSearch()
    }

    fun setFilters(filters: SearchFilters) {
        _filters.value = filters
        triggerSearch()
    }

    fun runSavedSearch(query: String, modeId: String) {
        _searchQuery.value = query
        _searchMode.value = SearchMode.entries.firstOrNull { it.id == modeId } ?: SearchMode.PARTIAL
        triggerSearch(immediate = true)
    }

    fun triggerSearch(immediate: Boolean = false) {
        searchJob?.cancel()
        val q = _searchQuery.value
        if (q.isBlank()) {
            _searchResults.value = emptyList()
            _isSearching.value = false
            return
        }
        searchJob = viewModelScope.launch(Dispatchers.Default) {
            if (!immediate) delay(160)
            _isSearching.value = true
            val start = System.currentTimeMillis()
            val files = dao.getAllFiles()
            val chunks = if (_searchMode.value == SearchMode.SIMILAR) dao.getAllChunks() else emptyList()
            val res = SearchEngine.search(
                query = q,
                mode = _searchMode.value,
                filters = _filters.value,
                sortColumn = _sortColumn.value,
                sortOrder = _sortOrder.value,
                allFiles = files,
                allChunks = chunks
            )
            _searchElapsedMs.value = (System.currentTimeMillis() - start).coerceAtLeast(1L)
            _searchResults.value = res
            _isSearching.value = false
        }
    }

    fun importUris(uris: List<Uri>) {
        if (uris.isEmpty()) return
        viewModelScope.launch {
            indexer.indexPickedUris(uris, userPrefs.value.ocrLanguage)
            if (_searchQuery.value.isNotBlank()) triggerSearch(immediate = true)
        }
    }

    fun cancelIndexing() = indexer.cancel()

    fun toggleBookmark(file: FileEntity) {
        viewModelScope.launch(Dispatchers.IO) {
            val existing = dao.getBookmarkByUri(file.uri)
            if (existing != null) {
                dao.deleteBookmarkByUri(file.uri)
            } else {
                dao.insertBookmark(
                    BookmarkEntity(
                        fileUri = file.uri,
                        fileName = file.name,
                        extension = file.extension,
                        size = file.size,
                        modified = file.modified,
                        tagsJson = if (file.customTag.isNotBlank()) Json.encodeToString(listOf(file.customTag)) else "[]",
                        createdAt = Instant.now().toString()
                    )
                )
            }
        }
    }

    fun updateBookmarkTags(fileUri: String, tags: List<String>) {
        viewModelScope.launch(Dispatchers.IO) {
            dao.updateBookmarkTags(fileUri, Json.encodeToString(tags))
        }
    }

    fun removeBookmark(fileUri: String) {
        viewModelScope.launch(Dispatchers.IO) {
            dao.deleteBookmarkByUri(fileUri)
        }
    }

    fun saveCurrentSearch() {
        val q = _searchQuery.value.trim()
        if (q.isBlank()) return
        viewModelScope.launch(Dispatchers.IO) {
            dao.insertSavedSearch(
                SavedSearchEntity(
                    query = q,
                    mode = _searchMode.value.id,
                    createdAt = Instant.now().toString()
                )
            )
        }
    }

    fun deleteSavedSearch(id: Long) {
        viewModelScope.launch(Dispatchers.IO) { dao.deleteSavedSearchById(id) }
    }

    fun clearSavedSearches() {
        viewModelScope.launch(Dispatchers.IO) { dao.clearSavedSearches() }
    }

    fun toggleTheme() {
        viewModelScope.launch { prefs.setDarkTheme(!userPrefs.value.isDarkTheme) }
    }

    fun setPendingShare(payload: SharedPayload?) {
        _pendingSharePayload.value = payload
    }
}
