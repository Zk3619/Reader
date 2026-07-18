fn main() {
    println!("cargo:rerun-if-changed=permissions");
    println!("cargo:rerun-if-changed=android/display-reader");
    println!("cargo:rerun-if-changed=android/music-media");
    println!("cargo:rerun-if-changed=android/tv-spider");
    tauri_build::build()
}
