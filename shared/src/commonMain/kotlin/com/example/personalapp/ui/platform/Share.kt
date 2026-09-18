package com.example.personalapp.ui.platform

import androidx.compose.runtime.Composable

// System share sheet for a plain-text payload (the invite code on StudentDetailsScreen).
// Android: ACTION_SEND chooser; iOS: UIActivityViewController. Composable so the Android actual
// can reach LocalContext without the caller threading a Context through.
@Composable
expect fun rememberTextSharer(): (String) -> Unit
