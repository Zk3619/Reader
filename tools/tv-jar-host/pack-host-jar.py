import zipfile
from pathlib import Path

root = Path("build/classes")
out = Path("build/libs/tv-jar-host.jar")
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr(
        "META-INF/MANIFEST.MF",
        "Manifest-Version: 1.0\r\nMain-Class: com.reader.tvjarhost.Main\r\n\r\n",
    )
    for p in root.rglob("*.class"):
        z.write(p, p.relative_to(root).as_posix())
print(out, out.stat().st_size)
