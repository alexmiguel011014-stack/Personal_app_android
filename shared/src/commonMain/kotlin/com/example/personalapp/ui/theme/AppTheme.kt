package com.example.personalapp.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

// GOALS.md §22a/§22b: the "stop looking like an Android app" palette and shape scale, as named
// constants instead of magic numbers scattered across screens. Every screen already reads colors
// and corner radii through MaterialTheme.colorScheme.*/shapes.* (verified 2026-09-21 — only one
// hardcoded color exists anywhere in ui/screen, SuccessGreen, which fills a real gap Material3
// has no role for), so this file alone is what changes the whole app's look.
//
// Dark theme is explicitly out of scope for this pass (§22b) — there is no dark variant here yet.

// One accent (indigo), kept close to the app's original purple hue rather than replaced —
// §22a's direction is "the app-ness comes from purple-tinted *surfaces*, not the accent". Used
// for primary actions, the selected-row indicator and links.
private val Primary = Color(0xFF4F46E5)
private val OnPrimary = Color(0xFFFFFFFF)
private val PrimaryContainer = Color(0xFFE4E2FA)
private val OnPrimaryContainer = Color(0xFF1E1B4B)

// Material's baseline lightColorScheme() defaults secondary/secondaryContainer to a pale lavender
// (0xFFE8DEF8) — that single default is what made every StudentCard, chip and outlined surface in
// the old screenshots read as "Android app purple". Replaced with neutral slate: same role in the
// type system, no hue of its own.
private val Secondary = Color(0xFF64748B)
private val OnSecondary = Color(0xFFFFFFFF)
private val SecondaryContainer = Color(0xFFEEF1F5)
private val OnSecondaryContainer = Color(0xFF334155)

// Tertiary keeps a distinct, non-purple identity — StudentListItem uses it to mark "Feminino"
// against secondary's neutral default, so it has to actually read as a different color.
private val Tertiary = Color(0xFF0D9488)
private val OnTertiary = Color(0xFFFFFFFF)
private val TertiaryContainer = Color(0xFFCCFBF1)
private val OnTertiaryContainer = Color(0xFF134E4A)

private val Background = Color(0xFFF8F9FB)
private val OnBackground = Color(0xFF1E1E24)
private val Surface = Color(0xFFFFFFFF)
private val OnSurface = Color(0xFF1E1E24)
private val SurfaceVariant = Color(0xFFF1F2F5)
private val OnSurfaceVariant = Color(0xFF5B5F6B)
// §22a's "elevation replaced by 1dp borders" direction: this is the border color panes/cards will
// use. Not yet swept across every Card in the app (recorded as remaining work in GOALS.md §22c) —
// this pass establishes the token so that sweep has something correct to reach for.
private val Outline = Color(0xFFD8DAE0)
private val OutlineVariant = Color(0xFFE7E8EC)

private val Error = Color(0xFFDC2626)
private val OnError = Color(0xFFFFFFFF)
private val ErrorContainer = Color(0xFFFEE2E2)
private val OnErrorContainer = Color(0xFF7F1D1D)

private val AppColorScheme = lightColorScheme(
    primary = Primary,
    onPrimary = OnPrimary,
    primaryContainer = PrimaryContainer,
    onPrimaryContainer = OnPrimaryContainer,
    secondary = Secondary,
    onSecondary = OnSecondary,
    secondaryContainer = SecondaryContainer,
    onSecondaryContainer = OnSecondaryContainer,
    tertiary = Tertiary,
    onTertiary = OnTertiary,
    tertiaryContainer = TertiaryContainer,
    onTertiaryContainer = OnTertiaryContainer,
    background = Background,
    onBackground = OnBackground,
    surface = Surface,
    onSurface = OnSurface,
    surfaceVariant = SurfaceVariant,
    onSurfaceVariant = OnSurfaceVariant,
    outline = Outline,
    outlineVariant = OutlineVariant,
    error = Error,
    onError = OnError,
    errorContainer = ErrorContainer,
    onErrorContainer = OnErrorContainer,
)

// §22a: corner radius dropped from Material's defaults (4/8/12/16/28dp) to a crisper 4-10dp range
// — the single change that most reads as "not a phone app" on Card/Button/Dialog shapes, since
// every one of them already resolves its shape from MaterialTheme.shapes.* rather than a literal.
private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp),
    small = RoundedCornerShape(6.dp),
    medium = RoundedCornerShape(8.dp),
    large = RoundedCornerShape(10.dp),
    extraLarge = RoundedCornerShape(12.dp),
)

/**
 * GOALS.md §22b: replaces the bare `MaterialTheme { }` that used to wrap [com.example.personalapp
 * .ui.navigation.RoleRouter] identically (but separately) in `main.kt` (web) and
 * `MainActivity.kt` (Android) — one theme, both platforms, so a future palette/shape change is a
 * one-file edit instead of a two-file one that can drift.
 */
@Composable
fun AppTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = AppColorScheme,
        shapes = AppShapes,
        content = content,
    )
}
