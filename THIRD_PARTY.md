# Third-party software

The only runtime dependency is [jschardet](https://github.com/aadsm/jschardet),
version 3.1.4, by António Afonso and contributors, a JavaScript port of chardet.
It is used without modifications under LGPL-2.1-or-later.

The build retains its copyright/license notices and writes its full license to
`dist/THIRD_PARTY_LICENSES.txt`. `third_party/jschardet/` contains the dependency's
original source and license and is included in the source archive. You may
modify or replace that copy, point the package dependency at it, and rebuild the
extension. The build is not obfuscated and does not prevent debugging or changes.

esbuild, jsdom, Prettier and web-ext are development dependencies. They are not
shipped as extension runtime code. Their versions and transitive dependencies
are recorded in `package-lock.json`.
