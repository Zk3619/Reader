# btls-sys skips its own Android branch when CMAKE_TOOLCHAIN_FILE is set, so it
# no longer hardcodes API 21 nor turns cargo-mobile2's TARGET_CC (.cmd wrapper)
# into CMAKE_C_COMPILER. Pin the ABI here and delegate to the NDK toolchain.
set(READER_ANDROID_ABI arm64-v8a)
include("${CMAKE_CURRENT_LIST_DIR}/android-common.cmake")
