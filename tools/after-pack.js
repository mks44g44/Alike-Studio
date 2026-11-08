// electron-builder afterPack hook: embeds the app icon and version info into Alike.exe
// using the pure-JS "resedit" library (works on any OS, no Wine needed).
const fs = require('fs'), path = require('path');
exports.default = async function (context) {
  if (context.electronPlatformName !== 'win32') return;
  const ResEdit = require('resedit'), PELibrary = require('pe-library');
  const pkg = context.packager.appInfo;
  const exe = path.join(context.appOutDir, pkg.productFilename + '.exe');
  const exePath = fs.existsSync(exe) ? exe : path.join(context.appOutDir, 'Alike.exe');
  const data = fs.readFileSync(exePath);
  const pe = PELibrary.NtExecutable.from(data, { ignoreCert: true });
  const res = PELibrary.NtExecutableResource.from(pe);
  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(context.packager.projectDir, 'assets', 'icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const groupId = groups.length ? groups[0].id : 1, lang = groups.length ? groups[0].lang : 1033;
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, groupId, lang, iconFile.icons.map((i) => i.data));
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0] || ResEdit.Resource.VersionInfo.createEmpty();
  const v = pkg.version.split('.').map(Number);
  vi.setFileVersion(v[0], v[1], v[2], 0, 1033); vi.setProductVersion(v[0], v[1], v[2], 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    FileDescription: 'Alike Studio', ProductName: 'Alike Studio', CompanyName: 'Alike', LegalCopyright: '© 2026 Alike',
    OriginalFilename: path.basename(exePath), InternalName: 'Alike', FileVersion: pkg.version, ProductVersion: pkg.version,
  });
  vi.outputToResourceEntries(res.entries);
  res.outputResource(pe);
  fs.writeFileSync(exePath, Buffer.from(pe.generate()));
  console.log('  • embedded icon + version info into', path.basename(exePath));
};
