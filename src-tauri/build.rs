fn main() {
    println!("cargo:rerun-if-changed=permissions");
    println!("cargo:rerun-if-changed=android/display-reader");
    tauri_build::build()
}
