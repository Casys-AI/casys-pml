#!/bin/sh
# PML Installation Script
# Usage: curl -fsSL https://pml.casys.ai/install.sh | sh
#
# This script detects your OS and architecture, downloads the appropriate
# PML binary, and installs it to ~/.pml/bin/pml

set -e

# Configuration - Public repo for releases
GITHUB_REPO="Casys-AI/pml-std"
INSTALL_DIR="$HOME/.pml/bin"
BINARY_NAME="pml"

# Colors (if terminal supports them)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
info() {
    printf "${BLUE}[info]${NC} %s\n" "$1"
}

success() {
    printf "${GREEN}[ok]${NC} %s\n" "$1"
}

warn() {
    printf "${YELLOW}[warn]${NC} %s\n" "$1"
}

error() {
    printf "${RED}[error]${NC} %s\n" "$1" >&2
    exit 1
}

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Linux*)     echo "linux" ;;
        Darwin*)    echo "macos" ;;
        CYGWIN*|MINGW*|MSYS*) echo "windows" ;;
        *)          error "Unsupported operating system: $(uname -s)" ;;
    esac
}

# Detect architecture
detect_arch() {
    case "$(uname -m)" in
        x86_64|amd64)   echo "x64" ;;
        aarch64|arm64)  echo "arm64" ;;
        *)              error "Unsupported architecture: $(uname -m)" ;;
    esac
}

# Get binary name for platform
get_binary_name() {
    local os="$1"
    local arch="$2"

    case "$os" in
        linux)
            echo "pml-linux-x64"
            ;;
        macos)
            if [ "$arch" = "arm64" ]; then
                echo "pml-macos-arm64"
            else
                echo "pml-macos-x64"
            fi
            ;;
        windows)
            echo "pml-windows-x64.exe"
            ;;
    esac
}

# Get latest release version from GitHub API
get_latest_version() {
    local url="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"

    if command -v curl >/dev/null 2>&1; then
        curl -sL "$url" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/'
    elif command -v wget >/dev/null 2>&1; then
        wget -qO- "$url" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/'
    else
        error "Neither curl nor wget found. Please install one of them."
    fi
}

# Download file
download() {
    local url="$1"
    local output="$2"

    info "Downloading from $url"

    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$url" -o "$output"
    elif command -v wget >/dev/null 2>&1; then
        wget -q "$url" -O "$output"
    else
        error "Neither curl nor wget found. Please install one of them."
    fi
}

# Add to PATH in shell profile
add_to_path() {
    local shell_profile=""
    local path_line="export PATH=\"\$HOME/.pml/bin:\$PATH\""

    # Detect shell profile
    case "$SHELL" in
        */zsh)
            shell_profile="$HOME/.zshrc"
            ;;
        */bash)
            if [ -f "$HOME/.bashrc" ]; then
                shell_profile="$HOME/.bashrc"
            elif [ -f "$HOME/.bash_profile" ]; then
                shell_profile="$HOME/.bash_profile"
            fi
            ;;
        */fish)
            shell_profile="$HOME/.config/fish/config.fish"
            path_line="set -gx PATH \$HOME/.pml/bin \$PATH"
            ;;
    esac

    if [ -n "$shell_profile" ]; then
        # Check if already in profile
        if ! grep -q ".pml/bin" "$shell_profile" 2>/dev/null; then
            echo "" >> "$shell_profile"
            echo "# PML" >> "$shell_profile"
            echo "$path_line" >> "$shell_profile"
            info "Added PML to PATH in $shell_profile"
            return 0
        else
            info "PML already in PATH"
            return 1
        fi
    else
        warn "Could not detect shell profile. Add ~/.pml/bin to your PATH manually."
        return 1
    fi
}

# Main installation
main() {
    echo ""
    echo "  ____  __  __ _     "
    echo " |  _ \\|  \\/  | |    "
    echo " | |_) | \\  / | |    "
    echo " |  __/| |\\/| | |___ "
    echo " |_|   |_|  |_|_____|"
    echo ""
    echo " Procedural Memory Layer"
    echo ""

    # Detect platform
    local os=$(detect_os)
    local arch=$(detect_arch)
    local binary_name=$(get_binary_name "$os" "$arch")

    info "Detected platform: $os-$arch"

    # Get latest version
    info "Fetching latest version..."
    local version=$(get_latest_version)

    if [ -z "$version" ]; then
        error "Could not determine latest version. Check your internet connection or try again later."
    fi

    info "Latest version: $version"

    # Create install directory
    mkdir -p "$INSTALL_DIR"

    # Download binary
    local download_url="https://github.com/${GITHUB_REPO}/releases/download/${version}/${binary_name}"
    local temp_file=$(mktemp)

    download "$download_url" "$temp_file"

    # Install binary
    local install_path="$INSTALL_DIR/$BINARY_NAME"
    mv "$temp_file" "$install_path"
    chmod +x "$install_path"

    success "Installed PML $version to $install_path"

    # Add to PATH
    if add_to_path; then
        echo ""
        warn "Restart your terminal or run: source ~/.zshrc (or ~/.bashrc)"
    fi

    # Check if in PATH already
    if command -v pml >/dev/null 2>&1; then
        success "PML is ready to use!"
    else
        echo ""
        info "To start using PML now, run:"
        echo "    export PATH=\"\$HOME/.pml/bin:\$PATH\""
    fi

    echo ""
    success "Installation complete!"
    echo ""
    echo "  Get started:"
    echo "    pml init          # Initialize PML in your project"
    echo "    pml --help        # Show available commands"
    echo ""
}

# Run main
main "$@"
