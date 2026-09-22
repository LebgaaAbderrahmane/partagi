# Maintainer: Abdou <abdou@example.com>
pkgname=partagi
pkgver=0.1.0
pkgrel=1
pkgdesc="Lightweight LAN screen sharing for small teams"
arch=('x86_64')
url="https://github.com/LebgaaAbderrahmane/partagi"
license=('MIT')
depends=(
  'gtk3'
  'webkit2gtk-4.1'
  'ffmpeg'
  'grim'
  'libxcb'
  'libxrandr'
  'dbus'
  'libpipewire'
)
makedepends=(
  'cargo'
  'nodejs'
  'npm'
  'corepack'
  'base-devel'
  'clang'
  'pkg-config'
)
source=("$url/archive/v$pkgver.tar.gz")
sha256sums=('SKIP')

prepare() {
  cd "$pkgname-$pkgver"
  corepack enable
  pnpm install
}

build() {
  cd "$pkgname-$pkgver"
  pnpm tauri build
}

package() {
  cd "$pkgname-$pkgver"
  install -Dm755 src-tauri/target/release/partagi "$pkgdir/usr/bin/partagi"
  install -Dm644 src-tauri/icons/128x128.png "$pkgdir/usr/share/icons/hicolor/128x128/apps/partagi.png"
  install -Dm644 src-tauri/icons/128x128@2x.png "$pkgdir/usr/share/icons/hicolor/256x256/apps/partagi.png"
  install -Dm644 src-tauri/icons/32x32.png "$pkgdir/usr/share/icons/hicolor/32x32/apps/partagi.png"

  install -Dm644 /dev/stdin "$pkgdir/usr/share/applications/partagi.desktop" <<EOF
[Desktop Entry]
Name=Partagi
Comment=Lightweight LAN screen sharing for small teams
Exec=partagi
Icon=partagi
Terminal=false
Type=Application
Categories=Network;Utility;
EOF
}
