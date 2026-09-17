package com.example.personalapp

import androidx.compose.ui.window.ComposeUIViewController
import com.example.personalapp.ui.App
import platform.UIKit.UIViewController

// Entry point for the (future, GOALS.md §18j) Xcode project: `ContentView` hosts this via
// UIViewControllerRepresentable. Call initKoin() first.
fun MainViewController(): UIViewController = ComposeUIViewController { App() }
