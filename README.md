# AI Book Architect

Eine PWA-App zur Generierung von Büchern basierend auf KI.

## Funktionen
- **Themen-Eingabe**: Von einem Wort bis zu 5 Sätzen.
- **Inhaltsverzeichnis (ToC)**: Automatische Erstellung eines strukturierten Inhaltsverzeichnisses.
- **Anpassbare Parameter**: Wähle Stil (wissenschaftlich, unterhaltsam, etc.) und Struktur (Beispiele, Reflexionsfragen).
- **Längensteuerung**: Definiere Seitenanzahl und Wortzahlen.
- **Kapitel-Vorschau**: Generiere ein Test-Kapitel zur Überprüfung von Ton und Stil.
- **Export**: Exportiere dein Buch als Markdown (MD), PDF oder EPUB.

## Technologien
- React 19
- Tailwind CSS
- Gemini AI (@google/genai)
- jsPDF (PDF Export)
- JSZip (EPUB Export Vorbereitung)
- Framer Motion (Animationen)
- Vite PWA Plugin

## PWA Nutzung & Bereitstellung
Die App ist als Progressive Web App (PWA) vorkonfiguriert. Um sie vollständig zu nutzen:

1. **Icons hinzufügen**: Füge folgende Dateien in den Ordner `public/` deines Repos hinzu:
   - `pwa-192x192.png` (192x192 Pixel)
   - `pwa-512x512.png` (512x512 Pixel)
   - `favicon.ico`, `apple-touch-icon.png`, `mask-icon.svg` (optional, aber empfohlen)
2. **Build & Deploy**: Wenn du die App auf GitHub Pages, Vercel oder Netlify hostest, wird sie automatisch als PWA erkannt.
3. **Installation**: Öffne die URL auf deinem Smartphone (Chrome/Safari) und wähle "Zum Home-Bildschirm hinzufügen".
