fn main() {
    // Build without requiring icons for development
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .windows_attributes(tauri_build::WindowsAttributes::new())
    ).expect("failed to run tauri-build");
}
