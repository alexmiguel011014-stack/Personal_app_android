package com.example.personalapp.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.personalapp.data.service.UpdateChecker
import com.example.personalapp.data.service.UpdateStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

// GOALS.md §18i: one instance backs both the automatic launch-time check (RoleRouter) and the
// manual "Verificar atualização" button (SettingsScreen) — same StateFlow, two triggers.
class UpdateViewModel(
    private val updateChecker: UpdateChecker,
) : ViewModel() {

    val currentVersionName: String = updateChecker.currentVersionName

    private val _status = MutableStateFlow<UpdateStatus?>(null)
    val status: StateFlow<UpdateStatus?> = _status

    private val _isChecking = MutableStateFlow(false)
    val isChecking: StateFlow<Boolean> = _isChecking

    fun checkForUpdate() {
        viewModelScope.launch {
            _isChecking.value = true
            _status.value = updateChecker.check()
            _isChecking.value = false
        }
    }

    fun dismiss() {
        _status.value = null
    }
}
