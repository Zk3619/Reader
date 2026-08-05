# Included by the per-ABI entry files. ABI comes from READER_ANDROID_ABI;
# API level and NDK location come from the environment.
if(NOT READER_ANDROID_ABI)
  message(FATAL_ERROR "READER_ANDROID_ABI must be set before including android-common.cmake")
endif()

set(_reader_ndk "$ENV{ANDROID_NDK_HOME}")
if(NOT _reader_ndk)
  set(_reader_ndk "$ENV{ANDROID_NDK_ROOT}")
endif()
if(NOT _reader_ndk)
  message(FATAL_ERROR "ANDROID_NDK_HOME is not set")
endif()

set(_reader_api "$ENV{ANDROID_NATIVE_API_LEVEL}")
if(NOT _reader_api)
  set(_reader_api 24)
endif()

set(ANDROID_ABI "${READER_ANDROID_ABI}")
set(ANDROID_PLATFORM "android-${_reader_api}")
set(ANDROID_STL c++_shared)

include("${_reader_ndk}/build/cmake/android.toolchain.cmake")
