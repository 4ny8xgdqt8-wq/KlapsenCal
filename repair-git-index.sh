#!/usr/bin/env bash
# ==============================================================================
# KlapsenCal - Git Index Repair Script
# Behebt den Fehler: "fatal: .git/index: index file smaller than expected"
# ==============================================================================

set -e

# In das Verzeichnis des Skripts wechseln
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🔧 [KlapsenCal] Repariere .git/index..."

if [ -f ".git/index" ]; then
  rm -f .git/index
  echo "🗑️  Beschädigte .git/index Datei entfernt."
else
  echo "ℹ️  Keine vorhandene .git/index Datei gefunden."
fi

echo "🔄 Setze Git-Index zurück ('git reset')..."
git reset

echo ""
echo "✅ Git-Index erfolgreich repariert!"
echo ""
echo "📊 Aktueller Arbeitsstand:"
git status -s
