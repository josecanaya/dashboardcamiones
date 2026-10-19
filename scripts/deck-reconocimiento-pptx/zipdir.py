import zipfile, os, sys
src, dst = sys.argv[1], sys.argv[2]
z = zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED)
z.write(os.path.join(src, '[Content_Types].xml'), '[Content_Types].xml')
for r, d, fs in os.walk(src):
    for f in fs:
        p = os.path.join(r, f); a = os.path.relpath(p, src).replace(os.sep, '/')
        if a != '[Content_Types].xml': z.write(p, a)
z.close()
